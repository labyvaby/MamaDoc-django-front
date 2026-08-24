import type {
  AvailabilityAppointment,
  AvailabilityDay,
  AvailabilitySlot,
} from "../../api/scheduling";

/** Строка дня в виде «Окна»: окно сетки (свободное/прошедшее) либо приём. */
export type TimelineRow =
  | { kind: "slot"; key: string; start: string; slot: AvailabilitySlot }
  | { kind: "appt"; key: string; start: string; appt: AvailabilityAppointment };

/**
 * Строки дня: свободные окна сетки + фактические приёмы, по времени.
 *
 * Занятые слоты выбрасываем: их время принадлежит сетке, а не приёму. Приём
 * 11:45–12:15 при шаге 30 минут занимает слоты 11:30 и 12:00 — раньше он и
 * показывался дважды, и с чужим временем. Одна строка приёма с настоящим
 * временем правдивее двух строк сетки.
 *
 * В схеме бэка `appointments` обязателен (подтверждено 21.08.2026), но
 * рантайм-проверку оставляем: прод стоит на ветке `deploy/*`, и на стенде со
 * старым бэком без неё вид упал бы. undefined — рисуем сетку как есть, чтобы
 * не остаться вообще без занятых окон.
 */
export function buildTimeline(day: AvailabilityDay): TimelineRow[] {
  const appts = day.appointments;
  const gridSlots = appts ? day.slots.filter((s) => s.appointmentId == null) : day.slots;
  const rows: TimelineRow[] = gridSlots.map((slot) => ({
    kind: "slot",
    key: `s-${slot.start}`,
    start: slot.start,
    slot,
  }));
  for (const appt of appts ?? []) {
    rows.push({ kind: "appt", key: `a-${appt.id}-${appt.start}`, start: appt.start, appt });
  }
  // 'HH:MM' с ведущими нулями сравнивается как строка.
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}
