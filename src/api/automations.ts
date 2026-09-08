import { apiRequest } from "./client";
import { scopeParams, type Scope } from "./scope";

/**
 * Конструктор автоматизаций: «КОГДА событие → ЕСЛИ условия → ТО действия».
 *
 * Контракт — `docs/automations-api.md` в backend-репозитории. Модуль живёт на
 * `/api/v2/`, поэтому пути здесь начинаются с `/v2/automations/`, а не с
 * имени домена, как у остальных модулей фронта.
 *
 * Единственный источник правды о событиях, полях, операторах и переменных —
 * `/catalog/`. Свой фиксированный список держать нельзя: каталог расширяется
 * на бэке, и захардкоженный фронт молча потеряет новые события.
 */

const BASE = "/v2/automations";

export type AutomationStatus = "draft" | "active" | "paused";

/** Значение select-поля условия; приходит только для `fieldType: "select"`. */
export interface AutomationFieldOption {
  value: string;
  label: string;
}

export interface AutomationCatalogField {
  code: string;
  label: string;
  /**
   * `select` — значения в `options`; `branch` / `service` / `employee` /
   * `client` — ID из собственных справочников фронта; `decimal` / `integer` —
   * число (деньги передаём строкой).
   */
  fieldType: string;
  operators: string[];
  options: AutomationFieldOption[];
  /**
   * Поле есть у события, но конструктор его не предлагает (ID-шные ссылки).
   * Приходит в каталоге, чтобы сохранённые условия оставались читаемыми, а
   * `branch_id` продолжал включать выбор филиала у правила.
   */
  hidden?: boolean;
}

export interface AutomationCatalogEvent {
  code: string;
  label: string;
  module: string;
  fields: AutomationCatalogField[];
  variables: string[];
  /**
   * Код переменной → подпись для интерфейса. Показывать пользователю нужно
   * подпись, а вставлять в шаблон — код. Кода может не быть в словаре: тогда
   * показываем сам код (бэк может добавить переменную раньше подписи).
   */
  variableLabels: Record<string, string>;
}

/** Подпись переменной для интерфейса; фолбэк — сам код. */
export function variableLabel(
  event: AutomationCatalogEvent | undefined,
  code: string,
): string {
  return event?.variableLabels?.[code] || code;
}

export interface AutomationCatalogActionConfigField {
  code: string;
  label: string;
  type: string;
  options?: string[];
  default?: string;
  /** Поле имеет смысл только для этих каналов (пусто = для всех). */
  onlyForChannels?: string[];
}

export interface AutomationCatalogAction {
  code: string;
  label: string;
  configFields: AutomationCatalogActionConfigField[];
}

export interface AutomationCatalog {
  events: AutomationCatalogEvent[];
  actions: AutomationCatalogAction[];
  conditionGroupOperators: string[];
}

/** Лист дерева условий. У оператора `exists` поля `value` нет. */
export interface AutomationConditionLeaf {
  field: string;
  operator: string;
  value?: unknown;
}

/** Узел дерева. Пустые группы бэк отклоняет, вложенность глубже 4 — тоже. */
export interface AutomationConditionGroup {
  operator: string;
  items: AutomationConditionNode[];
}

export type AutomationConditionNode =
  | AutomationConditionLeaf
  | AutomationConditionGroup;

/** `{}` — «без условий», совпадает всегда. */
export type AutomationConditions =
  | Record<string, never>
  | AutomationConditionNode;

export interface AutomationActionConfig {
  channel?: string;
  recipientField?: string;
  /**
   * Телефон получателя целиком («+996700000001»). Только у правил по
   * расписанию: события там нет, брать номер из payload неоткуда.
   */
  recipientPhone?: string;
  /** Заголовок push-уведомления; у SMS и WhatsApp заголовка нет. */
  title?: string;
  body?: string;
  [key: string]: unknown;
}

export interface AutomationAction {
  id: number;
  position: number;
  actionType: string;
  delayMinutes: number;
  config: AutomationActionConfig;
}

