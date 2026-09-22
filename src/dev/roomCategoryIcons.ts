/**
 * Иконка категории у номера в шахматке (RoomBookingGrid) — раньше значок («люкс») был
 * только у одной категории, по просьбе теперь у каждой своя иконка: строки группируются
 * по этажу, не по категории (см. roomBookingFloors.ts), и иконка встаёт на место
 * прежнего заголовка секции как признак категории.
 *
 * Категория — вольный текст (HotelRoomType.name/code), поэтому иконка не читается по
 * названию, а назначается по порядку категорий объекта (sortOrder, потом id — тот же
 * порядок, что в «Категории и тарифы»): стабильна, пока порядок категорий не меняется,
 * и не требует своего поля на бэкенде. Люкс-категории (isLuxury) всегда получают корону —
 * тот же смысл, что раньше нёс отдельный бейдж, поэтому не участвуют в общем круге.
 * Настоящее название категории — в подсказке (Tooltip) у иконки в RoomBookingGrid.tsx;
 * сама иконка только даёт быстро различить категории взглядом по строкам одного этажа.
 */

/** Ключи иконок; сами React-компоненты — в RoomBookingGrid.tsx (этот модуль без JSX, для тестов). */
export const REGULAR_ROOM_ICON_KEYS = ["bed", "kingBed", "singleBed", "bedroomParent", "weekend", "villa"] as const;
export type RegularRoomIconKey = (typeof REGULAR_ROOM_ICON_KEYS)[number];
export type RoomCategoryIconKey = RegularRoomIconKey | "luxury";

export interface RoomTypeForIcon {
  id: number;
  isLuxury: boolean;
  sortOrder: number;
}

/** Ключ иконки для одной категории по её месту среди НЕ-люксовых категорий объекта. */
export function roomCategoryIconKey(indexAmongRegular: number, isLuxury: boolean): RoomCategoryIconKey {
  if (isLuxury) return "luxury";
  return REGULAR_ROOM_ICON_KEYS[indexAmongRegular % REGULAR_ROOM_ICON_KEYS.length];
}

/** roomTypeId → ключ иконки, для всех категорий объекта разом. */
export function buildRoomCategoryIconKeys(roomTypes: readonly RoomTypeForIcon[]): Map<number, RoomCategoryIconKey> {
  const sorted = [...roomTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const map = new Map<number, RoomCategoryIconKey>();
  let regularIndex = 0;
  for (const rt of sorted) {
    if (rt.isLuxury) {
      map.set(rt.id, "luxury");
      continue;
    }
    map.set(rt.id, roomCategoryIconKey(regularIndex, false));
    regularIndex += 1;
  }
  return map;
}
