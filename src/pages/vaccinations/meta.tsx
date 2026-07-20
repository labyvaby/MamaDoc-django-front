import dayjs from "dayjs";

import type { ScheduleStatus, VaccinationRecordStatus } from "../../api/vaccinations";

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
 * Место укола — набор для формы. Гайд подтверждает только "left_arm"; остальные
 * значения предположение фронта (открытый вопрос бэку). Если бэк использует
 * другие slug'и — правится только этот список.
 */
export const INJECTION_SITE_OPTIONS: { value: string; label: string }[] = [
  { value: "left_arm", label: "Левое плечо" },
  { value: "right_arm", label: "Правое плечо" },
  { value: "left_thigh", label: "Левое бедро" },
  { value: "right_thigh", label: "Правое бедро" },
  { value: "oral", label: "Перорально" },
  { value: "other", label: "Другое" },
];

const INJECTION_SITE_LABELS = new Map(INJECTION_SITE_OPTIONS.map((o) => [o.value, o.label]));

export function injectionSiteLabel(site: string): string {
  return site ? INJECTION_SITE_LABELS.get(site) ?? site : "—";
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
