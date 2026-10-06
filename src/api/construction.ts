import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Стройка» застройщика (AIVIO): проекты и графики, подрядчики и акты,
 * стройконтроль — `/api/v2/construction`.
 *
 * Контракт — гайд бэка `frontend-construction.md` §1–5 (05.10.2026), формы
 * ответов сверены с test2 06.10.2026.
 * - смотреть — `construction.view`, все кнопки трёх экранов — `construction.manage`;
 * - филиал режет бэк по филиалу ЖК; справочник подрядчиков общий для организации;
 * - деньги — строки → числа здесь; списки — массивы без пагинации;
 * - историю и побочные эффекты (ЭДО, кредиторка, касса) делает сервер —
 *   после действия только перечитать.
 * - отставание этапа бэк считает по датам (`delayDays = max(просрочка, shiftDays)`),
 *   ручной сдвиг виден в `shiftDays` — открытый вопрос к заказчику (гайд §9).
 */

const API = "/v2/construction";

export const STAGE_STATUSES = ["planned", "active", "late", "done"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const ACT_STATUSES = ["draft", "check", "accepted", "paid", "rejected"] as const;
export type ActStatus = (typeof ACT_STATUSES)[number];

export const DEFECT_SEVERITIES = ["critical", "major", "minor"] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];
export const DEFECT_STATUSES = ["open", "fixing", "verify", "closed"] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const INSPECTION_RESULTS = ["ok", "warn", "fail"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export interface HistoryEntry {
  at: string;
  by: string;
  text: string;
}

export interface StageGroup {
  code: string;
  label: string;
  weight: number;
}

export interface ScheduleSummary {
  projectId: number;
  projectName: string;
  readinessPct: number;
  timeElapsedPct: number;
  stagesTotal: number;
  stagesDone: number;
  stagesActive: number;
  activeStageName: string;
  nextStageName: string;
  maxDelayDays: number;
  delayedStages: number;
  delayedStageIds: number[];
  statuses: string[];
  projectStart: string | null;
  projectEnd: string | null;
  daysToHandover: number | null;
  updated: string | null;
  foremanId: number | null;
  foreman: string;
}

export interface Stage {
  id: number;
  projectId: number;
  projectName: string;
  order: number;
  name: string;
  group: string;
  groupLabel: string;
  groupWeight: number;
  contractorId: number | null;
  /** `null` — «Собственные силы». */
  contractorName: string | null;
  responsibleId: number | null;
  responsible: string;
  start: string;
  end: string;
  factStart: string | null;
  factEnd: string | null;
  progress: number;
  volume: number;
  unit: string;
  done: number;
  status: StageStatus | string;
  statusLabel: string;
  delayDays: number;
  shiftDays: number;
  forecastEnd: string | null;
  updatedAt: string;
}

export interface StageDetail extends Stage {
  history: HistoryEntry[];
  acts: { id: number; number: string; period: string; subject: string; amount: number; status: string; statusLabel: string; date: string }[];
  openDefects: { id: number; number: string; title: string; section: string; floor: number | null; severity: string; severityLabel: string; status: string }[];
}

export interface ActsSummary {
  contractorsCount: number;
  contractorsWithActive: number;
  portfolioAmount: number;
  checkCount: number;
  checkAmount: number;
  acceptedCount: number;
  toPayAmount: number;
  contractsCount: number;
  actsCount: number;
  rejectedCount: number;
  draftCount: number;
}

export interface ContractorStats {
  contractsCount: number;
  activeCount: number;
  totalAmount: number;
  paid: number;
  paidPct: number;
  pendingActsCount: number;
  pendingActsAmount: number;
  debt: number;
  openDefects: number;
  lateStages: number;
  claimsCount: number;
}

export interface Contractor {
  id: number;
  name: string;
  inn: string;
  spec: string;
  contact: string;
  phone: string;
  rating: number;
  since: string;
  bank: string;
  account: string;
  director: string;
  isActive: boolean;
  isBlocked: boolean;
  blockReason: string;
  blockedAt: string | null;
  stats: ContractorStats;
}

export interface ConstructionContract {
  id: number;
  number: string;
  contractorId: number | null;
  contractorName: string;
  projectId: number | null;
  projectName: string;
  subject: string;
  amount: number;
  paid: number;
  paidPct: number;
  retention: number;
  /** Остаток к оплате по договору. */
  debt: number;
  status: string;
  statusLabel: string;
  start: string | null;
  end: string | null;
  documentId: number | null;
}

export interface Act {
  id: number;
  number: string;
  contractorId: number | null;
  contractorName: string;
  contractId: number | null;
  contractNumber: string;
  projectId: number | null;
  projectName: string;
  documentId: number | null;
  edoNumber: string;
  period: string;
  subject: string;
  amount: number;
  retention: number;
  toPay: number;
  paidAmount: number;
  date: string;
  status: ActStatus | string;
  statusLabel: string;
  checkedBy: string;
  defects: number;
  returnReason: string;
  acceptedAt: string | null;
  paidAt: string | null;
}

export interface ActDetail extends Act {
  history: HistoryEntry[];
  defectList: { id: number; number: string; title: string; severity: string; severityLabel: string; status: string; statusLabel: string }[];
}

export interface ContractorDetail extends Contractor {
  contracts: ConstructionContract[];
  acts: Act[];
}

export interface DefectsSummary {
  openCount: number;
  verifyCount: number;
  criticalCount: number;
  overdueCount: number;
  closed30DCount: number;
  closedCount: number;
  totalCount: number;
  inspections30DCount: number;
  inspectionsCount: number;
  inspectionsOk: number;
  inspectionsWarn: number;
  inspectionsFail: number;
  byContractor: { id: number | null; name: string; count: number }[];
  byCategory: { id: number | null; name: string; count: number }[];
}

export interface Defect {
  id: number;
  number: string;
  projectId: number | null;
  projectName: string;
  contractorId: number | null;
  contractorName: string;
  title: string;
  section: string;
  floor: number | null;
  category: string;
  severity: DefectSeverity | string;
  severityLabel: string;
  status: DefectStatus | string;
  statusLabel: string;
  description: string;
  found: string;
  deadline: string | null;
  closed: string | null;
  isOverdue: boolean;
  overdueDays: number;
  foundBy: string;
  responsible: string;
  prescription: string;
  photos: number;
  actId: number | null;
  actNumber: string;
  stageId: number | null;
  stageName: string;
  inspectionId: number | null;
}

export interface DefectPhoto {
  id: number;
  name: string;
  url: string;
  size: number;
  at: string;
  by: string;
}

export interface DefectDetail extends Defect {
  history: HistoryEntry[];
  photoFiles: DefectPhoto[];
}

export interface Inspection {
  id: number;
  number: string;
  projectId: number | null;
  projectName: string;
  date: string;
  type: string;
  inspector: string;
  result: InspectionResult | string;
  resultLabel: string;
  defectsFound: number;
  note: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
/** Массив или DRF-страница `{results}`. */
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);
const history = (value: unknown): HistoryEntry[] => list(value).map((h) => ({ at: str(h.at), by: str(h.by), text: str(h.text) }));

export const fromRawSummary = (raw: any): ScheduleSummary => ({
  projectId: raw?.projectId,
  projectName: str(raw?.projectName),
  readinessPct: num(raw?.readinessPct),
  timeElapsedPct: num(raw?.timeElapsedPct),
  stagesTotal: num(raw?.stagesTotal),
  stagesDone: num(raw?.stagesDone),
  stagesActive: num(raw?.stagesActive),
  activeStageName: str(raw?.activeStageName),
  nextStageName: str(raw?.nextStageName),
  maxDelayDays: num(raw?.maxDelayDays),
  delayedStages: num(raw?.delayedStages),
  delayedStageIds: list(raw?.delayedStageIds).map(Number),
  statuses: list(raw?.statuses).map(String),
  projectStart: raw?.projectStart ?? null,
  projectEnd: raw?.projectEnd ?? null,
  daysToHandover: numOrNull(raw?.daysToHandover),
  updated: raw?.updated ?? null,
  foremanId: raw?.foremanId ?? null,
  foreman: str(raw?.foreman),
});

export const fromRawStage = (raw: any): Stage => ({
  id: raw.id,
  projectId: raw.projectId,
  projectName: str(raw.projectName),
  order: num(raw.order),
  name: str(raw.name),
  group: str(raw.group),
  groupLabel: str(raw.groupLabel),
  groupWeight: num(raw.groupWeight),
  contractorId: raw.contractorId ?? null,
  contractorName: raw.contractorName ?? null,
  responsibleId: raw.responsibleId ?? null,
  responsible: str(raw.responsible),
  start: str(raw.start),
  end: str(raw.end),
  factStart: raw.factStart ?? null,
  factEnd: raw.factEnd ?? null,
  progress: num(raw.progress),
  volume: num(raw.volume),
  unit: str(raw.unit),
  done: num(raw.done),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  delayDays: num(raw.delayDays),
  shiftDays: num(raw.shiftDays),
  forecastEnd: raw.forecastEnd ?? null,
  updatedAt: str(raw.updatedAt),
});

export const fromRawStageDetail = (raw: any): StageDetail => ({
  ...fromRawStage(raw),
  history: history(raw.history),
  acts: list(raw.acts).map((a) => ({ id: a.id, number: str(a.number), period: str(a.period), subject: str(a.subject), amount: num(a.amount), status: str(a.status), statusLabel: str(a.statusLabel), date: str(a.date) })),
  openDefects: list(raw.openDefects).map((d) => ({
    id: d.id,
    number: str(d.number),
    title: str(d.title),
    section: str(d.section),
    floor: numOrNull(d.floor),
    severity: str(d.severity),
    severityLabel: str(d.severityLabel),
    status: str(d.status),
  })),
});

export const fromRawActsSummary = (raw: any): ActsSummary => ({
  contractorsCount: num(raw?.contractorsCount),
  contractorsWithActive: num(raw?.contractorsWithActive),
  portfolioAmount: num(raw?.portfolioAmount),
  checkCount: num(raw?.checkCount),
  checkAmount: num(raw?.checkAmount),
  acceptedCount: num(raw?.acceptedCount),
  toPayAmount: num(raw?.toPayAmount),
  contractsCount: num(raw?.contractsCount),
  actsCount: num(raw?.actsCount),
  rejectedCount: num(raw?.rejectedCount),
  draftCount: num(raw?.draftCount),
});

const fromRawStats = (raw: any): ContractorStats => ({
  contractsCount: num(raw?.contractsCount),
  activeCount: num(raw?.activeCount),
  totalAmount: num(raw?.totalAmount),
  paid: num(raw?.paid),
  paidPct: num(raw?.paidPct),
  pendingActsCount: num(raw?.pendingActsCount),
  pendingActsAmount: num(raw?.pendingActsAmount),
  debt: num(raw?.debt),
  openDefects: num(raw?.openDefects),
  lateStages: num(raw?.lateStages),
  claimsCount: num(raw?.claimsCount),
});

export const fromRawContractor = (raw: any): Contractor => ({
  id: raw.id,
  name: str(raw.name),
  inn: str(raw.inn),
  spec: str(raw.spec),
  contact: str(raw.contact),
  phone: str(raw.phone),
  rating: num(raw.rating),
  since: str(raw.since),
  bank: str(raw.bank),
  account: str(raw.account),
  director: str(raw.director),
  isActive: raw.isActive !== false,
  isBlocked: Boolean(raw.isBlocked),
  blockReason: str(raw.blockReason),
  blockedAt: raw.blockedAt ?? null,
  stats: fromRawStats(raw.stats),
});

export const fromRawContract = (raw: any): ConstructionContract => ({
  id: raw.id,
  number: str(raw.number),
  contractorId: raw.contractorId ?? null,
  contractorName: str(raw.contractorName),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  subject: str(raw.subject ?? raw.title),
  amount: num(raw.amount),
  paid: num(raw.paid),
  paidPct: num(raw.paidPct),
  retention: num(raw.retention),
  debt: num(raw.debt),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  start: raw.start ?? raw.startDate ?? null,
  end: raw.end ?? raw.endDate ?? null,
  documentId: raw.documentId ?? null,
});

export const fromRawAct = (raw: any): Act => ({
  id: raw.id,
  number: str(raw.number),
  contractorId: raw.contractorId ?? null,
  contractorName: str(raw.contractorName),
  contractId: raw.contractId ?? null,
  contractNumber: str(raw.contractNumber),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  documentId: raw.documentId ?? null,
  edoNumber: str(raw.edoNumber),
  period: str(raw.period),
  subject: str(raw.subject),
  amount: num(raw.amount),
  retention: num(raw.retention),
  toPay: num(raw.toPay),
  paidAmount: num(raw.paidAmount),
  date: str(raw.date),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  checkedBy: str(raw.checkedBy),
  defects: num(raw.defects),
  returnReason: str(raw.returnReason),
  acceptedAt: raw.acceptedAt ?? null,
  paidAt: raw.paidAt ?? null,
});

export const fromRawActDetail = (raw: any): ActDetail => ({
  ...fromRawAct(raw),
  history: history(raw.history),
  defectList: list(raw.defectList).map((d) => ({
    id: d.id,
    number: str(d.number),
    title: str(d.title),
    severity: str(d.severity),
    severityLabel: str(d.severityLabel),
    status: str(d.status),
    statusLabel: str(d.statusLabel),
  })),
});

export const fromRawDefectsSummary = (raw: any): DefectsSummary => ({
  openCount: num(raw?.openCount),
  verifyCount: num(raw?.verifyCount),
  criticalCount: num(raw?.criticalCount),
  overdueCount: num(raw?.overdueCount),
  closed30DCount: num(raw?.closed30DCount),
  closedCount: num(raw?.closedCount),
  totalCount: num(raw?.totalCount),
  inspections30DCount: num(raw?.inspections30DCount),
  inspectionsCount: num(raw?.inspectionsCount),
  inspectionsOk: num(raw?.inspectionsOk),
  inspectionsWarn: num(raw?.inspectionsWarn),
  inspectionsFail: num(raw?.inspectionsFail),
  byContractor: list(raw?.byContractor).map((c) => ({ id: c.id ?? null, name: str(c.name), count: num(c.count) })),
  byCategory: list(raw?.byCategory).map((c) => ({ id: c.id ?? null, name: str(c.name), count: num(c.count) })),
});

export const fromRawDefect = (raw: any): Defect => ({
  id: raw.id,
  number: str(raw.number),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  contractorId: raw.contractorId ?? null,
  contractorName: str(raw.contractorName),
  title: str(raw.title),
  section: str(raw.section),
  floor: numOrNull(raw.floor),
  category: str(raw.category),
  severity: str(raw.severity),
  severityLabel: str(raw.severityLabel),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  description: str(raw.description),
  found: str(raw.found),
  deadline: raw.deadline ?? null,
  closed: raw.closed ?? null,
  isOverdue: Boolean(raw.isOverdue),
  overdueDays: num(raw.overdueDays),
  foundBy: str(raw.foundBy),
  responsible: str(raw.responsible),
  prescription: str(raw.prescription),
  photos: num(raw.photos),
  actId: raw.actId ?? null,
  actNumber: str(raw.actNumber),
  stageId: raw.stageId ?? null,
  stageName: str(raw.stageName),
  inspectionId: raw.inspectionId ?? null,
});

export const fromRawDefectDetail = (raw: any): DefectDetail => ({
  ...fromRawDefect(raw),
  history: history(raw.history),
  photoFiles: list(raw.photoFiles).map((p) => ({ id: p.id, name: str(p.name), url: str(p.url), size: num(p.size), at: str(p.at), by: str(p.by) })),
});

export const fromRawInspection = (raw: any): Inspection => ({
  id: raw.id,
  number: str(raw.number),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  date: str(raw.date),
  type: str(raw.type),
  inspector: str(raw.inspector),
  result: str(raw.result),
  resultLabel: str(raw.resultLabel),
  defectsFound: num(raw.defectsFound),
  note: str(raw.note),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ───────────────────────────────────────────────────────────────────

const construction = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });

/** Пустые значения в query не шлём (неверный параметр бэк отвергает 400). */
export function constructionQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") qs.set(key, String(value));
  const text = qs.toString();
  return text ? `?${text}` : "";
}