/**
 * Повторение правила по расписанию.
 *
 * `weekly` — по выбранным дням недели (0 = понедельник), `interval_days` —
 * каждые N дней от `startDate` (по умолчанию — день сохранения). Время всегда
 * местное для филиала правила, а для правила «во всех филиалах» — по часовому
 * поясу установки.
 */
export interface AutomationSchedule {
  kind: "weekly" | "interval_days";
  /** «ЧЧ:ММ». */
  time: string;
  /** Только у `weekly`. 0 = понедельник, 6 = воскресенье. */
  weekdays?: number[];
  /** Только у `interval_days`. */
  intervalDays?: number;
  /** Только у `interval_days`: «ГГГГ-ММ-ДД», точка отсчёта сетки. */
  startDate?: string;
}

export interface Automation {
  id: number;
  organizationId: number;
  branchId: number | null;
  branchName: string | null;
  name: string;
  eventCode: string;
  eventLabel: string;
  status: AutomationStatus;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  /** Пусто у правила по событию. */
  schedule: AutomationSchedule | Record<string, never>;
  /** Ближайшее срабатывание; `null` у события и у неактивного расписания. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationActionInput {
  actionType: string;
  delayMinutes: number;
  config: AutomationActionConfig;
}

/**
 * Тело `POST` и `PUT`. `PUT` — полная замена: отправлять нужно всё состояние
 * формы, частичного обновления на бэке нет (как и `PATCH` с `DELETE`).
 */
export interface AutomationSaveInput {
  name: string;
  eventCode: string;
  status: AutomationStatus;
  branchId: number | null;
  conditions: AutomationConditions;
  actions: AutomationActionInput[];
  /** Обязательно для события расписания, игнорируется для остальных. */
  schedule?: AutomationSchedule;
  organizationId?: number;
}

export type AutomationRunStatus =
  | "matched"
  | "skipped"
  | "completed"
  | "failed";

export type AutomationJobStatus = "pending" | "sent" | "failed" | "cancelled";

export interface AutomationJob {
  id: number;
  actionType: string;
  status: AutomationJobStatus;
  scheduledFor: string;
  recipient: string;
  renderedBody: string;
  attemptsCount: number;
  externalMessageId: string;
  error: string;
}

export interface AutomationRun {
  id: number;
  eventCode: string;
  /** Правило, породившее запуск — общая история смешивает разные правила. */
  automationId: number;
  automationName: string;
  eventPayload: Record<string, unknown>;
  status: AutomationRunStatus;
  error: string;
  jobs: AutomationJob[];
  createdAt: string;
  completedAt: string | null;
}

export interface AutomationTestInput {
  eventCode: string;
  conditions: AutomationConditions;
  actions: AutomationActionInput[];
  eventPayload: Record<string, unknown>;
  schedule?: AutomationSchedule;
  organizationId?: number;
}

export interface AutomationTestActionPreview {
  actionType: string;
  recipient: string;
  renderedBody: string;
  delayMinutes: number;
  channel: string;
  renderedTitle: string;
}

export interface AutomationTestResult {
  matched: boolean;
  actions: AutomationTestActionPreview[];
}

/**
 * Скоуп: у автоматизаций филиал — часть самой сущности (`branchId` в теле), а
 * не фильтр списка, поэтому в query уходит только `organizationId`. Без него
 * мультиорг-пользователь и суперадмин получат не ту организацию, которую
 * видят на экране.
 */
function orgQuery(scope: Scope): string {
  const qs = scopeParams({ organizationId: scope.organizationId }).toString();
  return qs ? `?${qs}` : "";
}

export function getAutomationCatalog(
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<AutomationCatalog> {
  return apiRequest<AutomationCatalog>(`${BASE}/catalog/${orgQuery(scope)}`, {
    signal,
  });
}

export function getAutomations(
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<Automation[]> {
  return apiRequest<Automation[]>(`${BASE}/${orgQuery(scope)}`, { signal });
}

export function getAutomation(
  id: number,
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<Automation> {
  return apiRequest<Automation>(`${BASE}/${id}/${orgQuery(scope)}`, { signal });
}

export function createAutomation(
  input: AutomationSaveInput,
  signal?: AbortSignal,
): Promise<Automation> {
  return apiRequest<Automation>(`${BASE}/`, {
    method: "POST",
    body: input,
    signal,
  });
}

/** Полная замена определения. История Run сохраняется, Job хранят снимок. */
export function updateAutomation(
  id: number,
  input: AutomationSaveInput,
  signal?: AbortSignal,
): Promise<Automation> {
  return apiRequest<Automation>(`${BASE}/${id}/`, {
    method: "PUT",
    body: input,
    signal,
  });
}

export function getAutomationRuns(
  id: number,
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<AutomationRun[]> {
  return apiRequest<AutomationRun[]>(`${BASE}/${id}/runs/${orgQuery(scope)}`, {
    signal,
  });
}

/**
 * История всех правил организации — источник данных вкладки «История».
 * Формат Run тот же, что у истории одного правила, поэтому разбор общий.
 */
export function getOrganizationRuns(
  params: { automationId?: number; status?: AutomationRunStatus } = {},
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<AutomationRun[]> {
  const query = scopeParams({ organizationId: scope.organizationId });
  if (params.automationId != null) {
    query.set("automationId", String(params.automationId));
  }
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return apiRequest<AutomationRun[]>(`${BASE}/runs/${qs ? `?${qs}` : ""}`, {
    signal,
  });
}

/**
 * Dry run: проверяет условия и рендер шаблона без сохранения и без вызова
 * провайдера. Успех отвечает `201`, хотя ничего не создаёт.
 */
export function testAutomation(
  input: AutomationTestInput,
  signal?: AbortSignal,
): Promise<AutomationTestResult> {
  return apiRequest<AutomationTestResult>(`${BASE}/test/`, {
    method: "POST",
    body: input,
    signal,
  });
}

/** Группа (`operator` + `items`), а не лист условия. */
export function isConditionGroup(
  node: AutomationConditionNode,
): node is AutomationConditionGroup {
  return Array.isArray((node as AutomationConditionGroup).items);
}

/** `{}` — «без условий»: ни поля листа, ни items группы. */
export function isEmptyConditions(
  conditions: AutomationConditions,
): conditions is Record<string, never> {
  if (!conditions || typeof conditions !== "object") return true;
  const node = conditions as AutomationConditionNode;
  return !isConditionGroup(node) && !(node as AutomationConditionLeaf).field;
}

/**
 * Канал доставки через приложение ProfiChat.
 *
 * Бэкенд отдаёт его в списке каналов только когда интеграция включена и
 * ключ задан, поэтому проверять доступность отдельно не нужно: нет в
 * каталоге — нет и в выпадающем списке.
 */
export const PROFICHAT_PUSH_CHANNEL = "profichat_push";

/**
 * Псевдособытие правила по расписанию.
 *
 * В каталоге оно приходит как обычное событие — но без полей условий: сама
 * периодичность и есть триггер, проверять там нечего.
 */
export const SCHEDULE_EVENT_CODE = "schedule.recurring";

/** Правило запускается расписанием, а не событием домена. */
export function isScheduledEvent(eventCode: string): boolean {
  return eventCode === SCHEDULE_EVENT_CODE;
}

/** Верхняя граница `intervalDays` — ограничение бэка. */
export const MAX_INTERVAL_DAYS = 365;

/** Операторы, которым `value` не нужен вовсе. */
export const OPERATORS_WITHOUT_VALUE = new Set(["exists"]);

/** Операторы, которым `value` обязан приходить массивом. */
export const OPERATORS_WITH_LIST_VALUE = new Set(["in", "not_in"]);

/** Максимальная вложенность групп условий — ограничение бэка. */
export const MAX_CONDITION_DEPTH = 4;

/** Верхняя граница `delayMinutes` (365 дней). */
export const MAX_DELAY_MINUTES = 525600;
