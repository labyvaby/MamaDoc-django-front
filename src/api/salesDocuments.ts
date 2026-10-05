import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Документы (CRM)» застройщика: файлы сделок — договоры, листы брони,
 * графики, планировки, квитанции. Часть создаётся сама при брони, продаже и
 * оплате; свой файл можно загрузить и отправить на подпись — тогда он уходит
 * в ЭДО, и когда там подпишут, здесь статус сам станет «Подписан».
 *
 * Контракт — `frontend-documents.md` §5 и справочник (раздел «Документы
 * (CRM)»), 04.10.2026. Базовый путь `/api/v2/realty/documents/`;
 * смотреть — `realty.view`, загружать и отправлять на подпись — `realty.manage`.
 * Файл — только через защищённую ссылку `fileUrl` (`protectedFile.ts`).
 */

const DOCS_API = "/v2/realty/documents";

export type SalesDocChip = "all" | "contracts" | "bookings" | "layouts" | "payments";
export const SALES_DOC_CHIPS: readonly SalesDocChip[] = ["all", "contracts", "bookings", "layouts", "payments"];
export type SalesDocType = "contract" | "booking" | "schedule" | "layout" | "payment";
export const SALES_DOC_TYPES: readonly SalesDocType[] = ["contract", "booking", "schedule", "layout", "payment"];

export interface SalesDocument {
  id: number;
  number: string;
  name: string;
  type: SalesDocType | string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  /** Цвет статуса от бэка (имя тона: green / orange / …) — сопоставляем с темой. */
  statusColor: string;
  originLabel: string;
  object: string;
  projectName: string | null;
  unitNumber: number | null;
  buyer: string;
  amount: number;
  date: string;
  dateLabel: string;
  fileUrl: string | null;
  fileName: string;
  comment: string;
  edoDocumentId: number | null;
  edoNumber: string | null;
  edoStatusLabel: string | null;
}

export interface SalesDocsSummary {
  total: number;
  review: number;
  signing: number;
  signedMonth: number;
  counts: Record<SalesDocChip, number>;
}

export interface SalesDocsParams {
  chip: SalesDocChip;
  search: string;
  from: string | null;
  to: string | null;
}

type RawSalesDocument = Omit<SalesDocument, "amount"> & { amount: string };

const fromRaw = (raw: RawSalesDocument): SalesDocument => ({ ...raw, amount: Number(raw.amount) || 0 });

function docs<T>(scope: RealtyScope | undefined, path: string, options: Parameters<typeof apiRequest>[1] = {}): Promise<T> {
  return apiRequest<T>(`${DOCS_API}${path}`, { ...options, headers: realtyHeaders(scope) });
}

export async function getSalesDocuments(params: SalesDocsParams, scope?: RealtyScope, signal?: AbortSignal): Promise<SalesDocument[]> {
  const query = new URLSearchParams();
  if (params.chip !== "all") query.set("chip", params.chip);
  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const text = query.toString();
  const raw = await docs<RawSalesDocument[]>(scope, `/${text ? `?${text}` : ""}`, { signal });
  return raw.map(fromRaw);
}

export async function getSalesDocsSummary(scope?: RealtyScope, signal?: AbortSignal): Promise<SalesDocsSummary> {
  const raw = await docs<Omit<SalesDocsSummary, "counts"> & { counts?: Partial<SalesDocsSummary["counts"]> }>(scope, "/summary/", { signal });
  return { ...raw, counts: { all: 0, contracts: 0, bookings: 0, layouts: 0, payments: 0, ...raw.counts } };
}

export interface SalesDocUpload {
  file: File;
  name: string;
  type: SalesDocType;
  projectId: number | null;
  unitId: number | null;
  buyer: string;
  amount: number | null;
  date: string | null;
  comment: string;
}

/** Загрузка: multipart — `file` и поля документа. */
export async function uploadSalesDocument(input: SalesDocUpload, scope?: RealtyScope): Promise<SalesDocument> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("name", input.name);
  form.append("type", input.type);
  if (input.projectId != null) form.append("projectId", String(input.projectId));
  if (input.unitId != null) form.append("unitId", String(input.unitId));
  if (input.buyer) form.append("buyer", input.buyer);
  if (input.amount != null) form.append("amount", input.amount.toFixed(2));
  if (input.date) form.append("date", input.date);
  if (input.comment) form.append("comment", input.comment);
  return fromRaw(await docs<RawSalesDocument>(scope, "/", { method: "POST", formData: form }));
}

/** «На подпись» — создаёт документ ЭДО (статус «На подписи»). */
export async function sendSalesDocumentToSign(id: number, scope?: RealtyScope): Promise<SalesDocument> {
  return fromRaw(await docs<RawSalesDocument>(scope, `/${id}/sign/`, { method: "POST", body: {} }));
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const salesDocsKeys = {
  all: ["django", "sales-documents"] as const,
  list: (scope: RealtyScope | undefined, params: SalesDocsParams) => [...salesDocsKeys.all, ...scopeKey(scope), "list", params] as const,
  summary: (scope: RealtyScope | undefined) => [...salesDocsKeys.all, ...scopeKey(scope), "summary"] as const,
};
