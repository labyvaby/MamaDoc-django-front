import dayjs from "dayjs";

import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * ЭДО застройщика (AIVIO): документ идёт по маршруту — черновик →
 * согласование по шагам (каждый шаг — роль) → подпись компании → отправка
 * контрагенту → подпись контрагента → архив / выгрузка в 1С. Маршрут берётся
 * из шаблона (ДКП, АВР, ДП…).
 *
 * Контракт — гайд бэка `frontend-documents.md` и справочник
 * `aivio-api-reference.md` (раздел «ДОКУМЕНТЫ»), 04.10.2026, проверено бэком на
 * test2. Базовый путь `/api/v2/edo/`.
 * - организация — заголовком `X-Organization-Id`, филиал режет бэк;
 * - `edo.view` — смотреть и согласовать/отклонить СВОЙ шаг; `edo.manage` —
 *   остальные действия; `edo.templates.manage` — шаблоны и маршруты;
 * - кнопки «Согласовать / Отклонить» — по полям документа `canApprove` /
 *   `canApproveOnBehalf`, а не по праву;
 * - строка реестра и карточка — один объект (список отдаёт его целиком);
 * - файлы — только через защищённые ссылки (`protectedFile.ts`).
 */

const EDO_API = "/v2/edo";

type Decimal = string;

// ─── Модель ────────────────────────────────────────────────────────────────

export type EdoStatus = "draft" | "review" | "signing" | "signed" | "rejected" | "archived" | "terminated";
export type EdoTab = "all" | "mine" | "in" | "out" | "internal" | "draft" | "review" | "signing" | "signed" | "rejected" | "archived" | "terminated";
/** Вкладки реестра ЭДО в порядке макета; у архива и договоров — свои экраны. */
export const EDO_TABS: readonly EdoTab[] = ["all", "mine", "review", "signing", "signed", "draft", "rejected", "in", "out", "internal"];
export type EdoDirection = "in" | "out" | "internal";
export type CounterpartyType = "buyer" | "contractor" | "gov" | "internal" | "supplier";
export const COUNTERPARTY_TYPES: readonly CounterpartyType[] = ["buyer", "contractor", "supplier", "gov", "internal"];
/** Экран-срез реестра: ЭДО целиком, реестр договоров или архив. */
export type EdoScope = "edo" | "contracts" | "archive";

/** Шаг маршрута: ждёт очереди / на рассмотрении / согласован / отклонён. */
export type StepState = "pending" | "current" | "done" | "rejected";

export interface EdoStep {
  id: number;
  order: number;
  role: string;
  /** Имя согласующего. */
  name: string;
  position: string;
  state: StepState;
  at: string | null;
  comment: string;
  approverName: string | null;
  canApprove: boolean;
  canApproveOnBehalf: boolean;
}

export interface EdoSignature {
  id: number;
  party: "company" | "counterparty" | string;
  name: string;
  position: string;
  at: string;
  auto: boolean;
}

export interface EdoFile {
  id: number;
  name: string;
  /** Защищённая ссылка (с сессией), не `/media/`. */
  url: string | null;
  at: string;
  by: string;
  /** Подпись размера («1,2 МБ») — у вложений; у версий — пусто. */
  size: string;
  note: string;
  /** Номер версии; у вложений — null. */
  version: number | null;
}

export interface EdoDocumentRef {
  id: number;
  number: string;
  type: string;
  title: string;
  status: EdoStatus;
}

export interface EdoDocument {
  id: number;
  number: string;
  type: string;
  typeName: string;
  typeShort: string;
  group: string;
  templateId: number;
  requiresEsign: boolean;
  title: string;
  counterparty: string;
  counterpartyType: string;
  projectId: number | null;
  projectName: string | null;
  unitId: number | null;
  amount: number;
  date: string;
  deadline: string | null;
  direction: EdoDirection | string;
  status: EdoStatus;
  statusLabel: string;
  overdue: boolean;
  authorName: string;
  responsibleName: string;
  currentStepId: number | null;
  waitingCounterparty: boolean;
  sentAt: string | null;
  exported: boolean;
  exportedTo1CAt: string | null;
  signedAt: string | null;
  validUntil: string | null;
  parent: EdoDocumentRef | null;
  children: EdoDocumentRef[];
  tags: string[];
  /** Поля шаблона (реквизиты договора); ключи — как их назвал шаблон. */
  fields: Record<string, unknown>;
  createdAt: string;
  route: EdoStep[];
  signatures: EdoSignature[];
  comments: { id: number; by: string; at: string; text: string }[];
  attachments: EdoFile[];
  versions: EdoFile[];
  history: { at: string; by: string; text: string }[];
  canApprove: boolean;
  canApproveOnBehalf: boolean;
}