// Проекты и графики

export async function getStageGroups(scope?: RealtyScope, signal?: AbortSignal): Promise<StageGroup[]> {
  return list(await construction(scope, "/stage-groups/", { signal })).map((g) => ({ code: str(g.code), label: str(g.label), weight: num(g.weight) }));
}

export async function getProjectsOverview(scope?: RealtyScope, signal?: AbortSignal): Promise<ScheduleSummary[]> {
  return list(await construction(scope, "/projects/overview/", { signal })).map(fromRawSummary);
}

export async function getScheduleSummary(projectId: number, scope?: RealtyScope, signal?: AbortSignal): Promise<ScheduleSummary> {
  return fromRawSummary(await construction(scope, `/projects/${projectId}/schedule-summary/`, { signal }));
}

export async function getStages(params: { projectId?: number | null; delayed?: boolean }, scope?: RealtyScope, signal?: AbortSignal): Promise<Stage[]> {
  return list(await construction(scope, `/stages/${constructionQuery({ projectId: params.projectId, delayed: params.delayed ? "true" : null })}`, { signal })).map(fromRawStage);
}

export async function getStage(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<StageDetail> {
  return fromRawStageDetail(await construction(scope, `/stages/${id}/`, { signal }));
}

export interface StageInput {
  projectId: number;
  name: string;
  group: string;
  contractorId: number | null;
  start: string;
  end: string;
  volume: number | null;
  unit: string;
}

export function stageBody(input: StageInput): Record<string, unknown> {
  const body: Record<string, unknown> = { projectId: input.projectId, name: input.name.trim(), group: input.group, start: input.start, end: input.end };
  if (input.contractorId != null) body.contractorId = input.contractorId;
  if (input.volume != null) body.volume = input.volume;
  if (input.unit.trim()) body.unit = input.unit.trim();
  return body;
}

export async function createStage(input: StageInput, scope?: RealtyScope): Promise<StageDetail> {
  return fromRawStageDetail(await construction(scope, "/stages/", { method: "POST", body: stageBody(input) }));
}

export async function updateStageProgress(id: number, body: { progress: number; done?: number | null; note?: string }, scope?: RealtyScope): Promise<StageDetail> {
  const payload: Record<string, unknown> = { progress: body.progress };
  if (body.done != null) payload.done = body.done;
  if (body.note?.trim()) payload.note = body.note.trim();
  return fromRawStageDetail(await construction(scope, `/stages/${id}/progress/`, { method: "POST", body: payload }));
}

export async function shiftStage(id: number, body: { days: number; reason: string; cascade: boolean }, scope?: RealtyScope): Promise<{ shifted: number }> {
  const raw = await construction<{ shifted?: unknown[] }>(scope, `/stages/${id}/shift/`, { method: "POST", body: { ...body, reason: body.reason.trim() } });
  return { shifted: list(raw?.shifted).length };
}

/** Претензия подрядчику — письмо в ЭДО; ответ несёт `documentId`. */
export async function claimStage(id: number, scope?: RealtyScope): Promise<{ documentId: number | null; number: string }> {
  const raw = await construction<{ documentId?: number; number?: string; document?: { id?: number } }>(scope, `/stages/${id}/claim/`, { method: "POST", body: {} });
  return { documentId: raw?.documentId ?? raw?.document?.id ?? null, number: str(raw?.number) };
}

// Подрядчики и акты

export async function getActsSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<ActsSummary> {
  return fromRawActsSummary(await construction(scope, "/acts/summary/", { signal }));
}

export async function getContractors(scope?: RealtyScope, signal?: AbortSignal): Promise<Contractor[]> {
  return list(await construction(scope, "/contractors/", { signal })).map(fromRawContractor);
}

export async function getContractor(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<ContractorDetail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- разбор ответа
  const raw = await construction<any>(scope, `/contractors/${id}/`, { signal });
  return { ...fromRawContractor(raw), contracts: list(raw?.contracts).map(fromRawContract), acts: list(raw?.acts).map(fromRawAct) };
}

export async function getContracts(scope?: RealtyScope, signal?: AbortSignal): Promise<ConstructionContract[]> {
  return list(await construction(scope, "/contracts/", { signal })).map(fromRawContract);
}

/** Все акты: срез по статусу и ЖК — на клиенте, счётчики чипов из того же списка. */
export async function getActs(scope?: RealtyScope, signal?: AbortSignal): Promise<Act[]> {
  return list(await construction(scope, "/acts/", { signal })).map(fromRawAct);
}

export async function getAct(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<ActDetail> {
  return fromRawActDetail(await construction(scope, `/acts/${id}/`, { signal }));
}

export interface ActInput {
  contractorId: number;
  projectId: number;
  period: string;
  amount: string;
  subject: string;
}

export async function createAct(input: ActInput, scope?: RealtyScope): Promise<ActDetail> {
  const body = { contractorId: input.contractorId, projectId: input.projectId, period: input.period.trim(), amount: input.amount, subject: input.subject.trim() };
  return fromRawActDetail(await construction(scope, "/acts/", { method: "POST", body }));
}

export type ActAction = "submit" | "accept" | "pay";

export async function runActAction(id: number, action: ActAction, scope?: RealtyScope): Promise<ActDetail> {
  return fromRawActDetail(await construction(scope, `/acts/${id}/${action}/`, { method: "POST", body: {} }));
}

export async function returnAct(id: number, reason: string, scope?: RealtyScope): Promise<ActDetail> {
  return fromRawActDetail(await construction(scope, `/acts/${id}/return/`, { method: "POST", body: { reason: reason.trim() } }));
}

export async function blockContractor(id: number, reason: string, scope?: RealtyScope): Promise<void> {
  await construction(scope, `/contractors/${id}/block/`, { method: "POST", body: reason.trim() ? { reason: reason.trim() } : {} });
}

export async function unblockContractor(id: number, scope?: RealtyScope): Promise<void> {
  await construction(scope, `/contractors/${id}/unblock/`, { method: "POST", body: {} });
}

/** Кнопки акта по статусу (как в макете): что можно сделать сейчас. */
export function actActions(status: string): ("submit" | "accept" | "return" | "pay")[] {
  switch (status) {
    case "draft":
    case "rejected":
      return ["submit"];
    case "check":
      return ["accept", "return"];
    case "accepted":
      return ["pay"];
    default:
      return [];
  }
}

// Стройконтроль

export async function getDefectsSummary(projectId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<DefectsSummary> {
  return fromRawDefectsSummary(await construction(scope, `/defects/summary/${constructionQuery({ projectId })}`, { signal }));
}

export const DEFECT_FILTERS = ["open", "verify", "closed", "all"] as const;
export type DefectFilter = (typeof DEFECT_FILTERS)[number];

export function defectsQuery(params: { filter: DefectFilter; projectId?: number | null; severity?: string | null }): string {
  return constructionQuery({
    open: params.filter === "open" ? "true" : params.filter === "closed" ? "false" : null,
    status: params.filter === "verify" ? "verify" : null,
    projectId: params.projectId,
    severity: params.severity,
  });
}

export async function getDefects(params: { filter: DefectFilter; projectId?: number | null; severity?: string | null }, scope?: RealtyScope, signal?: AbortSignal): Promise<Defect[]> {
  return list(await construction(scope, `/defects/${defectsQuery(params)}`, { signal })).map(fromRawDefect);
}

export async function getDefect(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<DefectDetail> {
  return fromRawDefectDetail(await construction(scope, `/defects/${id}/`, { signal }));
}

export interface DefectInput {
  projectId: number;
  title: string;
  category: string;
  severity: string;
  deadline: string;
  contractorId: number | null;
  stageId: number | null;
  inspectionId: number | null;
  section: string;
  floor: number | null;
  description: string;
}

export function defectBody(input: DefectInput): Record<string, unknown> {
  const body: Record<string, unknown> = { projectId: input.projectId, title: input.title.trim(), category: input.category.trim(), severity: input.severity, deadline: input.deadline };
  if (input.contractorId != null) body.contractorId = input.contractorId;
  if (input.stageId != null) body.stageId = input.stageId;
  if (input.inspectionId != null) body.inspectionId = input.inspectionId;
  if (input.section.trim()) body.section = input.section.trim();
  if (input.floor != null) body.floor = input.floor;
  if (input.description.trim()) body.description = input.description.trim();
  return body;
}

export async function createDefect(input: DefectInput, scope?: RealtyScope): Promise<DefectDetail> {
  return fromRawDefectDetail(await construction(scope, "/defects/", { method: "POST", body: defectBody(input) }));
}

export type DefectAction = "prescribe" | "to-verify" | "close" | "reopen";

export async function runDefectAction(id: number, action: DefectAction, scope?: RealtyScope, note = ""): Promise<DefectDetail> {
  const body = action === "to-verify" && note.trim() ? { note: note.trim() } : {};
  return fromRawDefectDetail(await construction(scope, `/defects/${id}/${action}/`, { method: "POST", body }));
}

export async function moveDefectDeadline(id: number, deadline: string, reason: string, scope?: RealtyScope): Promise<DefectDetail> {
  return fromRawDefectDetail(await construction(scope, `/defects/${id}/deadline/`, { method: "POST", body: { deadline, reason: reason.trim() } }));
}

export async function uploadDefectPhoto(id: number, file: File, scope?: RealtyScope): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  await construction(scope, `/defects/${id}/photos/`, { method: "POST", formData });
}

export async function deleteDefectPhoto(id: number, photoId: number, scope?: RealtyScope): Promise<void> {
  await construction(scope, `/defects/${id}/photos/${photoId}/`, { method: "DELETE" });
}

/** Кнопки дефекта по статусу. */
export function defectActions(status: string): DefectAction[] {
  switch (status) {
    case "open":
      return ["prescribe"];
    case "fixing":
      return ["to-verify"];
    case "verify":
      return ["close", "reopen"];
    default:
      return [];
  }
}

export async function getInspections(scope?: RealtyScope, signal?: AbortSignal): Promise<Inspection[]> {
  return list(await construction(scope, "/inspections/", { signal })).map(fromRawInspection);
}

export async function createInspection(body: { projectId: number; type: string; result: InspectionResult; note: string }, scope?: RealtyScope): Promise<Inspection> {
  const payload: Record<string, unknown> = { projectId: body.projectId, type: body.type.trim(), result: body.result };
  if (body.note.trim()) payload.note = body.note.trim();
  return fromRawInspection(await construction(scope, "/inspections/", { method: "POST", body: payload }));
}

// ─── Хелперы экранов ────────────────────────────────────────────────────────

/** Окно Ганта: от самого раннего старта до самого позднего окончания (план или прогноз) — по месяцам. */
export function ganttRange(stages: Pick<Stage, "start" | "end" | "forecastEnd">[]): { from: string; to: string } | null {
  const dates = stages.flatMap((s) => [s.start, s.end, s.forecastEnd]).filter((d): d is string => Boolean(d));
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const from = `${first.slice(0, 7)}-01`;
  const [y, m] = last.slice(0, 7).split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0));
  return { from, to: end.toISOString().slice(0, 10) };
}

const dayMs = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** Положение отрезка в окне, доли 0..1 (для left/width в процентах). */
export function ganttBar(range: { from: string; to: string }, start: string, end: string): { left: number; width: number } {
  const total = (toUtc(range.to) - toUtc(range.from)) / dayMs + 1;
  const left = Math.max(0, (toUtc(start) - toUtc(range.from)) / dayMs) / total;
  const right = Math.min(total, (toUtc(end) - toUtc(range.from)) / dayMs + 1) / total;
  return { left, width: Math.max(0.004, right - left) };
}

/** Месяцы окна: `{ month: "2026-10", left, width }`. */
export function ganttMonths(range: { from: string; to: string }): { month: string; left: number; width: number }[] {
  const months: { month: string; left: number; width: number }[] = [];
  let [y, m] = range.from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = range.to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const bar = ganttBar(range, start, endDate);
    months.push({ month: start.slice(0, 7), left: bar.left, width: bar.width });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Ближайшие вехи: незавершённые этапы по плановому окончанию. */
export function upcomingMilestones(stages: Stage[], limit = 5): Stage[] {
  return stages
    .filter((s) => s.status !== "done")
    .sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.order - b.order))
    .slice(0, limit);
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const constructionKeys = {
  all: ["django", "construction"] as const,
  scoped: (scope: RealtyScope | undefined) => [...constructionKeys.all, ...scopeKey(scope)] as const,
  groups: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "groups"] as const,
  overview: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "overview"] as const,
  summary: (scope: RealtyScope | undefined, projectId: number) => [...constructionKeys.scoped(scope), "summary", projectId] as const,
  stages: (scope: RealtyScope | undefined, projectId: number | null, delayed = false) => [...constructionKeys.scoped(scope), "stages", projectId, delayed] as const,
  stage: (scope: RealtyScope | undefined, id: number) => [...constructionKeys.scoped(scope), "stage", id] as const,
  actsSummary: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "acts-summary"] as const,
  contractors: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "contractors"] as const,
  contractor: (scope: RealtyScope | undefined, id: number) => [...constructionKeys.scoped(scope), "contractor", id] as const,
  contracts: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "contracts"] as const,
  acts: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "acts"] as const,
  act: (scope: RealtyScope | undefined, id: number) => [...constructionKeys.scoped(scope), "act", id] as const,
  defectsSummary: (scope: RealtyScope | undefined, projectId: number | null) => [...constructionKeys.scoped(scope), "defects-summary", projectId] as const,
  defects: (scope: RealtyScope | undefined, params: { filter: DefectFilter; projectId?: number | null; severity?: string | null }) => [...constructionKeys.scoped(scope), "defects", params] as const,
  defect: (scope: RealtyScope | undefined, id: number) => [...constructionKeys.scoped(scope), "defect", id] as const,
  inspections: (scope: RealtyScope | undefined) => [...constructionKeys.scoped(scope), "inspections"] as const,
};
