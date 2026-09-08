import { apiRequest, getErrorCode, type ApiError } from "./client";

/**
 * Модуль «Воронка продаж» (`deals`).
 *
 * Контракт: `MamaDoc/backend_answer_deals_module.md` (v2, 01.09.2026) — НЕ менять
 * без согласования с бэкенд-командой. Формы ниже сняты с живого API теста
 * 01.09.2026, снимок — `MamaDoc/deals-api-live-snapshot.md`; там же три
 * расхождения контракта с фактом, которые ещё дослать бэку.
 *
 * ⚠ Модуль выложен только на `test.crm.operator.kg`; на проде эндпоинтов ещё
 * нет (404), прод ждёт нашей сверки на тесте.
 */

/**
 * Модуль целиком: пункт меню, роут `/deals`, вкладка настроек воронок и блок
 * «Воронка продаж» в «Сводке».
 *
 * ⚠ Выключен до выкладки бэкенда на прод: там все `/api/deals/*` отвечают 404
 * (проверено под авторизацией 02.09.2026), и доска встречала бы владельца
 * ошибкой загрузки. Гейта по правам мало: роль `superadmin` проходит в
 * `usePermissions` любую проверку, а на проде эта роль есть у живых
 * аккаунтов. На тесте включать этим же флагом — сетевой слой готов.
 */
export const DEALS_MODULE_ENABLED = false;

// ── Types ──────────────────────────────────────────────────────────────────────

/** Тип этапа: рабочий, успешное закрытие, потеря. В воронке ровно один won и один lost. */
export type DealStageKind = "open" | "won" | "lost";

export type DealActivityType = "call" | "message" | "visit" | "note";

export interface DealStage {
  id: number;
  pipelineId: number;
  name: string;
  /** hex, приходит из настроек этапа: используем как есть, своей палитры не навязываем. */
  color: string;
  order: number;
  kind: DealStageKind;
  /** Норматив «сколько дней карточке позволено висеть»; null — норматива нет. */
  slaDays: number | null;
  isActive: boolean;
}

export interface DealPipeline {
  id: number;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  order: number;
  stages: DealStage[];
}

export interface DealDictionaryItem {
  id: number;
  name: string;
  isActive: boolean;
  order: number;
}

/**
 * Карточка сделки — один и тот же сериализатор в списке, `board/`, детали,
 * ответах POST/PATCH и `move/` (проверено на живом API).
 */
export interface Deal {
  id: number;
  pipelineId: number;
  stageId: number;
  stageName: string;
  stageKind: DealStageKind;
  contactName: string;
  phone: string;
  comment: string;
  patientId: number | null;
  patientName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  /** decimal строкой («3000.00») — не приводить к number при отправке обратно. */
  amount: string;
  currency: string;
  sourceId: number | null;
  sourceName: string | null;
  nextActionAt: string | null;
  /** Касание просрочено и сделка ещё в работе — считает бэк. */
  isActionOverdue: boolean;
  lostReasonId: number | null;
  lostReasonName: string | null;
  /** 0-based порядок внутри колонки; сервер держит нумерацию плотной. */
  position: number;
  branchId: number | null;
  branchName: string | null;
  /** Заявка с витрины `/book`, если сделка выросла из неё. Автозаведения в v1 нет. */
  bookingId: number | null;
  createdById: number | null;
  createdByName: string | null;
  itemsCount: number;
  activitiesCount: number;
  wonAt: string | null;
  closedAt: string | null;
  createdAt: string;
  /** Версия карточки для оптимистичного переноса, см. moveDeal. */
  updatedAt: string;
  /** Провисела дольше норматива этапа. При slaDays = null всегда false. */
  isSlaBreached: boolean;
  /** Дробное число дней с последнего входа в этап (0.04 — час); null — лога нет. */
  daysInStage: number | null;
}

export interface DealItem {
  id: number;
  dealId: number;
  serviceId: number | null;
  /** Название и цена — снимок прайса на момент добавления, задним числом не едут. */
  name: string;
  price: string;
  quantity: number;
  total: string;
}

