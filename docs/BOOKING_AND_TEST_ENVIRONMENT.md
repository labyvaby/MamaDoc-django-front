# Booking и тестовая среда NewCRM

Документ для frontend-разработчика: текущий public booking-контракт, локальный запуск,
test-сервер, браузерная проверка и правила безопасного deploy.

## 1. Репозитории и окружения

| Что | Локально | Test-сервер |
|---|---|---|
| Frontend | C:\Users\laby\Desktop\MamaDoc-django-front | /opt/MamaDoc-django-front-test |
| Backend | C:\Users\laby\Desktop\MamaDoc-backend | /opt/MamaDoc-backend-test |
| Test dist | — | /opt/MamaDoc-frontend-test/dist |
| Test URL | — | https://test.crm.operator.kg/ |
| Production URL | — | https://newcrm.pediatr.kg/ |

В frontend основной режим — Django:

~~~env
VITE_BACKEND_MODE=django
VITE_API_URL=/api
VITE_API_PROXY_TARGET=http://localhost:8000
VITE_WS_PROXY_TARGET=ws://localhost:8001
VITE_BOOKING_ORG_SLUG=mama-doktor
~~~

Пароли, Raven-ключи, production cookie и SSH-доступы не добавлять в Git,
Markdown или исходный код.

## 2. Public booking

Публичная витрина находится вне CRM-аутентификации:

~~~text
/book
/book/doctors
/book/doctor/<id-or-slug>
~~~

Основные frontend-файлы:

~~~text
src/api/publicBooking.ts
src/pages/public-booking/DoctorsPage.tsx
src/pages/public-booking/DoctorBookingPage.tsx
src/pages/public-booking/booking/
~~~

Public API живёт под /api/v1, CRM API — под /api. API-слой принимает raw
snake_case и глубоко переводит ответы в camelCase. Страницы не должны делать
собственный mapping.

### Каталог и доступность

~~~text
GET /api/v1/organizations/<slug>/
GET /api/v1/organizations/<slug>/branches/
GET /api/v1/organizations/<slug>/services/
GET /api/v1/organizations/<slug>/professionals/
GET /api/v1/professionals/<id-or-slug>/
GET /api/v1/professionals/<id-or-slug>/reviews/
GET /api/v1/professionals/<id-or-slug>/calendar/
GET /api/v1/professionals/<id-or-slug>/available-times/
GET /api/v1/professionals/<id-or-slug>/available-services/
~~~

Параметры:

~~~text
calendar:
  date_from=YYYY-MM-DD
  date_to=YYYY-MM-DD
  service_id=<id>                 # необязательно

available-times:
  date=YYYY-MM-DD                 # обязательно
  service_ids=12,15               # необязательно

available-services:
  date=YYYY-MM-DD                 # обязательно
  time=HH:MM                      # обязательно
~~~

Ответы списков имеют envelope:

~~~json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0 }
}
~~~

### Видимость услуги

В CRM JSON поле называется onlineBookingVisible, в Django-модели —
online_booking_visible. У активных услуг default=true задаётся миграцией.

Скрытая услуга не должна попасть в список услуг организации, calendar,
available-times, available-services, detail врача или список врачей,
отфильтрованный по услуге. POST создания брони также повторно валидирует
service id на backend, поэтому скрытую услугу нельзя передать напрямую.

Врач не показывается публично, если он не врач, отключён для онлайн-записи
или не имеет активной видимой услуги.

Отзывы публичны только при publication_status=published. Автор обезличивается
до «Пациент», рейтинг считается из того же опубликованного набора. До
модерации rating=null и ratingCount=0 — корректное поведение.

## 3. Создание брони

~~~text
POST /api/v1/bookings/
Content-Type: application/json
~~~

Frontend функция createGuestBooking отправляет snake_case:

