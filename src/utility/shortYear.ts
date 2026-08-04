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

/**
 * Разобрать то, что набрано в поле даты, и дописать век, если год короче четырёх цифр.
 *
 * Работает с текстом, а не с датой из MUI X: пока в секции года меньше четырёх цифр,
 * пикер считает ввод невалидным и наружу отдаёт Invalid Date — развернуть год из него нельзя.
 *
 * @returns дата в ISO `YYYY-MM-DD`, либо null — если год уже полный, ввод неполный или дата не существует.
 */
export function expandShortYearInText(
  text: string,
  format: string,
  mode: ShortYearMode,
  currentYear: number,
): string | null {
  if (mode === "off") return null;
  if (!format.includes("YYYY")) return null; // двузначный формат года MUI X разворачивает сам

  const tokens = format.match(/D{1,2}|M{1,2}|Y{2,4}/g);
  const groups = text.match(/\d+/g);
  if (!tokens || !groups || tokens.length !== groups.length) return null;

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  tokens.forEach((token, i) => {
    const num = Number(groups[i]);
    if (token.startsWith("D")) day = num;
    else if (token.startsWith("M")) month = num;
    else year = num;
  });

  if (day === null || month === null || year === null) return null;
  if (year >= 100) return null; // год введен полностью — трогать нечего

  const expanded = expandShortYear(year, mode, currentYear);
  if (expanded === year) return null;

  // 31.02 и подобное не «переносим» на март, а считаем неразобранным
  const iso = `${pad(expanded, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== expanded || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;

  return iso;
}
