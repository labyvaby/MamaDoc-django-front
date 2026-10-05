import { apiRequest } from "./client";
import type { AppointmentConsumptionWarning } from "./appointments";
export { parseBackendError } from "./appointments";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentMethod = "cash" | "card" | "balance" | "bonus" | "insurance";

export type PaymentStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "discounted"
  | "refunded";

/**
 * Где стоит счёт приёма (бэк: appointments.payment_access.payment_phase).
 * До начала приёма неоплаченный остаток — «к оплате» (`awaiting`/`prepaid`),
 * после начала — `debt`. Поле `debt` приёма по-прежнему значит «остаток».
 */
export type PaymentPhase =
  | "awaiting"
  | "prepaid"
  | "paid"
  | "debt"
  | "discounted"
  | "refunded"
  | "free"
  | "canceled";

/** Вид одной оплаты: до начала приёма, на приёме, погашение долга позже. */
export type PaymentKind = "prepayment" | "payment" | "debt_repayment";

/** Почему правка/возврат недоступны — стабильные коды бэка. */
export type PaymentLockReason =
  | "module_disabled"
  | "no_permission"
  | "online_prepayment"
  | "internal_method"
  | "has_refund"
  | "appointment_closed"
  | "day_closed"
  | "fully_refunded";

export interface AppointmentPayment {
  id: number;
  method: PaymentMethod;
  amount: string;
  /** Total amount already refunded for this payment */
  refundedAmount?: string;
  createdAt: string;
  /** Date this payment counts toward in the cashbox — may differ from createdAt for card/insurance */
  cashDate: string;
  /** Insurance company id (only for method === "insurance") */
  insurerId?: number | null;
  /** Insurance company name (only for method === "insurance") */
  insurerName?: string | null;
  /** Patient policy number (only for method === "insurance") */
  policyNumber?: string;
  /** Способ безнала из справочника (только для method === "card") */
  cashlessMethodId?: number | null;
  /** Название способа безнала — джойном, как insurerName */
  cashlessMethodName?: string | null;
  /**
   * Строка пришла онлайн-предоплатой брони, а не из кассы: метод `card`,
   * способ безнала «Бакай Paylink», дата кассы — день оплаты банку.
   * Её нельзя перезаписать обычной оплатой и **нельзя присылать в apply**
   * (её дата кассы вне разрешённых пресетов → 400).
   * `undefined` — окружение без релиза предоплаты, предоплат там не бывает.
   */
  isPrepayment?: boolean;
  /** manual — регистратор; booking — Bakai/public booking */
  prepaymentSource?: "manual" | "booking" | null;
  /** Current appointment date; changes when the appointment is rescheduled. */
  targetAppointmentDate?: string | null;
  /** Комментарий кассира к оплате. */
  note?: string;
  /** Auth-user id того, кто принял деньги. */
  createdById?: number | null;
  // ── История оплат (undefined — бэк без релиза истории) ──────────────────
  /** Предоплата / оплата на приёме / погашение долга — от текущего начала приёма. */
  kind?: PaymentKind;
  /** Кто принял: ФИО из карточки сотрудника, иначе имя/логин. */
  createdByName?: string | null;
  /** Что можно сделать запрашивающему: права + настройки + «день в день». */
  canEdit?: boolean;
  canDelete?: boolean;
  canRefund?: boolean;
  editLockReason?: PaymentLockReason | null;
  refundLockReason?: PaymentLockReason | null;
  /** Сколько раз оплату правили (подробности — в `revisions` сводки). */
  revisionsCount?: number;
}

export interface AppointmentRefund {
  id: number;
  paymentId: number;
  method: PaymentMethod;
  amount: string;
  reason: string;
  createdById: number;
  createdAt: string;
  /** Способ безнала наследуется от платежа, по которому идёт возврат */
  cashlessMethodId?: number | null;
  cashlessMethodName?: string | null;
  /** Кто оформил возврат. */
  createdByName?: string | null;
}

/**
 * Оплата, какой она была до правки, — снимок бэка. Ключи snake_case: это
 * JSON-поле, бэк его не переименовывает.
 */
export interface PaymentRevisionSnapshot {
  id?: number;
  method?: PaymentMethod;
  amount?: string;
  cashless_method?: number | null;
  cashless_method_name?: string | null;
  insurer?: number | null;
  insurer_name?: string | null;
  policy_number?: string;
  cash_date?: string | null;
  note?: string;
  is_prepayment?: boolean;
  created_at?: string;
  created_by?: number | null;
}

/** Одна правка принятой оплаты (из истории или из формы оплаты). */
export interface PaymentRevision {
  id: number;
  paymentId: number;
  action: "updated" | "deleted";
  source: "history" | "payment_form";
  /** `{amount: {old: "500.00", new: "300.00"}, method: {...}}` — snake_case поля оплаты. */
  changes: Record<string, { old: unknown; new: unknown }>;
  snapshot: PaymentRevisionSnapshot;
  reason: string;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
}

