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
}

export interface AutomationCatalogEvent {
  code: string;
  label: string;
  module: string;
  fields: AutomationCatalogField[];
  variables: string[];
}

export interface AutomationCatalogActionConfigField {
  code: string;
  label: string;
  type: string;
  options?: string[];
  default?: string;
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
  organizationId?: number;
}

export interface AutomationTestActionPreview {
  actionType: string;
  recipient: string;
  renderedBody: string;
  delayMinutes: number;
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

/** Операторы, которым `value` не нужен вовсе. */
export const OPERATORS_WITHOUT_VALUE = new Set(["exists"]);

/** Операторы, которым `value` обязан приходить массивом. */
export const OPERATORS_WITH_LIST_VALUE = new Set(["in", "not_in"]);

/** Максимальная вложенность групп условий — ограничение бэка. */
export const MAX_CONDITION_DEPTH = 4;

/** Верхняя граница `delayMinutes` (365 дней). */
export const MAX_DELAY_MINUTES = 525600;
