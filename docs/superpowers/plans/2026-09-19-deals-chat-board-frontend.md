# Воронка продаж, этап 1 — фронт: боты, чат в карточке, realtime, DnD, линия этапов

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Экран ботов и кодов этапов в настройках, чат Chatwoot в карточке сделки, мгновенное обновление доски, DnD с сортировкой и линия истории этапов — поверх бэкенда `feat/deals-bot-api` (в проде с 19.09.2026, контракт `MamaDoc-backend/docs/deals-bot-api.md`).

**Architecture:** Всё в существующем модуле `src/pages/deals`, `src/components/deals`, `src/components/board`, `src/pages/settings`. API-слой — `src/api/deals.ts` (msgspec-camelCase контракт). Realtime — существующий `useChangesSocket` (`/ws/changes/`), расширенный полем `meta` и режимом без филиала. Чат — переиспользуем механику раздела «Чаты» (`fetchChatwootEmbed`, `useChatwootLoginFailed`), но со своей целью — ссылкой на разговор. Тексты — `src/locales/ru/deals.json` через `useT("deals")`.

**Tech Stack:** React 18, MUI 6, TanStack Query 5, framer-motion, `@dnd-kit/core` + `@dnd-kit/sortable` (новая зависимость), vitest.

**Ветка:** `feat/deals-chat-board` (worktree `front-deals`, от `origin/main`). Тесты: `npx vitest run <путь>`. Lint: `npx eslint <файлы>`, типы: `npx tsc --noEmit`. Деплой в этом плане **не делается**.

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `src/api/deals.ts` | типы и функции: `code` у этапа/воронки, поля Chatwoot и `lastActivityAt` у сделки, `actorKind/actorColor`, `stageCode`, боты и ключи, `getDealsMeta` |
| `src/api/deals.test.ts` | тесты API-слоя (существующий файл, добавить кейсы) |
| `src/api/queryKeys.ts` | `deals.bots`, `deals.botKeys` |
| `src/locales/ru/deals.json` | новые тексты: `settings.bots*`, `settings.stageCode*`, `detail.chat*`, `board.realtime*`, `timeline.*` |
| `src/pages/settings/DealsSettingsPage.tsx` | поле «Код» в диалоге этапа и у воронки; секция ботов |
| `src/pages/settings/deals/BotsSection.tsx` (новый) | список ботов, создание/правка, ключи, показ секрета |
| `src/hooks/useChangesSocket.ts` | `meta` в сообщении; сокет открывается и без филиала (`enabled`) |
| `src/pages/deals/useDealsRealtime.ts` (новый) | подписка на `entity=deal`, инвалидация доски/сводки, подсветка и звук новых |
| `src/pages/deals/useDealsRealtime.test.ts` (новый) | чистая логика: фильтр по pipelineId, «своя» сделка не звенит |
| `src/pages/deals/index.tsx`, `DealBoardView.tsx` | подключение realtime, переключатель звука, `highlightId` |
| `src/components/deals/DealChatPane.tsx` (новый) | iframe разговора: сессия → SSO → разговор → «переподключить» |
| `src/components/deals/DealDetailDrawer.tsx` | двухколоночный режим, вкладки на мобиле, `StageTimeline` |
| `src/components/deals/ChannelIcon.tsx` (новый) | иконка канала (WhatsApp/Instagram/Telegram/сайт/телефон) |
| `src/components/deals/StageTimeline.tsx` (новый) + `.test.tsx` | цветная полоса истории этапов, полный и compact |
| `src/components/deals/stageTimeline.ts` (новый) + `.test.ts` | чистый расчёт сегментов (пропорции, минимум 4 %) |
| `src/components/board/Board.tsx`, `BoardColumn.tsx`, `BoardCard.tsx`, `types.ts` | `@dnd-kit`: сортировка внутри колонки, плейсхолдер, overlay, автоскролл, тач; `onDrop(item, columnId, index)` |
| `src/pages/deals/DealBoardView.tsx` | `position = index`, перенос внутри колонки, иконка канала, «касание N мин назад», compact-полоса |
| `src/pages/tasks/*Board*` | принять третий аргумент `onDrop` (игнорировать) |

---

### Task 1: API-слой — типы, боты, ключи, meta

**Files:**
- Modify: `src/api/deals.ts`, `src/api/queryKeys.ts`
- Test: `src/api/deals.test.ts`

