import type { WorkShiftRow } from "../../../api/attendance";

/**
 * Значение фильтра филиала на странице СКУД.
 * "all" — без фильтрации, "none" — только смены без филиала, число — id филиала.
 */
export type ShiftBranchFilter = "all" | "none" | number;

/**
 * Фильтрация смен по филиалу выполняется на клиенте намеренно.
 *
 * `GET /api/attendance/shifts/` умеет параметр `branchId`, но он строгий:
 * `branchId=null` отвечает 400 «Ожидается число», а способа «филиал X + общие»
 * нет вовсе. Серверный фильтр молча спрятал бы смены с `branchId: null` —
 * а это не только записи до марта 2026, но и живые отметки clock-in, которым
 * бэкенд не проставил филиал (тикет backend_ticket_attendance_branch_scoping).
 *
 * Список не пагинирован — за период приходит весь массив, поэтому фильтровать
 * в памяти безопасно и ничего не теряется.
 */
export function filterShiftsByBranch(
  shifts: WorkShiftRow[],
  filter: ShiftBranchFilter,
): WorkShiftRow[] {
  if (filter === "all") return shifts;
  if (filter === "none") return shifts.filter((s) => s.branchId == null);
  return shifts.filter((s) => s.branchId === filter);
}

/** Смены без филиала — они не попадают ни в один филиальный расчёт ЗП. */
export function unassignedShifts(shifts: WorkShiftRow[]): WorkShiftRow[] {
  return shifts.filter((s) => s.branchId == null);
}

export interface BranchOption {
  id: number;
  name: string;
}

/**
 * Филиалы для селектора: членство пользователя плюс филиалы, встреченные в
 * самих сменах. Второе нужно, чтобы фильтр покрывал данные и тогда, когда
 * смена осталась от филиала, из которого пользователя уже исключили.
 */
export function buildBranchOptions(
  membershipBranches: BranchOption[],
  shifts: WorkShiftRow[],
): BranchOption[] {
  const byId = new Map<number, string>();
  membershipBranches.forEach((b) => byId.set(b.id, b.name));
  shifts.forEach((s) => {
    if (s.branchId != null && !byId.has(s.branchId)) {
      byId.set(s.branchId, s.branchName ?? `Филиал ${s.branchId}`);
    }
  });
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
