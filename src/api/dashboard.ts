import { apiRequest } from "./client";

/**
 * Агрегат главного экрана: `GET /api/dashboard/summary/`.
 *
 * Один запрос вместо ≈26 (касса за период и базу, месяц, записи по дням, брони,
 * задачи, воронка, отзывы, зарплата, загрузка, срез по филиалам). Контракт —
 * ответ бэка от 24.09.2026 на тикет `MamaDoc/backend_ticket_dashboard_v2_2026-09-23.md`:
 * в OpenAPI `sections` описан свободным объектом, поэтому поля здесь — по тексту
 * ответа и сверены с живым ответом тестового стенда.
 *
 * Правила, на которые опирается экран:
 * - раздел без права в ответ не попадает вовсе (ключа нет, а не null) — что
 *   пришло, то и рисуем, отдельно гейтить каждый запрос не нужно;
 * - все суммы — строки с двумя знаками, даты — YYYY-MM-DD;
 * - `baseline` — тот же раздел за период сравнения, только скаляры; у разделов
 *   «на сейчас» (month, tasks, deals, load) он всегда `null`;
 * - база сравнения по умолчанию — те же правила, что показывает фронт
 *   (`previousRange` в pages/dashboard/period.ts); применённые даты приходят
 *   в `compareFrom`/`compareTo`.
 *
 * ⚠ Фронт рассчитан на исправленный v2 (ответ бэка на замечания 24.09.2026:
 * доли топов от всей выручки, refunded вне paid, branches[] без фильтра по
 * branchId) и выкладывается на прод только после бэка. Первую версию агрегата
 * (86d4563b) узнаёт `isDashboardSummaryV2` — тогда сводка показывает ошибку,
 * а не цифры другой формы.
 */

export type DashboardSectionName =
  | "money"
  | "month"
  | "appointments"
  | "bookings"
  | "tasks"
  | "deals"
  | "reviews"
  | "staff"
  | "branches"
  | "load";

export const DASHBOARD_ALL_SECTIONS: DashboardSectionName[] = [
  "money",
  "month",
  "appointments",
  "bookings",
  "tasks",
  "deals",
  "reviews",
  "staff",
  "branches",
  "load",
];

/**
 * Разделы «на сейчас» — их бэк советует опрашивать отдельно и часто: считаются
 * независимо, лишние разделы запрос не утяжеляют.
 */
export const DASHBOARD_LIVE_SECTIONS: DashboardSectionName[] = [
  "tasks",
  "deals",
  "load",
  "bookings",
];

export interface DashboardCashlessRow {
  cashlessMethodId: number | null;
  cashlessMethodName: string | null;
  income: string;
  refunds: string;
  expenses: string;
  supplyExpenses: string;
  salesIncome: string;
  count: number;
}

/** Скаляры кассы — то, что приходит и в текущих значениях, и в `baseline`. */
export interface DashboardMoneyScalars {
  /** Наличные + карта. */
  grossIncome: string;
  /** grossIncome − refundedTotal. Страховая и внутренний баланс не входят. */
  netIncome: string;
  cashIncome: string;
  cardIncome: string;
  cashRefunds: string;
  cardRefunds: string;
  refundedTotal: string;
  balancePayments: string;
  balanceRefunds: string;
  insuranceIncome: string;
  insuranceRefunds: string;
  /** Число платежей наличными и картой — не приёмов. */
  paymentCount: number;
  refundCount: number;
  salesTotal: string;
  saleCount: number;
  totalExpenses: string;
  expenseCount: number;
  supplyTotal: string;
  supplyCount: number;
  /** netIncome + salesTotal − totalExpenses − supplyTotal (формула бэка). */
  netCashFlow: string;
  /** Долг по приёмам периода по дате приёма, включая будущие. */
  debtTotal: string;
  debtAppointments: number;
  /** Прошедшие визиты периода, оплаченные не полностью (по журналу платежей, не по статусу). */
  unpaidPastCount: number;
  /** Сколько по ним осталось получить. */
  unpaidPastAmount: string;
}

export interface DashboardMoney extends DashboardMoneyScalars {
  byCashlessMethod: DashboardCashlessRow[];
  /** Остаток непогашенного долга на сейчас по всем прошедшим визитам — от периода не зависит. */
  debtOutstanding: string;
  baseline: DashboardMoneyScalars | null;
}