export interface EdoSummary {
  total: number;
  review: number;
  signing: number;
  signingWaitingCounterparty: number;
  signedThisMonth: number;
  waitingMyDecision: number;
  overdue: number;
  overdueNumbers: string[];
  avgApprovalHours: number;
  companySignatures: number;
  byType: { type: string; short: string; count: number }[];
  tabs: Partial<Record<EdoTab, number>>;
}

export interface ContractsSummary {
  activeCount: number;
  pendingCount: number;
  closedCount: number;
  allCount: number;
  portfolio: number;
  buyersCount: number;
  buyersAmount: number;
  expiringCount: number;
  expiring: { id: number; number: string; counterparty: string; validUntil: string; daysLeft: number }[];
}

export interface ArchiveSummary {
  total: number;
  exportedCount: number;
  pendingExportCount: number;
  terminatedCount: number;
  storageBytes: number;
  years: string[];
}

export interface EdoTemplate {
  id: number;
  code: string;
  name: string;
  short: string;
  group: string;
  groupLabel: string;
  route: string[];
  routeSteps: { role: string; position: string; name: string; employeeId: number | null }[];
  defaultRoute: string[];
  routeCustomized: boolean;
  requiresEsign: boolean;
  isActive: boolean;
  usageCount: number;
}

export interface EdoApprover {
  role: string;
  position: string;
  employeeId: number | null;
  name: string;
}

// ─── Переходники ───────────────────────────────────────────────────────────

const money = (value: Decimal | number | null | undefined) => Number(value ?? 0) || 0;

type RawDocument = Omit<EdoDocument, "amount" | "attachments" | "versions" | "route" | "signatures"> & {
  amount: Decimal;
  route?: (Omit<EdoStep, "canApprove" | "canApproveOnBehalf"> & { canApprove?: boolean; canApproveOnBehalf?: boolean })[];
  signatures?: (Omit<EdoSignature, "auto"> & { auto?: boolean })[];
  attachments?: { id: number; name: string; size: string; url: string; at: string; by: string }[];
  versions?: { id: number; v: number; at: string; by: string; note: string; fileUrl: string | null; fileName: string }[];
};

export function fromRawDocument(raw: RawDocument): EdoDocument {
  return {
    ...raw,
    amount: money(raw.amount),
    parent: raw.parent ?? null,
    children: raw.children ?? [],
    tags: raw.tags ?? [],
    fields: raw.fields ?? {},
    comments: raw.comments ?? [],
    history: raw.history ?? [],
    canApprove: raw.canApprove ?? false,
    canApproveOnBehalf: raw.canApproveOnBehalf ?? false,
    route: (raw.route ?? [])
      .map((step) => ({ ...step, canApprove: step.canApprove ?? false, canApproveOnBehalf: step.canApproveOnBehalf ?? false }))
      .sort((a, b) => a.order - b.order),
    signatures: (raw.signatures ?? []).map((s) => ({ ...s, auto: s.auto ?? false })),
    attachments: (raw.attachments ?? []).map((a) => ({ id: a.id, name: a.name, url: a.url || null, at: a.at, by: a.by, size: a.size, note: "", version: null })),
    versions: (raw.versions ?? []).map((v) => ({ id: v.id, name: v.fileName, url: v.fileUrl, at: v.at, by: v.by, size: "", note: v.note, version: v.v })),
  };
}

/** Шаг, который сейчас на рассмотрении. */
export const currentStep = (doc: EdoDocument) => doc.route.find((step) => step.state === "current") ?? null;
/** Дней просрочки по сроку согласования; 0 — не просрочен. */
export const overdueDays = (doc: Pick<EdoDocument, "overdue" | "deadline">) =>
  doc.overdue && doc.deadline ? Math.max(1, dayjs().startOf("day").diff(dayjs(doc.deadline), "day")) : 0;
export const hasSignature = (doc: EdoDocument, party: "company" | "counterparty") => doc.signatures.some((s) => s.party === party);

// ─── Запросы ───────────────────────────────────────────────────────────────

function edo<T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}): Promise<T> {
  return apiRequest<T>(`${EDO_API}${path}`, { ...options, headers: realtyHeaders(scope) });
}

export interface EdoListParams {
  scope: EdoScope;
  tab: EdoTab;
  search: string;
  type: string;
  projectId: number | null;
  /** Реестр договоров: all | active | pending | closed. */
  contractStatus?: string;
  /** Архив: год. */
  year?: string;
  /** Архив: только не выгруженные в 1С. */
  notExported?: boolean;
}

