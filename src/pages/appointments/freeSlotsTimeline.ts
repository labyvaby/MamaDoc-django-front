import type {
  AvailabilityAppointment,
  AvailabilityDay,
  AvailabilitySlot,
} from "../../api/scheduling";
import type { DayAbsence } from "./absenceHours";

/**
 * Строка дня в виде «Окна»: окно сетки (свободное/прошедшее), приём либо
 * интервал отсутствия врача (частичный выходной — см. absenceHours.ts).
 */
export type TimelineRow =
  | { kind: "slot"; key: string; start: string; slot: AvailabilitySlot }
  | { kind: "appt"; key: string; start: string; appt: AvailabilityAppointment }
  | { kind: "absence"; key: string; start: string; end: string };

/** 'HH:MM' → минуты от полуночи; строки формата бэка сравниваются как есть. */
function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** Пересекается ли слот с каким-нибудь приёмом дня по времени. */
function coveredByAppointment(
  slot: AvailabilitySlot,
  appts: AvailabilityAppointment[],
): boolean {
  const start = minutes(slot.start);
  const end = minutes(slot.end);
  return appts.some((a) => minutes(a.start) < end && start < minutes(a.end));
}

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
 *
 * Слоты `busyElsewhere`, накрытые приёмом из `appointments`, тоже выбрасываем.
 * В org-wide выдаче (суперпользователь без выбранного филиала) чужой приём
 * виден строкой сам по себе, а бэк параллельно гасит этим флагом слоты второй
 * смены на то же время — без фильтра одно и то же время встало бы в ленту
 * дважды: приёмом и глухим «занят в другом филиале».
 */
export function buildTimeline(day: AvailabilityDay, absence?: DayAbsence): TimelineRow[] {
  const appts = day.appointments;
  const gridSlots = appts
    ? day.slots.filter(
        (s) => s.appointmentId == null && !(s.busyElsewhere && coveredByAppointment(s, appts)),
      )
    : day.slots;
  const rows: TimelineRow[] = gridSlots.map((slot) => ({
    kind: "slot",
    // Ключ — пара (время, филиал): у сотрудника со сменами в двух филиалах
    // org-wide выдача даёт слоты обеих смен одним плоским списком, и одно и то
    // же время встречается дважды с разными branchId (ответ бэка 02.09.2026).
    key: `s-${slot.start}-${slot.branchId ?? "x"}`,
    start: slot.start,
    slot,
  }));
  for (const appt of appts ?? []) {
    rows.push({ kind: "appt", key: `a-${appt.id}-${appt.start}`, start: appt.start, appt });
  }
  // Часы отсутствия — своей строкой на своём месте: слотов там нет, и без неё
  // «врач ушёл в 14:00» неотличимо от «после 14:00 всё занято». Целодневное
  // отсутствие строкой не рисуем — его показывает заглушка над списком.
  if (absence && !absence.fullDay) {
    for (const range of absence.ranges) {
      rows.push({
        kind: "absence",
        key: `x-${range.start}-${range.end}`,
        start: range.start,
        end: range.end,
      });
    }
  }
  // 'HH:MM' с ведущими нулями сравнивается как строка.
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}
