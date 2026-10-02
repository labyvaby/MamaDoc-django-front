/**
 * Данные для отчётов отеля: постраничная выборка (бэкенд отдаёт не больше
 * 200 строк за запрос) и чистые расчёты поверх броней, оплат и расходов.
 * Расчёты здесь, а не в компонентах, — чтобы отчёты считали одинаково и
 * чтобы их можно было проверить тестами (hotelReportData.test.ts).
 */
import dayjs from "dayjs";

import { getExpenses, type Expense } from "../api/expenses";
import {
  listPaymentRegister,
  listReservations,
  type HotelPayment,
  type HotelPaymentRegisterTotal,
  type HotelReservation,
  type HotelReservationListParams,
} from "../api/hotel";

const PAGE = 200;
/** Потолок страниц на один отчёт: 10 × 200 = 2000 строк — дальше честно говорим «показаны не все». */
const MAX_PAGES = 10;

export interface Fetched<T> {
  rows: T[];
  /** Упёрлись в потолок страниц — в отчёте не все строки. */
  truncated: boolean;
}

export async function fetchAllReservations(
  params: Omit<HotelReservationListParams, "limit" | "offset">,
  signal?: AbortSignal,
  maxPages = MAX_PAGES,
): Promise<Fetched<HotelReservation>> {
  const byId = new Map<number, HotelReservation>();
  for (let page = 0; page < maxPages; page++) {
    const res = await listReservations({ ...params, limit: PAGE, offset: page * PAGE }, signal);
    for (const r of res.results) byId.set(r.id, r);
    if (res.results.length < PAGE || (page + 1) * PAGE >= res.count) return { rows: [...byId.values()], truncated: false };
  }
  return { rows: [...byId.values()], truncated: true };
}

export interface FetchedRegister extends Fetched<HotelPayment> {
  totals: HotelPaymentRegisterTotal[];
}

/** Реестр оплат: from включительно, to исключительно (как у бэкенда). */
export async function fetchPaymentRegister(
  propertyId: number,
  from: string,
  to: string,
  signal?: AbortSignal,
  maxPages = MAX_PAGES,
): Promise<FetchedRegister> {
  const rows: HotelPayment[] = [];
  let totals: HotelPaymentRegisterTotal[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await listPaymentRegister({ propertyId, from, to, limit: PAGE, offset: page * PAGE }, signal);
    if (page === 0) totals = res.totals;
    rows.push(...res.results);
    if (res.results.length < PAGE || rows.length >= res.count) return { rows, totals, truncated: false };
  }
  return { rows, totals, truncated: true };
}

