# MamaDoc / NewCRM — инструкция для Claude

Актуально на 2026-08-06. Перед каждым выкатом сверяй фактическую ветку и commit на сервере: они важнее старых сообщений в чате.

## 1. Репозитории и окружения

Локально:

- C:\Users\laby\Desktop\MamaDoc-django-front — React/Vite frontend для Django API.
- C:\Users\laby\Desktop\MamaDoc-backend — Django API, Postgres, Channels.
- C:\Users\laby\Desktop\MamaDoc — старый Supabase frontend; для Django-фич не использовать без отдельного указания.

Production:

- сайт: https://newcrm.pediatr.kg/
- backend checkout: /opt/MamaDoc-backend
- frontend source: /opt/MamaDoc-django-front
- frontend dist: /opt/MamaDoc-frontend/dist
- production compose: docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml

Test:

- сайт: https://test.crm.operator.kg/
- backend checkout: /opt/MamaDoc-backend-test
- frontend source: /opt/MamaDoc-django-front-test
- frontend dist: /opt/MamaDoc-frontend-test/dist
- для backend обязательно добавлять docker/docker-compose.test.yml

Локальному frontend не нужна локальная база, если .env.local проксирует API через VITE_API_PROXY_TARGET. Всегда проверяй, куда реально смотрит proxy.

## 2. Граница booking

Booking — публичная запись пациента/гостя. К нему относятся:

- публичные маршруты и API бронирования;
- кабинет пациента, OTP и токен пациента;
- запись без услуги;
- patientId/serviceIds при подтверждении;
- online_booking_visible у услуги и публичные фильтры;
- отмена гостевой/пациентской брони с освобождением приёма;
- Paylink, предоплата, вебхук оплаты;
- booking-уведомления и публичные контракты.

Booking-коммиты отправляются только в test до отдельного согласования:

- frontend test branch: codex/test-booking-main;
- backend test branch: сейчас main, но перед работой сверить на сервере.

Non-booking — функции обычной CRM, не меняющие публичную запись: RBAC, СКУД, зарплата, знания, архив заключений, обычная панель приёмов, точечное расписание, настройки сотрудников/филиалов.

Текущие production branches:

- frontend: codex/prod-safe-nonbooking;
- backend: codex/prod-nonbooking-release.

Если задача смешанная, раздели её на отдельные коммиты и destination. Booking не переносить в production cherry-pick-ом вместе с non-booking.

## 3. Начало работы

В каждом затронутом репозитории:

~~~bash
git status --short --branch
git fetch origin
git log --oneline --decorate -5
~~~

Не удаляй незнакомые изменения, untracked-файлы или серверные скрипты. Не используй git reset --hard.

Создавай ветку от destination:

~~~bash
# non-booking frontend
git switch -c codex/<topic> origin/codex/prod-safe-nonbooking

# non-booking backend
git switch -c codex/<topic> origin/codex/prod-nonbooking-release

# booking frontend
git switch -c codex/<topic> origin/codex/test-booking-main

# booking backend — только после проверки фактической test branch
git switch -c codex/<topic> origin/main
~~~

## 4. Commit и push

Один commit — одна законченная бизнес-задача. Перед commit:

~~~bash
git diff --check
git status --short
git diff --stat
~~~

Затем:

~~~bash
git add <только-нужные-файлы>
git commit -m "feat(schedule): edit a single day"
git push -u origin codex/<topic>
~~~

Правила:

- не коммитить .env, пароли, токены, дампы и личные JSON;
- не использовать git add . без просмотра списка файлов;
- не пушить booking в production branch;
- не делать force-push на общие ветки;
- если переносишь commit, сначала проверь git show --stat <commit>;
- при конфликте branch остановись и разбирайся, не затирай историю.

## 5. Проверки

Frontend:

~~~bash
npm install
npx tsc --noEmit
npm run test -- --run
npm run build
~~~

Backend:

~~~bash
.venv\Scripts\python.exe manage.py check
.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.venv\Scripts\ruff.exe check <изменённые-файлы>
.venv\Scripts\python.exe -m pytest <целевые-тесты>
~~~

Если pytest упирается в существующую старую test-базу или зависает на baseline-миграции, не удаляй базу молча. Запиши это как блокер и отдельно выполни check, makemigrations --check, ruff и доступные целевые тесты.

## 6. Production deploy

Сначала push нужной production branch. На сервере перед deploy:

