/**
 * Группировка номеров по этажам для шахматки (RoomBookingGrid) — по образцу макета
 * «Терра» (сентябрь 2026, hotel-32-room-planner). Раньше строки группировались по
 * категориям (заголовок «Стандарт»/«Люкс»), теперь по этажу (HotelCalendarRoom.floor —
 * свободная строка, заполняется в форме номера, см. HotelRoomFormPage.tsx); категория
 * показывается иконкой у самого номера (см. roomCategoryIcons.ts), а не заголовком секции.
 *
 * Этаж — вольный текст, не обязательно число («Цоколь», «Мансарда»): группы сортируются
 * численно, когда это возможно (localeCompare с numeric:true — «2» раньше «10», а не как
 * строки), иначе по алфавиту; номера без этажа (пустая строка) собираются в отдельную
 * группу и идут последними, а не теряются молча. Внутри этажа номера идут по номеру
 * комнаты тем же численно-текстовым порядком.
 */
export interface FloorGroup<T> {
  /** Точное значение HotelCalendarRoom.floor; "" — этаж не указан. */
  floor: string;
  rooms: T[];
}

const collate = (a: string, b: string) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });

export function groupRoomsByFloor<T extends { floor: string; number: string }>(
  rooms: readonly T[],
): FloorGroup<T>[] {
  const byFloor = new Map<string, T[]>();
  for (const room of rooms) {
    const key = room.floor?.trim() ?? "";
    const arr = byFloor.get(key);
    if (arr) arr.push(room);
    else byFloor.set(key, [room]);
  }
  // Пустой этаж — не первый по алфавиту/числу, а последний: "без этажа" ближе к
  // "не важно, где" и не должен разрывать нумерованный порядок сверху списка.
  const floors = [...byFloor.keys()].sort((a, b) => {
    if (a === "" || b === "") return a === b ? 0 : a === "" ? 1 : -1;
    return collate(a, b);
  });
  return floors.map((floor) => ({
    floor,
    rooms: [...byFloor.get(floor)!].sort((a, b) => collate(a.number, b.number)),
  }));
}

/** «1 этаж» / «Мансарда» / «Без этажа» — сама подпись в обычном регистре, капс — CSS text-transform в компоненте. */
export function floorGroupLabel(floor: string): string {
  const trimmed = floor.trim();
  if (!trimmed) return "Без этажа";
  return /^\d+$/.test(trimmed) ? `${trimmed} этаж` : trimmed;
}

/** «1 номер» / «2 номера» / «5 номеров» — обычное русское склонение количества. */
export function pluralRooms(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "номеров";
  if (mod10 === 1) return "номер";
  if (mod10 >= 2 && mod10 <= 4) return "номера";
  return "номеров";
}
