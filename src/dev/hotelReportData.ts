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
import { isGuestDebt, isMissedArrival, isNoShowCandidate, nightCounts } from "./hotelInHouse";

const PAGE = 200;
/** Потолок страниц на один отчёт: 10 × 200 = 2000 строк — дальше честно говорим «показаны не все». */
const MAX_PAGES = 10;

export interface Fetched<T> {
  rows: T[];
  /** Упёрлись в потолок страниц — в отчёте не все строки. */
  truncated: boolean;
}

/** Сколько страниц броней грузим одновременно. */
const PARALLEL_PAGES = 4;

/** Первая страница даёт count, остальные идут по PARALLEL_PAGES сразу; бронь на стыке страниц не дублируется. */
export async function fetchAllReservations(
  params: Omit<HotelReservationListParams, "limit" | "offset">,
  signal?: AbortSignal,
  maxPages = MAX_PAGES,
): Promise<Fetched<HotelReservation>> {
  const byId = new Map<number, HotelReservation>();
  const first = await listReservations({ ...params, limit: PAGE, offset: 0 }, signal);
  for (const r of first.results) byId.set(r.id, r);
  const pages = first.results.length < PAGE ? 1 : Math.min(maxPages, Math.ceil(first.count / PAGE));
  for (let start = 1; start < pages; start += PARALLEL_PAGES) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(PARALLEL_PAGES, pages - start) }, (_, i) =>
        listReservations({ ...params, limit: PAGE, offset: (start + i) * PAGE }, signal),
      ),
    );
    for (const res of batch) for (const r of res.results) byId.set(r.id, r);
  }
  return { rows: [...byId.values()], truncated: first.results.length >= PAGE && first.count > maxPages * PAGE };
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
  acceptedById?: number,
): Promise<FetchedRegister> {
  const rows: HotelPayment[] = [];
  let totals: HotelPaymentRegisterTotal[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await listPaymentRegister({ propertyId, from, to, acceptedById, limit: PAGE, offset: page * PAGE }, signal);
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
const todayStr = () => dayjs().format("YYYY-MM-DD");
/** Ночь считается: по факту (nightCounts), а при today = null — по датам брони, как считал старый сервер. */
const slept = (item: HotelReservation["items"][number], date: string, today: string | null) => today == null || nightCounts(item, date, today);
/** Цена ночи после скидки сотрудника — как в карточках с сервера (price − discount). */
const net = (night: { price: string | number; discount?: string | number | null }): number => num(night.price) - num(night.discount);

export interface DailyPoint {
  date: string;
  soldRooms: number;
  revenue: number;
}

/**
 * По каждой дате периода (обе границы включительно): проданные номера и сумма
 * цен ночей. Только ночи, которые кто-то прожил или ещё проживёт (nightCounts):
 * не заехавший гость — не выручка, как на сервере и на ресепшене.
 */
export function dailySeries(reservations: HotelReservation[], from: string, to: string, today: string | null = todayStr()): DailyPoint[] {
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
        if (!p || !slept(item, night.date, today)) continue;
        p.soldRooms += 1;
        p.revenue += net(night);
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
  today: string | null,
): RevenueSlice[] {
  const map = new Map<string, RevenueSlice & { ids: Set<number> }>();
  for (const r of reservations) {
    if (!isRevenueReservation(r)) continue;
    for (const item of r.items) {
      if (item.isActive === false) continue;
      const { key, label } = keyOf(r, item);
      for (const night of item.nights ?? []) {
        if (night.date < from || night.date > to || !slept(item, night.date, today)) continue;
        const s = map.get(key) ?? { key, label, nights: 0, revenue: 0, adr: 0, reservations: 0, ids: new Set<number>() };
        s.nights += 1;
        s.revenue += net(night);
        s.ids.add(r.id);
        map.set(key, s);
      }
    }
  }
  return [...map.values()]
    .map(({ ids, ...s }) => ({ ...s, reservations: ids.size, adr: s.nights ? Math.round(s.revenue / s.nights) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export const revenueByCategory = (reservations: HotelReservation[], from: string, to: string, today: string | null = todayStr()) =>
  slices(reservations, from, to, (_r, item) => ({ key: String(item.roomTypeId), label: item.roomTypeName }), today);

export const revenueBySource = (reservations: HotelReservation[], from: string, to: string, labelOf: (source: string) => string, today: string | null = todayStr()) =>
  slices(reservations, from, to, (r) => ({ key: r.source || "other", label: labelOf(r.source || "other") }), today);

export interface NotArrivedSummary {
  reservations: number;
  nights: number;
  revenue: number;
}

/**
 * Не заехали, и незаезд не закрыт: брони, их ночи в периоде и что эти ночи
 * стоили. Не выручка, не загрузка и не долг — пока ресепшен не заселит гостя
 * или не закроет день; в отчётах показывается отдельной строкой.
 */
export function notArrivedSummary(reservations: HotelReservation[], from: string, to: string, today = todayStr()): NotArrivedSummary {
  const ids = new Set<number>();
  let nights = 0;
  let revenue = 0;
  for (const r of reservations) {
    if (!isRevenueReservation(r)) continue;
    for (const item of r.items) {
      if (!isMissedArrival(item, today)) continue;
      for (const night of item.nights ?? []) {
        if (night.date < from || night.date > to) continue;
        ids.add(r.id);
        nights += 1;
        revenue += net(night);
      }
    }
  }
  return { reservations: ids.size, nights, revenue };
}

/**
 * Закрытые незаезды (ночной аудит или ресепшен) с заездом в периоде: брони, их ночи в
 * периоде и что те стоили. Пока сервер не отдаёт reports/occupancy → noShows, считаем
 * так же по броням периода: после закрытия незаезды пропадали из отчётов совсем.
 */
export function noShowSummary(reservations: HotelReservation[], from: string, to: string): NotArrivedSummary {
  const ids = new Set<number>();
  let nights = 0;
  let revenue = 0;
  for (const r of reservations) {
    if (r.status !== "no_show") continue;
    const checkIn = reservationCheckIn(r);
    if (checkIn == null || checkIn < from || checkIn > to) continue;
    ids.add(r.id);
    for (const item of r.items) {
      if (item.isActive === false) continue;
      for (const night of item.nights ?? []) {
        if (night.date < from || night.date > to) continue;
        nights += 1;
        revenue += net(night);
      }
    }
  }
  return { reservations: ids.size, nights, revenue };
}

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
/**
 * Какие брони берёт отчёт: «checkIn» — с заездом в периоде (обычные «Заезды»);
 * «stay» — проживание пересекает период. Во второй режим ведут «Долги гостей»
 * из «Собственнику»: там должники — гости, жившие в периоде, в том числе
 * заехавшие раньше него, и по дате заезда список с суммой не сходился.
 */
export type BalanceSelect = "checkIn" | "stay";

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
  /**
   * Цена ночи — как ADR «Собственнику»: цены ночей минус скидки, делённые на
   * ночи, которые гость прожил или ещё проживёт (nightCounts). Допуслуги и
   * ночи незаезда / после выезда сюда не входят; 0 — таких ночей нет.
   */
  adr: number;
  /** Ночи для ADR и их сумма (без допуслуг) — итог считается по ним, а не по сумме брони. */
  adrNights: number;
  adrAmount: number;
  total: number;
  paid: number;
  balance: number;
  currency: string;
  /** Для отчёта «Заезды»: юрлицо, телефон, гости, тариф, питание, гарантия, кто оформил, факт заезда/выезда. */
  corporateName: string;
  phone: string;
  guests: number;
  ratePlan: string;
  board: string;
  guarantee: string;
  createdByName: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** Время заезда брони ("14:30": ранний заезд, со слов гостя); null — как в правилах. */
  expectedArrivalTime: string | null;
  /** Время выезда брони ("15:30", поздний выезд); null — как в правилах. */
  expectedDepartureTime: string | null;
  /** Не заехал: ждали, день заезда прошёл, незаезд не закрыт — в «К оплате» не идёт. */
  missed: boolean;
  /**
   * Долг гостя — как «Долги гостей» в «Собственнику» (isGuestDebt): остаток к оплате у
   * того, кто заселён или уже выехал. Не заехавший и тот, кто ещё приедет, — не должник.
   */
  debt: boolean;
  reservation: HotelReservation;
}

export function balanceRows(
  reservations: HotelReservation[],
  opts: { from: string; to: string; balance: BalanceFilter; status: BalanceStatusFilter; source?: string; corporate?: string; today?: string; select?: BalanceSelect },
): BalanceRow[] {
  const today = opts.today ?? todayStr();
  return reservations
    .filter((r) => {
      if (opts.status === "active" && r.status !== "confirmed") return false;
      if (opts.status === "cancelled" && r.status !== "cancelled" && r.status !== "no_show") return false;
      if (opts.source && r.source !== opts.source) return false;
      if (opts.corporate && (r.corporateName ?? "") !== opts.corporate) return false;
      const checkIn = reservationCheckIn(r);
      if (checkIn == null) return false;
      if (opts.select === "stay") {
        const checkOut = reservationCheckOut(r);
        return checkIn <= opts.to && (checkOut == null || checkOut > opts.from);
      }
      return checkIn >= opts.from && checkIn <= opts.to;
    })
    .map((r) => {
      const active = r.items.filter((i) => i.isActive !== false);
      const nights = active.reduce((s, i) => s + (i.nightsCount ?? i.nights?.length ?? 0), 0);
      const total = num(r.totalAmount);
      let adrNights = 0;
      let adrAmount = 0;
      for (const item of active) {
        for (const night of item.nights ?? []) {
          if (!nightCounts(item, night.date, today)) continue;
          adrNights += 1;
          adrAmount += net(night);
        }
      }
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
        adr: adrNights ? Math.round((adrAmount / adrNights) * 100) / 100 : 0,
        adrNights,
        adrAmount,
        total,
        paid: num(r.paidAmount),
        balance: num(r.balanceDue),
        currency: r.currency,
        corporateName: r.corporateName ?? "",
        phone: (active.flatMap((i) => i.guests).find((g) => g.isPrimary) ?? active[0]?.guests[0])?.phone ?? "",
        guests: active.reduce((s, i) => s + i.adults + i.children, 0),
        ratePlan: [...new Set(active.map((i) => i.ratePlanName).filter(Boolean))].join(", "),
        board: [...new Set(active.map((i) => i.boardType).filter((b) => b && b !== "none"))].join(", "),
        guarantee: r.guaranteeMethod,
        createdByName: r.createdByName,
        checkedInAt: active.map((i) => i.checkedInAt).filter((v): v is string => v != null).sort()[0] ?? null,
        checkedOutAt: active.map((i) => i.checkedOutAt).filter((v): v is string => v != null).sort().pop() ?? null,
        expectedArrivalTime: r.expectedArrivalTime ? r.expectedArrivalTime.slice(0, 5) : null,
        expectedDepartureTime: r.expectedDepartureTime ? r.expectedDepartureTime.slice(0, 5) : null,
        missed: isNoShowCandidate(r, today),
        debt: isGuestDebt(r),
        reservation: r,
      };
    })
    .filter((row) =>
      opts.balance === "debt" ? row.debt : opts.balance === "overpaid" ? row.balance < 0 : opts.balance === "settled" ? row.balance === 0 : true,
    )
    .sort((a, b) => (a.checkIn ?? "").localeCompare(b.checkIn ?? "") || a.number - b.number);
}

export function balanceTotals(rows: BalanceRow[]) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const nights = rows.reduce((s, r) => s + r.nights, 0);
  const adrNights = rows.reduce((s, r) => s + r.adrNights, 0);
  const adrAmount = rows.reduce((s, r) => s + r.adrAmount, 0);
  return {
    total,
    paid: rows.reduce((s, r) => s + r.paid, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
    nights,
    adrNights,
    adr: adrNights ? Math.round((adrAmount / adrNights) * 100) / 100 : 0,
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

/**
 * Расход смены — как оплата по acceptedAt: проведён внутри окна смены (и не задним числом
 * за прошлый день), либо внесён позже, задним числом, датой этой смены. Раньше расходы
 * брались за календарную дату, а оплаты — за окно «09:00–09:00», и «В кассе» вычитало
 * из ночных оплат дневные расходы чужой смены.
 */
export function isShiftExpense(
  e: { expenseDate: string; createdAt: string },
  date: string,
  window: { start: dayjs.Dayjs; end: dayjs.Dayjs },
): boolean {
  if (inWindow(e.createdAt, window)) return e.expenseDate >= date;
  return e.expenseDate === date && !dayjs(e.createdAt).isBefore(window.end);
}

/** Подпись способа для сводки: терминал безнала («ККБ», «МКасса») важнее общего «Карта». */
export const paymentChannelLabel = (p: HotelPayment): string => p.cashlessMethodName || p.methodLabel || p.method;

/**
 * Сумма оплаты в валюте брони. У оплаты в валюте (50 USD) amount — то, что
 * дал гость, а в сомах — amountBase; складывать amount значило бы считать
 * 50 долларов как 50 сом.
 */
export const baseAmount = (p: HotelPayment): number => num(p.amountBase ?? p.amount);

export const signedAmount = (p: HotelPayment): number => (p.kind === "refund" ? -baseAmount(p) : baseAmount(p));

/** Оплата сделана в другой валюте, чем валюта брони (настоящая, с сервера). */
const isForeignPayment = (p: HotelPayment) => Boolean(p.baseCurrency && p.currency && p.currency !== p.baseCurrency);

/** «50 USD по 87,5» — что дал гость, если платил в валюте; иначе null. */
export const foreignPaymentLabel = (p: HotelPayment): string | null =>
  isForeignPayment(p) ? `${num(p.amount).toLocaleString("ru-RU")} ${p.currency}${p.exchangeRate ? ` по ${num(p.exchangeRate).toLocaleString("ru-RU")}` : ""}` : null;

export interface PaymentSummary {
  cash: number;
  cashless: number;
  total: number;
  refunds: number;
  byChannel: { label: string; amount: number; count: number }[];
  byCurrency: { currency: string; cash: number; cashless: number }[];
  /** Наличные, принятые в валюте: сколько долларов/евро лежит в кассе (с сервера — currency, из демо — метка «[USD 50 × 87.45]»). */
  foreignCash: { currency: string; amount: number }[];
}

const FOREIGN_TAG = /^\[([A-Z]{3}) ([\d.]+) × ([\d.]+)\]/;

export function summarizePayments(payments: HotelPayment[]): PaymentSummary {
  let cash = 0;
  let cashless = 0;
  let refunds = 0;
  const channels = new Map<string, { label: string; amount: number; count: number }>();
  const currencies = new Map<string, { currency: string; cash: number; cashless: number }>();
  const foreign = new Map<string, number>();
  for (const p of payments) {
    const amount = signedAmount(p);
    const sign = p.kind === "refund" ? -1 : 1;
    if (p.method === "cash" && isForeignPayment(p)) foreign.set(p.currency, (foreign.get(p.currency) ?? 0) + sign * num(p.amount));
    else {
      const tag = p.method === "cash" ? FOREIGN_TAG.exec(p.note ?? "") : null;
      if (tag) foreign.set(tag[1], (foreign.get(tag[1]) ?? 0) + sign * Number(tag[2]));
    }
    if (p.kind === "refund") refunds += baseAmount(p);
    // Суммы уже в валюте брони — и группируем по ней, а не по валюте, которой платил гость.
    const curCode = p.baseCurrency || p.currency;
    const cur = currencies.get(curCode) ?? { currency: curCode, cash: 0, cashless: 0 };
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
    currencies.set(curCode, cur);
  }
  return {
    cash,
    cashless,
    total: cash + cashless,
    refunds,
    byChannel: [...channels.values()].sort((a, b) => b.amount - a.amount),
    byCurrency: [...currencies.values()],
    foreignCash: [...foreign].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })).filter((f) => f.amount !== 0),
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
 * Завтраков утром даты: гости, ночевавшие в ночь на эту дату (nightCounts —
 * не заехавшие и уже выехавшие не едят), с питанием, где есть завтрак.
 */
export function breakfastCount(reservations: HotelReservation[], date: string, today = todayStr()): number {
  const night = dayjs(date).subtract(1, "day").format("YYYY-MM-DD");
  let count = 0;
  for (const r of reservations) {
    if (!isRevenueReservation(r)) continue;
    for (const item of r.items) {
      if (!BREAKFAST_BOARDS.has(item.boardType)) continue;
      if (nightCounts(item, night, today)) count += item.adults + item.children;
    }
  }
  return count;
}

/** Процент изменения к прошлому периоду; null — сравнивать не с чем. */
export function deltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
