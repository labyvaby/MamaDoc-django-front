import dayjs from "dayjs";
import "dayjs/locale/ru";

import type { PosHistorySummary, PosSavedReceipt } from "../../api/pos";
import type { DateRange, DateRangePreset, ToneName } from "../../components/ui";
import { formatQuantity } from "../../utility/format";

/**
 * Подписи и мелкие вычисления страницы «История продаж». Вынесены из
 * компонентов, чтобы список, дровер чека и печатная форма показывали одно
 * и то же, а правила можно было покрыть тестами.
 */

// ── Статусы и оплаты ────────────────────────────────────────────────────────────

/** `ReceiptStatus` бэка. Отменённый отложенный чек бэк возвращает в `draft`. */
export const RECEIPT_STATUS_META: Record<string, { label: string; tone: ToneName }> = {
  completed: { label: "Завершён", tone: "success" },
  held: { label: "Отложен", tone: "warning" },
  returned: { label: "Возврат", tone: "error" },
  draft: { label: "Отменён", tone: null },
};

export const receiptStatusMeta = (status: string) =>
  RECEIPT_STATUS_META[status] ?? { label: status, tone: null as ToneName };

/** `ReceiptPaymentMethod` бэка — все семь, а не только три «живых». */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  cashless: "Безналичные",
  bonus: "Бонусы",
  certificate: "Сертификат",
  voucher: "Ваучер",
  debt: "В долг",
};

export const paymentMethodLabel = (method: string) => PAYMENT_METHOD_LABELS[method] ?? method;

/** Действия журнала чека (`ReceiptAuditLog.action`). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  checkout_completed: "Продажа проведена",
  receipt_held: "Чек отложен",
  held_receipt_completed: "Отложенный чек оплачен",
  receipt_cancelled: "Отложенный чек отменён",
  receipt_returned: "Оформлен возврат",
  receipt_exchanged: "Оформлен обмен",
};

export const auditActionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action;

// ── Чек ─────────────────────────────────────────────────────────────────────────

/**
 * Короткий номер — первые 8 знаков UUID. Ровно так номер печатается на
 * товарном чеке кассы, поэтому по нему же кассир ищет чек в истории.
 */
export const receiptNumber = (receipt: Pick<PosSavedReceipt, "number" | "id">) =>
  receipt.number ? receipt.number.slice(0, 8) : `#${receipt.id}`;

export const clientLabel = (receipt: Pick<PosSavedReceipt, "clientId" | "clientName">) => {
  const name = receipt.clientName?.trim();
  if (name) return name;
  return receipt.clientId != null ? `Клиент #${receipt.clientId}` : "Без клиента";
};

/** Суммарное количество единиц в чеке: «3 шт.» из строк «2.000» + «1.000». */
export const unitsCount = (lines: PosSavedReceipt["lines"]) =>
  lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

/**
 * Состав чека одной строкой: «Пальто ×2 и ещё 3». Первая позиция названа —
 * по ней чек узнают, — остальные считаем, чтобы строка не разъезжалась.
 */
export const linesSummary = (lines: PosSavedReceipt["lines"]) => {
  const [first, ...rest] = lines;
  if (!first) return "Без товаров";
  const quantity = Number(first.quantity);
  const head = quantity > 1 ? `${first.productName} ×${formatQuantity(first.quantity)}` : first.productName;
  return rest.length ? `${head} и ещё ${rest.length}` : head;
};

/** Чем оплатили: «Наличные», «Карта + Наличные» — уникальные способы по порядку. */
export const paymentsSummary = (payments: PosSavedReceipt["payments"]) => {
  const labels = payments.map((payment) => paymentMethodLabel(payment.method));
  const unique = labels.filter((label, index) => labels.indexOf(label) === index);
  return unique.length ? unique.join(" + ") : "Без оплаты";
};

// ── Даты ────────────────────────────────────────────────────────────────────────

/**
 * Дата в списке: «Сегодня, 14:05», «Вчера, 09:12», «12 сен, 18:40», за другой
 * год — с годом. Относительные слова только для двух последних дней: дальше
 * «3 дня назад» приходится пересчитывать в голове.
 */