- [ ] **Step 1: Тесты** — в `src/api/deals.test.ts` по образцу существующих (мок `apiRequest`): `getBots` бьёт в `/deals/bots/` и возвращает `results`; `issueBotKey` — `POST /deals/bots/<id>/keys/` и отдаёт `{key, secret}`; `revokeBotKey` — `DELETE /deals/bots/<id>/keys/<keyId>/`; `getDealsMeta` — `/deals/meta/`; `moveDeal` принимает `stageCode` вместо `stageId`; `updateStage` с `clearCode`.
- [ ] **Step 2: Типы** — `DealStage.code: string | null`, `DealPipeline.code: string | null`; `DealChannel = "whatsapp" | "instagram" | "telegram" | "web" | "phone" | "other"`; `DealActorKind = "employee" | "bot"`; в `Deal`: `conversationId`, `contactId`, `channel`, `inboxName`, `chatUrl`, `lastActivityAt`, `createdByBotId`, `actorKind`, `actorColor`; в `DealActivity`/`DealStageLogEntry`/`DealChangeLogEntry`: `actorKind`, `actorColor`; `StagePayload.code?`, `clearCode?`; `MoveDealPayload.stageId?` + `stageCode?`; `CreateDealPayload`/`UpdateDealPayload`: `conversationId`, `contactId`, `channel`, `inboxName`, `clearConversation`; `DealBot`, `DealBotKey`, `DealBotIssued`, `DealsMeta`.
- [ ] **Step 3: Функции** — `getBots`, `createBot`, `updateBot`, `getBotKeys`, `issueBotKey`, `revokeBotKey`, `getDealsMeta`. `queryKeys.deals.bots(orgId)`, `botKeys(botId, orgId)`.
- [ ] **Step 4:** `npx vitest run src/api/deals.test.ts` → PASS; `npx tsc --noEmit` → чисто.
- [ ] **Step 5: Commit** `feat(deals): API-слой — боты, ключи, коды этапов, поля Chatwoot`.

---

### Task 2: Настройки — код этапа/воронки и секция «Боты»

**Files:**
- Modify: `src/pages/settings/DealsSettingsPage.tsx`, `src/locales/ru/deals.json`
- Create: `src/pages/settings/deals/BotsSection.tsx`

- [ ] **Step 1: Тексты** в `deals.json` → `settings`: `stageCode` «Код для интеграций», `stageCodeHint` «Латиница; по нему бот адресует этап. Пусто — этап недоступен боту», `pipelineCode`, `bots` «Боты и API-ключи», `botsHint`, `botAdd`, `botName`, `botColor`, `botBranch`, `botBranchAny` «Все филиалы», `botActive`, `botInactive`, `botKeys`, `botKeyIssue` «Выпустить ключ», `botKeyLabel`, `botKeyRevoke`, `botKeyRevokeConfirm`, `botKeySecretTitle` «Ключ выпущен», `botKeySecretHint` «Скопируйте сейчас — повторно он не показывается», `botKeyCopy`, `botKeyCopied`, `botKeysEmpty`, `botLastUsed`, `botNeverUsed`, `botKeysCount_one/few/many`.
- [ ] **Step 2: Код этапа** — в `StageDialog` поле `TextField label=settings.stageCode` с `helperText=stageCodeHint`, валидация `^[a-z0-9][a-z0-9_-]{0,63}$` (иначе `error`), в `onSubmit` — `code: value || null`; при редактировании пустое поле → `clearCode: true`. В строке этапа — серый `<code>{stage.code}</code>` рядом с названием. У воронки — поле «Код» рядом с названием в блоке воронки (та же валидация, `updatePipeline({code}|{clearCode})`).
- [ ] **Step 3: `BotsSection`** — props `{orgId, canManage}`. Запросы `getBots`; карточка бота: цветной кружок-робот (`SmartToyOutlined`), имя, филиал или «Все филиалы», чип статуса, «ключей: N», «последнее обращение». Раскрытие → таблица ключей (`getBotKeys`): label, `prefix…`, статус, срок, последнее использование, кнопка «Отозвать» (ConfirmDialog → `revokeBotKey`). Кнопка «Выпустить ключ» → диалог (label, срок необязательно) → `issueBotKey` → диалог «Ключ выпущен» с `secret` в моноширинном поле, кнопка «Скопировать» (`navigator.clipboard.writeText`, fallback — выделение), предупреждение. Диалог создания/правки бота: имя, цвет (палитра `STAGE_COLORS`), филиал (select из `useBranches`/`usePermissions().branches`), переключатель «Активен» (в правке). Ошибки — `dealsErrorMessage`.
- [ ] **Step 4:** Вставить `<Divider/> <BotsSection …/>` после справочников на `DealsSettingsPage`; секция видна только с `deals.manage`.
- [ ] **Step 5:** `npx tsc --noEmit`, `npx eslint src/pages/settings`; ручная проверка на dev-сервере против стенда/прода (`VITE_API_URL`): создать бота, выпустить ключ, отозвать.
- [ ] **Step 6: Commit** `feat(deals): настройки — коды этапов, боты и API-ключи`.

