# MamaDoc Django Front — Контекст проекта

Перед задачами, затрагивающими ветки, booking или deploy, прочитать
`docs/CLAUDE_WORKFLOW.md` — там зафиксированы актуальные production/test
окружения и безопасный порядок выката.

Этот файл — главный источник правды о фронтенд-репозитории. Читай перед любой задачей.

---

## Что такое этот репозиторий

Это React-фронтенд медицинской CRM **MamaDoc**, адаптированный под Django REST API.

**Откуда взят:** форк оригинального MamaDoc (Supabase-версия, GitHub: labyvaby/MamaDoc).
**Зачем существует:** оригинал работает на Supabase (облачная БД + Edge Functions). Параллельно разрабатывается новый бэкенд на Django — этот фронтенд подключается к нему. Один кодовый файл обслуживает оба бэкенда; переключение — флагом `VITE_BACKEND_MODE`.

---

## Модель продукта — SaaS

**Проект строится как SaaS-платформа** — одна система обслуживает множество независимых клиник.

Сейчас работаем с первым клиентом (одна организация, несколько филиалов). Архитектура рассчитана на масштабирование: в будущем подключаются другие клиники со своими филиалами/пользователями/данными — полностью изолированно.

**Жёсткие требования:**

- **Изоляция данных — P0.** Данные клиники А никогда не видны клинике Б; филиал A1 не виден в контексте A2.
- **Масштабируемость.** Списки и запросы должны работать одинаково при 1 и при 1000 организациях. Пагинация и фильтрация обязательны там, где список растёт.
- **Нарастающая разработка.** Новые фичи — дополнение, не переписывание. Обратная совместимость важна.
- **Оптимизация с самого начала.** Тяжёлые операции проектируются с учётом роста данных.

**Флаг переключения:**
```
VITE_BACKEND_MODE=django   — этот репозиторий, Django API
VITE_BACKEND_MODE=supabase — оригинальный MamaDoc, Supabase
```

---

## Три репозитория проекта

| Роль | Путь на диске | GitHub |
|------|--------------|--------|
| **Этот фронт (Django-режим)** | `C:\Users\laby\Desktop\MamaDoc-django-front` | labyvaby/MamaDoc-django-front |
| **Django бэкенд** | `C:\Users\laby\Desktop\MamaDoc-backend` | labyvaby/MamaDoc-backend |
| **Оригинал (Supabase)** | `C:\Users\laby\Desktop\MamaDoc` | labyvaby/MamaDoc |

Оригинал — эталон дизайна и UX. Если непонятно как должна выглядеть страница — смотри `C:\Users\laby\Desktop\MamaDoc\src\pages\`.
Полный список API-эндпоинтов бэка — в `C:\Users\laby\Desktop\MamaDoc-backend\AGENTS.md`.

---

## Стек

| Что | Версия / примечание |
|-----|--------|
| React | 18.3 |
| TypeScript | strict |
| Vite | сборщик; dev через `refine dev` |
| MUI (Material UI) | v6 (+ `@mui/x-data-grid`, `@mui/x-date-pickers`, `@mui/lab`) |
| Refine | v5 — CRUD framework (используется в Supabase-режиме; в Django-режиме обходится прямыми вызовами) |
| React Router | v7 (пакет `react-router`) |
| @tanstack/react-query | кэш запросов (через Refine) |
| recharts | графики (отчёты) |
| dayjs | даты |

---

## Структура проекта (фактическая)

```
MamaDoc-django-front/
├── src/
│   ├── api/                    — ⭐ СЛОЙ ДОСТУПА К DJANGO API (основной способ)
│   │   ├── client.ts           — apiRequest<T>(), ApiError, credentials:include
│   │   ├── appointments.ts     — приёмы (services[] / products[] на запись)
│   │   ├── patients.ts, patientBalance.ts
│   │   ├── staff.ts            — сотрудники, онбординг, услуги, документы
│   │   ├── rbac.ts             — роли, права, memberships
│   │   ├── catalog.ts, warehouse.ts, sales.ts
│   │   ├── cashbox.ts, cashboxShifts.ts, expenses.ts
│   │   ├── payments.ts, medical.ts, attendance.ts, payroll.ts
│   │   ├── organization.ts, auth.ts
│   │   └── queryKeys.ts        — ключи react-query (djangoQueryKeys)
│   │
│   ├── pages/                  — страницы приложения
│   │   ├── appointments/       — приёмы (главная: AppointmentsPage, дроверы)
│   │   ├── patients/, patient-search/
│   │   ├── employes/           — сотрудники (Django-страница)
│   │   ├── cashbox/, expenses/, financial-reports/, reports/, salary-reports/
│   │   ├── products/, sales/, storage/, warehouses/
│   │   ├── doctor/, nurse/, work-shifts/   — кабинеты + СКУД
│   │   ├── profile/, auth/, client/        — профиль, вход, клиентский портал
│   │   ├── settings/           — настройки (роли, участники, организация, филиалы, …)
│   │   ├── admin/, print/, history/, all-appointments/, all-procedures/
│   │   └── placeholder/        — UnderConstruction / LegacyRouteGuard
│   │
│   ├── features/               — фиче-модули с логикой (НЕ только Refine-ресурсы)
│   │   ├── employees/          — карточка/дроверы сотрудника (Django + Supabase)
│   │   └── payroll/
│   │
│   ├── components/             — переиспользуемый UI (sidebar, ui/, rbac/, …)
│   ├── hooks/                  — usePermissions, useCan, useDjangoAppointmentData, …
│   ├── config/
│   │   ├── backend.ts          — ⭐ IS_DJANGO_BACKEND, BACKEND_MODE
│   │   ├── djangoDataProvider.ts — заглушка Refine-провайдера в Django-режиме
│   │   └── routeConfig.ts, appointmentStatuses.tsx, saleStatuses.tsx
│   ├── contexts/, providers/, theme.ts, utility/, types/
│   └── App.tsx                 — роутер + провайдеры
│
├── .env.local                  — локальные переменные (не в git)
├── vite.config.ts              — dev-прокси /api → Django сервер
└── AGENTS.md                   — этот файл
```

> ⚠️ Старая версия этого файла ссылалась на `src/providers/data/djangoDataProvider.ts`
> и `src/constants/config.ts` — таких путей НЕТ. Реальные: `src/config/djangoDataProvider.ts`
> и `src/config/backend.ts`.

---

## Переменные окружения (`.env.local`)

```env
VITE_BACKEND_MODE=django               — включает Django-режим во всём приложении
VITE_API_URL=/api                      — префикс API; в dev проксируется Vite'ом
VITE_API_PROXY_TARGET=http://localhost:8000   — куда Vite шлёт /api (локальный Django)
VITE_OFFICE_IP=                        — IP офиса для СКУД (clock in/out)
```

- В dev `VITE_API_URL=/api` + прокси Vite на `VITE_API_PROXY_TARGET`. Прокси переписывает
  Set-Cookie для локальной сессии (см. `vite.config.ts`).
- `VITE_API_PROXY_TARGET` можно указывать на прод (`https://newcrm.pediatr.kg`) или на
  локальный Django (`http://localhost:8000`).