export const receiptDateLabel = (iso: string, now = dayjs()) => {
  const date = dayjs(iso).locale("ru");
  const time = date.format("HH:mm");
  if (date.isSame(now, "day")) return `Сегодня, ${time}`;
  if (date.isSame(now.subtract(1, "day"), "day")) return `Вчера, ${time}`;
  return date.isSame(now, "year") ? date.format("D MMM, HH:mm") : date.format("D MMM YYYY, HH:mm");
};

/** Полная дата для карточки чека и печатной формы: «12 сентября 2026, 18:40». */
export const receiptDateFull = (iso: string) => dayjs(iso).locale("ru").format("D MMMM YYYY, HH:mm");

// ── Период ──────────────────────────────────────────────────────────────────────

/** Ключ пресета «За всё время»: даты в запрос не уходят. */
export const ALL_TIME_PRESET = "all";

/**
 * Пресеты периода истории. «За всё время» представлен диапазоном от условной
 * даты — `DateRangeField` умеет показывать только конечный диапазон, а по
 * ключу пресета страница просто не передаёт даты на сервер.
 */
export const HISTORY_PERIOD_PRESETS: DateRangePreset[] = [
  { key: "today", label: "Сегодня", range: () => [dayjs().startOf("day"), dayjs().endOf("day")] },
  {
    key: "yesterday",
    label: "Вчера",
    range: () => [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").endOf("day")],
  },
  { key: "7d", label: "Последние 7 дней", range: () => [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  { key: "30d", label: "Последние 30 дней", range: () => [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")] },
  { key: "month", label: "Этот месяц", range: () => [dayjs().startOf("month"), dayjs().endOf("month")] },
  {
    key: "prevMonth",
    label: "Прошлый месяц",
    range: () => [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")],
  },
  { key: ALL_TIME_PRESET, label: "За всё время", range: () => [dayjs("2000-01-01").startOf("day"), dayjs().endOf("day")] },
];

export const historyPreset = (key: string) => HISTORY_PERIOD_PRESETS.find((preset) => preset.key === key) ?? HISTORY_PERIOD_PRESETS[0];

// ── Режим совместимости со старым бэкендом ───────────────────────────────────────
//
// Фронт и бэк выкатываются порознь: пока сервер не знает `dateFrom/dateTo/
// search` и `history/summary/`, страница фильтрует и считает загруженную
// страницу сама — как делала прежняя версия. Ниже — те же правила, что на
// сервере, чтобы после обновления бэкенда поведение не «прыгнуло».

/** Чек внутри периода (границы включительно); `null` — период не ограничен. */
export const receiptInRange = (receipt: Pick<PosSavedReceipt, "createdAt">, range: DateRange | null) => {
  if (!range) return true;
  const created = dayjs(receipt.createdAt);
  return !created.isBefore(range.from) && !created.isAfter(range.to);
};

/** Совпадение с поиском: начало номера, товар, имя клиента или его номер. */
export const receiptMatches = (
  receipt: Pick<PosSavedReceipt, "number" | "clientId" | "clientName" | "lines">,
  query: string,
) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    receipt.number.toLowerCase().startsWith(needle)
    || receipt.lines.some((line) => line.productName.toLowerCase().includes(needle))
    || (receipt.clientName ?? "").toLowerCase().includes(needle)
    || (receipt.clientId != null && String(receipt.clientId) === needle)
  );
};

/** Сводка по набору чеков — в формате `history/summary/`. */
export const summarizeReceipts = (receipts: PosSavedReceipt[]): PosHistorySummary => {
  const byStatus = (value: string) => receipts.filter((receipt) => receipt.status === value);
  const completed = byStatus("completed");
  const sum = (field: "totalAmount" | "discountTotal") =>
    completed.reduce((total, receipt) => total + (Number(receipt[field]) || 0), 0);
  return {
    count: receipts.length,
    completed: completed.length,
    held: byStatus("held").length,
    returned: byStatus("returned").length,
    cancelled: byStatus("draft").length,
    revenue: String(sum("totalAmount")),
    discountTotal: String(sum("discountTotal")),
  };
};
