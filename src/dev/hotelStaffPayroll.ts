/**
 * Зарплата по графику — как в таблице Viva: смены по ролям (горничная,
 * кухня, ресепшен), начислено = сумма ставок отработанных смен, аванс —
 * из расходов финансов (категория «Аванс» на сотрудника), к выплате —
 * начислено минус аванс. Чистые функции — проверяются тестами.
 */
import type { Expense } from "../api/expenses";
import type { HotelStaffRole, HotelStaffShift } from "../api/hotel";

export const STAFF_ROLE_LABELS: Record<HotelStaffRole, string> = {
  housekeeping: "Горничная",
  reception: "Ресепшен",
  kitchen: "Кухня",
  maintenance: "Техник",
  other: "Другое",
};

/** Эмодзи — как в шапке их таблицы, узнаются с первого взгляда. */
export const STAFF_ROLE_EMOJI: Record<HotelStaffRole, string> = {
  housekeeping: "🧽",
  reception: "📋",
  kitchen: "👩‍🍳",
  maintenance: "🔧",
  other: "•",
};

export const STAFF_ROLE_ORDER: HotelStaffRole[] = ["housekeeping", "kitchen", "reception", "maintenance", "other"];

export interface PayrollRow {
  employeeId: number;
  name: string;
  byRole: Partial<Record<HotelStaffRole, number>>;
  shifts: number;
  earned: number;
  advance: number;
  toPay: number;
}

export interface PayrollResult {
  rows: PayrollRow[];
  totals: { shifts: number; earned: number; advance: number; toPay: number };
  roles: HotelStaffRole[];
}

/** Отработанные смены: отметка «не вышел» не считается, остальные — да. */
export const countsAsWorked = (s: HotelStaffShift) => s.status !== "absent";

export function computePayroll(shifts: HotelStaffShift[], advances: Map<number, number>, names: Map<number, string>): PayrollResult {
  const rows = new Map<number, PayrollRow>();
  const roles = new Set<HotelStaffRole>();
  const row = (id: number): PayrollRow => {
    let r = rows.get(id);
    if (!r) {
      r = { employeeId: id, name: names.get(id) ?? "", byRole: {}, shifts: 0, earned: 0, advance: 0, toPay: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const s of shifts) {
    if (!countsAsWorked(s)) continue;
    const r = row(s.employeeId);
    if (!r.name) r.name = s.employeeName;
    r.byRole[s.role] = (r.byRole[s.role] ?? 0) + 1;
    roles.add(s.role);
    r.shifts += 1;
    r.earned += Number(s.rate) || 0;
  }
  for (const [id, amount] of advances) {
    if (!amount) continue;
    row(id).advance += amount;
  }
  const list = [...rows.values()]
    .map((r) => ({ ...r, name: r.name || names.get(r.employeeId) || `Сотрудник №${r.employeeId}`, toPay: r.earned - r.advance }))
    .sort((a, b) => b.shifts - a.shifts || a.name.localeCompare(b.name, "ru"));
  return {
    rows: list,
    totals: list.reduce((t, r) => ({ shifts: t.shifts + r.shifts, earned: t.earned + r.earned, advance: t.advance + r.advance, toPay: t.toPay + r.toPay }), {
      shifts: 0,
      earned: 0,
      advance: 0,
      toPay: 0,
    }),
    roles: STAFF_ROLE_ORDER.filter((r) => roles.has(r)),
  };
}

/** Авансы месяца: расходы категории «Аванс» на конкретного сотрудника. */
export function advancesFromExpenses(expenses: Expense[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const e of expenses) {
    if (e.isVoided || e.categoryKind !== "advance" || e.employeeId == null) continue;
    map.set(e.employeeId, (map.get(e.employeeId) ?? 0) + (Number(e.amount) || 0));
  }
  return map;
}

/** Цвет сотрудника в сетке — стабильный по id, из спокойной палитры. */
const EMPLOYEE_COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04", "#4f46e5", "#0d9488", "#b91c1c"];
export const employeeColor = (id: number) => EMPLOYEE_COLORS[Math.abs(id) % EMPLOYEE_COLORS.length];
