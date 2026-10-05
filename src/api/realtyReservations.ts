import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * «Брони и оплаты» застройщика (AIVIO) — реестр броней и договоров.
 *
 * Контракт — гайд бэка `frontend-sales.md` §6 (05.10.2026), формы сверены с
 * test2 06.10.2026. Действия с бронью и договором (подтвердить предоплату,
 * продлить, снять, оформить договор) живут в карточке квартиры на шахматке —
 * экран ведёт туда, а не дублирует формы.
 * - «Ожидается платежей» / «Оплачено за месяц» — сводка биллинга;
 * - филиал режет бэк (филиал ЖК);
 * - смотреть — `realty.view`.
 */

const REALTY_API = "/v2/realty";

export const RESERVATION_STATUSES = ["active", "sold", "cancelled", "expired"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const CONTRACT_STATUSES = ["signed", "refunded"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export interface ReservationRow {
  id: number;
  number: string;
  unitId: number;
  unitNumber: number | null;
  /** «1-комн. · №3081». */
  unitLabel: string;
  projectId: number | null;
  projectName: string;
  leadId: number | null;
  buyer: string;
  phone: string;
  /** free / prepaid. */
  type: string;
  typeLabel: string;
  /** Срок брони в часах; подпись склоняет фронт — у бэка «72 часов». */
  term: number | null;
  termLabel: string;
  amount: number;
  paymentStatus: string;
  paymentStatusLabel: string;
  expiresAt: string | null;
  offerTitle: string;
  price: number;
  discount: number;
  finalPrice: number;
  status: ReservationStatus | string;
  statusLabel: string;
  manager: string;
  createdAt: string;
}

export interface ContractRow {
  id: number;
  number: string;
  unitId: number;
  unitNumber: number | null;
  projectId: number | null;
  projectName: string;
  leadId: number | null;
  buyer: string;
  phone: string;
  payment: string;
  paymentLabel: string;
  price: number;
  signedAt: string | null;
  status: ContractStatus | string;
  statusLabel: string;
  refundReason: string;
  billingAccountId: number | null;
  manager: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- сырой ответ разбирается здесь и только здесь */
const money = (value: unknown) => Number(value ?? 0) || 0;

const fromRawReservation = (raw: any): ReservationRow => ({
  id: raw.id,
  number: raw.number ?? "",
  unitId: raw.unitId,
  unitNumber: raw.unitNumber ?? null,
  unitLabel: raw.unitLabel ?? (raw.unitNumber != null ? `№${raw.unitNumber}` : ""),
  projectId: raw.projectId ?? null,
  projectName: raw.projectName ?? "",
  leadId: raw.leadId ?? null,
  buyer: raw.buyer ?? "",
  phone: raw.phone ?? "",
  type: raw.type ?? "",
  typeLabel: raw.typeLabel ?? "",
  term: Number(raw.term) || null,
  termLabel: raw.termLabel ?? "",
  amount: money(raw.amount),
  paymentStatus: raw.paymentStatus ?? "",
  paymentStatusLabel: raw.paymentStatusLabel ?? "",
  expiresAt: raw.expiresAt ?? null,
  offerTitle: raw.offerTitle ?? "",
  price: money(raw.price),
  discount: money(raw.discount),
  finalPrice: money(raw.finalPrice ?? raw.price),
  status: raw.status ?? "",
  statusLabel: raw.statusLabel ?? "",
  manager: raw.manager ?? "",
  createdAt: raw.createdAt ?? "",
});

const fromRawContract = (raw: any): ContractRow => ({
  id: raw.id,
  number: raw.number ?? "",
  unitId: raw.unitId,
  unitNumber: raw.unitNumber ?? null,
  projectId: raw.projectId ?? null,
  projectName: raw.projectName ?? "",
  leadId: raw.leadId ?? null,
  buyer: raw.buyer ?? "",
  phone: raw.phone ?? "",
  payment: raw.payment ?? "",
  paymentLabel: raw.paymentLabel ?? "",
  price: money(raw.price),
  signedAt: raw.signedAt ?? null,
  status: raw.status ?? "",
  statusLabel: raw.statusLabel ?? "",
  refundReason: raw.refundReason ?? "",
  billingAccountId: raw.billingAccountId ?? null,
  manager: raw.manager ?? "",
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getReservations(status: ReservationStatus | null, scope?: RealtyScope, signal?: AbortSignal): Promise<ReservationRow[]> {
  const raw = await apiRequest<unknown[]>(`${REALTY_API}/reservations/${status ? `?status=${status}` : ""}`, { headers: realtyHeaders(scope), signal });
  return (raw ?? []).map(fromRawReservation);
}

export async function getContracts(status: ContractStatus | null, scope?: RealtyScope, signal?: AbortSignal): Promise<ContractRow[]> {
  const raw = await apiRequest<unknown[]>(`${REALTY_API}/contracts/${status ? `?status=${status}` : ""}`, { headers: realtyHeaders(scope), signal });
  return (raw ?? []).map(fromRawContract);
}

/** KPI «Истекают сегодня» — активные брони, у которых срок кончается сегодня (по местному дню). */
export function expiringToday(list: readonly ReservationRow[], now = new Date()): number {
  const day = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
  const today = day(now);
  return list.filter((row) => row.status === "active" && row.expiresAt && day(new Date(row.expiresAt)) === today).length;
}

/** Поиск по реестру на клиенте: номер, покупатель, телефон (цифры), квартира, ЖК. */
export function matchesDealSearch(row: { number: string; buyer: string; phone: string; projectName: string; unitNumber: number | null }, search: string): boolean {
  const query = search.trim().toLocaleLowerCase("ru");
  if (!query) return true;
  const digits = query.replace(/\D/g, "");
  return (
    [row.number, row.buyer, row.projectName, row.unitNumber != null ? String(row.unitNumber) : ""].some((field) => field.toLocaleLowerCase("ru").includes(query)) ||
    (digits.length >= 3 && row.phone.replace(/\D/g, "").includes(digits))
  );
}

const scopeKey = (scope: RealtyScope | undefined) => [scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const;

export const realtyDealKeys = {
  all: ["django", "realty", "deals"] as const,
  reservations: (scope: RealtyScope | undefined, status: ReservationStatus | null) => [...realtyDealKeys.all, ...scopeKey(scope), "reservations", status] as const,
  contracts: (scope: RealtyScope | undefined, status: ContractStatus | null) => [...realtyDealKeys.all, ...scopeKey(scope), "contracts", status] as const,
};