export interface DealActivity {
  id: number;
  dealId: number;
  actorId: number | null;
  actorName: string | null;
  type: DealActivityType;
  note: string;
  occurredAt: string;
  createdAt: string;
}

export interface DealStageLogEntry {
  id: number;
  dealId: number;
  actorId: number | null;
  actorName: string | null;
  fromStageId: number | null;
  fromStageName: string | null;
  toStageId: number;
  toStageName: string;
  enteredAt: string;
  note: string;
  /** Сколько карточка пробыла в этапе, дробные часы — считает бэк. */
  durationHours: number | null;
}

export interface DealChangeLogEntry {
  id: number;
  dealId: number;
  actorId: number | null;
  actorName: string | null;
  /** Пока пишутся только `amount` и `assignee`. */
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** Деталь сделки: карточка завёрнута в `deal` — в отличие от POST/PATCH, где она плоско. */
export interface DealDetail {
  deal: Deal;
  items: DealItem[];
  activities: DealActivity[];
  stageLog: DealStageLogEntry[];
  changeLog: DealChangeLogEntry[];
}

/** Итог колонки: count и amountTotal — по всей колонке, а не по отданному срезу. */
export interface DealColumnTotals {
  stageId: number;
  count: number;
  amountTotal: string;
}

export interface DealBoardColumn extends DealColumnTotals {
  stageName: string;
  stageKind: DealStageKind;
  color: string;
  order: number;
  slaDays: number | null;
  /** Первые `limit` карточек колонки по position. */
  deals: Deal[];
}

export interface DealBoard {
  pipelineId: number;
  pipelineName: string;
  columns: DealBoardColumn[];
  limit: number;
  overdueActionsCount: number;
}

export interface DealsSummary {
  /** null — цифры по всем воронкам организации (параметр pipelineId не передан). */
  pipelineId: number | null;
  totalCount: number;
  totalAmount: string;
  openCount: number;
  openAmount: string;
  wonCount: number;
  wonAmount: string;
  lostCount: number;
  /** Открытые сделки с касанием до конца сегодняшнего дня — просроченные входят и сюда. */
  todayActionsCount: number;
  overdueActionsCount: number;
  /**
   * ⚠ Только непустые колонки и без stageName (проверено на живом API): полный
   * набор этапов и подписи берём из getPipelines/getStages, иначе пустые этапы
   * исчезают из воронки. Расхождение с контрактом дослано бэку.
   */
  columns: DealColumnTotals[];
}

export interface DealDuplicatePatient {
  id: number;
  fullName: string;
  phone: string;
  birthDate: string | null;
}

export interface DealDuplicates {
  /** Полная карточка, а не урезанная: дровер дедупа рисует этап, сумму, ответственного. */
  deals: Deal[];
  patients: DealDuplicatePatient[];
  /** Порог значащих цифр, с которого бэк вообще ищет (сейчас 5) — не хардкодить. */
  minDigits: number;
}

export interface DealsResponse {
  results: Deal[];
  count: number;
  next: string | null;
  previous: string | null;
  /** Для пилюли «Просрочено» без второго запроса. */
  overdueActionsCount: number;
}

export type DealsOrdering =
  | "board"
  | "created"
  | "createdAsc"
  | "amount"
  | "amountAsc"
  | "nextAction"
  | "updated";

export interface DealsFilters {
  pipelineId?: number;
  stageId?: number;
  assigneeId?: number;
  /** Взаимоисключимо с assigneeId; `me` без карточки сотрудника — пустой список, не ошибка. */
  assignee?: "me" | "none";
  sourceId?: number;
  lostReasonId?: number;
  /** Имя обращения, имя привязанного пациента, хвост телефона от 5 цифр. */
  search?: string;
  amountFrom?: string;
  amountTo?: string;
  createdFrom?: string;
  /** Голая дата = конец дня (бэк починил полночь 01.09.2026). */
  createdTo?: string;
  nextActionBefore?: string;
  hasOverdueAction?: boolean;
  kind?: DealStageKind;
  /** Только суперпользователю; обычная сессия режется своим филиалом на бэке. */
  branchId?: number;
  ordering?: DealsOrdering;
  page?: number;
  pageSize?: number;
  /** Обязателен суперпользователю на всех ручках модуля, иначе 400 (см. withOrg). */
  organizationId?: number;
}

export interface DealItemInput {
  serviceId: number;
  quantity: number;
  /** Своё название и цена — для позиции не из прайса. */
  name?: string;
  price?: string;
}

export interface CreateDealPayload {
  /** Единственное обязательное поле. */
  contactName: string;
  phone?: string;
  comment?: string;
  /** Не передан — воронка с isDefault, иначе первая активная. */
  pipelineId?: number;
  /** Не передан — первый активный open-этап; won/lost при создании запрещены (400). */
  stageId?: number;
  patientId?: number;
  assigneeId?: number;
  sourceId?: number;
  nextActionAt?: string;
  /** Позиции можно завести одним запросом; amount при непустых items игнорируется. */
  items?: DealItemInput[];
  amount?: string;
}

/**
 * PATCH tri-state: `null` в поле НЕ очищает (msgspec не отличает его от
 * «не присылали») — только явные clear-флаги.
 */
export interface UpdateDealPayload {
  contactName?: string;
  phone?: string;
  comment?: string;
  patientId?: number;
  assigneeId?: number;
  sourceId?: number;
  amount?: string;
  nextActionAt?: string;
  branchId?: number;
  clearAssignee?: boolean;
  clearPatient?: boolean;
  clearNextAction?: boolean;
  clearLostReason?: boolean;
  clearSource?: boolean;
  clearBranch?: boolean;
}

export interface MoveDealPayload {
  stageId: number;
  /** 0-based индекс, куда карточка встала; колонки перенумеровывает сервер. */
  position: number;
  /**
   * Версия карточки на экране. Расходится с сервером → 409 DEAL_MOVED со свежей
   * сделкой в details.deal. Не передавать — законный last-write-wins для
   * действия «Перенести в…» из только что загруженного списка.
   */
  updatedAt?: string;
  /** Обязателен при переходе в lost-этап; на не-lost этап — 400. */
  lostReasonId?: number;
  note?: string;
}

/** Ответ переноса: свежая карточка и итоги двух затронутых колонок. */
export interface MoveDealResponse {
  deal: Deal;
  columns: DealColumnTotals[];
}

export interface DealsFunnelStage {
  stageId: number;
  name: string;
  /** Сверх контракта, но приходит: тип и порядок этапа — чтобы не сверять со stages/. */
  kind: DealStageKind;
  order: number;
  /** Вошло в этап за период — считается по логу переходов, не по текущему положению. */
  entered: number;
  movedForward: number;
  lost: number;
  amountTotal: string;
}

export interface DealsFunnelTotals {
  created: number;
  won: number;
  lost: number;
  /** Созданные за период и до сих пор в работе. */
  inProgress: number;
  wonAmount: string;
  avgCheck: string;
  /** null — за период не выиграно ни одной сделки. Это не ноль: «0 дней» рисовать нельзя. */
  avgCycleDays: number | null;
  /** Сумма в работе на текущий момент, а не за период. */
  pipelineAmount: string;
}

/**
 * Разбивка аналитики. ⚠ Ключ именно `id`, а не `sourceId`/`assigneeId`, как
 * обещал контракт: проверено на живом API 01.09.2026. `null` — «без источника»
 * / «без ответственного», бэк отдаёт их строкой «—».
 */
export interface DealsFunnelBreakdown {
  id: number | null;
  name: string;
  created: number;
  won: number;
  wonAmount: string;
}

export type DealsFunnelBySource = DealsFunnelBreakdown;
export type DealsFunnelByAssignee = DealsFunnelBreakdown;

export interface DealsFunnelLostReason {
  lostReasonId: number | null;
  name: string;
  count: number;
}

export interface DealsFunnel {
  pipelineId: number | null;
  /** Границы, нормализованные бэком: dateTo приходит концом дня. */
  dateFrom: string | null;
  dateTo: string | null;
  stages: DealsFunnelStage[];
  totals: DealsFunnelTotals;
  bySource: DealsFunnelBySource[];
  byAssignee: DealsFunnelByAssignee[];
  lostReasons: DealsFunnelLostReason[];
}

export interface DealsFunnelFilters {
  pipelineId?: number;
  dateFrom?: string;
  dateTo?: string;
  assigneeId?: number;
  sourceId?: number;
  branchId?: number;
  organizationId?: number;
}

// ── Ошибки контракта ───────────────────────────────────────────────────────────

/** Конфликт одновременного переноса: 409, в details.deal — актуальная сделка. */
export const DEAL_MOVED = "DEAL_MOVED";
/** Правка суммы выигранной сделки без deals.amount_override: 403. */
export const AMOUNT_LOCKED = "AMOUNT_LOCKED";
/** Удаление этапа со сделками без moveToStageId: 400, в details.dealsCount. */
export const STAGE_NOT_EMPTY = "STAGE_NOT_EMPTY";
/** Возврат won/lost в работу без deals.manage: 403. */
export const REOPEN_FORBIDDEN = "REOPEN_FORBIDDEN";

/**
 * Свежая сделка из ответа 409, чтобы доска перерисовалась без второго запроса.
 *
 * Запреты по деньгам и причине потери своего кода не имеют — приходят как
 * VALIDATION_ERROR с готовым русским текстом в error.message; их показываем как есть.
 */
export function getMovedDeal(error: unknown): Deal | null {
  if (getErrorCode(error) !== DEAL_MOVED) return null;
  const details = (error as ApiError).details as { deal?: Deal } | null | undefined;
  return details?.deal ?? null;
}

/** Сколько сделок мешает удалить этап (для диалога «куда перенести»). */
export function getStageDealsCount(error: unknown): number | null {
  if (getErrorCode(error) !== STAGE_NOT_EMPTY) return null;
  const details = (error as ApiError).details as { dealsCount?: number } | null | undefined;
  return details?.dealsCount ?? null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Бэк выводит организацию из membership сессии, но суперпользователю (и
 * мультиорг-аккаунту) нужен явный organizationId — на всех ручках модуля,
 * включая POST/PATCH/DELETE (проверено на живом API 01.09.2026: без него 400
 * VALIDATION_ERROR). Заголовок X-Organization-Id бэк тоже принимает и он
 * старше query, но мы его пока не шлём нигде в приложении.
 */
function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}

function buildDealParams(filters: DealsFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (filters.pipelineId != null) q.set("pipelineId", String(filters.pipelineId));
  if (filters.stageId != null) q.set("stageId", String(filters.stageId));
  if (filters.assigneeId != null) q.set("assigneeId", String(filters.assigneeId));
  if (filters.assignee) q.set("assignee", filters.assignee);
  if (filters.sourceId != null) q.set("sourceId", String(filters.sourceId));
  if (filters.lostReasonId != null) q.set("lostReasonId", String(filters.lostReasonId));
  if (filters.search) q.set("search", filters.search);
  if (filters.amountFrom) q.set("amountFrom", filters.amountFrom);
  if (filters.amountTo) q.set("amountTo", filters.amountTo);
  if (filters.createdFrom) q.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) q.set("createdTo", filters.createdTo);
  if (filters.nextActionBefore) q.set("nextActionBefore", filters.nextActionBefore);
  if (filters.hasOverdueAction) q.set("hasOverdueAction", "true");
  if (filters.kind) q.set("kind", filters.kind);
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.ordering) q.set("ordering", filters.ordering);
  if (filters.page != null) q.set("page", String(filters.page));
  if (filters.pageSize != null) q.set("pageSize", String(filters.pageSize));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  return q;
}