---

### Task 3: Realtime доски

**Files:**
- Modify: `src/hooks/useChangesSocket.ts`
- Create: `src/pages/deals/useDealsRealtime.ts`, `src/pages/deals/useDealsRealtime.test.ts`
- Modify: `src/pages/deals/index.tsx`, `src/pages/deals/DealBoardView.tsx`, `src/pages/deals/meta.tsx`, `src/locales/ru/deals.json`

- [ ] **Step 1: Тест чистой логики** `shouldReactToDealEvent(msg, pipelineId, ownIds)` → `{refetch: boolean, celebrate: boolean}`: чужая `entity` → нет; `deal` другой воронки → нет; `created` с `objectId` из `ownIds` → refetch без celebrate; `created` чужой → refetch + celebrate; `moved/updated/deleted` → refetch без celebrate.
- [ ] **Step 2: `useChangesSocket`** — `ChangeMessage` получает `organizationId: number | null`, `meta: Record<string, unknown>`; `branchId?: number` остаётся, добавляется `enabled?: boolean` (по умолчанию `branchId != null`; при `enabled: true` сокет открывается и без филиала — бэк с 19.09 принимает по членству). Зависимость эффекта — `[branchId, enabled]`.
- [ ] **Step 3: `useDealsRealtime({pipelineId, ownIds, onCelebrate})`** — `useChangesSocket({enabled: true, branchId: activeBranch?.id, onMessage})`; на подходящее событие — debounce 300 мс → `invalidateQueries(djangoQueryKeys.deals.all)`, отдельно `onCelebrate(objectId)` для чужих `created`. Скрытая вкладка — буфер до фокуса (как в `useRealtimeRefetch`). Возвращает `connected`.
- [ ] **Step 4: Интеграция** — в `index.tsx`: `const ownIds = useRef(new Set<number>())`, `CreateDealDrawer.onCreated` кладёт id; `useDealsRealtime` с `onCelebrate` → `setHighlightId(id)` + звук (`new Audio("/sounds/deal-new.mp3")` — короткий файл в `public/sounds/`, ≤ 30 КБ; играть только если `localStorage.dealsSound !== "off"`); переключатель звука (иконка `VolumeUpOutlined`/`VolumeOffOutlined`) в шапке доски; `DEALS_REFRESH_MS` → при `connected` 300 000, иначе 60 000 (`refetchInterval` берётся из состояния). В `DealBoardView` — проп `highlightId` → карточка с `id === highlightId` получает `boxShadow` рамку primary 3 с (`motion` initial/animate) и снимается по таймеру.
- [ ] **Step 5:** `npx vitest run src/pages/deals`, `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat(deals): realtime доски — мгновенные обновления, подсветка и звук новых сделок`.

---

### Task 4: Чат в карточке — `DealChatPane` и двухколоночный дровер

**Files:**
- Create: `src/components/deals/DealChatPane.tsx`, `src/components/deals/ChannelIcon.tsx`
- Modify: `src/components/deals/DealDetailDrawer.tsx`, `src/pages/deals/DealBoardView.tsx`, `src/locales/ru/deals.json`