export function edoListQuery(params: EdoListParams): string {
  const query = new URLSearchParams();
  if (params.scope !== "edo") query.set("scope", params.scope);
  if (params.scope === "edo" && params.tab !== "all") query.set("tab", params.tab);
  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.type && params.type !== "all") query.set("type", params.type);
  if (params.projectId != null) query.set("projectId", String(params.projectId));
  if (params.contractStatus && params.contractStatus !== "all") query.set("contractStatus", params.contractStatus);
  if (params.year && params.year !== "all") query.set("year", params.year);
  if (params.notExported) query.set("exported", "0");
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function getEdoDocuments(params: EdoListParams, scope?: RealtyScope, signal?: AbortSignal): Promise<EdoDocument[]> {
  const raw = await edo<RawDocument[]>(scope, `/documents/${edoListQuery(params)}`, { signal });
  return raw.map(fromRawDocument);
}

export async function getEdoDocument(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<EdoDocument> {
  return fromRawDocument(await edo<RawDocument>(scope, `/documents/${id}/`, { signal }));
}

export async function getEdoSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<EdoSummary> {
  const raw = await edo<Omit<EdoSummary, "byType"> & { byType: { type: string; templateShortCode: string; count: number }[] }>(scope, "/documents/summary/", { signal });
  return { ...raw, overdueNumbers: raw.overdueNumbers ?? [], tabs: raw.tabs ?? {}, byType: (raw.byType ?? []).map((b) => ({ type: b.type, short: b.templateShortCode || b.type, count: b.count })) };
}

export async function getContractsSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<ContractsSummary> {
  const raw = await edo<Omit<ContractsSummary, "portfolio" | "buyersAmount"> & { portfolio: Decimal; buyersAmount: Decimal }>(scope, "/contracts/summary/", { signal });
  return { ...raw, portfolio: money(raw.portfolio), buyersAmount: money(raw.buyersAmount), expiring: raw.expiring ?? [] };
}

export async function getArchiveSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<ArchiveSummary> {
  const raw = await edo<ArchiveSummary>(scope, "/archive/summary/", { signal });
  return { ...raw, years: raw.years ?? [] };
}

export async function getEdoTemplates(scope?: RealtyScope, includeInactive = false, signal?: AbortSignal): Promise<EdoTemplate[]> {
  return edo<EdoTemplate[]>(scope, `/templates/${includeInactive ? "?includeInactive=1" : ""}`, { signal });
}

export async function getEdoApprovers(scope?: RealtyScope, signal?: AbortSignal): Promise<EdoApprover[]> {
  return edo<EdoApprover[]>(scope, "/approvers/", { signal });
}

export interface NewEdoDocumentInput {
  templateId: number;
  title: string;
  counterparty: string;
  counterpartyType: CounterpartyType;
  direction: EdoDirection;
  amount: number;
  date: string;
  deadline: string | null;
  projectId: number | null;
  /** true — сразу отправить на согласование. */
  submit: boolean;
}

export async function createEdoDocument(input: NewEdoDocumentInput, scope?: RealtyScope): Promise<EdoDocument> {
  const body = { ...input, amount: input.amount.toFixed(2), fields: {} };
  return fromRawDocument(await edo<RawDocument>(scope, "/documents/", { method: "POST", body }));
}

/**
 * «Сверка» из дебиторки/кредиторки (гайд `frontend-finance.md` §5): документ ЭДО
 * «Акт сверки» по контрагенту за период «01.07.2026 – 05.10.2026». Право — `edo.manage`.
 */
export async function createReconciliationAct(counterparty: string, period: string, scope?: RealtyScope): Promise<EdoDocument> {
  return fromRawDocument(await edo<RawDocument>(scope, "/documents/", { method: "POST", body: { type: "recon", counterparty, fields: { period } } }));
}

/** Действия над документом без тела ответа, которое нужно разбирать: карточку перечитываем. */
export type EdoAction =
  | { kind: "submit" }
  | { kind: "approve"; comment: string }
  | { kind: "approveStep"; stepId: number; comment: string }
  | { kind: "reject"; comment: string }
  | { kind: "rework"; note: string }
  | { kind: "sign"; party: "company" | "counterparty"; signerName: string; signerPosition: string }
  | { kind: "sendToCounterparty" }
  | { kind: "remind" }
  | { kind: "comment"; text: string }
  | { kind: "additionalAgreement"; title: string; changes: string[]; amount: number | null; deadline: string | null }
  | { kind: "terminate"; reason: string }
  | { kind: "archive"; exportTo1C: boolean }
  | { kind: "export1c" };

export async function runEdoAction(id: number, action: EdoAction, scope?: RealtyScope): Promise<void> {
  const post = (path: string, body: object = {}) => edo<unknown>(scope, `/documents/${id}/${path}`, { method: "POST", body });
  switch (action.kind) {
    case "submit":
      return void (await post("submit/"));
    case "approve":
      return void (await post("approve/", { comment: action.comment }));
    case "approveStep":
      return void (await post(`steps/${action.stepId}/approve/`, { comment: action.comment }));
    case "reject":
      return void (await post("reject/", { comment: action.comment }));
    case "rework":
      return void (await post("rework/", { note: action.note }));
    case "sign":
      return void (await post("sign/", { party: action.party, signerName: action.signerName, signerPosition: action.signerPosition }));
    case "sendToCounterparty":
      return void (await post("send-to-counterparty/"));
    case "remind":
      return void (await post("remind/"));
    case "comment":
      return void (await post("comments/", { text: action.text }));
    case "additionalAgreement":
      return void (await post("additional-agreement/", {
        title: action.title,
        changes: action.changes,
        amount: action.amount == null ? "0" : action.amount.toFixed(2),
        deadline: action.deadline,
      }));
    case "terminate":
      return void (await post("terminate/", { reason: action.reason }));
    case "archive":
      // С 09.10.2026 пустое тело — только архив, без выгрузки в 1С; выгрузка — явным флагом.
      return void (await post("archive/", action.exportTo1C ? { exportTo1C: true } : undefined));
    case "export1c":
      return void (await post("export-1c/"));
  }
}

/** Вложение или новая версия: multipart, поле `file` (до 25 МБ, белый список расширений). */
export async function uploadEdoFile(id: number, kind: "attachments" | "versions", file: File, scope?: RealtyScope, note = ""): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  if (kind === "versions" && note) form.append("note", note);
  await edo<unknown>(scope, `/documents/${id}/${kind}/`, { method: "POST", formData: form });
}