export interface DashboardMonthDay {
  date: string;
  netIncome: string;
  paymentCount: number;
}

/** Темп месяца. Месяц — по dateTo. */
export interface DashboardMonth {
  /** YYYY-MM. */
  month: string;
  dateFrom: string;
  dateTo: string;
  daysInMonth: number;
  daysElapsed: number;
  /** С 1-го числа по dateTo — так же, как netIncome кассы. */
  netIncome: string;
  previousMonth: { month: string; dateFrom: string; dateTo: string; netIncome: string } | null;
  /** Каждый день с 1-го по dateTo по возрастанию; сумма равна netIncome. */
  daily: DashboardMonthDay[];
  baseline: null;
}

export interface DashboardCanceledBy {
  patient: number;
  clinic: number;
  /** Отмены до появления поля инициатора. */
  unknown: number;
}

export interface DashboardAppointmentsScalars {
  /** Все записи периода любого статуса и вида (как /appointments/day-counts/). */
  total: number;
  /** Без отменённых и неявок. */
  visits: number;
  /** Оплачено полностью, со скидкой или хотя бы частично; полностью возвращённые не входят. */
  paid: number;
  /** Отменённые — без неявок. */
  canceled: number;
  noShow: number;
  canceledBy: DashboardCanceledBy;
  /** Визиты карт, у которых раньше уже был визит в организации. */
  repeatVisits: number;
  /** repeatVisits / visits × 100, строка "0.00"–"100.00". */
  repeatShare: string;
  debtAppointments: number;
}

export interface DashboardTopService {
  serviceId: number;
  serviceName: string;
  amount: string;
  /** Число визитов, в которых есть эта услуга (не строки и не quantity). */
  count: number;
  /** Доля в % от выручки ВСЕХ оплаченных строк услуг за период (не от топа). */
  share: string;
}

export interface DashboardAppointments extends DashboardAppointmentsScalars {
  /** По окну графика (chartFrom…chartTo). */
  daily: { date: string; count: number }[];
  /** Среднее число записей в тот же день недели за 4 прошлые недели, по дням daily. */
  weekdayBaseline: { date: string; average: string }[];
  topServices: DashboardTopService[];
  /** Знаменатель долей: выручка всех оплаченных строк услуг за период. */
  topServicesTotal: string;
  baseline: DashboardAppointmentsScalars | null;
}

export interface DashboardBookingsScalars {
  /** Ждут подтверждения — на сейчас, от периода не зависит. */
  pendingCount: number;
  /** Ждут подтверждения, а время уже прошло — на сейчас. */
  overdueCount: number;
  /** Брони на даты периода. */
  total: number;
  materialized: number;
  /** Приём оплачен; полностью возвращённые не входят. */
  paid: number;
  /** paid / total × 100, строка с двумя знаками. */
  conversionRate: string;
}

export interface DashboardBookings extends DashboardBookingsScalars {
  baseline: DashboardBookingsScalars | null;
}

export interface DashboardTasks {
  new: number;
  inProgress: number;
  awaitingApproval: number;
  overdue: number;
  newForMe: number;
  baseline: null;
}

export interface DashboardDeals {
  /** Филиал, по которому посчитано; null — вся организация. */
  branchId: number | null;
  totalCount: number;
  totalAmount: string;
  openCount: number;
  openAmount: string;
  wonCount: number;
  wonAmount: string;
  lostCount: number;
  todayActionsCount: number;
  overdueActionsCount: number;
  baseline: null;
}

export interface DashboardReviewsScalars {
  sent: number;
  answered: number;
  /** Строка с одним знаком, "4.6"; без отправленных запросов — "0.0". */
  averageRating: string;
  negative: number;
}

export interface DashboardReviews extends DashboardReviewsScalars {
  baseline: DashboardReviewsScalars | null;
}

export interface DashboardStaffRevenueRow {
  employeeId: number;
  employeeName: string;
  /** Выручка, которую принёс сотрудник: строки услуг полностью оплаченных визитов. */
  amount: string;
  /** Число визитов с участием сотрудника. */
  count: number;
  /** Доля в % от всей выручки периода. */
  share: string;
}

export interface DashboardPayrollRow {
  employeeId: number;
  fullName: string;
  appointmentsCount: number;
  paidCount: number;
  /** Начислено сотруднику — не выручка. */
  earnings: string;
}

