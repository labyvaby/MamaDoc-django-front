import dayjs from "dayjs";

import type {
  BatchWriteOffReason,
  ScheduleStatus,
  VaccinationRecordStatus,
} from "../../api/vaccinations";

/** Палитра-тон MUI (null — нейтральный) — та же система, что в задачах. */
export type ToneName = "warning" | "info" | "success" | "error" | null;

export const SCHEDULE_STATUS_META: Record<ScheduleStatus, { label: string; color: ToneName }> = {
  planned: { label: "Запланирована", color: "info" },
  overdue: { label: "Просрочена", color: "error" },
  done: { label: "Сделана", color: "success" },
  skipped: { label: "Пропущена", color: null },
};

export const SCHEDULE_STATUS_OPTIONS = (
  Object.keys(SCHEDULE_STATUS_META) as ScheduleStatus[]
).map((value) => ({ value, label: SCHEDULE_STATUS_META[value].label }));

/**
 * Статус записи о прививке. Гайд фиксирует только "pending" (в ответе) и приём
 * PATCH {status:"canceled"}; "done" и точные подписи — предположение фронта.
 */
export const RECORD_STATUS_META: Record<string, { label: string; color: ToneName }> = {
  pending: { label: "Проведена", color: "success" },
  done: { label: "Завершена", color: "success" },
  canceled: { label: "Отменена", color: "error" },
};

export function recordStatusMeta(status: VaccinationRecordStatus) {
  return RECORD_STATUS_META[status] ?? { label: String(status), color: null as ToneName };
}

/**
 * Место укола — набор для формы. Значения выверены по живому API 17.08.2026:
 * бэк принимает ровно `left_arm`, `right_arm`, `thigh`, `oral`, всё остальное
 * отбивает 400 «Invalid enum value». Прежний список фронта был угадан и
 * наполовину неверен: `left_thigh`/`right_thigh`/`other` роняли сохранение —
 * а бедро у младенцев основное место укола.
 *
 * Бэк не различает левое и правое бедро — просим добавить, тикет
 * `MamaDoc/backend_ticket_vaccinations_product_line_link.md`, п. 4.
 */
export const INJECTION_SITE_OPTIONS: { value: string; label: string }[] = [
  { value: "left_arm", label: "Левое плечо" },
  { value: "right_arm", label: "Правое плечо" },
  { value: "thigh", label: "Бедро" },
  { value: "oral", label: "Перорально" },
];

const INJECTION_SITE_LABELS = new Map(INJECTION_SITE_OPTIONS.map((o) => [o.value, o.label]));

export function injectionSiteLabel(site: string): string {
  return site ? INJECTION_SITE_LABELS.get(site) ?? site : "—";
}

/**
 * Причины списания доз партии. Slug'и — предложение фронта из тикета
 * `MamaDoc/backend_ticket_vaccinations_batch_writeoff.md` (бэк набор пока не
 * подтвердил): если он вернёт другие — правится только этот список.
 */
export const BATCH_WRITEOFF_REASON_OPTIONS: { value: BatchWriteOffReason; label: string }[] = [
  { value: "expired", label: "Истёк срок годности" },
  { value: "cold_chain", label: "Нарушение холодовой цепи" },
  { value: "damaged", label: "Повреждена / брак" },
  { value: "broken", label: "Разбита ампула" },
  { value: "lost", label: "Утеря / недостача" },
  { value: "other", label: "Другое" },
];

const BATCH_WRITEOFF_REASON_LABELS = new Map(
  BATCH_WRITEOFF_REASON_OPTIONS.map((o) => [o.value, o.label]),
);

export function batchWriteOffReasonLabel(reason: BatchWriteOffReason): string {
  return BATCH_WRITEOFF_REASON_LABELS.get(reason) ?? String(reason);
}

/** «1 доза» / «4 дозы» / «10 доз» — для подписей списаний и остатков. */
export function pluralDoses(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} доза`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} дозы`;
  return `${n} доз`;
}

// ── Человеческие сроки календаря ──────────────────────────────────────────────

export type ScheduleDateInfo = { text: string; overdue: boolean; soon: boolean };

/** «сегодня» / «завтра» / «через N дн» / «просрочено на N дн» (по scheduledDate). */
export function scheduleDateInfo(scheduledDate: string, status: ScheduleStatus): ScheduleDateInfo {
  const date = dayjs(scheduledDate);
  const today = dayjs().startOf("day");
  const diff = date.startOf("day").diff(today, "day");
  const closed = status === "done" || status === "skipped";
  if (closed) return { text: date.format("DD.MM.YYYY"), overdue: false, soon: false };
  const plural = (n: number) => (n === 1 ? "день" : n < 5 ? "дня" : "дней");
  if (diff < 0) {
    const n = Math.abs(diff);
    return { text: `просрочено на ${n} ${plural(n)}`, overdue: true, soon: false };
  }
  if (diff === 0) return { text: "сегодня", overdue: false, soon: true };
  if (diff === 1) return { text: "завтра", overdue: false, soon: true };
  if (diff <= 7) return { text: `через ${diff} ${plural(diff)}`, overdue: false, soon: true };
  return { text: `до ${date.format("DD.MM.YYYY")}`, overdue: false, soon: false };
}
