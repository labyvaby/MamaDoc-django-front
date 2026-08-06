/**
 * Чистая логика «какие чипы показать по приёму» — вынесена из
 * AppointmentStatusChips, чтобы правила видимости можно было покрыть тестами
 * (render-библиотек в проекте нет, только vitest).
 *
 * Правила и их причины — в шапке AppointmentStatusChips.tsx.
 */
import type { DjangoAppointment } from "../../api/appointments";
import { resolveStatusCode } from "../../config/appointmentStatuses";
import type { StatusCode } from "../../config/appointmentStatuses";
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

/** Статусы, которые показываем даже по закрытому чеку: оплаченный отменённый
 *  приём (возврат не оформлен) иначе выглядел бы как обычное «Оплачено». */
const ALWAYS_VISIBLE_STATUS_CODES = new Set(["canceled", "no_show"]);

export interface StatusChipState {
  /** Статус хода визита; после закрытия чека прячется. */
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

  // Закрытый чек: внесена вся сумма либо она полностью погашена скидкой.
  // Частичная оплата чек не закрывает — там остаётся долг, и статус визита
  // нужен (пациент ещё в работе). Процент скидки считаем из сумм: без сумм
  // (укороченные формы приёма в дроверах) полноту скидки не утверждаем.
  const isCheckClosed = showPayChip || (!hasPaid && discountPercent === 100);

  // Статус хода визита после закрытия чека не показываем: по просьбе
  // регистратуры — дальше строка живёт как расчётная, и «Подтверждён» рядом с
  // «Оплачено» только занимал место в строке.
  //
  // Исключение — отмена и неявка: они означают, что деньги нужно вернуть,
  // и прятать их за «Оплачено» нельзя.
  const showStatusChip =
    !isCheckClosed || statusCode == null || ALWAYS_VISIBLE_STATUS_CODES.has(statusCode);

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

/**
 * Единое вычисляемое состояние приёма — то, каким главным чипом строка
 * отвечает на вопрос «что с этим приёмом». По нему же обязаны считать
 * счётчики и фильтры дня (AppointmentListPanel): раньше они классифицировали
 * по сырому статусу из базы, и фильтр «Пациент здесь» отбирал строки, на
 * которых видно одно лишь «Оплачено» — бэк при оплате статус визита не
 * меняет, а строка после закрытия чека прячет его чип.
 *
 * В приёме смешаны три сущности: статус визита (ожидаем / здесь / на приёме),
 * статус оплаты и фактическое состояние процесса (открыт или закрыт). Явного
 * «закрыт» бэк не даёт — completed он не проставляет (см. шапку
 * AppointmentStatusChips), поэтому действует ВРЕМЕННОЕ бизнес-правило:
 * полностью закрытый чек = операционно закрытый приём. Пациент, оплативший
 * заранее и ещё сидящий в кабинете, уйдёт из «Пациент здесь» в «Оплачено» —
 * осознанная цена правила. Когда бэк научится закрывать визит явным статусом,
 * заменить правило нужно будет только здесь.
 *
 * Возвращает:
 *   • canceled / no_show — всегда, даже по закрытому чеку (деньги к возврату);
 *   • "paid" — чек закрыт оплатой (нал, безнал, смешанная);
 *   • "discounted" — чек закрыт скидкой на всю сумму без внесённых денег;
 *   • иначе код статуса визита; null — статус неизвестен.
 */
export function resolveAppointmentDisplayState(
  appt: AppointmentStatusSource,
): StatusCode | null {
  const code = resolveStatusCode(appt.status);
  if (code && ALWAYS_VISIBLE_STATUS_CODES.has(code)) return code;

  const { showStatusChip, showPayChip } = getStatusChipState(appt);
  // Чек не закрыт (или статус неизвестен) — состояние приёма и есть статус
  // визита, ровно тот чип, который виден в строке.
  if (showStatusChip) return code;
  return showPayChip ? "paid" : "discounted";
}
