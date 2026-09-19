/**
 * Ряды ленты дня одной группы (специалиста): приёмы и свободные окна в порядке
 * времени плюс место линии «сейчас». Чистые функции — их проверяют юнит-тесты,
 * компонент только рисует результат.
 */
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";

export type GapSlot = {
  isGap: true;
  id: string;
  timeStr: string;
  dateIso: string;
  /** Исполнитель группы, в которой стоит окно (null — группа «без специалиста»). */
  employeeId: number | null;
};

export type RenderItem = DjangoAppointment | GapSlot;

export function isGap(item: RenderItem): item is GapSlot {
  return (item as GapSlot).isGap === true;
}

/** Начало элемента ленты: у окна — dateIso (локальное время без зоны), у приёма — scheduledAt. */
export function itemStartTs(item: RenderItem): number {
  return dayjs(isGap(item) ? item.dateIso : item.scheduledAt).valueOf();
}

export type ListRow = { /** Над этим рядом рисуется линия «сейчас». */ nowLine: boolean } & (
  | { kind: "gaps"; gaps: GapSlot[] }
  | { kind: "appt"; appt: DjangoAppointment }
);

/**
 * Собирает ряды группы. Линия «сейчас» встаёт над первым элементом — приёмом
 * ИЛИ окном, — который ещё не начался: окно 09:00 стоит в ленте выше приёма
 * 09:30, и в 06:41 линия должна быть над окном, а не между ним и приёмом.
 * Прошедшие приёмы остаются выше линии — регистратуре нужен и вопрос «кто был
 * только что». `nowTs` null — не сегодняшний день, линии нет.
 *
 * На телефоне (`mergeGaps`) подряд идущие окна сливаются в один ряд (GapRun),
 * но ряд рвётся перед окном, над которым стоит линия: иначе она оказалась бы
 * и над уже прошедшими окнами того же ряда.
 */
export function buildListRows(items: RenderItem[], nowTs: number | null, mergeGaps: boolean): ListRow[] {
  const nowLineItemId =
    nowTs == null ? null : (items.find((item) => itemStartTs(item) >= nowTs)?.id ?? null);
  const rows: ListRow[] = [];
  for (const item of items) {
    const nowLine = item.id === nowLineItemId;
    if (isGap(item)) {
      const last = rows[rows.length - 1];
      if (mergeGaps && !nowLine && last?.kind === "gaps") last.gaps.push(item);
      else rows.push({ kind: "gaps", gaps: [item], nowLine });
    } else {
      rows.push({ kind: "appt", appt: item, nowLine });
    }
  }
  return rows;
}