/** Напомнить всем согласующим просроченных документов. */
export async function remindOverdueEdo(scope?: RealtyScope): Promise<void> {
  await edo<unknown>(scope, "/documents/remind-overdue/", { method: "POST", body: {} });
}

/** Пакетная выгрузка в 1С; `ids` нет — все подписанные, ещё не выгруженные. */
export async function exportEdoTo1C(ids: number[] | null, scope?: RealtyScope): Promise<{ count: number }> {
  return edo(scope, "/documents/export-1c/", { method: "POST", body: { ids } });
}

export async function updateEdoTemplate(id: number, patch: { isActive?: boolean; requiresEsign?: boolean }, scope?: RealtyScope): Promise<void> {
  await edo<unknown>(scope, `/templates/${id}/`, { method: "PATCH", body: patch });
}

export async function setEdoTemplateRoute(id: number, route: string[], scope?: RealtyScope): Promise<void> {
  await edo<unknown>(scope, `/templates/${id}/route/`, { method: "PUT", body: { route } });
}

export async function resetEdoTemplateRoute(id: number, scope?: RealtyScope): Promise<void> {
  await edo<unknown>(scope, `/templates/${id}/route/reset/`, { method: "POST", body: {} });
}

export async function updateEdoApprover(role: string, patch: { name?: string; position?: string }, scope?: RealtyScope): Promise<void> {
  await edo<unknown>(scope, `/approvers/${encodeURIComponent(role)}/`, { method: "PATCH", body: patch });
}

/** Допустимые файлы вложений — для `accept` у поля выбора файла. */
export const EDO_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.csv,.jpg,.jpeg,.png,.webp,.heic,.heif,.zip";
export const EDO_FILE_MAX_BYTES = 25 * 1024 * 1024;

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const edoKeys = {
  all: ["django", "edo"] as const,
  list: (scope: RealtyScope | undefined, params: EdoListParams) => [...edoKeys.all, ...scopeKey(scope), "list", params] as const,
  document: (scope: RealtyScope | undefined, id: number) => [...edoKeys.all, ...scopeKey(scope), "document", id] as const,
  summary: (scope: RealtyScope | undefined, kind: EdoScope) => [...edoKeys.all, ...scopeKey(scope), "summary", kind] as const,
  templates: (scope: RealtyScope | undefined, includeInactive: boolean) => [...edoKeys.all, ...scopeKey(scope), "templates", includeInactive] as const,
  approvers: (scope: RealtyScope | undefined) => [...edoKeys.all, ...scopeKey(scope), "approvers"] as const,
};