/** Счёт, разделённый моментом начала приёма. Суммы — decimal-строки. */
export interface PaymentSettlement {
  phase: PaymentPhase;
  started: boolean;
  startsAt: string;
  /** Чистыми, пришло до начала приёма. */
  prepaidAmount: string;
  /** Чистыми, пришло после начала. */
  paidAfterStartAmount: string;
  /** Неоплаченный остаток: до начала — «к оплате», после — долг. */
  remainingAmount: string;
  /** Остаток, ставший долгом; до начала приёма — 0. */
  debtAmount: string;
}

/** Настройки модуля истории и права запрашивающего. */
export interface PaymentHistoryAccess {
  historyEnabled: boolean;
  editingEnabled: boolean;
  sameDayOnly: boolean;
  canEdit: boolean;
  canEditAnyDay: boolean;
  canRefund: boolean;
  /** «Сегодня» клиники (Asia/Bishkek) — от него считается «день в день». */
  today: string;
}

export interface PaymentSummary {
  appointmentId: number;
  totalAmount: string;
  discountAmount: string;
  payableAmount: string;
  paidTotal: string;
  /** Gross total of all refunds */
  refundedTotal?: string;
  /** paidTotal - refundedTotal */
  paidNet?: string;
  /** Total bonus points redeemed for this appointment */
  bonusPaid?: string;
  /** Total bonus points refunded for this appointment */
  bonusRefunded?: string;
  debt: string;
  /**
   * Онлайн-предоплата брони, уже проведённая в приём (входит в `paidTotal`).
   * Форма оплаты вычитает её из суммы к вводу: в поля кассир вносит только
   * то, что платят на месте. `undefined` = 0 (окружение без релиза).
   */
  prepaidTotal?: string;
  /**
   * Уплачено сверх суммы к оплате — приём вышел дешевле предоплаты. Долг в
   * минус не уходит, разница показывается здесь. Что с ней делать — вопрос
   * заказчику, UI под возврат/баланс пока не рисуем.
   */
  overpaidAmount?: string;
  paymentStatus: PaymentStatus;
  /** Appointment workflow status mirrored from backend (cancelled/no_show → debt always "0.00") */
  appointmentStatus?: string;
  payments: AppointmentPayment[];
  refunds?: AppointmentRefund[];
  /**
   * Что натворило автосписание расходников в **этом** запросе. Оплата,
   * переводящая приём в `paid`/`discounted`, сама списывает расходники со
   * склада, а возврат, уводящий приём из оплаченных, возвращает их назад
   * (`front_consumables_integration.md`, ответы 1–3) — поэтому предупреждения
   * приходят именно сюда, а не только в ответе приёма.
   *
   * На GET `/payments/` — всегда пустой массив (проверено на живом API
   * 30.07.2026: поле присутствует).
   */
  consumptionWarnings?: AppointmentConsumptionWarning[];
  // ── История оплат (undefined — бэк без релиза истории) ──────────────────
  settlement?: PaymentSettlement | null;
  access?: PaymentHistoryAccess | null;
  /** Правки оплат, старые сначала; пусто, когда история выключена. */
  revisions?: PaymentRevision[];
}

export interface PaymentLineInput {
  method: PaymentMethod;
  amount: string;
  /** Required when method === "insurance": active insurer of the org */
  insurerId?: number;
  /** Optional patient policy number (insurance only) */
  policyNumber?: string;
  /**
   * Способ безналичной оплаты из справочника — только для method === "card".
   * Шлём, только когда справочник непустой и флаг CASHLESS_METHODS_ENABLED
   * включён (см. api/cashlessMethods.ts).
   */
  cashlessMethodId?: number;
  /**
   * Cash register date — only for method === "card" | "insurance", and only
   * one of two presets: today or the appointment's own date. Omit to default
   * to today. Other methods must omit it (always dated today server-side).
   */
  cashDate?: string;
}

export interface ApplyPaymentPayload {
  discountAmount: string;
  payments: PaymentLineInput[];
  /** Amount to deduct from patient balance (omit or "0.00" if not using balance) */
  balanceAmount?: string;
  /** Amount to deduct from patient bonuses (omit or "0.00" if not using bonuses) */
  bonusAmount?: string;
  note?: string;
}

export interface CreateManualPrepaymentPayload extends ApplyPaymentPayload {
  /** Reuse this value when retrying an uncertain request. */
  idempotencyKey: string;
}

export interface RefundPayload {
  amount: string;
  reason: string;
}

