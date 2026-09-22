import { apiRequest } from "./client";
import { scopeParams, type Scope } from "./scope";
import type {
  WhatsAppConnectionInfo,
  WhatsAppParameterSource,
  WhatsAppTemplate,
} from "./whatsapp";

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
  /** Поле запрещено для этих каналов (`body` у WhatsApp). */
  notForChannels?: string[];
}

export interface AutomationCatalogAction {
  code: string;
  label: string;
  configFields: AutomationCatalogActionConfigField[];
}

export interface AutomationRecipientEmployee {
  id: number;
  name: string;
  /** В карточке нет телефона — отправка такому сотруднику провалится. */
  hasPhone: boolean;
}

export interface AutomationRecipientRole {
  id: number;
  name: string;
}

/**
 * Кого действие может назвать получателем. Приходит вместе с каталогом и
 * привязано к организации: сотрудники и роли **всех** её филиалов, чтобы
 * правило «во всех филиалах» могло адресовать любого. Справочник сотрудников
 * остальной части приложения режется по активному филиалу и сюда не годится.
 */
export interface AutomationRecipientOptions {
  employees: AutomationRecipientEmployee[];
  roles: AutomationRecipientRole[];
}

/**
 * WhatsApp-часть каталога — единственная, что зависит от организации:
 * подключение и зеркало её шаблонов. Пустой объект приходит, когда
 * организацию по запросу определить не удалось.
 */
export interface AutomationWhatsAppCatalog {
  connection: WhatsAppConnectionInfo;
  templates: WhatsAppTemplate[];
  parameterSources: WhatsAppParameterSource[];
}

export interface AutomationCatalog {
  events: AutomationCatalogEvent[];
  actions: AutomationCatalogAction[];
  conditionGroupOperators: string[];
  recipientOptions: AutomationRecipientOptions;
  whatsapp?: AutomationWhatsAppCatalog | Record<string, never>;
}

