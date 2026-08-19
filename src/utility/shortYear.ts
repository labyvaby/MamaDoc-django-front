/**
 * Как разворачивать короткий год (пользователь ввел 1–2 цифры вместо 4):
 * - `past` — ближайший год в прошлом: «27» → 1927, «20» → 2020 (дата рождения, найм, расход)
 * - `future` — ближайший год в будущем: «27» → 2027 (срок годности, срок задачи)
 * - `nearest` — ближайший к текущему в любую сторону (смены, фильтры периодов)
 * - `off` — не трогать ввод
 */
export type ShortYearMode = "past" | "future" | "nearest" | "off";

/**
 * Развернуть короткий год в четырёхзначный.
 * Вынесено из CustomDatePicker отдельным модулем: чистая функция без MUI-зависимостей,
 * чтобы покрываться юнит-тестами.
 */
export function expandShortYear(shortYear: number, mode: ShortYearMode, currentYear: number): number {
  if (mode === "off" || !Number.isInteger(shortYear) || shortYear < 0 || shortYear >= 100) return shortYear;

  const century = Math.floor(currentYear / 100) * 100;
  const candidates = [century - 100 + shortYear, century + shortYear, century + 100 + shortYear];

  if (mode === "past") {
    const past = candidates.filter((y) => y <= currentYear);
    return past.length ? past[past.length - 1] : candidates[0];
  }
  if (mode === "future") {
    return candidates.find((y) => y >= currentYear) ?? candidates[candidates.length - 1];
  }
  return candidates.reduce((best, y) => (Math.abs(y - currentYear) < Math.abs(best - currentYear) ? y : best));
}

const pad = (n: number, len: number) => String(n).padStart(len, "0");

type FieldParts = {
  day: number | null;
  month: number | null;
  year: number | null;
  hour: number | null;
  minute: number | null;
  second: number | null;
  /** Есть ли в формате секция дня: «YYYY-MM» нативного <input type="month"> её не имеет. */
  hasDay: boolean;
};

/**
 * Разобрать текст поля по его формату.
 *
 * Разбираем по слотам между разделителями, а не по цифрам подряд: незаполненные секции
 * MUI рисует плашками («27.07.0095 ЧЧ:мм»), и по числу цифр их с форматом не сопоставить.
 */
function parseFieldText(text: string, format: string): FieldParts | null {
  const tokens = format.match(/D{1,2}|M{1,2}|Y{2,4}|H{1,2}|m{1,2}|s{1,2}/g);
  const slots = text.split(/[^0-9\p{L}]+/u).filter(Boolean);
  if (!tokens || slots.length !== tokens.length) return null;

  const parts: FieldParts = {
    day: null,
    month: null,
    year: null,
    hour: null,
    minute: null,
    second: null,
    hasDay: tokens.some((token) => token.startsWith("D")),
  };

  tokens.forEach((token, i) => {
    const slot = slots[i];
    const num = /^\d+$/.test(slot) ? Number(slot) : null;
    if (token.startsWith("D")) parts.day = num;
    else if (token.startsWith("M")) parts.month = num;
    else if (token.startsWith("Y")) parts.year = num;
    else if (token.startsWith("H")) parts.hour = num;
    else if (token.startsWith("m")) parts.minute = num;
    else parts.second = num;
  });

  return parts;
}

/** Собрать ISO из разобранных частей с заданным годом. Null — если такой даты не существует. */
function buildIso(parts: FieldParts, year: number): string | null {
  const { day, month, hour, minute, second, hasDay } = parts;
  if (month === null || month < 1 || month > 12) return null;

  if (!hasDay) return `${pad(year, 4)}-${pad(month, 2)}`;
  if (day === null) return null;

  // 31.02 и подобное не «переносим» на март, а считаем неразобранным
  const iso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;

  // Время в формате есть, но ещё не набрано — отдаём одну дату, полночь подставит пикер
  if (hour === null) return iso;
  const min = minute ?? 0;
  const sec = second ?? 0;
  if (hour > 23 || min > 59 || sec > 59) return null;

  return `${iso}T${pad(hour, 2)}:${pad(min, 2)}:${pad(sec, 2)}`;
}

/**
 * Разобрать то, что набрано в поле даты (или даты со временем), и дописать век,
 * если год короче четырёх цифр.
 *
 * Работает с текстом, а не с датой из MUI X: пока в секции года меньше четырёх цифр,
 * пикер считает ввод невалидным и наружу отдаёт Invalid Date — развернуть год из него нельзя.
 *
 * @returns ISO `YYYY-MM-DD` (или `YYYY-MM-DDTHH:mm:ss`, если время уже набрано),
 *   либо null — если год уже полный, ввод неполный или дата не существует.
 */
export function expandShortYearInText(
  text: string,
  format: string,
  mode: ShortYearMode,
  currentYear: number,
): string | null {
  if (mode === "off") return null;
  if (!format.includes("YYYY")) return null; // двузначный формат года MUI X разворачивает сам

  const parts = parseFieldText(text, format);
  if (!parts || parts.year === null) return null;
  if (parts.year >= 100) return null; // год введен полностью — трогать нечего

  const expanded = expandShortYear(parts.year, mode, currentYear);
  if (expanded === parts.year) return null;

  return buildIso(parts, expanded);
}

/**
 * Собрать дату из набранного текста, подставив заданный год (год в тексте игнорируется).
 *
 * Нужно, чтобы зафиксировать год в момент нажатия второй цифры: к этому мгновению поле
 * показывает ещё только первую, а ждать перерисовки нельзя — быстрый набор уйдёт вперёд.
 */
export function buildIsoWithYear(text: string, format: string, year: number): string | null {
  const parts = parseFieldText(text, format);
  return parts ? buildIso(parts, year) : null;
}

/**
 * То же для нативных полей браузера (`type="date"`, `"datetime-local"`, `"month"`):
 * значение приходит в ISO, а короткий год браузер дополняет нулями («95» → «0095-07-27»).
 *
 * @returns исправленное значение в том же виде, что пришло, либо null — если менять нечего.
 */
export function expandShortYearInIso(value: string, mode: ShortYearMode, currentYear: number): string | null {
  const groups = value ? value.match(/\d+/g) : null;
  if (!groups) return null;

  const format = ["YYYY-MM", "YYYY-MM-DD", "YYYY-MM-DD HH", "YYYY-MM-DD HH:mm", "YYYY-MM-DD HH:mm:ss"][
    groups.length - 2
  ];
  if (!format) return null;

  // «T» между датой и временем — буква, а не разделитель: для разбора меняем её на пробел.
  const iso = expandShortYearInText(value.replace("T", " "), format, mode, currentYear);
  // Год в ISO всегда четырёхзначный («0095» → «1995»), длина не меняется — лишние
  // секунды, дописанные разбором, обрезаем, чтобы вернуть значение в исходном виде.
  return iso ? iso.slice(0, value.length) : null;
}

/**
 * Готовый `onBlur` для нативного поля даты: дописывает век по уходу из поля.
 * В `onChange` это делать нельзя — браузер шлёт его на каждую валидную комбинацию,
 * и набор «1995» превратился бы в 2019 → 2009 → 2005.
 */
export function shortYearInputBlur(mode: ShortYearMode, onFix: (value: string) => void) {
  return (event: { target: { value?: string } }) => {
    const fixed = expandShortYearInIso(event.target?.value ?? "", mode, new Date().getFullYear());
    if (fixed) onFix(fixed);
  };
}