- [ ] **Step 1: `ChannelIcon`** — `{channel, size?}` → `WhatsApp`, `Instagram`, `Telegram`, `Language` (web), `Phone`, `ChatBubbleOutline` (other) из `@mui/icons-material`, цвет бренда через `sx`; `title` — подпись канала (`t("channel.<code>")`).
- [ ] **Step 2: `DealChatPane`** — props `{chatUrl: string}`. Состояния `phase: "conversation" | "sso" | "return" | "failed"`, `attempt`. Стартуем с `src = chatUrl` (сессия Chatwoot в браузере обычно жива — раздел «Чаты»). `useChatwootLoginFailed(src, onLoginRequired)`: из `conversation` → `sso` (запрос `fetchChatwootEmbed`, `staleTime: Infinity, gcTime: 0`, `src = embed.url`); в `sso` по `onLoad` + 2500 мс → `return` (`src = chatUrl`, новый `key`); `login-required` в `return` → `failed` → экран «Вход в Чат-центр не завершился» с кнопкой «Переподключить» (`attempt + 1`, `phase = "sso"`). Ошибка `embed/` → `ChatsUnavailable reason=chatwootUnavailableReason(err)`. Подложка «Открываем разговор…» до `onLoad + 400 мс`, как в `ChatsFrame`. `allow="clipboard-write; microphone; camera; autoplay"`, без `sandbox`.
- [ ] **Step 3: Дровер** — `const withChat = Boolean(deal?.chatUrl) && canChat` где `canChat = can("chatwoot.view")`. `PaperProps.sx.width`: `{ xs: "100%", sm: withChat ? 1100 : 520 }`, `maxWidth: "100%"`. На `≥ md` при `withChat` — `Stack direction="row"`: левая колонка `520px` (нынешнее содержимое, `overflowY: auto`), `Divider orientation="vertical"`, правая `flex: 1` — шапка «Чат · {inboxName}» с `ChannelIcon` и кнопкой «Открыть в Чатах» (ссылка на `/chats`), ниже `DealChatPane`. На `< md` — `SegmentedTabs` «Сделка / Чат» под шапкой, чат занимает всю высоту. В шапке дровера рядом с телефоном — `ChannelIcon`. Права: `useCanChecker().can("chatwoot.view")`.
- [ ] **Step 4: Карточка доски** — `ChannelIcon` 14px перед телефоном (только если `channel !== "other"`); строка «касание N мин назад» из `lastActivityAt` (`dayjs().to()`), `warning.main` если старше 24 ч; актор-бот у создателя — маленький `SmartToyOutlined` цветом `actorColor` в тултипе «Создано ботом {name}».
- [ ] **Step 5: Деталь — история** — в `stageLog`/`activities`/`changeLog` показывать `actorName` с иконкой робота, если `actorKind === "bot"` (цвет `actorColor`).
- [ ] **Step 6:** `npx tsc --noEmit`, `npx eslint src/components/deals`; ручная проверка с включённым Chatwoot у организации.
- [ ] **Step 7: Commit** `feat(deals): чат Chatwoot в карточке сделки, канал и последнее касание на доске`.

---

### Task 5: DnD на `@dnd-kit`

**Files:**
- Modify: `package.json` (deps `@dnd-kit/core@^6`, `@dnd-kit/sortable@^10`, `@dnd-kit/utilities@^3`), `package-lock.json`
- Modify: `src/components/board/Board.tsx`, `BoardColumn.tsx`, `BoardCard.tsx`, `types.ts`
- Modify: `src/pages/deals/DealBoardView.tsx`, потребитель в `src/pages/tasks/`
- Test: `src/components/board/Board.test.tsx` (новый; `@testing-library/react`, если есть в проекте — проверить `package.json`; иначе тест чистой функции `resolveDrop`)

