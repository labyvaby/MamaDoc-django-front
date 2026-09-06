/**
 * Чистые функции отбора и подсчёта для списка приёмов (Регистратура и реестры).
 *
 * Живут отдельно от панели, потому что это единственная часть фильтров, где
 * можно ошибиться молча: поиск, который не смотрит в телефон, и сумма по
 * специалисту, которая задваивается на совместном приёме, выглядят рабочими.
 */
import dayjs, { type Dayjs } from "dayjs";

import type { AppointmentServiceLine, DjangoAppointment } from "../../../api/appointments";
import type { PaymentStatus } from "../../../api/payments";
import type { StatusCode } from "../../../config/appointmentStatuses";
import {
  isCancelledStatus,
  isSlotCovered,
  type BusyInterval,
} from "./slotAvailability";

/**
 * Статусы визита, по которым можно отобрать день. Порядок — ход визита, а не
 * алфавит: регистратор читает ленту слева направо как шкалу времени.
 */
export const VISIT_FILTER_CODES: StatusCode[] = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "canceled",
  "no_show",
];

/**
 * Статусы оплаты. Цвет берётся не своей таблицей тонов, а через код статуса из
 * appointmentStatuses — иначе фильтр «Долг» желтел бы при красном чипе в строке
 * (та же конвенция, что в журнале реестров: registry/RegistryJournalView).
 *
 * «Оплачено» стоит первым: это главный фильтр конца смены, и в переносящемся
 * ряду чипов он не должен уезжать во вторую строку.
 *
 * «Не оплачено» чипа здесь нет: в дне это большинство записей, и чип с самым
 * большим счётчиком отбирал бы почти весь список — то есть ничего не сообщал.
 * ⚠ Список заодно задаёт допустимые значения URL-параметра `pay`
 * (useReceptionFilters), поэтому `?pay=unpaid` теперь отбраковывается — это
 * осознанно: фильтра, который нельзя снять кликом по чипу, быть не должно.
 * В журнале реестров (registry/) свой набор чипов, «Не оплачено» там
 * осталось.
 *
 * «Возврат» своего чипа в строке не имеет и остаётся нейтральным.
 */
export const PAYMENT_FILTER_OPTIONS: {
  value: PaymentStatus;
  /** Код статуса, из которого берётся цвет; null — нейтральный чип. */
  statusCode: StatusCode | null;
}[] = [
  { value: "paid", statusCode: "paid" },
  { value: "partial", statusCode: "debt" },
  { value: "discounted", statusCode: "discounted" },
  { value: "refunded", statusCode: null },
];

/** Шаг сетки записи: как и длительность приёма по умолчанию (slotAvailability). */
const SLOT_STEP_MINUTES = 30;

/**
 * Первое время, на которое ещё можно записать внутри отрезка смены.
 *
 * Нужно для сотрудника, у которого смена есть, а записей нет: без этого он
 * виден в ленте, но при выборе показывает пустой экран — записать «к
 * свободному врачу» через список нельзя. Прошедшее время не предлагаем
 * (у смены, которая уже началась, отсчёт идёт от ближайшего получаса), а
 * закончившийся отрезок не даёт слота вовсе.
 *
 * `now` параметром — чтобы поведение можно было проверить тестом.
 */
export function firstFreeSlotInSegment(
  day: Dayjs,
  segment: { start: string; end: string },
  now: Dayjs = dayjs(),
): Dayjs | null {
  const [startH, startM] = segment.start.split(":").map(Number);
  const [endH, endM] = segment.end.split(":").map(Number);
  if ([startH, startM, endH, endM].some((n) => !Number.isFinite(n))) return null;

  const segStart = day.hour(startH).minute(startM).second(0).millisecond(0);
  const segEnd = day.hour(endH).minute(endM).second(0).millisecond(0);
  if (!segEnd.isAfter(segStart)) return null;

  // Округление «сейчас» вверх до шага сетки: предлагать 14:07 бессмысленно.
  const minutesIntoStep = now.minute() % SLOT_STEP_MINUTES;
  const roundedNow = now
    .second(0)
    .millisecond(0)
    .add(minutesIntoStep === 0 ? 0 : SLOT_STEP_MINUTES - minutesIntoStep, "minute");

  const candidate = roundedNow.isAfter(segStart) ? roundedNow : segStart;
  return candidate.add(SLOT_STEP_MINUTES, "minute").valueOf() <= segEnd.valueOf()
    ? candidate
    : null;
}

/**
 * Первое СВОБОДНОЕ окно внутри смены: шагаем по сетке слотов, пока не найдём
 * время, не занятое приёмом этого сотрудника.
 *
 * `firstFreeSlotInSegment` про приёмы ничего не знает и всегда отдаёт начало
 * смены — из-за этого врачу с графиком с 09:00 и записью на 09:00
 * предлагалось окно на 09:00.
 */