---

## IS_DJANGO_BACKEND — главный флаг

Определён в **`src/config/backend.ts`**:
```ts
export const BACKEND_MODE =
  import.meta.env.VITE_BACKEND_MODE === "django" ? "django" : "supabase";
export const IS_DJANGO_BACKEND = BACKEND_MODE === "django";
```

**Правило:** любой Refine-хук (`useList`, `useOne`, `useCreate`, `useUpdate`) в компоненте,
который рендерится в Django-режиме, должен быть защищён:
```ts
useList({ resource: "roles", queryOptions: { enabled: !IS_DJANGO_BACKEND } });
```
Иначе Refine дёрнет Supabase dataProvider и упадёт.

---

## Как работают данные в Django-режиме

**Основной паттерн — НЕ Refine dataProvider, а прямые вызовы через `src/api/*.ts`:**

```ts
// src/api/client.ts
export async function apiRequest<T>(path, options): Promise<T>
//   fetch(`${API_BASE}${path}`, { credentials: "include", ... })
//   API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api"
//   401 → событие "mamadoc:api-unauthorized" (RequireAuth уводит на /login)
//   !ok → throw new ApiError(message, status, payload)
```

- Каждый домен имеет свой `src/api/<domain>.ts` с типами (camelCase, зеркало msgspec-payloads
  бэка) и функциями (`getX`, `createX`, `updateX`).
- Кэш — `@tanstack/react-query` (ключи в `src/api/queryKeys.ts`, `djangoQueryKeys`).
- Refine остаётся для Supabase-режима и общей обвязки (layout, kbar), но данные Django
  идут мимо него.

### ⚠️ Ловушка: имена полей записи ≠ чтения (приёмы)
При создании/обновлении приёма список услуг отправляется под ключом **`services`**
(НЕ `serviceLines` — это имя на чтение), товары — под ключом **`products`**. msgspec на
бэке молча отбрасывает неизвестные ключи, поэтому неверное имя тихо теряется и даёт 400
«передайте serviceId или непустой список services». См. `src/api/appointments.ts`
(`denormalizeCreatePayload`).

### Real-time (WebSocket) — приёмы
Сервер (Django Channels) толкает короткий hint об изменении в `wss://<origin>/ws/changes/`,
клиент по нему рефетчит экран обычным REST (данные по сокету не передаются). Аутентификация —
той же сессионной cookie; нужен активный филиал, иначе сокет закрывается кодом 4401 → работаем
на polling. События скоупятся по филиалу на момент подключения (смена филиала = переоткрытие).

