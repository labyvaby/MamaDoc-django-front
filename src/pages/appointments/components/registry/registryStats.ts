/**
 * registryStats — агрегации журнала реестров («Все приёмы» / «Все процедуры»).
 *
 * Считаем на фронте из уже загруженного среза: `useAppointmentsList` и так
 * тянет весь период целиком, поэтому сводка, пульс месяца и разрезы не требуют
 * ни одного дополнительного запроса.
 *
 * Деньги берём теми же функциями, что и группы исполнителей в регистратуре
 * (listFilters): сумма строк × множитель скидки чека, оплаченная доля —
 * пропорционально. Это важно для «Всех процедур»: там в срез входят только
 * строки медсестёр, и считать по чеку целиком нельзя — совместный приём
 * врач+медсестра принёс бы медсестре сумму врача.
 */
import dayjs from "dayjs";

import type {
  AppointmentServiceLine,
  DjangoAppointment,
} from "../../../../api/appointments";
import type { PaymentStatus } from "../../../../api/payments";
import { isCancelledStatus } from "../slotAvailability";
import { discountFactor, paidShare, serviceLineTotal } from "../listFilters";

/** Строки приёма, попадающие в срез (для процедур — только медсестринские). */
export type LinesOf = (appt: DjangoAppointment) => AppointmentServiceLine[];

export interface RegistryMoney {
  /** Начислено по строкам среза с учётом скидки чека. */
  accrued: number;
  /** Сколько из этого уже закрыто деньгами. */
  paid: number;
  /** Незакрытый остаток — только там, где деньги реально ждут (см. isDebtBearing). */
  debt: number;
}

const ZERO_MONEY: RegistryMoney = { accrued: 0, paid: 0, debt: 0 };

/**
 * Ждут ли по этому приёму денег.
 *
 * ⚠ Решение фронта, не контракт бэка: «долгом» считаем незакрытый остаток по
 * состоявшемуся визиту. Запланированный на завтра неоплаченный приём долгом не
 * считается — иначе плитка «Долг» показывала бы всю будущую запись месяца.
 * Отмена и неявка денег не ждут по определению.
 *
 * Состоявшийся определяем по времени, а не только по статусу: бэк приёмы не
 * закрывает (на проде почти всё остаётся в scheduled/confirmed), и проверка
 * «status === completed» оставляла плитку «Долг» нулевой при сотнях
 * неоплаченных прошедших визитов.
 */
export function isDebtBearing(appt: DjangoAppointment, now: dayjs.Dayjs = dayjs()): boolean {
  if (isCancelledStatus(appt.status)) return false;
  if (appt.paymentStatus === "partial") return true;
  if (appt.paymentStatus === "paid" || appt.paymentStatus === "discounted") return false;
  if (appt.paymentStatus === "refunded") return false;
  if (appt.status === "arrived" || appt.status === "in_progress" || appt.status === "completed") {
    return true;
  }
  const finishedAt = dayjs(appt.endsAt || appt.scheduledAt);
  return finishedAt.isValid() && finishedAt.isBefore(now);
}

/** Деньги по строкам среза одного приёма. */
export function moneyOf(appt: DjangoAppointment, lines: AppointmentServiceLine[]): RegistryMoney {
  if (isCancelledStatus(appt.status)) return ZERO_MONEY;

  const lineSum = lines.reduce((sum, line) => sum + serviceLineTotal(line), 0);
  if (lineSum <= 0) return ZERO_MONEY;

  const accrued = lineSum * discountFactor(appt);
  const paid = accrued * paidShare(appt);
  const rest = accrued - paid;

  return { accrued, paid, debt: isDebtBearing(appt) && rest > 0 ? rest : 0 };
}

function addMoney(target: RegistryMoney, add: RegistryMoney): void {
  target.accrued += add.accrued;
  target.paid += add.paid;
  target.debt += add.debt;
}

// ── Сводка периода ───────────────────────────────────────────────────────────