- [ ] **Step 1: Установить** `npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (в worktree — через junction на общий `node_modules` не ставить: сделать свой `node_modules` в `front-deals`, `npm ci` + `npm i`).
- [ ] **Step 2: Чистая функция** `resolveDrop(over, itemsByColumn)` в `src/components/board/dnd.ts` → `{columnId, index}` из `over.id` (карточка → её колонка и индекс; колонка → конец); тест: бросок на карточку в другой колонке даёт индекс карточки; на пустую колонку — 0; на ту же колонку ниже — индекс с поправкой на удаление.
- [ ] **Step 3: `Board`** — `DndContext` с сенсорами `PointerSensor({activationConstraint: {distance: 6}})`, `TouchSensor({activationConstraint: {delay: 200, tolerance: 5}})`, `KeyboardSensor`; каждая колонка — `useDroppable` + `SortableContext(items=ids, strategy=verticalListSortingStrategy)`; карточка — `useSortable`; `onDragOver` — визуальный плейсхолдер (dnd-kit сам раздвигает через `transform`); `DragOverlay` с копией карточки (`content` из `card(item)`, тень, `rotate(2deg)`); `onDragEnd` → `resolveDrop` → если колонка ≠ исходной или индекс изменился → `onDrop(item, columnId, index)`; `canDrop=false` — колонка `disabled` в `useDroppable` и приглушена. Автоскролл — встроенный `autoScroll` DndContext (горизонтальный контейнер доски получает `overflowX: auto`, уже есть). Меню «Перенести в…» — без изменений.
- [ ] **Step 4: `BoardProps.onDrop: (item, columnId, index) => void`**; `DealBoardView`: `moveMutation({deal, stageId, position: index})`, оптимистичное обновление вставляет карточку на `index`; перенос внутри колонки разрешён (`columnOf(item) === columnId` больше не отсекается в ядре — решает модуль: для сделок `canDrop` возвращает `true` для своей колонки). Задачи: `onDrop` игнорирует `index`.
- [ ] **Step 5:** `npx vitest run src/components/board`, `npx tsc --noEmit`; ручная проверка: сортировка внутри колонки, перенос между, тач в DevTools, клавиатура (Space, стрелки).
- [ ] **Step 6: Commit** `feat(board): drag-and-drop на @dnd-kit — сортировка внутри колонки, плейсхолдер, тач`.

---

### Task 6: Линия истории этапов

**Files:**
- Create: `src/components/deals/stageTimeline.ts`, `stageTimeline.test.ts`, `StageTimeline.tsx`
- Modify: `src/components/deals/DealDetailDrawer.tsx`, `src/pages/deals/DealBoardView.tsx`, `src/locales/ru/deals.json`

- [ ] **Step 1: Тест `buildStageSegments(log, stagesById, now)`** — три записи с интервалами 1 ч / 3 ч / открытый → доли ~0.2/0.6/0.2 с учётом `now`; сегмент короче 4 % растягивается до 4 % с перенормировкой остальных; закрытая сделка (последний этап `won/lost`) → `last.open === false`; пустой лог → `[]`.
- [ ] **Step 2: `buildStageSegments`** — возвращает `{stageId, name, color, kind, from, to, seconds, share, actorName, actorKind, actorColor, open}`; цвет из `stagesById` (по `stageId` из лога через `toStageId`), fallback `#94A3B8`.
- [ ] **Step 3: `StageTimeline`** — props `{segments, variant: "full" | "compact"}`. `full`: полоса 8 px `borderRadius: 4`, сегменты `flex: share`, последний открытый — `@keyframes pulse` opacity 1↔0.6; тултип `«{name} · {длительность} · {actorName} · {дата}»`; подписи под сегментами при `share ≥ 0.15`. `compact`: полоса 3 px без тултипов и подписей, `mt: 0.75`.
- [ ] **Step 4:** В дровере — под шапкой (до полей) `StageTimeline variant="full"` из `detail.stageLog` + `stages` (уже есть в дровере для селекта). На карточке доски — `compact` из `deal.stagePath`… бэк `stagePath` **не отдаёт** (не вошло в бэкенд-этап) — на карточке рисуем полосу из одного текущего сегмента: цвет этапа на всю ширину с пульсом, если `daysInStage != null`; полноценная полоса на карточке — после появления `stagePath` (заметка в TODO плана бэка).
- [ ] **Step 5:** `npx vitest run src/components/deals`, `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `feat(deals): линия истории этапов в карточке сделки`.

---

### Task 7: Финал

- [ ] `npx vitest run` целиком, `npx tsc --noEmit`, `npx eslint src`.
- [ ] `docs/frontend-deals-stage1-2026-09-19.md` — что появилось, какие права нужны (`deals.manage` для ботов, `chatwoot.view` для чата), что требует бэкенда ≥ 59521e4.
- [ ] Push `feat/deals-chat-board`; PR **не мержить и не деплоить** без отдельного разрешения.

---

## Самопроверка

- Спека §1.6 → Task 2; §3.2–3.4 → Task 4; §4.2 → Task 3; §5.1 → Task 5; §5.2 → Task 6 (с оговоркой про `stagePath`); §2.2 (код в настройках) → Task 2.
- Имена сквозные: `DealChannel`, `chatUrl`, `lastActivityAt`, `actorKind/actorColor`, `getBots/issueBotKey/revokeBotKey`, `useDealsRealtime`, `resolveDrop`, `buildStageSegments`, `StageTimeline`, `DealChatPane`, `ChannelIcon`.