/** WhatsApp-каталог, если бэк его прислал; `undefined` у пустого объекта. */
export function whatsappCatalog(
  catalog: AutomationCatalog,
): AutomationWhatsAppCatalog | undefined {
  const value = catalog.whatsapp;
  if (!value || !("connection" in value)) return undefined;
  return value as AutomationWhatsAppCatalog;
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

/**
 * Один получатель действия.
 *
 * `payload` — телефон из данных события (клиент, сотрудник записи), только у
 * правил по событию; `employee` — конкретный сотрудник; `role` — все активные
 * сотрудники с этой RBAC-ролью (у события с филиалом — только его филиала);
 * `phone` — фиксированный номер. Бэк создаёт по одной отправке на каждого.
 */
export type AutomationRecipient =
  | { type: "payload"; field: string }
  | { type: "employee"; employeeId: number }
  | { type: "role"; roleId: number }
  | { type: "phone"; phone: string };

/** Верхняя граница списка получателей одного действия — ограничение бэка. */
export const MAX_RECIPIENTS = 50;
/** Откуда берётся значение позиционного параметра WhatsApp-шаблона. */
export type WhatsAppParameterSourceCode = "event" | "constant";

/**
 * Привязка `{{i}}` шаблона: поле события (только из `variables` события,
 * опечатка ловится при сохранении) или постоянная строка.
 */
export interface WhatsAppParameterBinding {
  source: WhatsAppParameterSourceCode;
  /** Только у `source: "event"`. */
  field?: string;
  /** Только у `source: "constant"`. */
  value?: string;
}

export interface AutomationActionConfig {
  channel?: string;
  /** Получатели; ровно эту форму отправляем на бэк. */
  recipients?: AutomationRecipient[];
  /**
   * Устаревшие одиночные получатели правил, сохранённых до появления списка.
   * Бэк понимает их и при следующем сохранении сворачивает в `recipients`;
   * фронт только читает — в `toSaveInput` они не попадают.
   */
  recipientField?: string;
  recipientPhone?: string;
  /** Заголовок push-уведомления; у SMS и WhatsApp заголовка нет. */
  title?: string;
  /** Текст SMS и push. У WhatsApp запрещён: текст живёт в WhatsApp Manager. */
  body?: string;
  /** WhatsApp: шаблон из `catalog.whatsapp.templates[].id`. */
  templateId?: string;
  /** WhatsApp: язык шаблона; должен совпадать с шаблоном. */
  language?: string;
  /** WhatsApp: `parameters[i]` заполняет `{{i+1}}`; ровно `parameterCount` штук. */
  parameters?: WhatsAppParameterBinding[];
  [key: string]: unknown;
}

export interface AutomationAction {
  id: number;
  position: number;
  actionType: string;
  delayMinutes: number;
  config: AutomationActionConfig;
  /**
   * WhatsApp-действие с произвольным текстом, сохранённое до появления
   * шаблонов. Правило видно и редактируется, но движок его не отправляет,
   * пока не выбран шаблон.
   */
  needsTemplateSetup?: boolean;
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
  /** Хотя бы одно действие правила требует выбора шаблона WhatsApp. */
  needsTemplateSetup?: boolean;
}

export interface AutomationActionInput {
  actionType: string;
  delayMinutes: number;
  config: AutomationActionConfig;
}

/**
 * Тело `POST` и `PUT`. `PUT` — полная замена: отправлять нужно всё состояние
 * формы, частичного обновления (`PATCH`) на бэке нет.
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

/** Выполнение: `sent` значит «передано Raven», а не «доставлено». */
export type AutomationJobStatus = "pending" | "sent" | "failed" | "cancelled";

/**
 * Доставка, как её сообщил Raven вебхуками и досверкой. Двигается только
 * вперёд (`accepted` → `sent` → `delivered` → `read`); `failed` — терминал.
 * Пусто, пока сообщение не передано Raven, и у SMS/push, где статусов
 * доставки нет.
 */
export type AutomationDeliveryStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface AutomationJob {
  id: number;
  actionType: string;
  status: AutomationJobStatus;
  scheduledFor: string;
  recipient: string;
  /** Чей это номер — имя сотрудника, роль. Пусто у номера из события. */
  recipientLabel: string;
  renderedBody: string;
  attemptsCount: number;
  externalMessageId: string;
  error: string;
  channel?: string;
  deliveryStatus?: AutomationDeliveryStatus | "";
  deliveryErrorCode?: string;
  deliveryError?: string;
  deliveryUpdatedAt?: string | null;
  /** wamid — id сообщения у Meta. */
  providerMessageId?: string;
  /** Снимок шаблона WhatsApp, с которым отправка была создана. */
  whatsappTemplateId?: string;
  whatsappTemplateName?: string;
  whatsappLanguage?: string;
  /** Уже подставленные значения `{{1}}..{{n}}`. */
  resolvedParameters?: string[];
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

/** Что помешает отправке WhatsApp: машинный код и готовая подпись. */
export interface AutomationTestActionError {
  code: string;
  label: string;
}

export interface AutomationTestActionPreview {
  actionType: string;
  recipient: string;
  recipientLabel: string;
  renderedBody: string;
  delayMinutes: number;
  channel: string;
  renderedTitle: string;
  /** Только у WhatsApp: номер отправителя, шаблон и подставленные параметры. */
  senderPhone?: string;
  templateId?: string;
  templateName?: string;
  language?: string;
  parameters?: string[];
  /** Пусто — всё в порядке. Dry-run ничего не отправляет в любом случае. */
  errors?: AutomationTestActionError[];
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
  }).then((catalog) => ({
    ...catalog,
    // Бэк без списка получателей (ещё не обновлён) — пустые справочники, а
    // не падение редактора на `undefined.map`.
    recipientOptions: {
      employees: catalog.recipientOptions?.employees ?? [],
      roles: catalog.recipientOptions?.roles ?? [],
    },
  }));
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

/**
 * Удаление правила вместе с историей запусков. Ответ `204`; чужое правило —
 * `404`. `organizationId` уходит в query, как у чтения: тела у DELETE нет.
 */
export function deleteAutomation(
  id: number,
  scope: Scope = {},
  signal?: AbortSignal,
): Promise<void> {
  return apiRequest<void>(`${BASE}/${id}/${orgQuery(scope)}`, {
    method: "DELETE",
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
 * Канал WhatsApp: сообщение — всегда одобренный Meta шаблон. Вместо текста
 * действие хранит `templateId` и привязки параметров (`docs/automations-api.md`
 * §7, «Канал whatsapp»).
 */
export const WHATSAPP_CHANNEL = "whatsapp";

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