- `src/hooks/useChangesSocket.ts` — generic-клиент канала (backoff, 4401, reconnect на focus/online).
- `src/hooks/useAppointmentsAutoSync.ts` — WS-триггер + polling-страховка `last-update`
  (25с при живом сокете, 2.5с без него — константы в `queryKeys.ts`). Polling НЕ выключать:
  сокет может отвалиться тихо, а это медцентр — надёжность важнее скорости.
- Оплаты/возвраты приходят как `entity: "appointment", action: "updated"`.
- Dev: Vite проксирует `/ws` → `VITE_WS_PROXY_TARGET` (по умолчанию `ws://localhost:8001`).
- Заключения и касса — следующие срезы, тот же механизм (подписка через `useChangesSocket`).

### Мульти-тенант на фронте
Пользователь часто работает суперюзером, а бэк отдаёт суперюзеру записи ВСЕХ организаций.
Поэтому списки (роли, участники, дропдаун ролей) фильтруются по активной организации
(`activeOrganization.id` из `usePermissions`). При создании/редактировании приёма шлём
`organizationId: activeOrganization?.id`, иначе бэк выводит орг из «активного членства» и
может разойтись с `branchId` → 400 «branch должен принадлежать организации приёма».

---

## Что подключено к Django API

| Область | Статус | Где |
|---------|--------|-----|
| Приёмы (регистратура) + услуги + **товары** + оплаты | ✅ Django | `pages/appointments/`, `api/appointments.ts` |
| Пациенты + баланс | ✅ Django | `pages/patients/`, `api/patients.ts` |
| Сотрудники (онбординг, редактирование, услуги, документы, специализации) | ✅ Django | `pages/employes/`, `features/employees/`, `api/staff.ts` |
| Роли / права / участники (RBAC) | ✅ Django | `pages/settings/` (Roles/Memberships), `api/rbac.ts` |
| Касса + смены | ✅ Django | `pages/cashbox/`, `api/cashbox.ts` |
| Расходы + категории | ✅ Django | `pages/expenses/`, `api/expenses.ts` |
| Склад / товары / продажи | ✅ Django | `pages/products,sales,storage,warehouses/`, `api/warehouse.ts` |
| Зарплата (отчёт, правила) | ✅ Django | `pages/salary-reports/`, `features/payroll/`, `api/payroll.ts` |
| СКУД / рабочие смены | ✅ Django | `pages/work-shifts/`, `api/attendance.ts` |
| Настройки (организация, филиалы, роли, участники, специализации) | ✅ Django | `pages/settings/` |
| Медицинские заключения | ✅ Django | `api/medical.ts`, дроверы приёма |

> Статусы меняются — проверяй фактический код/роуты в `App.tsx` перед тем как полагаться.

---

## Паттерн добавления Django-страницы

1. Тип + функции запроса — в `src/api/<domain>.ts` (типы camelCase = зеркало payload бэка).
2. Компонент в `src/pages/<module>/` — данные через `apiRequest` / `react-query`, не через Refine.
3. Если на странице есть Refine-хуки — защитить `enabled: !IS_DJANGO_BACKEND`.
4. В `App.tsx` — роут (часто `lazy()` для code-splitting). При необходимости гейтить правами
   через `RequirePermission` / `ProtectedRoute`.
5. Сайдбар (`components/sidebar/`) — пункт виден по праву (`useCan`/`CanAccess`); незаконченное →
   `UnderConstruction` / `LegacyRouteGuard`.

---

## Как запускать

```bash
npm install
npm run dev          # dev сервер на http://localhost:5177 (refine dev --port 5177)
npx tsc --noEmit     # проверка типов (обязательно перед коммитом)
npm run build        # tsc && refine build (production)
```

**Связь с бэком:** Django должен слушать `http://localhost:8000`. Vite проксирует `/api/*`
→ `VITE_API_PROXY_TARGET` (см. `vite.config.ts`). Бэкенд запускается из своего репозитория
через `.venv` (см. его AGENTS.md — там ВАЖНОЕ про две БД: рабочая = нативный Postgres, не Docker).

---

## Частые ошибки

**Refine getList / getOne падает в Django-режиме** — компонент вызывает `useList`/`useOne`
без `enabled: !IS_DJANGO_BACKEND`. Найти по стек-трейсу → добавить guard.

**Двоятся роли / участники / дропдаун ролей** — суперюзер видит все организации; фильтровать
по `activeOrganization.id` (см. «Мульти-тенант на фронте»).

**400 «передайте serviceId или непустой список services»** при создании приёма — отправлен
ключ `serviceLines` вместо `services` (см. ловушку имён полей выше).

**TypeScript-ошибки в Supabase-типах** — оригинальные типы из `src/types/` сгенерированы из
Supabase-схемы. В Django-режиме используем собственные интерфейсы рядом с `src/api/<domain>.ts`.

**Прокси / CORS** — проверить `VITE_API_PROXY_TARGET` в `.env.local` и `vite.config.ts`.
401 на запросах обычно значит, что сессия протухла (или бэк не запущен).
