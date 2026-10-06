import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Сметы, снабжение и склад застройщика (AIVIO, группа «Стройка») —
 * `/api/v2/supply`.
 *
 * Контракт — гайд бэка `frontend-construction.md` §6–8 (05.10.2026).
 * - смотреть — `supply.view`; кнопки — `supply.manage`; «Согласовать» /
 *   «Отклонить» заявку и «Выбрать» победителя тендера — `supply.approve`;
 * - филиал режет бэк по филиалу ЖК (склады — по филиалу склада); справочники
 *   поставщиков и номенклатуры общие для организации;
 * - деньги и количества — строки/числа → числа здесь; списки — массивы;
 * - побочные эффекты (ЭДО, кредиторка, приход на склад, факт бюджета) делает
 *   сервер — после действия только перечитать.
 *
 * Открытые вопросы (форма не описана в гайде, разбираем защитно):
 * - список `GET /tenders/`, `GET /orders/` и `GET /suppliers/` — считаем, что
 *   элементы как в карточке, без вложенных `offers` / `items` / `orders`;
 * - элемент `GET /inventories/` — `{id, number, warehouseId, warehouseName,
 *   status, startedAt, rows[]}` по аналогии с ответом `POST /inventories/`.
 */

const API = "/v2/supply";

export const REQUEST_STATUSES = ["new", "approved", "tender", "ordered", "delivered", "rejected"] as const;
export const ORDER_STEPS = ["ordered", "in_transit", "delivered", "closed"] as const;
export const MOVEMENT_TYPES = ["in", "out", "move"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

// ─── Сметы ──────────────────────────────────────────────────────────────────

export interface EstimatePosition {
  id: number;
  code: string;
  section: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
  doneQty: number;
  donePct: number;
  remaining: number;
  lastAct: string;
  stageId: number | null;
  stageName: string;
}

export interface EstimateSection {
  name: string;
  total: number;
  done: number;
  donePct: number;
  positions: number;
}

export interface EstimateVersion {
  version: number;
  kind: string;
  title: string;
  reason: string;
  total: number;
  date: string;
  by: string;
  current: boolean;
}

export interface Estimate {
  id: number;
  projectId: number;
  projectName: string;
  version: number;
  updated: string | null;
  index: number;
  total: number;
  done: number;
  donePct: number;
  remaining: number;
  positionsCount: number;
  positions: EstimatePosition[];
  sections: EstimateSection[];
  versions: EstimateVersion[];
}

// ─── Снабжение ──────────────────────────────────────────────────────────────

export interface SupplySummary {
  newRequests: number;
  inWorkRequests: number;
  openTenders: number;
  offersCount: number;
  ordersInTransit: number;
  ordersInTransitAmount: number;
  purchased30d: number;
  suppliersCount: number;
  funnel: { status: string; label: string; count: number }[];
  lowStock: { nomId: number; nomName: string; unit: string; total: number; min: number; suggestedQty: number }[];
}

export interface HistoryEntry {
  at: string;
  by: string;
  text: string;
}

export interface RequestItem {
  id: number;
  nomId: number;
  nomName: string;
  unit: string;
  category: string;
  price: number;
  qty: number;
  amount: number;
  /** `null` у не-согласованных заявок в списке. */
  localAvailable: number | null;
  centralQty: number | null;
  /** `stock` со склада / `transfer` перемещение / `purchase` закупка. */
  coverage: "stock" | "transfer" | "purchase" | string | null;
}

export interface SupplyRequest {
  id: number;
  number: string;
  title: string;
  projectId: number | null;
  projectName: string;
  requester: string;
  created: string;
  needBy: string | null;
  status: string;
  statusLabel: string;
  items: RequestItem[];
  total: number;
  note: string;
  tenderId: number | null;
  tenderNumber: string;
  orderId: number | null;
  orderNumber: string;
  overdue: boolean;
  history: HistoryEntry[];
  warehouseId: number | null;
  warehouseName: string;
  canIssueFromStock: boolean;
}

export interface TenderOffer {
  id: number;
  supplierId: number;
  supplierName: string;
  supplierCategory: string;
  rating: number;
  price: number;
  deliveryDays: number;
  terms: string;
  valid: string | null;
  isBest: boolean;
  aboveBestPct: number;
  score: number;
  recommended: boolean;
  isWinner: boolean;
}

export interface Tender {
  id: number;
  number: string;
  requestId: number | null;
  requestNumber: string;
  title: string;
  projectId: number | null;
  projectName: string;
  status: string;
  statusLabel: string;
  created: string;
  deadline: string | null;
  invited: { supplierId: number; supplierName: string; responded: boolean }[];
  offers: TenderOffer[];
  offersCount: number;
  bestPrice: number;
  winnerId: number | null;
  winnerName: string;
  orderId: number | null;
  orderNumber: string;
  notResponded: string[];
  invitationsSentAt: string | null;
}

export interface OrderItem {
  nomId: number;
  nomName: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
}

export interface SupplyOrder {
  id: number;
  number: string;
  supplierId: number | null;
  supplierName: string;
  projectId: number | null;
  projectName: string;
  requestId: number | null;
  requestNumber: string;
  items: OrderItem[];
  total: number;
  status: string;
  statusLabel: string;
  orderedAt: string | null;
  eta: string | null;
  deliveredAt: string | null;
  doc: string;
  docId: number | null;
  waybill: string;
  terms: string;
  overdue: boolean;
  warehouseName: string;
  supplierContact: string;
  supplierPhone: string;
  history: HistoryEntry[];
}

export interface Supplier {
  id: number;
  name: string;
  inn: string;
  category: string;
  contact: string;
  phone: string;
  rating: number;
  terms: string;
  bank: string;
  ordersCount: number;
  ordersTotal: number;
  edoDocsCount: number;
  /** `null` — доставок не было. */
  onTimePct: number | null;
  orders: SupplyOrder[];
}

export interface Nomenclature {
  id: number;
  name: string;
  unit: string;
  category: string;
  price: number;
  min: number;
}

// ─── Склад ──────────────────────────────────────────────────────────────────

export interface StockSummary {
  stockValue: number;
  warehousesCount: number;
  nomenclatureCount: number;
  stockRowsCount: number;
  lowCount: number;
  lowNames: string[];
  moves7d: number;
  receipts7d: number;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  keeper: string;
  projectId: number | null;
  isCentral: boolean;
  positions: number;
  stockValue: number;
}

export interface StockByNomenclature {
  nomId: number;
  nomName: string;
  unit: string;
  category: string;
  price: number;
  min: number;
  total: number;
  /** `low` ниже минимума · `none` нет · `ok` в норме. */
  status: string;
  byWarehouse: { warehouseId: number; qty: number; reserved: number }[];
}

export interface StockRow {
  nomId: number;
  nomName: string;
  unit: string;
  category: string;
  price: number;
  qty: number;
  reserved: number;
  available: number;
  value: number;
  min: number;
  status: string;
}

export interface Movement {
  id: number;
  number: string;
  date: string;
  type: string;
  typeLabel: string;
  warehouseId: number | null;
  warehouseName: string;
  toWarehouseId: number | null;
  toWarehouseName: string;
  nomId: number | null;
  nomName: string;
  unit: string;
  qty: number;
  ref: string;
  by: string;
  projectId: number | null;
  projectName: string;
  budgetAmount: number | null;
}

export interface InventoryRow {
  nomId: number;
  nomName: string;
  unit: string;
  price: number;
  book: number;
  fact: number | null;
  diff: number | null;
  amount: number | null;
  /** `ok` сходится / `shortage` недостача / `surplus` излишек. */
  result: string | null;
}

export interface Inventory {
  id: number;
  number: string;
  warehouseId: number | null;
  warehouseName: string;
  status: string;
  statusLabel: string;
  startedAt: string | null;
  completedAt: string | null;
  rows: InventoryRow[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const num = (value: unknown) => Number(value ?? 0) || 0;
const numOrNull = (value: unknown) => (value == null || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const str = (value: unknown) => (value == null ? "" : String(value));
const list = (value: unknown): any[] => (Array.isArray(value) ? value : Array.isArray((value as { results?: unknown })?.results) ? (value as { results: any[] }).results : []);
const history = (value: unknown): HistoryEntry[] => list(value).map((h) => ({ at: str(h.at), by: str(h.by), text: str(h.text) }));

const fromRawPosition = (raw: any): EstimatePosition => ({
  id: raw.id,
  code: str(raw.code),
  section: str(raw.section),
  name: str(raw.name),
  unit: str(raw.unit),
  qty: num(raw.qty),
  price: num(raw.price),
  amount: num(raw.amount),
  doneQty: num(raw.doneQty),
  donePct: num(raw.donePct),
  remaining: num(raw.remaining),
  lastAct: str(raw.lastAct),
  stageId: raw.stageId ?? null,
  stageName: str(raw.stageName),
});

export const fromRawEstimate = (raw: any): Estimate => ({
  id: raw.id,
  projectId: raw.projectId,
  projectName: str(raw.projectName),
  version: num(raw.version),
  updated: raw.updated ?? null,
  index: num(raw.index),
  total: num(raw.total),
  done: num(raw.done),
  donePct: num(raw.donePct),
  remaining: num(raw.remaining),
  positionsCount: num(raw.positionsCount ?? list(raw.positions).length),
  positions: list(raw.positions).map(fromRawPosition),
  sections: list(raw.sections).map((s) => ({ name: str(s.name), total: num(s.total), done: num(s.done), donePct: num(s.donePct), positions: num(s.positions) })),
  versions: list(raw.versions).map((v) => ({
    version: num(v.version),
    kind: str(v.kind),
    title: str(v.title),
    reason: str(v.reason),
    total: num(v.total),
    date: str(v.date),
    by: str(v.by),
    current: Boolean(v.current),
  })),
});

export const fromRawSupplySummary = (raw: any): SupplySummary => ({
  newRequests: num(raw?.newRequests),
  inWorkRequests: num(raw?.inWorkRequests),
  openTenders: num(raw?.openTenders),
  offersCount: num(raw?.offersCount),
  ordersInTransit: num(raw?.ordersInTransit),
  ordersInTransitAmount: num(raw?.ordersInTransitAmount),
  purchased30d: num(raw?.purchased30d),
  suppliersCount: num(raw?.suppliersCount),
  funnel: list(raw?.funnel).map((f) => ({ status: str(f.status), label: str(f.label), count: num(f.count) })),
  lowStock: list(raw?.lowStock).map((l) => ({ nomId: l.nomId, nomName: str(l.nomName), unit: str(l.unit), total: num(l.total), min: num(l.min), suggestedQty: num(l.suggestedQty) })),
});

const fromRawRequestItem = (raw: any): RequestItem => ({
  id: raw.id,
  nomId: raw.nomId,
  nomName: str(raw.nomName),
  unit: str(raw.unit),
  category: str(raw.category),
  price: num(raw.price),
  qty: num(raw.qty),
  amount: num(raw.amount),
  localAvailable: numOrNull(raw.localAvailable),
  centralQty: numOrNull(raw.centralQty),
  coverage: raw.coverage ?? null,
});

export const fromRawRequest = (raw: any): SupplyRequest => ({
  id: raw.id,
  number: str(raw.number),
  title: str(raw.title),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  requester: str(raw.requester),
  created: str(raw.created),
  needBy: raw.needBy ?? null,
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  items: list(raw.items).map(fromRawRequestItem),
  total: num(raw.total),
  note: str(raw.note),
  tenderId: raw.tenderId ?? null,
  tenderNumber: str(raw.tenderNumber),
  orderId: raw.orderId ?? null,
  orderNumber: str(raw.orderNumber),
  overdue: Boolean(raw.overdue),
  history: history(raw.history),
  warehouseId: raw.warehouseId ?? null,
  warehouseName: str(raw.warehouseName),
  canIssueFromStock: Boolean(raw.canIssueFromStock),
});

export const fromRawTender = (raw: any): Tender => ({
  id: raw.id,
  number: str(raw.number),
  requestId: raw.requestId ?? null,
  requestNumber: str(raw.requestNumber),
  title: str(raw.title),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  created: str(raw.created),
  deadline: raw.deadline ?? null,
  invited: list(raw.invited).map((i) => ({ supplierId: i.supplierId, supplierName: str(i.supplierName), responded: Boolean(i.responded) })),
  offers: list(raw.offers).map((o) => ({
    id: o.id,
    supplierId: o.supplierId,
    supplierName: str(o.supplierName),
    supplierCategory: str(o.supplierCategory),
    rating: num(o.rating),
    price: num(o.price),
    deliveryDays: num(o.deliveryDays),
    terms: str(o.terms),
    valid: o.valid ?? null,
    isBest: Boolean(o.isBest),
    aboveBestPct: num(o.aboveBestPct),
    score: num(o.score),
    recommended: Boolean(o.recommended),
    isWinner: Boolean(o.isWinner),
  })),
  offersCount: num(raw.offersCount ?? list(raw.offers).length),
  bestPrice: num(raw.bestPrice),
  winnerId: raw.winnerId ?? null,
  winnerName: str(raw.winnerName),
  orderId: raw.orderId ?? null,
  orderNumber: str(raw.orderNumber),
  notResponded: list(raw.notResponded).map((n) => (typeof n === "string" ? n : str(n?.supplierName ?? n?.name))),
  invitationsSentAt: raw.invitationsSentAt ?? null,
});

export const fromRawOrder = (raw: any): SupplyOrder => ({
  id: raw.id,
  number: str(raw.number),
  supplierId: raw.supplierId ?? null,
  supplierName: str(raw.supplierName),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  requestId: raw.requestId ?? null,
  requestNumber: str(raw.requestNumber),
  items: list(raw.items).map((i) => ({ nomId: i.nomId, nomName: str(i.nomName), unit: str(i.unit), qty: num(i.qty), price: num(i.price), amount: num(i.amount) })),
  total: num(raw.total),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  orderedAt: raw.orderedAt ?? null,
  eta: raw.eta ?? null,
  deliveredAt: raw.deliveredAt ?? null,
  doc: str(raw.doc),
  docId: raw.docId ?? null,
  waybill: str(raw.waybill),
  terms: str(raw.terms),
  overdue: Boolean(raw.overdue),
  warehouseName: str(raw.warehouseName),
  supplierContact: str(raw.supplierContact),
  supplierPhone: str(raw.supplierPhone),
  history: history(raw.history),
});

export const fromRawSupplier = (raw: any): Supplier => ({
  id: raw.id,
  name: str(raw.name),
  inn: str(raw.inn),
  category: str(raw.category),
  contact: str(raw.contact),
  phone: str(raw.phone),
  rating: num(raw.rating),
  terms: str(raw.terms),
  bank: str(raw.bank),
  ordersCount: num(raw.ordersCount),
  ordersTotal: num(raw.ordersTotal),
  edoDocsCount: num(raw.edoDocsCount),
  onTimePct: numOrNull(raw.onTimePct),
  orders: list(raw.orders).map(fromRawOrder),
});

export const fromRawNomenclature = (raw: any): Nomenclature => ({
  id: raw.id ?? raw.nomId,
  name: str(raw.name ?? raw.nomName),
  unit: str(raw.unit),
  category: str(raw.category),
  price: num(raw.price),
  min: num(raw.min),
});

export const fromRawStockSummary = (raw: any): StockSummary => ({
  stockValue: num(raw?.stockValue),
  warehousesCount: num(raw?.warehousesCount),
  nomenclatureCount: num(raw?.nomenclatureCount),
  stockRowsCount: num(raw?.stockRowsCount),
  lowCount: num(raw?.lowCount),
  lowNames: list(raw?.lowNames).map(String),
  moves7d: num(raw?.moves7d),
  receipts7d: num(raw?.receipts7d),
});

export const fromRawWarehouse = (raw: any): Warehouse => ({
  id: raw.id,
  code: str(raw.code),
  name: str(raw.name),
  keeper: str(raw.keeper),
  projectId: raw.projectId ?? null,
  isCentral: Boolean(raw.isCentral),
  positions: num(raw.positions),
  stockValue: num(raw.stockValue),
});

export const fromRawStockByNom = (raw: any): StockByNomenclature => ({
  nomId: raw.nomId,
  nomName: str(raw.nomName),
  unit: str(raw.unit),
  category: str(raw.category),
  price: num(raw.price),
  min: num(raw.min),
  total: num(raw.total),
  status: str(raw.status),
  byWarehouse: list(raw.byWarehouse).map((w) => ({ warehouseId: w.warehouseId, qty: num(w.qty), reserved: num(w.reserved) })),
});

export const fromRawStockRow = (raw: any): StockRow => ({
  nomId: raw.nomId,
  nomName: str(raw.nomName),
  unit: str(raw.unit),
  category: str(raw.category),
  price: num(raw.price),
  qty: num(raw.qty),
  reserved: num(raw.reserved),
  available: num(raw.available),
  value: num(raw.value),
  min: num(raw.min),
  status: str(raw.status),
});

export const fromRawMovement = (raw: any): Movement => ({
  id: raw.id,
  number: str(raw.number),
  date: str(raw.date),
  type: str(raw.type),
  typeLabel: str(raw.typeLabel),
  warehouseId: raw.warehouseId ?? null,
  warehouseName: str(raw.warehouseName),
  toWarehouseId: raw.toWarehouseId ?? null,
  toWarehouseName: str(raw.toWarehouseName),
  nomId: raw.nomId ?? null,
  nomName: str(raw.nomName),
  unit: str(raw.unit),
  qty: num(raw.qty),
  ref: str(raw.ref),
  by: str(raw.by),
  projectId: raw.projectId ?? null,
  projectName: str(raw.projectName),
  budgetAmount: numOrNull(raw.budgetAmount),
});

export const fromRawInventory = (raw: any): Inventory => ({
  id: raw.id,
  number: str(raw.number),
  warehouseId: raw.warehouseId ?? null,
  warehouseName: str(raw.warehouseName),
  status: str(raw.status),
  statusLabel: str(raw.statusLabel),
  startedAt: raw.startedAt ?? raw.created ?? null,
  completedAt: raw.completedAt ?? null,
  rows: list(raw.rows).map((r) => ({
    nomId: r.nomId,
    nomName: str(r.nomName),
    unit: str(r.unit),
    price: num(r.price),
    book: num(r.book),
    fact: numOrNull(r.fact),
    diff: numOrNull(r.diff),
    amount: numOrNull(r.amount),
    result: r.result ?? null,
  })),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── API ───────────────────────────────────────────────────────────────────

const supply = <T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}) =>
  apiRequest<T>(`${API}${path}`, { ...options, headers: realtyHeaders(scope) });

export function supplyQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") qs.set(key, String(value));
  const text = qs.toString();
  return text ? `?${text}` : "";
}

const post = <T>(scope: RealtyScope | undefined, path: string, body: unknown = {}) => supply<T>(scope, path, { method: "POST", body });

// Сметы

export async function getEstimates(scope?: RealtyScope, signal?: AbortSignal): Promise<Estimate[]> {
  return list(await supply(scope, "/estimates/", { signal })).map(fromRawEstimate);
}

export async function getEstimate(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Estimate> {
  return fromRawEstimate(await supply(scope, `/estimates/${id}/`, { signal }));
}

export async function getEstimateItem(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<EstimatePosition> {
  return fromRawPosition(await supply(scope, `/estimate-items/${id}/`, { signal }));
}

export async function addEstimateItem(estimateId: number, body: { section: string; name: string; unit: string; qty: number; price: number }, scope?: RealtyScope): Promise<void> {
  await post(scope, `/estimates/${estimateId}/items/`, { ...body, section: body.section.trim(), name: body.name.trim(), unit: body.unit.trim() });
}

export async function updateEstimateProgress(itemId: number, body: { doneQty: number; act?: string }, scope?: RealtyScope): Promise<void> {
  await post(scope, `/estimate-items/${itemId}/progress/`, body.act?.trim() ? { doneQty: body.doneQty, act: body.act.trim() } : { doneQty: body.doneQty });
}

/** Правка позиции — версия сметы +1; `reason` обязателен. Шлём только изменённое. */
export async function updateEstimateItem(itemId: number, body: { name?: string; qty?: number; price?: number; reason: string }, scope?: RealtyScope): Promise<void> {
  await supply(scope, `/estimate-items/${itemId}/`, { method: "PATCH", body: { ...body, reason: body.reason.trim() } });
}

export async function reindexEstimate(estimateId: number, body: { index: number; scope: "materials" | "all"; reason: string }, scope?: RealtyScope): Promise<void> {
  await post(scope, `/estimates/${estimateId}/index/`, { ...body, reason: body.reason.trim() });
}

/** Импорт из Smeta.kg: CSV как текст. Ошибка строки — ничего не записано. */
export async function importEstimate(estimateId: number, content: string, mode: "append" | "replace", scope?: RealtyScope): Promise<{ imported: number }> {
  const raw = await post<{ imported?: number }>(scope, `/estimates/${estimateId}/import/`, { format: "csv", content, mode });
  return { imported: num(raw?.imported) };
}

// Снабжение

export async function getSupplySummary(scope?: RealtyScope, signal?: AbortSignal): Promise<SupplySummary> {
  return fromRawSupplySummary(await supply(scope, "/summary/", { signal }));
}

/** Все заявки (уже по `needBy`): срез по статусу и ЖК — на клиенте. */
export async function getRequests(scope?: RealtyScope, signal?: AbortSignal): Promise<SupplyRequest[]> {
  return list(await supply(scope, "/requests/", { signal })).map(fromRawRequest);
}

export async function getRequest(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<SupplyRequest> {
  return fromRawRequest(await supply(scope, `/requests/${id}/`, { signal }));
}

export interface RequestInput {
  title: string;
  projectId: number;
  needBy: string | null;
  items: { nomId: number; qty: number }[];
  note: string;
}

export function requestBody(input: RequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = { title: input.title.trim(), projectId: input.projectId, items: input.items.filter((i) => i.qty > 0) };
  if (input.needBy) body.needBy = input.needBy;
  if (input.note.trim()) body.note = input.note.trim();
  return body;
}

export async function createRequest(input: RequestInput, scope?: RealtyScope): Promise<SupplyRequest> {
  return fromRawRequest(await post(scope, "/requests/", requestBody(input)));
}

export type RequestAction = "approve" | "issue" | "tender" | "order";

export async function runRequestAction(id: number, action: RequestAction, scope?: RealtyScope): Promise<{ tenderId: number | null; orderId: number | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- разбор ответа (заявка / тендер / заказ)
  const raw = await post<any>(scope, `/requests/${id}/${action}/`);
  return { tenderId: action === "tender" ? (raw?.id ?? null) : (raw?.tenderId ?? null), orderId: action === "order" ? (raw?.id ?? null) : (raw?.orderId ?? null) };
}

export async function rejectRequest(id: number, reason: string, scope?: RealtyScope): Promise<void> {
  await post(scope, `/requests/${id}/reject/`, reason.trim() ? { reason: reason.trim() } : {});
}

/** Кнопки заявки по статусу и правам. */
export function requestActions(req: Pick<SupplyRequest, "status" | "canIssueFromStock">, can: { manage: boolean; approve: boolean }): ("approve" | "reject" | "issue" | "tender" | "order")[] {
  const out: ("approve" | "reject" | "issue" | "tender" | "order")[] = [];
  if (req.status === "new" && can.approve) out.push("approve", "reject");
  if (req.status === "approved") {
    if (can.manage && req.canIssueFromStock) out.push("issue");
    if (can.manage) out.push("tender", "order");
    if (can.approve) out.push("reject");
  }
  return out;
}

export async function getTenders(scope?: RealtyScope, signal?: AbortSignal): Promise<Tender[]> {
  return list(await supply(scope, "/tenders/", { signal })).map(fromRawTender);
}

export async function getTender(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Tender> {
  return fromRawTender(await supply(scope, `/tenders/${id}/`, { signal }));
}

export async function inviteTender(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/tenders/${id}/invite/`);
}

export async function addTenderOffer(id: number, body: { supplierId: number; price: number; deliveryDays: number; terms: string }, scope?: RealtyScope): Promise<void> {
  await post(scope, `/tenders/${id}/offers/`, { ...body, terms: body.terms.trim() });
}

/** «Выбрать» победителя → заказ (+ договор поставки в ЭДО). */
export async function awardTender(id: number, supplierId: number, scope?: RealtyScope): Promise<{ orderId: number | null }> {
  const raw = await post<{ id?: number; orderId?: number }>(scope, `/tenders/${id}/award/`, { supplierId });
  return { orderId: raw?.orderId ?? raw?.id ?? null };
}

export async function getOrders(scope?: RealtyScope, signal?: AbortSignal): Promise<SupplyOrder[]> {
  return list(await supply(scope, "/orders/", { signal })).map(fromRawOrder);
}

export async function getOrder(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<SupplyOrder> {
  return fromRawOrder(await supply(scope, `/orders/${id}/`, { signal }));
}

export async function shipOrder(id: number, waybill: string, scope?: RealtyScope): Promise<void> {
  await post(scope, `/orders/${id}/ship/`, waybill.trim() ? { waybill: waybill.trim() } : {});
}

export async function receiveOrder(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/orders/${id}/receive/`);
}

export async function getSuppliers(scope?: RealtyScope, signal?: AbortSignal): Promise<Supplier[]> {
  return list(await supply(scope, "/suppliers/", { signal })).map(fromRawSupplier);
}

export async function getSupplier(id: number, scope?: RealtyScope, signal?: AbortSignal): Promise<Supplier> {
  return fromRawSupplier(await supply(scope, `/suppliers/${id}/`, { signal }));
}

export async function getNomenclature(scope?: RealtyScope, signal?: AbortSignal): Promise<Nomenclature[]> {
  return list(await supply(scope, "/nomenclature/", { signal })).map(fromRawNomenclature);
}

// Склад

export async function getStockSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<StockSummary> {
  return fromRawStockSummary(await supply(scope, "/stock/summary/", { signal }));
}

export async function getWarehouses(scope?: RealtyScope, signal?: AbortSignal): Promise<Warehouse[]> {
  return list(await supply(scope, "/warehouses/", { signal })).map(fromRawWarehouse);
}

export async function getStockByNomenclature(search: string, scope?: RealtyScope, signal?: AbortSignal): Promise<StockByNomenclature[]> {
  return list(await supply(scope, `/stock/by-nomenclature/${supplyQuery({ search: search.trim() })}`, { signal })).map(fromRawStockByNom);
}

export async function getStock(warehouseId: number, search: string, scope?: RealtyScope, signal?: AbortSignal): Promise<StockRow[]> {
  return list(await supply(scope, `/stock/${supplyQuery({ warehouseId, search: search.trim() })}`, { signal })).map(fromRawStockRow);
}

export async function getMovements(warehouseId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Movement[]> {
  return list(await supply(scope, `/movements/${supplyQuery({ warehouseId })}`, { signal })).map(fromRawMovement);
}

export interface MovementInput {
  type: MovementType;
  warehouseId: number;
  toWarehouseId: number | null;
  nomId: number;
  qty: number;
  projectId: number | null;
  floor: string;
  ref: string;
}

/** Тело движения: получатель — только у перемещения, объект и этаж — только у списания. */
export function movementBody(input: MovementInput): Record<string, unknown> {
  const body: Record<string, unknown> = { type: input.type, warehouseId: input.warehouseId, nomId: input.nomId, qty: input.qty };
  if (input.type === "move" && input.toWarehouseId != null) body.toWarehouseId = input.toWarehouseId;
  if (input.type === "out") {
    if (input.projectId != null) body.projectId = input.projectId;
    if (input.floor.trim()) body.floor = input.floor.trim();
  }
  if (input.ref.trim()) body.ref = input.ref.trim();
  return body;
}

export async function createMovement(input: MovementInput, scope?: RealtyScope): Promise<Movement> {
  return fromRawMovement(await post(scope, "/movements/", movementBody(input)));
}

export async function getInventories(warehouseId: number | null, scope?: RealtyScope, signal?: AbortSignal): Promise<Inventory[]> {
  return list(await supply(scope, `/inventories/${supplyQuery({ warehouseId })}`, { signal })).map(fromRawInventory);
}

export async function startInventory(warehouseId: number, scope?: RealtyScope): Promise<Inventory> {
  return fromRawInventory(await post(scope, "/inventories/", { warehouseId }));
}

export async function completeInventory(id: number, rows: { nomId: number; fact: number }[], scope?: RealtyScope): Promise<Inventory> {
  return fromRawInventory(await post(scope, `/inventories/${id}/complete/`, { rows }));
}

export async function cancelInventory(id: number, scope?: RealtyScope): Promise<void> {
  await post(scope, `/inventories/${id}/cancel/`);
}

// ─── Хелперы экранов ────────────────────────────────────────────────────────

/** Шаг степпера заказа: индекс в `ORDER_STEPS`, неизвестный статус — 0. */
export const orderStep = (status: string) => Math.max(0, (ORDER_STEPS as readonly string[]).indexOf(status));

/** Позиции сметы по поиску (код, название) и разделу — на клиенте (гайд §6). */
export function filterPositions(positions: EstimatePosition[], search: string, section: string): EstimatePosition[] {
  const q = search.trim().toLocaleLowerCase("ru");
  return positions.filter((p) => (!section || p.section === section) && (!q || p.name.toLocaleLowerCase("ru").includes(q) || p.code.toLocaleLowerCase("ru").includes(q)));
}

/** Расхождение инвентаризации на клиенте до отправки (бэк пересчитает сам). */
export function inventoryDiff(book: number, fact: number | null): { diff: number | null; result: "ok" | "shortage" | "surplus" | null } {
  if (fact == null) return { diff: null, result: null };
  const diff = Math.round((fact - book) * 1000) / 1000;
  return { diff, result: diff === 0 ? "ok" : diff < 0 ? "shortage" : "surplus" };
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const supplyKeys = {
  all: ["django", "supply"] as const,
  scoped: (scope: RealtyScope | undefined) => [...supplyKeys.all, ...scopeKey(scope)] as const,
  estimates: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "estimates"] as const,
  estimate: (scope: RealtyScope | undefined, id: number) => [...supplyKeys.scoped(scope), "estimate", id] as const,
  estimateItem: (scope: RealtyScope | undefined, id: number) => [...supplyKeys.scoped(scope), "estimate-item", id] as const,
  summary: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "summary"] as const,
  requests: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "requests"] as const,
  request: (scope: RealtyScope | undefined, id: number) => [...supplyKeys.scoped(scope), "request", id] as const,
  tenders: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "tenders"] as const,
  tender: (scope: RealtyScope | undefined, id: number) => [...supplyKeys.scoped(scope), "tender", id] as const,
  orders: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "orders"] as const,
  order: (scope: RealtyScope | undefined, id: number) => [...supplyKeys.scoped(scope), "order", id] as const,
  suppliers: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "suppliers"] as const,
  supplier: (scope: RealtyScope | undefined, id: number) => [...supplyKeys.scoped(scope), "supplier", id] as const,
  nomenclature: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "nomenclature"] as const,
  stockSummary: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "stock-summary"] as const,
  warehouses: (scope: RealtyScope | undefined) => [...supplyKeys.scoped(scope), "warehouses"] as const,
  stockByNom: (scope: RealtyScope | undefined, search: string) => [...supplyKeys.scoped(scope), "stock-by-nom", search] as const,
  stock: (scope: RealtyScope | undefined, warehouseId: number, search: string) => [...supplyKeys.scoped(scope), "stock", warehouseId, search] as const,
  movements: (scope: RealtyScope | undefined, warehouseId: number | null) => [...supplyKeys.scoped(scope), "movements", warehouseId] as const,
  inventories: (scope: RealtyScope | undefined, warehouseId: number | null) => [...supplyKeys.scoped(scope), "inventories", warehouseId] as const,
};