/** Расходы филиала за даты (обе включительно), без аннулированных. */
export async function fetchAllExpenses(
  filters: { organizationId: number; branchId?: number | null; dateFrom: string; dateTo: string },
  signal?: AbortSignal,
  maxPages = MAX_PAGES,
): Promise<Fetched<Expense>> {
  const rows: Expense[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await getExpenses(
      {
        organizationId: filters.organizationId,
        branchId: filters.branchId ?? undefined,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        page,
        pageSize: PAGE,
      },
      signal,
    );
    rows.push(...res.results.filter((e) => !e.isVoided));
    if (!res.next) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

// ── Брони: выручка, загрузка, балансы ───────────────────────────────────────

/** В выручку и загрузку идут только подтверждённые брони (как «Активные» у Exely). */
export const isRevenueReservation = (r: HotelReservation): boolean => r.status === "confirmed";

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface DailyPoint {
  date: string;
  soldRooms: number;
  revenue: number;
}

/** По каждой дате периода (обе границы включительно): проданные номера и сумма цен ночей. */
export function dailySeries(reservations: HotelReservation[], from: string, to: string): DailyPoint[] {
  const points = new Map<string, DailyPoint>();
  for (let d = dayjs(from); !d.isAfter(dayjs(to), "day"); d = d.add(1, "day")) {
    const key = d.format("YYYY-MM-DD");
    points.set(key, { date: key, soldRooms: 0, revenue: 0 });
  }
  for (const r of reservations) {
    if (!isRevenueReservation(r)) continue;
    for (const item of r.items) {
      if (item.isActive === false) continue;
      for (const night of item.nights ?? []) {
        const p = points.get(night.date);
        if (!p) continue;
        p.soldRooms += 1;
        p.revenue += num(night.price);
      }
    }
  }
  return [...points.values()];
}

export interface RevenueSlice {
  key: string;
  label: string;
  nights: number;
  revenue: number;
  adr: number;
  reservations: number;
}

function slices(
  reservations: HotelReservation[],
  from: string,
  to: string,
  keyOf: (r: HotelReservation, item: HotelReservation["items"][number]) => { key: string; label: string },
): RevenueSlice[] {
  const map = new Map<string, RevenueSlice & { ids: Set<number> }>();
  for (const r of reservations) {
    if (!isRevenueReservation(r)) continue;
    for (const item of r.items) {
      if (item.isActive === false) continue;
      const { key, label } = keyOf(r, item);
      for (const night of item.nights ?? []) {
        if (night.date < from || night.date > to) continue;
        const s = map.get(key) ?? { key, label, nights: 0, revenue: 0, adr: 0, reservations: 0, ids: new Set<number>() };
        s.nights += 1;
        s.revenue += num(night.price);
        s.ids.add(r.id);
        map.set(key, s);
      }
    }
  }
  return [...map.values()]
    .map(({ ids, ...s }) => ({ ...s, reservations: ids.size, adr: s.nights ? Math.round(s.revenue / s.nights) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export const revenueByCategory = (reservations: HotelReservation[], from: string, to: string) =>
  slices(reservations, from, to, (_r, item) => ({ key: String(item.roomTypeId), label: item.roomTypeName }));

export const revenueBySource = (reservations: HotelReservation[], from: string, to: string, labelOf: (source: string) => string) =>
  slices(reservations, from, to, (r) => ({ key: r.source || "other", label: labelOf(r.source || "other") }));

/** Дата заезда брони — у групповой самая ранняя по активным номерам. */
export function reservationCheckIn(r: HotelReservation): string | null {
  if (r.checkIn) return r.checkIn;
  const dates = r.items.filter((i) => i.isActive !== false).map((i) => i.checkIn).sort();
  return dates[0] ?? null;
}

export function reservationCheckOut(r: HotelReservation): string | null {
  if (r.checkOut) return r.checkOut;
  const dates = r.items.filter((i) => i.isActive !== false).map((i) => i.checkOut).sort();
  return dates[dates.length - 1] ?? null;
}

export type BalanceFilter = "all" | "debt" | "overpaid" | "settled";
export type BalanceStatusFilter = "active" | "all" | "cancelled";

export interface BalanceRow {
  id: number;
  number: number;
  externalId: string;
  createdAt: string;
  source: string;
  customer: string;
  checkIn: string | null;
  checkOut: string | null;
  nights: number;
  status: HotelReservation["status"];
  rooms: string;
  adr: number;
  total: number;
  paid: number;
  balance: number;
  currency: string;
  reservation: HotelReservation;
}

export function balanceRows(
  reservations: HotelReservation[],
  opts: { from: string; to: string; balance: BalanceFilter; status: BalanceStatusFilter; source?: string },
): BalanceRow[] {
  return reservations
    .filter((r) => {
      if (opts.status === "active" && r.status !== "confirmed") return false;
      if (opts.status === "cancelled" && r.status !== "cancelled" && r.status !== "no_show") return false;
      if (opts.source && r.source !== opts.source) return false;
      const checkIn = reservationCheckIn(r);
      return checkIn != null && checkIn >= opts.from && checkIn <= opts.to;
    })
    .map((r) => {
      const active = r.items.filter((i) => i.isActive !== false);
      const nights = active.reduce((s, i) => s + (i.nightsCount ?? i.nights?.length ?? 0), 0);
      const total = num(r.totalAmount);
      return {
        id: r.id,
        number: r.number,
        externalId: r.externalId,
        createdAt: r.createdAt,
        source: r.source,
        customer: r.customerName || active[0]?.guests[0]?.fullName || "",
        checkIn: reservationCheckIn(r),
        checkOut: reservationCheckOut(r),
        nights,
        status: r.status,
        rooms: active.map((i) => i.roomNumber ?? "—").join(", "),
        adr: nights ? Math.round((total / nights) * 100) / 100 : 0,
        total,
        paid: num(r.paidAmount),
        balance: num(r.balanceDue),
        currency: r.currency,
        reservation: r,
      };
    })
    .filter((row) =>
      opts.balance === "debt" ? row.balance > 0 : opts.balance === "overpaid" ? row.balance < 0 : opts.balance === "settled" ? row.balance === 0 : true,
    )
    .sort((a, b) => (a.checkIn ?? "").localeCompare(b.checkIn ?? "") || a.number - b.number);
}

export function balanceTotals(rows: BalanceRow[]) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const nights = rows.reduce((s, r) => s + r.nights, 0);
  return {
    total,
    paid: rows.reduce((s, r) => s + r.paid, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
    nights,
    adr: nights ? Math.round((total / nights) * 100) / 100 : 0,
  };
}

// ── Смена администратора: оплаты и расходы ──────────────────────────────────

/**
 * Окно смены: календарные сутки (startHour = 0) или сутки с часа пересменки
 * (9 → с 09:00 этой даты до 09:00 следующей) — суточные смены ресепшена.
 */
export function shiftWindow(date: string, startHour: number): { start: dayjs.Dayjs; end: dayjs.Dayjs } {
  const start = dayjs(date).startOf("day").add(startHour, "hour");
  return { start, end: start.add(1, "day") };
}

export function inWindow(iso: string, window: { start: dayjs.Dayjs; end: dayjs.Dayjs }): boolean {
  const t = dayjs(iso);
  return !t.isBefore(window.start) && t.isBefore(window.end);
}

/** Подпись способа для сводки: терминал безнала («ККБ», «МКасса») важнее общего «Карта». */
export const paymentChannelLabel = (p: HotelPayment): string => p.cashlessMethodName || p.methodLabel || p.method;

export const signedAmount = (p: HotelPayment): number => (p.kind === "refund" ? -num(p.amount) : num(p.amount));

export interface PaymentSummary {
  cash: number;
  cashless: number;
  total: number;
  refunds: number;
  byChannel: { label: string; amount: number; count: number }[];
  byCurrency: { currency: string; cash: number; cashless: number }[];
}

export function summarizePayments(payments: HotelPayment[]): PaymentSummary {
  let cash = 0;
  let cashless = 0;
  let refunds = 0;
  const channels = new Map<string, { label: string; amount: number; count: number }>();
  const currencies = new Map<string, { currency: string; cash: number; cashless: number }>();
  for (const p of payments) {
    const amount = signedAmount(p);
    if (p.kind === "refund") refunds += num(p.amount);
    const cur = currencies.get(p.currency) ?? { currency: p.currency, cash: 0, cashless: 0 };
    if (p.method === "cash") {
      cash += amount;
      cur.cash += amount;
    } else {
      cashless += amount;
      cur.cashless += amount;
      const label = paymentChannelLabel(p);
      const c = channels.get(label) ?? { label, amount: 0, count: 0 };
      c.amount += amount;
      c.count += 1;
      channels.set(label, c);
    }
    currencies.set(p.currency, cur);
  }
  return {
    cash,
    cashless,
    total: cash + cashless,
    refunds,
    byChannel: [...channels.values()].sort((a, b) => b.amount - a.amount),
    byCurrency: [...currencies.values()],
  };
}

export interface ExpenseSummary {
  cash: number;
  card: number;
  total: number;
  byCategory: { label: string; amount: number }[];
}

export function summarizeExpenses(expenses: Expense[]): ExpenseSummary {
  let cash = 0;
  let card = 0;
  const cats = new Map<string, number>();
  for (const e of expenses) {
    if (e.isVoided) continue;
    cash += num(e.cashAmount);
    card += num(e.cardAmount);
    const label = e.categoryName || "Без категории";
    cats.set(label, (cats.get(label) ?? 0) + num(e.amount));
  }
  return {
    cash,
    card,
    total: cash + card,
    byCategory: [...cats].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount),
  };
}

const BREAKFAST_BOARDS = new Set(["breakfast", "half_board", "full_board", "all_inclusive"]);

/**
 * Завтраков утром даты: гости, ночевавшие в ночь на эту дату (заезд раньше,
 * выезд не раньше), с питанием, где есть завтрак.
 */
export function breakfastCount(reservations: HotelReservation[], date: string): number {
  let count = 0;
  for (const r of reservations) {
    if (!isRevenueReservation(r)) continue;
    for (const item of r.items) {
      if (item.isActive === false || !BREAKFAST_BOARDS.has(item.boardType)) continue;
      if (item.checkIn < date && item.checkOut >= date) count += item.adults + item.children;
    }
  }
  return count;
}

/** Процент изменения к прошлому периоду; null — сравнивать не с чем. */
export function deltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
