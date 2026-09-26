# Seitek: выкладка на тест

Актуально для гостиничной ветки `seitek` и контура `test.crm.operator.kg`.
Перед каждым выкладыванием сверяйте фактические ветки и commits на сервере:
состояние сервера важнее этого снимка документации.

## Что входит в эту поставку

- Frontend `seitek` содержит гостиничный интерфейс, Channex, предпросчёт
  динамических тарифов и дефолты характеристик категории номера.
- Frontend `origin/test` уже включает `seitek`; отдельное слияние этой ветки
  перед тестовой выкладкой не требуется.
- Backend `origin/test` уже содержит гостиничный модуль, Channex и поле
  `isManualOverride` в ответе `pricing-rules/simulate/`.
- Для формы категории номера backend дополнительно должен поддерживать
  `defaultArea`, `defaultCeilingHeight`, `defaultRoomsCount`,
  `defaultBathrooms`, `defaultWindowSide`, `defaultIsCorner`,
  `defaultLayoutDescription` и `defaultMealOptions` на `RoomType`.
  Изменение категории действует на следующие формы создания номера; уже
  созданные номера остаются независимыми.

## Контур и доступ

| Компонент | Значение |
| --- | --- |
| Тестовый сайт | <https://test.crm.operator.kg/> |
| Backend checkout | `/opt/MamaDoc-backend-test`, ветка `test` |
| Frontend checkout | `/opt/MamaDoc-django-front-test`, ветка `test` |
| Frontend build | `/opt/MamaDoc-frontend-test/dist` |
| Сервер | `root@173.249.38.147` |

Последняя выкладка этой задачи (27.09.2026): backend `9243bfe9`, frontend
test-source `b74b12ca` (он включает `seitek` `9624d56b`). Миграция `hotel.0011`
применена.

Подключайтесь SSH-ключом, выданным для сервера (локальный файл обычно
`~/.ssh/id_newcrm_ed25519`). Пароли и токены не копируйте в этот файл, Git,
терминальные команды или сообщения. Для входа в CRM используйте утверждённое
хранилище учётных данных или запросите доступ у ответственного.

## Перед выкладкой

1. Опубликуйте нужные commits в GitHub.
2. Убедитесь, что `test` fast-forward-ится к опубликованным commits.
3. Проверьте серверные ветки и статус. Сохраните неизвестные незатреканные
   файлы, особенно `config/.env*`; не запускайте `git clean` или `reset --hard`.
4. Не запускайте backend и frontend деплои одновременно: оба используют
   Docker на общем сервере.

Локальная проверка сервера:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_newcrm_ed25519" root@173.249.38.147 `
  "cd /opt/MamaDoc-backend-test && git status --short --branch && git log -1 --oneline; `
   cd /opt/MamaDoc-django-front-test && git status --short --branch && git log -1 --oneline"
```

Если ветка не `test`, есть неизвестные tracked-изменения или pull не может
выполниться fast-forward-ом, остановитесь и разберите расхождение до выкладки.

## Выкладка

Выпускайте backend первым: он добавляет поля и миграцию для `RoomType`.
Штатные серверные скрипты сами выполняют `git pull --ff-only`, миграции,
сборку и blue-green переключение.

```bash
ssh root@173.249.38.147
cd /opt/MamaDoc-backend-test
git status --short --branch
git log -1 --oneline
deploy-backend-test
```

После успешного backend-деплоя опубликуйте frontend:

```bash
cd /opt/MamaDoc-django-front-test
git status --short --branch
git log -1 --oneline
source /etc/environment
E2E_AFTER_DEPLOY=0 FRONTEND_DIR=/opt/MamaDoc-django-front-test \
  FRONTEND_DIST=/opt/MamaDoc-frontend-test/dist \
  bash /opt/MamaDoc-backend-test/scripts/deploy-newcrm-frontend.sh
```

`E2E_AFTER_DEPLOY=0` пропускает фоновый E2E-набор. Убирайте этот параметр
только когда отдельно запрошен запуск E2E.

Если алиаса нет, используйте штатные скрипты из актуального
`MamaDoc-backend-test/scripts/` с путями и переменными из
`MamaDoc-backend/docs/deployment-runbook.md`. Не подменяйте их ручной сборкой
через `docker compose up -d --build` или копированием `dist`.

## Проверка после выкладки

```bash
cd /opt/MamaDoc-backend-test
cat .deploy/active.tag
curl -I https://test.crm.operator.kg/
curl -i https://test.crm.operator.kg/api/auth/me/ | head
dc-test ps
```

Ожидается: сайт отвечает `200`, `/api/auth/me/` без авторизации — `401`,
`test-web` и `test-ws` активного цвета имеют статус `healthy`, подняты
`test-db`, `test-redis`, `test-celery-worker` и `test-celery-beat`.

Для проверки изменений категории номера войдите в тестовую CRM с гостиничным
доступом и проверьте создание/редактирование категории и создание номера:

- `GET /api/v2/hotel/room-types/?propertyId=<id>` возвращает все восемь
  `default*` полей;
- `POST` и `PATCH /api/v2/hotel/room-types/` принимают эти поля;
- PATCH с `null` очищает nullable-значения, пропущенное поле не меняет;
- выбор категории подставляет дефолты только в новую форму номера;
- редактирование дефолта категории не меняет ранее созданные номера.

## Результат последней выкладки

- Backend image `9243bfe99786` активен; `hotel.0011` применена.
- Frontend build опубликован из test-source `b74b12ca`.
- Проверено: сайт `200`, `/api/auth/me/` без сессии `401`, `test-db` и
  `test-redis` healthy, оба backend blue-контейнера healthy.
- Фоновый E2E-набор не запускался (`E2E_AFTER_DEPLOY=0`).
- Резервные `config/.env.bak-*` в backend test checkout сохранены.

## Откат

При ошибке backend-деплоя используйте только штатный `rollback-backend-test`
после фиксации активного/предыдущего тегов и логов. Frontend не откатывайте
вручную подменой `dist`; сначала зафиксируйте текущий опубликованный build и
действуйте по `deployment-runbook.md`.
