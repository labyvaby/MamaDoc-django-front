/**
 * Иконка категории у номера в шахматке (RoomBookingGrid) — раньше значок («люкс») был
 * только у одной категории, по просьбе теперь у каждой своя иконка: строки группируются
 * по этажу, не по категории (см. roomBookingFloors.ts), и иконка встаёт на место
 * прежнего заголовка секции как признак категории.
 *
 * Категория — вольный текст (HotelRoomType.name/code), поэтому иконка не читается по
 * названию. Первая версия просто пускала категории по кругу из 6 иконок подряд —
 * по обратной связи получалось не «своя иконка каждой категории», а произвольная (двум
 * похожим категориям, стоящим в каталоге рядом, доставались случайные несвязанные
 * иконки). Вместо этого иконка теперь идёт от РЕАЛЬНЫХ числовых полей категории —
 * вместимости (capacity, adultsCapacity/childrenCapacity уже сведены бэкендом в
 * capacity) — а не от текста, который пришлось бы угадывать регэкспом по русским
 * синонимам (ненадёжно, см. roomCapacityBucket): категория на двоих получает
 * иконку кровати, на четверых-шестерых — большего жилья, с детьми — колыбель.
 * Люкс (isLuxury) — всегда корона, вне вместимости, тот же смысл, что раньше нёс
 * отдельный бейдж.
 *
 * Категориям с ОДИНАКОВОЙ вместимостью (частый случай — «Стандарт» и «Комфорт» часто
 * отличаются только удобствами/ценой, не числом гостей) по-прежнему нужны разные
 * иконки — внутри вместимости они идут по кругу из 2–4 вариантов (BUCKET_ICON_KEYS),
 * в порядке sortOrder категорий объекта. Настоящее название категории — в подсказке
 * (Tooltip) у иконки в RoomBookingGrid.tsx.
 */

/** Ключи иконок; сами React-компоненты — в RoomBookingGrid.tsx (этот модуль без JSX, для тестов). */
export type RegularRoomIconKey =
  | "singleBed"
  | "chair"
  | "kingBed"
  | "bed"
  | "roomPreferences"
  | "bedroomParent"
  | "meetingRoom"
  | "doorFront"
  | "crib"
  | "groups"
  | "cottage"
  | "holidayVillage"
  | "castle"
  | "house";
export type RoomCategoryIconKey = RegularRoomIconKey | "luxury";

export type RoomCapacityBucket = "single" | "double" | "family" | "multi" | "large";

export interface RoomTypeForIcon {
  id: number;
  isLuxury: boolean;
  sortOrder: number;
  /** = adultsCapacity + childrenCapacity, как считает бэкенд (HotelRoomType.capacity). */
  capacity: number;
  childrenCapacity: number;
}

/**
 * Вместимость → смысловая группа иконок. Дети в категории — сильный сигнал «семейный
 * номер» независимо от общей вместимости, поэтому проверяется первым.
 */
export function roomCapacityBucket(capacity: number, childrenCapacity: number): RoomCapacityBucket {
  if (childrenCapacity > 0) return "family";
  if (capacity <= 1) return "single";
  if (capacity === 2) return "double";
  if (capacity <= 4) return "multi";
  return "large";
}

/**
 * Варианты внутри одной группы вместимости — категории с одинаковой вместимостью
 * (частый случай) всё равно получают разные иконки, по кругу в порядке sortOrder.
 */
const BUCKET_ICON_KEYS: Record<RoomCapacityBucket, readonly RegularRoomIconKey[]> = {
  single: ["singleBed", "chair"],
  double: ["kingBed", "bed", "roomPreferences"],
  multi: ["bedroomParent", "meetingRoom", "doorFront"],
  family: ["crib", "groups"],
  large: ["cottage", "holidayVillage", "castle", "house"],
};

/** Ключ иконки для одной категории по группе вместимости и месту внутри неё. */
export function roomCategoryIconKey(bucket: RoomCapacityBucket, indexInBucket: number): RegularRoomIconKey {
  const keys = BUCKET_ICON_KEYS[bucket];
  return keys[indexInBucket % keys.length];
}

/** roomTypeId → ключ иконки, для всех категорий объекта разом. */
export function buildRoomCategoryIconKeys(roomTypes: readonly RoomTypeForIcon[]): Map<number, RoomCategoryIconKey> {
  const sorted = [...roomTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const bucketCounts: Partial<Record<RoomCapacityBucket, number>> = {};
  const map = new Map<number, RoomCategoryIconKey>();
  for (const rt of sorted) {
    if (rt.isLuxury) {
      map.set(rt.id, "luxury");
      continue;
    }
    const bucket = roomCapacityBucket(rt.capacity, rt.childrenCapacity);
    const indexInBucket = bucketCounts[bucket] ?? 0;
    bucketCounts[bucket] = indexInBucket + 1;
    map.set(rt.id, roomCategoryIconKey(bucket, indexInBucket));
  }
  return map;
}
