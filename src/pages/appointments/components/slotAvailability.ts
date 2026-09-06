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
 * Занятость по СОТРУДНИКУ, а не по группе списка.
 *
 * Окна раньше считались от приёмов одной группы и уже ПОСЛЕ фильтров. Приём,
 * который в группу не попал (исполнитель указан только в другой строке услуги,
 * приём скрыт фильтром или поиском), слот не закрывал — регистратура рисовала
 * «Есть окно на 09:00» поверх занятого времени. Ключ — id исполнителя строки
 * услуги: именно по нему список группируется и по нему же сервер проверяет
 * пересечение при сохранении.
 *
 * На вход нужен ПОЛНЫЙ список приёмов дня, до фильтров: фильтр меняет то, что
 * показываем, а не то, что занято.
 */
export function busyIntervalsByEmployee(
  appts: DjangoAppointment[],
): Map<number, BusyInterval[]> {
  const byEmployee = new Map<number, BusyInterval[]>();
  for (const appt of appts) {
    if (isCancelledStatus(appt.status)) continue;
    const interval: BusyInterval = {
      start: dayjs(appt.scheduledAt).startOf("minute").valueOf(),
      end: appointmentEnd(appt).valueOf(),
    };
    for (const line of appt.services ?? []) {
      const id = line.employee?.id;
      if (id == null) continue;
      const list = byEmployee.get(id) ?? [];
      list.push(interval);
      byEmployee.set(id, list);
    }

    // Старые приёмы могут хранить исполнителя только в legacy-поле самого
    // приёма, без employee в строке услуги. Бэкенд учитывает оба варианта в
    // режиме окон, поэтому список должен закрывать эту же занятость.
    const legacyId = appt.employee?.id;
    if (legacyId != null) {
      const list = byEmployee.get(legacyId) ?? [];
      list.push(interval);
      byEmployee.set(legacyId, list);
    }
  }
  return byEmployee;
}

/**
 * Слот занят, если попадает внутрь активного приёма. Конец полуоткрыт: приём
 * 14:00–15:00 не блокирует слот на 15:00 — там уже можно записывать.
 */
export function isSlotCovered(intervals: BusyInterval[], t: number): boolean {
  return intervals.some((iv) => t >= iv.start && t < iv.end);
}