export interface CreateRefundResponse {
  refund: AppointmentRefund;
  paymentSummary: PaymentSummary;
  /**
   * Гайд (§1.3) обещает предупреждения в корне ответа возврата, а живой
   * `PaymentSummary` держит их внутри — читаем оба места (см.
   * `refundConsumptionWarnings`).
   */
  consumptionWarnings?: AppointmentConsumptionWarning[];
}

/**
 * Платежи, которые заводит касса, — без строк онлайн-предоплаты брони.
 * Предоплата приходит из банка отдельной `card`-строкой, защищена от
 * replace-all и в `apply` не отправляется (её дата кассы — день оплаты банку,
 * а бэк принимает только «сегодня» или «дату приёма»). Форма оплаты сидирует
 * поля, способ безнала и дату кассы только из этого списка. На окружении без
 * релиза предоплаты `isPrepayment` нет и фильтр ничего не меняет.
 */
export function manualPaymentsOf(
  summary: PaymentSummary | undefined | null,
): AppointmentPayment[] {
  return (summary?.payments ?? []).filter((p) => !p.isPrepayment);
}

/** Предупреждения возврата — из корня ответа или из вложенной сводки. */
export function refundConsumptionWarnings(
  res: CreateRefundResponse,
): AppointmentConsumptionWarning[] {
  const root = res.consumptionWarnings;
  if (Array.isArray(root) && root.length > 0) return root;
  const nested = res.paymentSummary?.consumptionWarnings;
  return Array.isArray(nested) ? nested : [];
}

// ── API functions ──────────────────────────────────────────────────────────────

export function getAppointmentPayments(
  appointmentId: number,
  signal?: AbortSignal,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/`,
    { signal },
  );
}

export function applyAppointmentPayment(
  appointmentId: number,
  payload: ApplyPaymentPayload,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/apply/`,
    { method: "POST", body: payload },
  );
}

export function createManualAppointmentPrepayment(
  appointmentId: number,
  payload: CreateManualPrepaymentPayload,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/prepayment/`,
    { method: "POST", body: payload },
  );
}

export function createAppointmentRefund(
  appointmentId: number,
  paymentId: number,
  payload: RefundPayload,
): Promise<CreateRefundResponse> {
  return apiRequest<CreateRefundResponse>(
    `/appointments/${appointmentId}/payments/${paymentId}/refund/`,
    { method: "POST", body: payload },
  );
}

// ── История оплат: правка и удаление одной оплаты ───────────────────────────

/**
 * Правка оплаты из истории. Отсутствующие поля не трогаются; `reason`
 * обязателен — он попадает в историю. Смена способа с карты/страховки
 * снимает терминал/страховую.
 */
export interface UpdateAppointmentPaymentPayload {
  reason: string;
  amount?: string;
  method?: "cash" | "card" | "insurance";
  cashlessMethodId?: number | null;
  insurerId?: number | null;
  policyNumber?: string;
  note?: string;
}

/** Коды ошибок правки, по которым ветвится UI (`ApiError.code`). */
export const PAYMENT_HISTORY_ERROR_CODES = {
  /** Чужой день без права «за прошлые дни». */
  dayLocked: "PAYMENT_DAY_LOCKED",
  /** Онлайн-предоплата, баланс/бонусы, был возврат, приём отменён. */
  locked: "PAYMENT_LOCKED",
  /** Правку выключили в настройках организации. */
  editingDisabled: "PAYMENT_EDITING_DISABLED",
} as const;

export function updateAppointmentPayment(
  appointmentId: number,
  paymentId: number,
  payload: UpdateAppointmentPaymentPayload,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/${paymentId}/`,
    { method: "PATCH", body: payload },
  );
}

/** Удалить оплату, которой не было (дубль, ошибка). Возврат денег — это refund. */
export function deleteAppointmentPayment(
  appointmentId: number,
  paymentId: number,
  reason: string,
): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(
    `/appointments/${appointmentId}/payments/${paymentId}/delete/`,
    { method: "POST", body: { reason } },
  );
}

/** Три переключателя модуля «История оплат» организации. */
export interface AppointmentPaymentSettings {
  historyEnabled: boolean;
  editingEnabled: boolean;
  sameDayOnly: boolean;
}

export function getAppointmentPaymentSettings(
  signal?: AbortSignal,
): Promise<AppointmentPaymentSettings> {
  return apiRequest<AppointmentPaymentSettings>(
    "/appointments/payment-settings/",
    { signal },
  );
}

/** Менять может только `organization.update`. */
export function updateAppointmentPaymentSettings(
  patch: Partial<AppointmentPaymentSettings>,
): Promise<AppointmentPaymentSettings> {
  return apiRequest<AppointmentPaymentSettings>(
    "/appointments/payment-settings/",
    { method: "PATCH", body: patch },
  );
}