export interface DashboardStaff {
  activeCount: number;
  newCount: number;
  /** Нужен finance.view — без него ключа нет. */
  topByRevenue?: DashboardStaffRevenueRow[];
  /** Знаменатель долей топа сотрудников; приходит вместе с topByRevenue. */
  topByRevenueTotal?: string;
  /** Нужны payroll.view и staff.related.payroll.view. Месяц — по dateTo. */
  payroll?: { year: number; month: number; status: string; rows: DashboardPayrollRow[] };
  baseline: { activeCount: number; newCount: number } | null;
}

export interface DashboardLoad {
  date: string;
  overallEmployeeCount: number;
  /** «Свободен» — есть хотя бы одно свободное окно сегодня. */
  overallFreeEmployeeCount: number;
  specializations: {
    specializationId: number;
    specializationName: string;
    employeeCount: number;
    freeEmployeeCount: number;
  }[];
  baseline: null;
}

export interface DashboardBranchMoneyScalars {
  grossIncome: string;
  netIncome: string;
  cashIncome: string;
  cardIncome: string;
  refundedTotal: string;
  paymentCount: number;
}

export interface DashboardBranchRow {
  branchId: number;
  organizationId: number;
  branchName: string;
  money: DashboardBranchMoneyScalars & {
    unpaidPastCount: number;
    unpaidPastAmount: string;
    debtOutstanding?: string;
    baseline: DashboardBranchMoneyScalars | null;
  };
}

export interface DashboardSections {
  money?: DashboardMoney;
  month?: DashboardMonth;
  appointments?: DashboardAppointments;
  bookings?: DashboardBookings;
  tasks?: DashboardTasks;
  deals?: DashboardDeals;
  reviews?: DashboardReviews;
  staff?: DashboardStaff;
  load?: DashboardLoad;
}

export interface DashboardSummary {
  dateFrom: string;
  dateTo: string;
  compareFrom: string;
  compareTo: string;
  organizationId: number;
  branchId: number | null;
  sections: DashboardSections;
  /** Только если в sections был `branches`. Все доступные филиалы, по алфавиту. */
  branches?: DashboardBranchRow[];
  /** Время расчёта, ISO (Бишкек). */
  generatedAt: string;
}

export interface DashboardSummaryParams {
  dateFrom: string;
  dateTo: string;
  compareFrom?: string;
  compareTo?: string;
  /** Окно графика записей; влияет только на appointments.daily и weekdayBaseline. */
  chartFrom?: string;
  chartTo?: string;
  branchId?: number | null;
  organizationId?: number | null;
  sections?: DashboardSectionName[];
}

export function getDashboardSummary(
  params: DashboardSummaryParams,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  const q = new URLSearchParams();
  q.set("dateFrom", params.dateFrom);
  q.set("dateTo", params.dateTo);
  // Пары — только вместе, иначе 400.
  if (params.compareFrom && params.compareTo) {
    q.set("compareFrom", params.compareFrom);
    q.set("compareTo", params.compareTo);
  }
  if (params.chartFrom && params.chartTo) {
    q.set("chartFrom", params.chartFrom);
    q.set("chartTo", params.chartTo);
  }
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  if (params.organizationId != null) q.set("organizationId", String(params.organizationId));
  if (params.sections?.length) q.set("sections", params.sections.join(","));
  return apiRequest<DashboardSummary>(`/dashboard/summary/?${q.toString()}`, { signal });
}

/**
 * Отличает v2 агрегата от первой версии (86d4563b, на проде 24.09.2026).
 *
 * Надёжный признак — `appointments.visits`: у v1 его нет. Записи видны почти
 * всем, кто видит сводку (сейчас она только у суперадмина). Без раздела
 * записей смотрим на разделы, которых в v1 не было вовсе, и на `baseline: null`
 * у задач (в v1 там была копия тех же чисел).
 */
export function isDashboardSummaryV2(summary: DashboardSummary | null | undefined): boolean {
  const s = summary?.sections;
  if (!s) return false;
  if (s.appointments) return "visits" in s.appointments;
  if (s.month || s.load || s.deals) return true;
  if (s.tasks) return s.tasks.baseline === null;
  // Разделов, по которым видна версия, нет — отличий в том, что пришло, тоже.
  return true;
}