~~~json
{
  "professional_id": 41,
  "branch_id": 2,
  "service_ids": [12, 15],
  "date": "2026-08-15",
  "time": "10:30",
  "patient_name": "Иванова Алина",
  "patient_phone": "+996700123456",
  "comment": ""
}
~~~

Ответ содержит confirmation_code, дату, время, услуги, сумму и публичную
информацию о враче/филиале. ФИО и телефон пациента в public read-ответах
не возвращаются.

### Бронь без услуги

Backend принимает отсутствие service_ids и пустой список []. Такая бронь
резервирует стандартное окно 30 минут.

При подтверждении из CRM услуги можно выбрать позже:

~~~text
PATCH /api/bookings/<id>/status/
~~~

~~~json
{
  "status": "confirmed",
  "patientId": 123,
  "serviceIds": [12]
}
~~~

serviceIds важен для подтверждения брони, созданной без услуги.

Backend этот сценарий поддерживает. Текущая публичная UI-страница пока
блокирует отправку при selectedServices.length === 0 в
src/pages/public-booking/DoctorBookingPage.tsx. Для включения no-service
в витрине нужно убрать servicesInvalid из блокирующей валидации и отправлять
serviceIds: [].

Коды ошибок:

~~~text
400 validation_error
404 врач/филиал/ресурс не найден
409 slot_unavailable
429 rate limit
~~~

Raw traceback и внутренние validation details гостю не показывать.

### Бронь по коду

~~~text
GET /api/v1/bookings/<confirmation_code>/
~~~

Новые публичные коды имеют 10 символов и алфавит без 0/O/1/I. Старые
6-символьные коды продолжают работать.

## 4. Кабинет пациента

Токен передаётся отдельно от CRM-сессии:

~~~text
X-Patient-Token: <token>
~~~

~~~text
POST /api/v1/auth/otp/request/
POST /api/v1/auth/otp/verify/
POST /api/v1/auth/register/
POST /api/v1/auth/logout/
GET  /api/v1/me/
GET  /api/v1/me/bookings/
POST /api/v1/me/bookings/<id>/cancel/
~~~

Токен не изменяет request.user. OTP ограничивается счётчиками в БД:
повтор не чаще 60 секунд, максимум 5 кодов в час на номер и 50 в сутки на IP.
Телефон нормализуется через индексированный phone_key — девять значащих цифр.

Отмена кабинетом отменяет Booking и связанный Appointment, чтобы окно
освободилось. patient_id при создании принимается только если пациент входит
в список активного токена и телефон совпадает.

## 5. Локальный запуск

### Frontend

~~~powershell
cd C:\Users\laby\Desktop\MamaDoc-django-front
npm ci
npm run dev
~~~

Открыть http://localhost:5177/ или http://localhost:5177/book.

Если нужен доступ с другого устройства:

~~~powershell
npm run dev -- --host 0.0.0.0
~~~

### Backend

В отдельном PowerShell:

~~~powershell
cd C:\Users\laby\Desktop\MamaDoc-backend
docker compose up -d db redis
.venv\Scripts\python.exe manage.py migrate
.venv\Scripts\python.exe manage.py runserver 8000
~~~

После этого Vite proxy отправляет /api в http://localhost:8000. Если локальный
WebSocket недоступен, приложение продолжает работать через polling.

~~~powershell
curl.exe -i http://localhost:8000/api/auth/me/
curl.exe -i http://localhost:8000/api/v1/organizations/mama-doktor/
npx tsc --noEmit
npm run build
~~~

## 6. Подключение к test

~~~bash
ssh root@173.249.38.147
~~~

Пароль вводится только в prompt. Не записывать его в команды, файлы и Git.

Checkout-ы:

~~~bash
/opt/MamaDoc-backend-test
/opt/MamaDoc-django-front-test
/opt/MamaDoc-frontend-test/dist
~~~

Проверка контейнеров:

~~~bash
docker compose \
  -f /opt/MamaDoc-backend-test/docker-compose.yml \
  -f /opt/MamaDoc-backend-test/docker/docker-compose.prod.yml \
  -f /opt/MamaDoc-backend-test/docker/docker-compose.test.yml ps
