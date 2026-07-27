/**
 * Чистая логика «какие чипы показать по приёму» — вынесена из
 * AppointmentStatusChips, чтобы правила видимости можно было покрыть тестами
 * (render-библиотек в проекте нет, только vitest).
 *
 * Правила и их причины — в шапке AppointmentStatusChips.tsx.
 */
import type { DjangoAppointment } from "../../api/appointments";
import { resolveStatusCode } from "../../config/appointmentStatuses";

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
    >
  >;

/**
 * Приём считаем просроченным не сразу после endsAt: приём может идти дольше
 * запланированного, и чип «просрочен» на живом приёме сбивал бы с толку.
 */
export const OVERDUE_GRACE_MS = 60 * 60 * 1000;

/** Статусы «приём ещё не закрыт» — только они могут просрочиться. */
const OPEN_STATUS_CODES = new Set(["scheduled", "confirmed", "arrived", "in_progress"]);

/** Статусы, которые нельзя прятать ни за какими платёжными чипами. */
const NEGATIVE_STATUS_CODES = new Set(["canceled", "no_show"]);

export interface StatusChipState {
  showStatusChip: boolean;
  showPayChip: boolean;
  /** 100% скидка: оплат нет, но чек закрыт. */
  showDiscountChip: boolean;
  /** Частичная оплата: показываем остаток суммой. */
  debtAmount: number | null;
  /** Время приёма прошло, а статус остался «открытым». */
  isOverdue: boolean;
  /** Код статуса для подбора стиля платёжного чипа. */
  paymentStyleStatus: string;
}

/** Есть ли по приёму заключение — бэк не отдаёт hasMedicalConclusion, выводим
 *  из строк услуг (та же логика, что в AppointmentListPanel и истории). */
const hasConclusionOf = (appt: AppointmentStatusSource): boolean =>
  (appt.services ?? []).some(
    (sl) =>
      sl.conclusionId != null ||
      sl.conclusionState === "draft" ||
      sl.conclusionState === "completed",
  );

export function getStatusChipState(
  appt: AppointmentStatusSource,
  opts: { alwaysShowStatus?: boolean; now?: number } = {},
): StatusChipState {
  const { alwaysShowStatus = false, now = Date.now() } = opts;

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

  // 100% скидка: оплат нет (paidTotal=0), но чек закрыт — иначе приём выглядел
  // бы неоплаченным.
  const showDiscountChip = appt.paymentStatus === "discounted" && !hasPaid;

  const statusCode = resolveStatusCode(appt.status);

  // Отменённый/неявка не прячем никогда: оплаченный отменённый приём иначе
  // выглядел как обычное «Оплачено» (на проде такие есть — возврат ещё не
  // оформлен, а строка не отличается от состоявшегося визита).
  const isNegative = statusCode != null && NEGATIVE_STATUS_CODES.has(statusCode);

  const hideStatusChip =
    !isNegative &&
    (statusCode === "completed" ||
      appt.paymentStatus === "paid" ||
      appt.paymentStatus === "partial" ||
      showDiscountChip ||
      hasConclusionOf(appt));

  const showPayChip = hasPaid;
  // Ни одного чипа по правилам выше — показываем статус, чтобы не потерять его.
  const showStatusChip =
    alwaysShowStatus || !hideStatusChip || (!showPayChip && !showDiscountChip);

  const endsAtMs = appt.endsAt ? Date.parse(appt.endsAt) : NaN;
  const isOverdue =
    statusCode != null &&
    OPEN_STATUS_CODES.has(statusCode) &&
    Number.isFinite(endsAtMs) &&
    endsAtMs < now - OVERDUE_GRACE_MS;

  // Долг показываем только при частичной оплате: у неоплаченного приёма долг
  // равен всей сумме и дублировал бы «Итого».
  const debt = Number(appt.debt ?? 0);
  const debtAmount = hasPaid && debt > 0 ? debt : null;

  return {
    showStatusChip,
    showPayChip,
    showDiscountChip,
    debtAmount,
    isOverdue,
    paymentStyleStatus,
  };
}
