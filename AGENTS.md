# AGENTS.md — MamaDoc Django Front

## Проект

Это React/TypeScript-фронтенд медицинской CRM MamaDoc. Репозиторий работает только с Django REST API и не содержит альтернативного backend-режима.

Три репозитория проекта:

| Роль | Путь |
|---|---|
| Фронтенд | `C:\Users\laby\Desktop\MamaDoc-django-front` |
| Django-бэкенд | `C:\Users\laby\Desktop\MamaDoc-backend` |

## Стек

- React 18.3, TypeScript strict, Vite
- MUI 6, Refine 5 для layout и навигации
- TanStack Query, Recharts, dayjs

## Структура

- `src/api/` — типизированные запросы к Django API
- `src/pages/` — страницы приложения
- `src/features/` — доменная логика сотрудников и зарплаты
- `src/components/` — переиспользуемый UI
- `src/hooks/` — хуки контекста, прав и синхронизации
- `src/config/djangoDataProvider.ts` — защитный Refine-провайдер для старых CRUD-вызовов

## Данные и права

Весь прикладной код получает данные через `src/api/*.ts` и `apiRequest()` с cookie-сессией. Кэширование выполняется TanStack Query, ключи находятся в `src/api/queryKeys.ts`.

Все списки и записи должны быть ограничены активной организацией и филиалом. Не добавляйте запросы без tenant-фильтра, пагинации или серверной фильтрации там, где список может расти.

Права проверяются через `usePermissions`, `useCan` и `RequirePermission`. Суперадминистратор имеет обход прав, остальные пользователи — только разрешения активного контекста.

## Переменные окружения

```env
VITE_API_URL=/api
VITE_API_PROXY_TARGET=http://localhost:8000
VITE_OFFICE_IP=
```

В dev Vite проксирует `/api` на `VITE_API_PROXY_TARGET`. Django должен слушать `http://localhost:8000`.

## Разработка

```bash
npm install
npm run dev
npx tsc --noEmit
npm run build
```

Перед изменениями, затрагивающими ветки, booking или deploy, прочитайте `docs/CLAUDE_WORKFLOW.md`.

## Правила

- Всегда читать и записывать файлы в UTF-8.
- Не повреждать кириллицу и не переписывать файлы целиком без необходимости.
- Сохранять чужие незавершённые изменения.
- Новые API-типы и функции размещать в соответствующем `src/api/<domain>.ts`.
- Для UI использовать Django-страницы и компоненты, а не удалённые legacy-модули.