export interface RegistrySummary extends RegistryMoney {
  /** Записей в срезе. */
  visits: number;
  /** Счетов с незакрытым остатком. */
  debtors: number;
  /** Средний чек по приёмам, где деньги действительно приняли. */
  averageCheck: number;
  /** Записей со скидкой. */
  discounted: number;
  /** Оплаченных полностью (paid + discounted). */
  closed: number;
}

export function summarize(items: DjangoAppointment[], linesOf: LinesOf): RegistrySummary {
  const total: RegistrySummary = {
    accrued: 0,
    paid: 0,
    debt: 0,
    visits: items.length,
    debtors: 0,
    averageCheck: 0,
    discounted: 0,
    closed: 0,
  };

  let paidVisits = 0;
  for (const appt of items) {
    const money = moneyOf(appt, linesOf(appt));
    addMoney(total, money);
    if (money.debt > 0) total.debtors += 1;
    if (money.paid > 0) paidVisits += 1;
    if (appt.paymentStatus === "discounted") total.discounted += 1;
    if (appt.paymentStatus === "paid" || appt.paymentStatus === "discounted") total.closed += 1;
  }

  total.averageCheck = paidVisits > 0 ? total.paid / paidVisits : 0;
  return total;
}

// ── Пульс месяца ─────────────────────────────────────────────────────────────

export interface PulseBucket {
  /** Ключ фильтра: YYYY-MM-DD для дня, YYYY-MM для месяца. */
  key: string;
  /** Подпись под столбиком: «12» или «авг». */
  label: string;
  /** Полная подпись для тултипа: «12 августа» / «Август 2026». */
  fullLabel: string;
  visits: number;
  paid: number;
  debt: number;
  /** Выходной — подпись приглушается. */
  muted: boolean;
}

const emptyBucket = (key: string, label: string, fullLabel: string, muted = false): PulseBucket => ({
  key,
  label,
  fullLabel,
  visits: 0,
  paid: 0,
  debt: 0,
  muted,
});

function fill(buckets: Map<string, PulseBucket>, items: DjangoAppointment[], linesOf: LinesOf, keyOf: (at: dayjs.Dayjs) => string): void {
  for (const appt of items) {
    const at = dayjs(appt.scheduledAt);
    if (!at.isValid()) continue;
    const bucket = buckets.get(keyOf(at));
    if (!bucket) continue;
    const money = moneyOf(appt, linesOf(appt));
    bucket.visits += 1;
    bucket.paid += money.paid;
    bucket.debt += money.debt;
  }
}

/** Столбики по дням выбранного месяца — включая дни без записей. */
export function pulseByDay(
  items: DjangoAppointment[],
  linesOf: LinesOf,
  monthStart: dayjs.Dayjs,
): PulseBucket[] {
  const buckets = new Map<string, PulseBucket>();
  for (let d = 1; d <= monthStart.daysInMonth(); d += 1) {
    const date = monthStart.date(d);
    const key = date.format("YYYY-MM-DD");
    buckets.set(key, emptyBucket(key, String(d), date.format("D MMMM"), date.day() === 0));
  }
  fill(buckets, items, linesOf, (at) => at.format("YYYY-MM-DD"));
  return Array.from(buckets.values());
}

/** Столбики по месяцам года — режим «весь год». */
export function pulseByMonth(
  items: DjangoAppointment[],
  linesOf: LinesOf,
  year: number,
): PulseBucket[] {
  const buckets = new Map<string, PulseBucket>();
  for (let m = 0; m < 12; m += 1) {
    const date = dayjs().year(year).month(m).date(1);
    const key = date.format("YYYY-MM");
    buckets.set(key, emptyBucket(key, date.format("MMM"), date.format("MMMM YYYY")));
  }
  fill(buckets, items, linesOf, (at) => at.format("YYYY-MM"));
  return Array.from(buckets.values());
}

// ── Группировка ленты по дням ────────────────────────────────────────────────

export interface DayGroup {
  iso: string;
  items: DjangoAppointment[];
  money: RegistryMoney;
}