export function firstFreeSlotInSegmentFor(
  day: Dayjs,
  segment: { start: string; end: string },
  intervals: BusyInterval[],
  now: Dayjs = dayjs(),
): Dayjs | null {
  const [endH, endM] = segment.end.split(":").map(Number);
  if (![endH, endM].every((n) => Number.isFinite(n))) return null;
  const segEnd = day.hour(endH).minute(endM).second(0).millisecond(0);

  let candidate = firstFreeSlotInSegment(day, segment, now);
  while (
    candidate &&
    intervals.some((interval) => {
      const start = candidate!.valueOf();
      const end = candidate!.add(SLOT_STEP_MINUTES, "minute").valueOf();
      return start < interval.end && interval.start < end;
    })
  ) {
    candidate = candidate.add(SLOT_STEP_MINUTES, "minute");
    if (candidate.add(SLOT_STEP_MINUTES, "minute").valueOf() > segEnd.valueOf()) return null;
  }
  return candidate;
}

/**
 * Первое свободное получасовое окно с привязкой к началу смены.
 *
 * Нельзя начинать сетку от конца предыдущего приёма: при смене 09:00,
 * приёмах 09:00–09:40 и 10:20–10:50 это ошибочно давало окно 09:40, хотя
 * реальные слоты 09:00, 09:30 и 10:00 все заняты.
 */
export function firstFreeSlotAtOrAfter(
  day: Dayjs,
  segment: { start: string; end: string },
  intervals: BusyInterval[],
  notBefore: Dayjs,
  latestEnd?: Dayjs,
  now: Dayjs = dayjs(),
): Dayjs | null {
  const [startH, startM] = segment.start.split(":").map(Number);
  const [endH, endM] = segment.end.split(":").map(Number);
  if ([startH, startM, endH, endM].some((n) => !Number.isFinite(n))) return null;

  const segStart = day.hour(startH).minute(startM).second(0).millisecond(0);
  const segEnd = day.hour(endH).minute(endM).second(0).millisecond(0);
  if (!segEnd.isAfter(segStart)) return null;
  const end = latestEnd && latestEnd.isBefore(segEnd) ? latestEnd : segEnd;
  const isToday = day.isSame(now, "day");

  for (
    let candidate = segStart;
    candidate.add(SLOT_STEP_MINUTES, "minute").valueOf() <= end.valueOf();
    candidate = candidate.add(SLOT_STEP_MINUTES, "minute")
  ) {
    const candidateEnd = candidate.add(SLOT_STEP_MINUTES, "minute");
    if (candidate.isBefore(notBefore) || (isToday && candidate.isBefore(now))) continue;
    const overlaps = intervals.some(
      (interval) => candidate.valueOf() < interval.end && interval.start < candidateEnd.valueOf(),
    );
    if (!overlaps) return candidate;
  }
  return null;
}

/** Только цифры — номера в базе лежат в разном формате (+996, 0555, пробелы). */
const digitsOnly = (s: string) => s.replace(/\D/g, "");

/**
 * Совпадает ли приём со строкой поиска.
 *
 * Ищем по пациенту, услуге и исполнителю, а телефон — отдельной веткой по
 * цифрам: регистратор набирает номер как слышит («0555 12 34 56»), а в базе он
 * может лежать как «+996555123456», и подстрокой это не сходится.
 */
export function matchesAppointmentSearch(appt: DjangoAppointment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  if ((appt.patient?.fullName ?? "").toLowerCase().includes(q)) return true;

  const qDigits = digitsOnly(q);
  if (qDigits.length >= 3) {
    const phoneDigits = digitsOnly(appt.patient?.phone ?? "");
    if (phoneDigits && phoneDigits.includes(qDigits)) return true;
  }

  return appt.services.some(
    (sl) =>
      (sl.service?.name ?? "").toLowerCase().includes(q) ||
      (sl.employee?.fullName ?? "").toLowerCase().includes(q),
  );
}

/**
 * Сумма строки услуги к оплате.
 *
 * Считаем от `lineTotal` бэка, и только если его нет — из цены за единицу.
 * ⚠ Живой ответ (проверено 07.08.2026 на /appointments/home/) поля `price` в
 * строке услуги НЕ содержит, хотя тип его объявляет: есть `unitPrice`,
 * `discountAmount` и посчитанный `lineTotal`. Расчёт «от price» давал ноль по
 * всему дню — отсюда цепочка фолбэков, как в карточке приёма
 * (AppointmentDetailsPanel: price → service.basePrice).
 */
export function serviceLineTotal(line: AppointmentServiceLine): number {
  const lineTotal = parseFloat(String(line.lineTotal ?? ""));
  if (Number.isFinite(lineTotal) && lineTotal > 0) return lineTotal;

  const unit =
    parseFloat(String(line.price ?? "")) ||
    parseFloat(String(line.unitPrice ?? "")) ||
    parseFloat(String(line.service?.basePrice ?? "")) ||
    0;
  const amount =
    unit * (line.quantity || 1) - (parseFloat(String(line.discountAmount ?? "")) || 0);
  return amount > 0 ? amount : 0;
}

export interface AppointmentPriceChangeSummary {
  previousTotal: number;
  currentTotal: number;
  serviceName: string | null;
  oldUnitPrice: number;
  newUnitPrice: number;
}

