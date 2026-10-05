/**
 * Ряды ленты дня одной группы (специалиста): приёмы и свободные окна в порядке
 * времени плюс место линии «сейчас». Чистые функции — их проверяют юнит-тесты,
 * компонент только рисует результат.
 */
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../api/appointments";
import type { PrepaidHold } from "./prepaidHolds";

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

/**
 * Одна плашка окна на время в группе. Окна строятся несколькими ветками
 * (между приёмами, на месте отменённого, перед первым, по сменам), и разные
 * ветки могут прийти к одному времени: 13:00 активный, 13:30 отменён, 14:00
 * активный — окно 13:30 давали и промежуток 13:00→14:00, и отменённая запись.
 * Оставляем первое по порядку, приёмы не трогаем.
 */
export function dedupeGapsByTime(items: RenderItem[]): RenderItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!isGap(item)) return true;
    if (seen.has(item.dateIso)) return false;
    seen.add(item.dateIso);
    return true;
  });
}

export type ListRow = { /** Над этим рядом рисуется линия «сейчас». */ nowLine: boolean } & (
  | { kind: "gaps"; gaps: GapSlot[] }
  | { kind: "appt"; appt: DjangoAppointment }
  | { kind: "hold"; hold: PrepaidHold }
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
export function buildListRows(
  items: RenderItem[],
  nowTs: number | null,
  mergeGaps: boolean,
  /**
   * Какие элементы вообще могут нести линию «сейчас». По умолчанию — любые.
   * Панель исключает отменённые приёмы: они уведены в конец группы, и линия
   * «сейчас» над отменённой строкой внизу ленты указывала бы не на то место дня.
   */
  isNowLineEligible: (item: RenderItem) => boolean = () => true,
): ListRow[] {
  const nowLineItemId =
    nowTs == null
      ? null
      : (items.find((item) => isNowLineEligible(item) && itemStartTs(item) >= nowTs)?.id ?? null);
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

function rowStartTs(row: ListRow): number {
  if (row.kind === "gaps") return dayjs(row.gaps[0].dateIso).valueOf();
  if (row.kind === "hold") return row.hold.start;
  return dayjs(row.appt.scheduledAt).valueOf();
}

/**
 * Вставляет брони с предоплатой (см. prepaidHolds.ts) в ряды группы по времени.
 * Хвост группы (`isTailRow` — отменённые приёмы, уведённые вниз) брони не
 * обгоняют: они встают перед ним. Линия «сейчас» переезжает на бронь, если та
 * оказалась первым ещё не начавшимся элементом.
 */
export function interleaveHolds(
  rows: ListRow[],
  holds: PrepaidHold[],
  nowTs: number | null,
  isTailRow: (row: ListRow) => boolean = () => false,
): ListRow[] {
  if (holds.length === 0) return rows;
  const result = [...rows];
  for (const hold of [...holds].sort((a, b) => a.start - b.start)) {
    let index = result.findIndex((row) => isTailRow(row) || rowStartTs(row) > hold.start);
    if (index === -1) index = result.length;
    result.splice(index, 0, { kind: "hold", hold, nowLine: false });
  }
  if (nowTs == null) return result;
  const firstUpcoming = result.findIndex((row) => !isTailRow(row) && rowStartTs(row) >= nowTs);
  if (firstUpcoming !== -1 && result[firstUpcoming].kind === "hold") {
    return result.map((row, i) => ({ ...row, nowLine: i === firstUpcoming }));
  }
  return result;
}