/** Записи по дням, новые сверху; внутри дня — по времени приёма. */
export function groupByDay(items: DjangoAppointment[], linesOf: LinesOf): DayGroup[] {
  const map = new Map<string, DjangoAppointment[]>();
  for (const appt of items) {
    const iso = dayjs(appt.scheduledAt).format("YYYY-MM-DD");
    const bucket = map.get(iso);
    if (bucket) bucket.push(appt);
    else map.set(iso, [appt]);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([iso, dayItems]) => {
      const sorted = [...dayItems].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      const money: RegistryMoney = { accrued: 0, paid: 0, debt: 0 };
      for (const appt of sorted) addMoney(money, moneyOf(appt, linesOf(appt)));
      return { iso, items: sorted, money };
    });
}

// ── Профиль процедур: пациенты и курсы ───────────────────────────────────────

/** Сколько единиц расходников списано по строкам среза. */
export function consumedUnits(items: DjangoAppointment[], linesOf: LinesOf): number {
  let total = 0;
  for (const appt of items) {
    for (const line of linesOf(appt)) {
      for (const item of line.consumptions ?? []) {
        total += parseFloat(String(item.quantity)) || 0;
      }
    }
  }
  return total;
}

/** Уникальных пациентов в срезе. */
export function uniquePatients(items: DjangoAppointment[]): number {
  const ids = new Set<number>();
  let anonymous = 0;
  for (const appt of items) {
    if (appt.patient?.id != null) ids.add(appt.patient.id);
    else anonymous += 1;
  }
  return ids.size + anonymous;
}

/** Серия одинаковых процедур у одного пациента: «Капельница ×5, 12–16 августа». */
export interface PatientCourse {
  key: string;
  serviceName: string;
  /** Сколько раз процедуру делали (с учётом количества в строке). */
  count: number;
  firstIso: string;
  lastIso: string;
  money: RegistryMoney;
  items: DjangoAppointment[];
}

export interface PatientGroup {
  key: string;
  patientId: number | null;
  patientName: string;
  visits: number;
  firstIso: string;
  lastIso: string;
  money: RegistryMoney;
  courses: PatientCourse[];
}

/**
 * Записи, сгруппированные по пациенту и внутри — по услуге.
 *
 * Процедуры почти всегда идут курсом: пять капельниц подряд в ленте по дням
 * рассыпаны на пять строк в разных днях, и «сколько прокапали этому пациенту»
 * приходится считать глазами. Здесь курс — одна строка с диапазоном дат.
 */
export function groupByPatient(items: DjangoAppointment[], linesOf: LinesOf): PatientGroup[] {
  const groups = new Map<string, PatientGroup>();

  for (const appt of items) {
    const patientId = appt.patient?.id ?? null;
    const key = patientId != null ? `p${patientId}` : `a${appt.id}`;
    const iso = dayjs(appt.scheduledAt).format("YYYY-MM-DD");
    const lines = linesOf(appt);

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        patientId,
        patientName: appt.patient?.fullName ?? "",
        visits: 0,
        firstIso: iso,
        lastIso: iso,
        money: { accrued: 0, paid: 0, debt: 0 },
        courses: [],
      };
      groups.set(key, group);
    }

    group.visits += 1;
    if (iso < group.firstIso) group.firstIso = iso;
    if (iso > group.lastIso) group.lastIso = iso;
    addMoney(group.money, moneyOf(appt, lines));

    for (const line of lines) {
      const serviceKey = String(line.service?.id ?? line.service?.name ?? "—");
      let course = group.courses.find((c) => c.key === serviceKey);
      if (!course) {
        course = {
          key: serviceKey,
          serviceName: line.service?.name ?? "—",
          count: 0,
          firstIso: iso,
          lastIso: iso,
          money: { accrued: 0, paid: 0, debt: 0 },
          items: [],
        };
        group.courses.push(course);
      }
      course.count += line.quantity || 1;
      if (iso < course.firstIso) course.firstIso = iso;
      if (iso > course.lastIso) course.lastIso = iso;
      addMoney(course.money, moneyOf(appt, [line]));
      if (!course.items.some((item) => item.id === appt.id)) course.items.push(appt);
    }
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.courses.sort((a, b) => b.count - a.count || b.lastIso.localeCompare(a.lastIso));
    for (const course of group.courses) {
      course.items.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
    }
  }
  // Свежие сверху: журнал читают от последнего дня назад.
  return result.sort((a, b) => b.lastIso.localeCompare(a.lastIso));
}

