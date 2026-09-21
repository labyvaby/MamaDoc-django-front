import type { HotelStayDisplayStatus } from "./hotelDisplay";

/**
 * Прозрачность заливки бара по статусу брони. Значков статуса на барах нет, поэтому
 * помимо цвета статус читается по плотности заливки: «Гость заехал» плотнее всех,
 * «Подтверждена» средняя, «Завершена» самая бледная (уже прошла). Образцы в легенде
 * берут те же числа. Подпись на любой из заливок — text.primary/secondary с контрастом
 * ≥ 4.5:1 (см. RoomBookingGrid).
 */
export function barFillAlpha(status: HotelStayDisplayStatus, dark: boolean): number {
  const light: Record<HotelStayDisplayStatus, number> = { confirmed: 0.16, arrived: 0.28, completed: 0.12 };
  const night: Record<HotelStayDisplayStatus, number> = { confirmed: 0.3, arrived: 0.44, completed: 0.22 };
  return (dark ? night : light)[status];
}

/**
 * Подпись бара брони в шахматке (RoomBookingGrid) в зависимости от его ширины.
 * Бар — это число ночей × ширина колонки дня, и при мелком масштабе одна ночь
 * занимает 20–40 px: имя гостя там не помещается. Чем уже бар, тем короче подпись:
 * имя целиком (обрезается «…», если не влезло) → инициалы → одна буква. Полное имя
 * и детали брони всегда в подсказке бара (title), поэтому ничего не теряется.
 */
export type BarLabelMode = "name" | "initials" | "initial";

/** С этой ширины бара (px) в нём читается хотя бы начало имени. */
export const BAR_NAME_MIN_PX = 84;
/** С этой ширины помещаются две буквы инициалов; уже — только одна. */
export const BAR_INITIALS_MIN_PX = 26;

export function barLabelMode(barPx: number): BarLabelMode {
  if (barPx >= BAR_NAME_MIN_PX) return "name";
  if (barPx >= BAR_INITIALS_MIN_PX) return "initials";
  return "initial";
}

/**
 * «Асанова Дана Ивановна» → «АД»: первые буквы первых двух слов. Слова без букв
 * (кавычки, дефис) пропускаются: «ООО «Ромашка»» → «ОР».
 */
export function guestInitials(name: string): string {
  const out: string[] = [];
  for (const word of name.trim().split(/\s+/)) {
    const letter = word.match(/\p{L}/u)?.[0];
    if (!letter) continue;
    out.push(letter.toLocaleUpperCase("ru"));
    if (out.length === 2) break;
  }
  return out.join("");
}

/** Текст бара по режиму; у брони без имени вместо инициалов — её номер («№123»). */
export function barLabelText(mode: BarLabelMode, customerName: string, reservationNumber: number): string {
  const name = customerName.trim();
  if (mode === "name") return name || `Бронь №${reservationNumber}`;
  const text = guestInitials(name) || `№${reservationNumber}`;
  return mode === "initial" ? (Array.from(text)[0] ?? "") : text;
}