/** Конверт `{results}` без пагинации — у всех ручек модуля, кроме списка сделок. */
interface ResultsEnvelope<T> {
  results: T[];
}

// ── Воронки и этапы ────────────────────────────────────────────────────────────

export async function getPipelines(
  organizationId?: number,
  includeInactive = false,
  signal?: AbortSignal,
): Promise<DealPipeline[]> {
  const path = includeInactive ? "/deals/pipelines/?includeInactive=1" : "/deals/pipelines/";
  const res = await apiRequest<ResultsEnvelope<DealPipeline>>(withOrg(path, organizationId), { signal });
  return res.results ?? [];
}

export function createPipeline(
  payload: { name: string; isDefault?: boolean },
  organizationId?: number,
): Promise<DealPipeline> {
  return apiRequest<DealPipeline>(withOrg("/deals/pipelines/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updatePipeline(
  pipelineId: number,
  payload: { name?: string; isDefault?: boolean; isActive?: boolean; order?: number },
  organizationId?: number,
): Promise<DealPipeline> {
  return apiRequest<DealPipeline>(withOrg(`/deals/pipelines/${pipelineId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

/** 400, если в воронке есть сделки. */
export function deletePipeline(pipelineId: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`/deals/pipelines/${pipelineId}/`, organizationId), {
    method: "DELETE",
  });
}

export async function getStages(
  pipelineId?: number,
  organizationId?: number,
  includeInactive = false,
  signal?: AbortSignal,
): Promise<DealStage[]> {
  const q = new URLSearchParams();
  if (pipelineId != null) q.set("pipelineId", String(pipelineId));
  if (includeInactive) q.set("includeInactive", "1");
  const query = q.toString();
  const res = await apiRequest<ResultsEnvelope<DealStage>>(
    withOrg(`/deals/stages/${query ? `?${query}` : ""}`, organizationId),
    { signal },
  );
  return res.results ?? [];
}

export interface StagePayload {
  pipelineId: number;
  name: string;
  color?: string;
  kind?: DealStageKind;
  slaDays?: number | null;
  order?: number;
}

/** Второй won/lost-этап в воронке создать нельзя — 400. */
export function createStage(payload: StagePayload, organizationId?: number): Promise<DealStage> {
  return apiRequest<DealStage>(withOrg("/deals/stages/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateStage(
  stageId: number,
  payload: Partial<Omit<StagePayload, "pipelineId">> & { isActive?: boolean },
  organizationId?: number,
): Promise<DealStage> {
  return apiRequest<DealStage>(withOrg(`/deals/stages/${stageId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

/**
 * Удаление этапа. Со сделками внутри — только с `moveToStageId`, иначе 400
 * STAGE_NOT_EMPTY с количеством в details (спрашиваем, куда переносить).
 * Этап won или lost не удаляется вовсе.
 */
export function deleteStage(
  stageId: number,
  moveToStageId?: number,
  organizationId?: number,
): Promise<void> {
  const path =
    moveToStageId != null
      ? `/deals/stages/${stageId}/?moveToStageId=${moveToStageId}`
      : `/deals/stages/${stageId}/`;
  return apiRequest<void>(withOrg(path, organizationId), { method: "DELETE" });
}

/**
 * Порядок этапов — только целиком: `stageIds` должен содержать ВСЕ этапы
 * воронки, неполный список → 400 с перечислением недостающих id. Так не
 * возникает промежуточного состояния с дублями order.
 */
export async function reorderStages(
  pipelineId: number,
  stageIds: number[],
  organizationId?: number,
): Promise<DealStage[]> {
  const res = await apiRequest<ResultsEnvelope<DealStage> | DealStage[]>(
    withOrg("/deals/stages/reorder/", organizationId),
    { method: "POST", body: { pipelineId, stageIds } },
  );
  return Array.isArray(res) ? res : res.results ?? [];
}

// ── Справочники ────────────────────────────────────────────────────────────────

async function getDictionary(
  path: string,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealDictionaryItem[]> {
  const res = await apiRequest<ResultsEnvelope<DealDictionaryItem>>(withOrg(path, organizationId), {
    signal,
  });
  return res.results ?? [];
}

export function getDealSources(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealDictionaryItem[]> {
  return getDictionary("/deals/sources/", organizationId, signal);
}

export function getLostReasons(
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealDictionaryItem[]> {
  return getDictionary("/deals/lost-reasons/", organizationId, signal);
}

export function createDealSource(
  payload: { name: string; order?: number },
  organizationId?: number,
): Promise<DealDictionaryItem> {
  return apiRequest<DealDictionaryItem>(withOrg("/deals/sources/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateDealSource(
  sourceId: number,
  payload: { name?: string; isActive?: boolean; order?: number },
  organizationId?: number,
): Promise<DealDictionaryItem> {
  return apiRequest<DealDictionaryItem>(withOrg(`/deals/sources/${sourceId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

/** 400, если источник уже используется сделками — предлагаем архивировать (isActive: false). */
export function deleteDealSource(sourceId: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`/deals/sources/${sourceId}/`, organizationId), {
    method: "DELETE",
  });
}

export function createLostReason(
  payload: { name: string; order?: number },
  organizationId?: number,
): Promise<DealDictionaryItem> {
  return apiRequest<DealDictionaryItem>(withOrg("/deals/lost-reasons/", organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateLostReason(
  reasonId: number,
  payload: { name?: string; isActive?: boolean; order?: number },
  organizationId?: number,
): Promise<DealDictionaryItem> {
  return apiRequest<DealDictionaryItem>(withOrg(`/deals/lost-reasons/${reasonId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteLostReason(reasonId: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`/deals/lost-reasons/${reasonId}/`, organizationId), {
    method: "DELETE",
  });
}

// ── Доска, сводка, дедуп ───────────────────────────────────────────────────────

export interface DealBoardParams extends Omit<DealsFilters, "stageId" | "page" | "pageSize"> {
  /** Сколько карточек отдать в каждой колонке; count и amountTotal — по всей колонке. */
  limit?: number;
}

/** Доска одним запросом: колонки с итогами и первыми `limit` карточками. */
export function getDealBoard(params: DealBoardParams = {}, signal?: AbortSignal): Promise<DealBoard> {
  const { limit, ...filters } = params;
  const q = buildDealParams(filters);
  if (limit != null) q.set("limit", String(limit));
  const query = q.toString();
  return apiRequest<DealBoard>(`/deals/board/${query ? `?${query}` : ""}`, { signal });
}

export function getDealsSummary(
  params: { pipelineId?: number; branchId?: number; organizationId?: number } = {},
  signal?: AbortSignal,
): Promise<DealsSummary> {
  const q = buildDealParams(params);
  const query = q.toString();
  return apiRequest<DealsSummary>(`/deals/summary/${query ? `?${query}` : ""}`, { signal });
}

/**
 * Дедуп при заведении обращения: похожие сделки и карточки пациентов с тем же
 * хвостом номера. Порог — `minDigits` в ответе (сейчас 5), меньше цифр — пустые
 * списки без ошибки. По филиалу сознательно не режется: человек звонит в тот
 * филиал, который взял трубку.
 */
export function getDealDuplicates(
  phone: string,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealDuplicates> {
  const q = new URLSearchParams({ phone });
  if (organizationId != null) q.set("organizationId", String(organizationId));
  return apiRequest<DealDuplicates>(`/deals/duplicates/?${q.toString()}`, { signal });
}

export function getDealsFunnel(
  filters: DealsFunnelFilters = {},
  signal?: AbortSignal,
): Promise<DealsFunnel> {
  const q = new URLSearchParams();
  if (filters.pipelineId != null) q.set("pipelineId", String(filters.pipelineId));
  if (filters.dateFrom) q.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) q.set("dateTo", filters.dateTo);
  if (filters.assigneeId != null) q.set("assigneeId", String(filters.assigneeId));
  if (filters.sourceId != null) q.set("sourceId", String(filters.sourceId));
  if (filters.branchId != null) q.set("branchId", String(filters.branchId));
  if (filters.organizationId != null) q.set("organizationId", String(filters.organizationId));
  const query = q.toString();
  return apiRequest<DealsFunnel>(`/deals/analytics/funnel/${query ? `?${query}` : ""}`, { signal });
}

// ── Сделки ─────────────────────────────────────────────────────────────────────

export function getDeals(filters: DealsFilters = {}, signal?: AbortSignal): Promise<DealsResponse> {
  const query = buildDealParams(filters).toString();
  return apiRequest<DealsResponse>(`/deals/${query ? `?${query}` : ""}`, { signal });
}

/** Деталь: карточка + позиции, касания, история этапов и правок. */
export function getDeal(
  dealId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealDetail> {
  return apiRequest<DealDetail>(withOrg(`/deals/${dealId}/`, organizationId), { signal });
}

export function createDeal(payload: CreateDealPayload, organizationId?: number): Promise<Deal> {
  return apiRequest<Deal>(withOrg("/deals/", organizationId), { method: "POST", body: payload });
}

export function updateDeal(
  dealId: number,
  payload: UpdateDealPayload,
  organizationId?: number,
): Promise<Deal> {
  return apiRequest<Deal>(withOrg(`/deals/${dealId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

/** Мягкое удаление: строка остаётся, из выдач исчезает, вернуть её нечем. */
export function deleteDeal(dealId: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`/deals/${dealId}/`, organizationId), { method: "DELETE" });
}

/**
 * Перенос карточки между этапами и внутри колонки.
 *
 * Отвечает 201 (это не признак создания) и отдаёт свежую сделку с новым
 * updatedAt — его обязательно кладём в кэш, иначе следующий перенос той же
 * карточки пошлёт устаревшую версию и словит 409 на ровном месте.
 */
export function moveDeal(
  dealId: number,
  payload: MoveDealPayload,
  organizationId?: number,
): Promise<MoveDealResponse> {
  return apiRequest<MoveDealResponse>(withOrg(`/deals/${dealId}/move/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

/**
 * Перенос с подчисткой причины потери.
 *
 * ⚠ Костыль под расхождение с контрактом: при возврате из `lost` в работу бэк
 * очищает `wonAt`/`closedAt`, но `lostReason` оставляет — и активная карточка
 * висит с плашкой «Причина потери: Дорого» (проверено на живом API
 * 01.09.2026). Передать причину на не-lost этап он при этом запрещает (400),
 * то есть сам считает такое состояние недопустимым. Досылаем `clearLostReason`
 * вторым запросом; когда бэк починит — убрать вместе с этим комментарием.
 */
export async function moveDealTo(
  dealId: number,
  payload: MoveDealPayload,
  organizationId?: number,
): Promise<MoveDealResponse> {
  const res = await moveDeal(dealId, payload, organizationId);
  if (res.deal.stageKind !== "open" || res.deal.lostReasonId == null) return res;
  const deal = await updateDeal(dealId, { clearLostReason: true }, organizationId);
  return { ...res, deal };
}

// ── Позиции, касания, логи ─────────────────────────────────────────────────────

export interface DealItemsResponse {
  results: DealItem[];
  /** Сумма сделки после изменения позиций — пересчитывать на клиенте не нужно. */
  amount: string;
}

export function getDealItems(
  dealId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealItemsResponse> {
  return apiRequest<DealItemsResponse>(withOrg(`/deals/${dealId}/items/`, organizationId), { signal });
}

export function addDealItem(
  dealId: number,
  payload: DealItemInput,
  organizationId?: number,
): Promise<DealItem> {
  return apiRequest<DealItem>(withOrg(`/deals/${dealId}/items/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

export function updateDealItem(
  itemId: number,
  payload: { quantity?: number; price?: string; name?: string },
  organizationId?: number,
): Promise<DealItem> {
  return apiRequest<DealItem>(withOrg(`/deals/items/${itemId}/`, organizationId), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteDealItem(itemId: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`/deals/items/${itemId}/`, organizationId), { method: "DELETE" });
}

export async function getDealActivities(
  dealId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealActivity[]> {
  const res = await apiRequest<ResultsEnvelope<DealActivity>>(
    withOrg(`/deals/${dealId}/activities/`, organizationId),
    { signal },
  );
  return res.results ?? [];
}

export function addDealActivity(
  dealId: number,
  payload: { type: DealActivityType; note?: string; occurredAt?: string },
  organizationId?: number,
): Promise<DealActivity> {
  return apiRequest<DealActivity>(withOrg(`/deals/${dealId}/activities/`, organizationId), {
    method: "POST",
    body: payload,
  });
}

export async function getDealChangelog(
  dealId: number,
  organizationId?: number,
  signal?: AbortSignal,
): Promise<DealChangeLogEntry[]> {
  const res = await apiRequest<ResultsEnvelope<DealChangeLogEntry>>(
    withOrg(`/deals/${dealId}/changelog/`, organizationId),
    { signal },
  );
  return res.results ?? [];
}