// ── Разрезы ──────────────────────────────────────────────────────────────────

export interface EmployeeSlice extends RegistryMoney {
  id: number;
  name: string;
  visits: number;
}

export interface ServiceSlice {
  name: string;
  count: number;
  sum: number;
}

export interface ConsumptionSlice {
  name: string;
  unit: string;
  quantity: number;
}

export interface RegistrySlices {
  employees: EmployeeSlice[];
  services: ServiceSlice[];
  /** Матрица «день недели × час»: [1..6][8..20] — плотность записей. */
  heat: { dow: number; hour: number; count: number }[];
  heatMax: number;
  payments: { status: PaymentStatus | "unknown"; count: number }[];
  consumptions: ConsumptionSlice[];
}

/** Разрезы среза: исполнители, услуги, часы пик, оплата, списанные материалы. */
export function sliceRegistry(items: DjangoAppointment[], linesOf: LinesOf): RegistrySlices {
  const employees = new Map<number, EmployeeSlice>();
  const services = new Map<string, ServiceSlice>();
  const heat = new Map<string, number>();
  const payments = new Map<PaymentStatus | "unknown", number>();
  const consumptions = new Map<string, ConsumptionSlice>();

  for (const appt of items) {
    const lines = linesOf(appt);
    const factor = isCancelledStatus(appt.status) ? 0 : discountFactor(appt);
    const share = paidShare(appt);

    for (const line of lines) {
      const lineSum = serviceLineTotal(line) * factor;

      const employee = line.employee;
      if (employee) {
        const slice = employees.get(employee.id) ?? {
          id: employee.id,
          name: employee.fullName,
          visits: 0,
          accrued: 0,
          paid: 0,
          debt: 0,
        };
        slice.visits += 1;
        slice.accrued += lineSum;
        slice.paid += lineSum * share;
        employees.set(employee.id, slice);
      }

      const serviceName = line.service?.name;
      if (serviceName) {
        const slice = services.get(serviceName) ?? { name: serviceName, count: 0, sum: 0 };
        slice.count += line.quantity || 1;
        slice.sum += lineSum;
        services.set(serviceName, slice);
      }

      for (const item of line.consumptions ?? []) {
        const quantity = parseFloat(String(item.quantity)) || 0;
        if (quantity <= 0) continue;
        const slice = consumptions.get(item.name) ?? {
          name: item.name,
          unit: item.unit,
          quantity: 0,
        };
        slice.quantity += quantity;
        consumptions.set(item.name, slice);
      }
    }

    const at = dayjs(appt.scheduledAt);
    if (at.isValid()) {
      const key = `${at.day()}-${at.hour()}`;
      heat.set(key, (heat.get(key) ?? 0) + 1);
    }

    const status = appt.paymentStatus ?? "unknown";
    payments.set(status, (payments.get(status) ?? 0) + 1);
  }

  const heatCells = Array.from(heat.entries()).map(([key, count]) => {
    const [dow, hour] = key.split("-").map(Number);
    return { dow, hour, count };
  });

  return {
    employees: Array.from(employees.values()).sort((a, b) => b.accrued - a.accrued),
    services: Array.from(services.values()).sort((a, b) => b.sum - a.sum),
    heat: heatCells,
    heatMax: heatCells.reduce((max, cell) => (cell.count > max ? cell.count : max), 0),
    payments: Array.from(payments.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    consumptions: Array.from(consumptions.values()).sort((a, b) => b.quantity - a.quantity),
  };
}