~~~

Ожидаемо:

~~~text
db       healthy
redis    healthy
test-web healthy
test-ws  Up
~~~

Test использует отдельные контейнеры, сеть и БД. Production DB не является
test DB.

## 7. Test deploy

Перед deploy изменения должны быть запушены:

~~~powershell
git status
git log --oneline -3
git push origin main
~~~

Команду deploy без суффикса test не запускать: это только подсказка.

### Backend

~~~bash
deploy-backend-test
~~~

Команда делает fast-forward в backend-test, собирает Docker image, применяет
миграции, перезапускает test web/ws и запускает sync_permissions,
sync_modules и sync_role_templates.

Проверка без авторизации:

~~~bash
curl -i https://test.crm.operator.kg/api/auth/me/ | head
~~~

Ожидается 401.

### Frontend

~~~bash
deploy-front-test
~~~

Команда делает fast-forward в frontend-test, собирает через Docker Node и
копирует dist в /opt/MamaDoc-frontend-test/dist.

~~~bash
curl -I https://test.crm.operator.kg/
grep -R "localhost:8000" -n /opt/MamaDoc-frontend-test/dist || echo "no localhost:8000"
grep -R "localhost:54321" -n /opt/MamaDoc-frontend-test/dist || echo "no localhost:54321"
~~~

Ожидается HTTP 200 и отсутствие localhost.

## 8. Проверка в браузере

Открыть:

~~~text
https://test.crm.operator.kg/
https://test.crm.operator.kg/book
https://test.crm.operator.kg/book/doctors
~~~

Smoke-сценарий:

1. Открыть /book и выбрать врача.
2. Проверить отсутствие скрытых и неактивных услуг.
3. Выбрать дату, время и услугу.
4. В DevTools → Network проверить /api/v1, а не Supabase.
5. Создать бронь и сохранить confirmation_code.
6. Открыть бронь по коду.
7. В CRM найти бронь, выбрать пациента и подтвердить.
8. Для no-service API-сценария отправить service_ids: [] и подтвердить через
   CRM с serviceIds.
9. Отменить бронь и проверить, что окно снова доступно.

В body создания должна быть service_ids, не serviceLines. В CRM PATCH должно
быть serviceIds.

## 9. Production safety

Не обновлять production обычным pull с main, если в main есть непроверенные
booking-коммиты. Перед deploy проверить:

~~~bash
git status
git log --oneline -3
docker compose ps
~~~

Нельзя выполнять:

~~~bash
git reset --hard
docker compose up -d --build
scp dist/* ...
~~~

Если pull --ff-only остановился из-за ручных изменений или расхождения истории,
не делать reset. Сначала сохранить и разобрать состояние.

Production-команды:

~~~bash
deploy-backend
deploy-front
~~~

Вызывать их только на заранее проверенной non-booking ветке. После deploy:

~~~bash
curl -I https://newcrm.pediatr.kg/
curl -i https://newcrm.pediatr.kg/api/auth/me/ | head
docker compose ps
~~~

Ожидается frontend 200, API без сессии 401, web healthy, db healthy и caddy Up.

## 10. Диагностика

Пустая витрина: проверить VITE_BOOKING_ORG_SLUG, endpoint организации,
список врачей, online_booking_enabled и наличие активной
online_booking_visible услуги.

401 в CRM: войти заново. X-Patient-Token не предназначен для CRM-маршрутов.

400 при создании: проверить snake_case public payload и типы id. Для CRM
использовать camelCase, включая serviceIds.

Test pull остановился: проверить git status в test checkout. Не стирать ручные
файлы и не делать reset.

Backend unhealthy:

~~~bash
dc ps
dc logs web --tail=150
dc logs ws --tail=150
dc logs caddy --tail=150
~~~

Смотреть последнюю миграцию, import error и конфигурацию окружения.