/**
 * Последняя фактическая правка цены и итог приёма непосредственно до неё.
 *
 * История приходит свежей сверху, но сортируем по changedAt сами: контракт
 * остаётся устойчивым, даже если порядок API когда-нибудь изменится. Изменение
 * относится к цене единицы, поэтому разницу умножаем на количество строки.
 * Удалённую строку восстановить из текущего списка нельзя — такую запись
 * пропускаем и берём предыдущую доступную правку.
 */
export function appointmentPriceChangeSummary(
  appt: DjangoAppointment,
): AppointmentPriceChangeSummary | null {
  const currentTotal = Number(appt.totalAmount);
  if (!Number.isFinite(currentTotal)) return null;

  const overrides = [...(appt.priceOverrides ?? [])].sort(
    (a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt),
  );
  for (const override of overrides) {
    if (override.serviceLineId == null) continue;
    const serviceLine = appt.services.find((line) => line.id === override.serviceLineId);
    if (!serviceLine) continue;

    const oldUnitPrice = Number(override.oldUnitPrice);
    const newUnitPrice = Number(override.newUnitPrice);
    if (
      !Number.isFinite(oldUnitPrice) ||
      !Number.isFinite(newUnitPrice) ||
      oldUnitPrice === newUnitPrice
    ) {
      continue;
    }

    const quantity = Number(serviceLine.quantity) || 1;
    return {
      previousTotal: Math.max(0, currentTotal + (oldUnitPrice - newUnitPrice) * quantity),
      currentTotal,
      serviceName: serviceLine.service?.name ?? null,
      oldUnitPrice,
      newUnitPrice,
    };
  }

  return null;
}

/**
 * Множитель скидки приёма: во сколько раз строка дешевле своей каталожной цены.
 *
 * Скидка вводится на приём целиком (`discountAmount`, дровер оплаты), а строки
 * услуг приходят с бэка ДО скидки — `lineTotal` её не знает. Без множителя чек
 * со скидкой 50% попадал в сумму врача полностью, и группа показывала больше,
 * чем касса приняла.
 *
 * ⚠ Допущение фронта: разбивки скидки по строкам бэк не отдаёт, поэтому она
 * разносится пропорционально — по всем строкам приёма и по товарам в нём, если
 * они есть (база — `totalAmount`). Кому именно из двух специалистов скидали —
 * из данных не следует.
 */
export function discountFactor(appt: DjangoAppointment): number {
  const discount = parseFloat(appt.discountAmount ?? "") || 0;
  if (discount <= 0) return 1;

  const total = parseFloat(appt.totalAmount ?? "") || 0;
  if (total <= 0) return 1;

  const factor = (total - discount) / total;
  return factor > 0 ? (factor < 1 ? factor : 1) : 0;
}

/**
 * Какая доля чека приёма уже закрыта деньгами: 0 — не платили, 1 — закрыт.
 *
 * ⚠ Допущение фронта: разбивки оплаты по строкам услуг бэк не отдаёт, поэтому
 * при частичной оплате доля разносится по исполнителям пропорционально их
 * суммам. Кто именно из двух специалистов «уже оплачен» при половине чека —
 * из данных не следует, и точный ответ потребовал бы поля от бэка.
 */
export function paidShare(appt: DjangoAppointment): number {
  const payable =
    parseFloat(appt.payableAmount ?? "") ||
    (parseFloat(appt.totalAmount ?? "") || 0) - (parseFloat(appt.discountAmount ?? "") || 0);
  const paid = parseFloat(appt.paidTotal ?? "") || 0;

  if (payable > 0) {
    const share = paid / payable;
    return share > 1 ? 1 : share < 0 ? 0 : share;
  }
  // Чек на ноль: скидка 100% / бесплатно — считаем закрытым, иначе «оплачено»
  // по такому приёму навсегда осталось бы нулём.
  return appt.paymentStatus === "paid" || appt.paymentStatus === "discounted" ? 1 : 0;
}

/**
 * Деньги по конкретному исполнителю за набор приёмов.
 *
 * Считаем по СТРОКАМ этого исполнителя, а не по чекам целиком: совместный приём
 * (врач + медсестра) показывается в обеих группах, и сумма чека попала бы в обе
 * — день бы «заработал» вдвое больше, чем было.
 *
 * Отменённые приёмы и неявки в деньги не идут: строки в них остаются, но денег
 * за ними нет.
 */
export function employeeMoneyTotals(
  appointments: DjangoAppointment[],
  employeeId: number | null,
): { accrued: number; paid: number } {
  let accrued = 0;
  let paid = 0;

  for (const appt of appointments) {
    if (isCancelledStatus(appt.status)) continue; // отмена и неявка (см. slotAvailability)

    const lineSum = appt.services
      .filter((sl) => (sl.employee?.id ?? null) === employeeId)
      .reduce((sum, sl) => sum + serviceLineTotal(sl), 0);

    if (lineSum <= 0) continue;
    // Скидка приёма живёт на чеке, а не в строках (см. discountFactor) —
    // без неё сумма группы завышена на весь размер скидки.
    const net = lineSum * discountFactor(appt);
    accrued += net;
    paid += net * paidShare(appt);
  }

  return { accrued, paid };
}
