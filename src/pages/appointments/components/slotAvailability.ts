import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";

/**
 * Занятость слотов на регистратуре.
 *
 * Модель занятости здесь обязана совпадать с серверной: при сохранении бэкенд
 * отклоняет приём по ПЕРЕСЕЧЕНИЮ ИНТЕРВАЛОВ (get_overlapping_appointments:
 * existing.starts_at < ends AND existing.ends_at > starts), а не по совпадению
 * времени начала. Пока фронт сравнивал только начала и считал приём
 * 30-минутным, регистратура видела «свободно» на слоте, который сервер затем
 * не принимал с ошибкой «Сотрудник уже занят в это время».
 */

/** Фолбэк длительности — только для приёмов без endsAt (старые payload'ы). */
export const DEFAULT_DURATION_MINS = 30;

export const isCancelledStatus = (s?: string | null) =>
  s === "canceled" || s === "cancelled" || s === "no_show";

/**
 * Реальный конец приёма. Бэк считает его как начало + СУММА длительностей всех
 * строк услуг, поэтому приём с несколькими услугами длиннее 30 минут: добавили
 * услугу — приём вырос и может накрыть соседний слот.
 */
export function appointmentEnd(a: DjangoAppointment): dayjs.Dayjs {
  return a.endsAt
    ? dayjs(a.endsAt)
    : dayjs(a.scheduledAt).add(DEFAULT_DURATION_MINS, "minute");
}

export interface BusyInterval {
  start: number;
  end: number;
}

/** Занятые интервалы активных (неотменённых) приёмов. */
export function busyIntervals(appts: DjangoAppointment[]): BusyInterval[] {
  return appts
    .filter((a) => !isCancelledStatus(a.status))
    .map((a) => ({
      start: dayjs(a.scheduledAt).startOf("minute").valueOf(),
      end: appointmentEnd(a).valueOf(),
    }));
}

/**
 * Слот занят, если попадает внутрь активного приёма. Конец полуоткрыт: приём
 * 14:00–15:00 не блокирует слот на 15:00 — там уже можно записывать.
 */
export function isSlotCovered(intervals: BusyInterval[], t: number): boolean {
  return intervals.some((iv) => t >= iv.start && t < iv.end);
}
