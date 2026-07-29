/**
 * Чистая логика «какие чипы показать по приёму» — вынесена из
 * AppointmentStatusChips, чтобы правила видимости можно было покрыть тестами
 * (render-библиотек в проекте нет, только vitest).
 *
 * Правила и их причины — в шапке AppointmentStatusChips.tsx.
 */
import type { DjangoAppointment } from "../../api/appointments";
import { resolveStatusCode } from "../../config/appointmentStatuses";
import { discountPercentOf } from "../../utility/format";

/** Приёму нужны только эти поля — компонент принимает и укороченные формы
 *  приёма из карточек-дроверов, а не только полный DjangoAppointment. */
export type AppointmentStatusSource = Pick<DjangoAppointment, "status"> &
  Partial<
    Pick<
      DjangoAppointment,
      | "paymentStatus"
      | "paidTotal"
      | "paymentMethods"
      | "services"
      | "endsAt"
      | "debt"
      | "totalAmount"
      | "discountAmount"
    >
  >;

/**
 * Приём считаем просроченным не сразу после endsAt: приём может идти дольше
 * запланированного, и чип «просрочен» на живом приёме сбивал бы с толку.
 */
export const OVERDUE_GRACE_MS = 60 * 60 * 1000;

/** Статусы «приём ещё не закрыт» — только они могут просрочиться. */
const OPEN_STATUS_CODES = new Set(["scheduled", "confirmed", "arrived", "in_progress"]);

export interface StatusChipState {
  /** Всегда true — поле оставлено, чтобы не переписывать вызывающий рендер. */
  showStatusChip: boolean;
  showPayChip: boolean;
  /** Скидка при отсутствии оплат. */
  showDiscountChip: boolean;
  /** Фактический процент скидки; null — сумм нет, процент не посчитать. */
  discountPercent: number | null;
  /** Частичная оплата: показываем остаток суммой. */
  debtAmount: number | null;
  /** Сумма чека — вторая половина фразы «Долг 1100 из 1600». */
  totalAmount: number | null;
  /** Время приёма прошло, а статус остался «открытым». */
  isOverdue: boolean;
  /** Код статуса для подбора стиля платёжного чипа. */
  paymentStyleStatus: string;
}

/** Один ли календарный день (в часовом поясе пользователя, не в UTC). */
const isSameLocalDay = (aMs: number, bMs: number): boolean => {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

export function getStatusChipState(
  appt: AppointmentStatusSource,
  opts: { now?: number } = {},
): StatusChipState {
  const { now = Date.now() } = opts;

  const methods = appt.paymentMethods ?? [];
  const hasPaid = Number(appt.paidTotal ?? 0) > 0;
  const isCardOnly = methods.length === 1 && methods[0] === "card";

  // Стиль чипа подбираем по коду статуса, а не по метке: метка зависит от
  // вертикали бизнеса и ключом быть не может.
  const paymentStyleStatus =
    appt.paymentStatus === "paid" && isCardOnly
      ? "paid_cashless"
      : appt.paymentStatus === "paid"
      ? "paid"
      : appt.paymentStatus === "partial"
      ? "partially_paid"
      : appt.status;

  const statusCode = resolveStatusCode(appt.status);

  // Долг показываем только при частичной оплате: у неоплаченного приёма долг
  // равен всей сумме и дублировал бы «Итого».
  const debt = Number(appt.debt ?? 0);
  const debtAmount = hasPaid && debt > 0 ? debt : null;
  const total = Number(appt.totalAmount ?? 0);

  // Скидка без оплаты: приём иначе выглядит просто неоплаченным, хотя часть
  // (или вся) сумма уже списана скидкой.
  //
  // Процент считаем из сумм, а не из paymentStatus. Раньше чип был жёстко
  // подписан «Скидка 100%» и показывался по одному признаку
  // paymentStatus === "discounted" — то есть утверждал процент, которого не
  // проверял, и скидка 50% подписывалась как полная.
  const discount = Number(appt.discountAmount ?? 0);
  const showDiscountChip =
    !hasPaid && (discount > 0 || appt.paymentStatus === "discounted");
  const discountPercent = discountPercentOf(total, discount);

  // При частичной оплате хватает одного чипа: «Долг 1100 из 1600» говорит и
  // что часть внесена, и сколько осталось. Раньше рядом стояли «Частично
  // оплачено» и «Долг 1100» — две метки об одном, а место в строке общее.
  const showPayChip = hasPaid && debtAmount == null;
  // Статус визита показываем всегда, рядом с деньгами.
  //
  // Раньше он прятался за платёжными чипами (оплачен / частично / скидка /
  // есть заключение), и делалось это не ради краткости, а потому что чипы
  // сливались по цвету: «Пациент здесь» выглядел как «Оплачено». Ценой было
  // главное для регистратуры — по оплаченной строке нельзя было понять,
  // пришёл человек или ещё нет. Дорожки развели по форме (контур / заливка),
  // и прятать больше нечего.
  const showStatusChip = true;

  // Просрочку помечаем только в пределах текущего дня: «висит незакрытым
  // прямо сейчас» — повод подойти и закрыть, а «висел незакрытым две недели
  // назад» — статистика. Бэк приёмы не закрывает вовсе, поэтому в архивных
  // днях метка стояла бы у каждой строки и не значила бы ничего.
  const endsAtMs = appt.endsAt ? Date.parse(appt.endsAt) : NaN;
  const isOverdue =
    statusCode != null &&
    OPEN_STATUS_CODES.has(statusCode) &&
    Number.isFinite(endsAtMs) &&
    endsAtMs < now - OVERDUE_GRACE_MS &&
    isSameLocalDay(endsAtMs, now);

  return {
    showStatusChip,
    showPayChip,
    showDiscountChip,
    discountPercent,
    debtAmount,
    totalAmount: debtAmount != null && total > 0 ? total : null,
    isOverdue,
    paymentStyleStatus,
  };
}