~~~bash
cd /opt/MamaDoc-backend
git status --short --branch
git log --oneline -3

cd /opt/MamaDoc-django-front
git status --short --branch
git log --oneline -3
~~~

Ожидается:

- backend: codex/prod-nonbooking-release;
- frontend: codex/prod-safe-nonbooking;
- commit совпадает с тем, который должен попасть в production;
- незнакомых tracked-изменений нет.

Команды:

~~~bash
deploy-backend
deploy-front
~~~

deploy-backend делает pull --ff-only, собирает images, валидирует Caddy, применяет миграции один раз до перезапуска, поднимает web/ws/caddy и синхронизирует permissions/modules/role templates.

deploy-front делает pull --ff-only, собирает frontend в Node Docker и копирует dist в production. Backend он не перезапускает.

Если изменены backend и frontend: сначала deploy-backend, затем deploy-front. Если изменён только frontend: достаточно deploy-front.

Проверка:

~~~bash
cd /opt/MamaDoc-backend
docker compose ps
docker compose exec -T web python manage.py showmigrations
curl -I https://newcrm.pediatr.kg/
curl -i https://newcrm.pediatr.kg/api/auth/me/ | head
~~~

Ожидается: сайт 200, API без авторизации 401, db healthy, web healthy, caddy up.

Не использовать обычный docker compose up -d --build без production overlay. Миграции вручную в production не запускать, если их выполняет deploy-backend.

## 7. Test deploy

На сервере сейчас нет отдельных команд deploy-front-test и deploy-backend-test в PATH. Не вызывай production deploy с test checkout без правильных переменных и overlay.

Frontend test:

~~~bash
source /etc/environment
EXPECTED_BRANCH=codex/test-booking-main \
FRONTEND_DIR=/opt/MamaDoc-django-front-test \
FRONTEND_DIST=/opt/MamaDoc-frontend-test/dist \
bash /opt/MamaDoc-backend-test/scripts/deploy-newcrm-frontend.sh
~~~

Скрипт проверяет test branch, делает pull --ff-only, собирает frontend и пишет только в test dist.

Backend test не выкатывать production-скриптом без test overlay. Безопасная схема:

~~~bash
cd /opt/MamaDoc-backend-test
git status --short --branch
git branch --show-current
git pull --ff-only

docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml -f docker/docker-compose.test.yml build web
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml -f docker/docker-compose.test.yml run --rm web python /code/manage.py migrate --noinput
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml -f docker/docker-compose.test.yml up -d db redis web ws
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml -f docker/docker-compose.test.yml ps
~~~

docker/docker-compose.test.yml обязателен: test использует отдельный image mamadoc-backend-test:latest и контейнеры test-web/test-ws. Второй Caddy не поднимать.

Проверка test:

~~~bash
curl -I https://test.crm.operator.kg/
curl -i https://test.crm.operator.kg/api/auth/me/ | head
~~~

Для booking проверяй публичные endpoints и сценарии гостя только на test, не на реальных production-платежах.

## 8. Перенос non-booking из main

Не вливай всю main: там могут быть booking-коммиты.

~~~bash
git log --oneline origin/main -- <path>
git show --stat <commit>
~~~

Переноси только проверенные non-booking commits в production branch:

~~~bash
git switch -c codex/prod-nonbooking-release origin/codex/prod-nonbooking-release
git cherry-pick <non-booking-commit-1> <non-booking-commit-2>
git push -u origin codex/prod-nonbooking-release
~~~

Для frontend используй codex/prod-safe-nonbooking. Если cherry-pick конфликтует или branch разошлась — остановись.

## 9. Ошибка deploy и rollback

При остановке deploy:

~~~bash
docker compose ps
docker compose logs web --tail=150
docker compose logs caddy --tail=150
~~~

Не запускай повторно вслепую. Если production checkout имеет untracked-файлы, сохранить их. Rollback делать только после фиксации текущего commit и выбора конкретного предыдущего рабочего commit. git reset --hard запрещён без отдельного разрешения.

## 10. Итоговый отчёт

После работы сообщи:

1. какие бизнес-фичи изменены;
2. какой commit попал в test и какой в production;
3. какие branches использовались;
4. какие проверки прошли;
5. что осталось блокером или не запускалось.

«Команда завершилась» не означает «деплой проверен»: обязательно сверяй branch, commit, migration status, контейнеры и HTTP-ответы.
