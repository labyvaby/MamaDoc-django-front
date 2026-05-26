export const formatKGS = (value: number | string | null | undefined): string => {
  const num = Number(value ?? 0);
  // Use Russian locale with KGS currency, no fractional part typically displayed
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "KGS",
    maximumFractionDigits: 0,
  }).format(num);
};

/**
 * Форматирует дату в вид `дд.мм.гггг`.
 * Принимает `Date` или строку (ISO "YYYY-MM-DD" / "YYYY-MM-DDTHH:MM[:SS]" и т.п.).
 * В случае некорректного значения возвращает пустую строку, чтобы не ломать интерфейс.
 */
export const formatDateRu = (
  value: string | Date | null | undefined,
): string => {
  if (!value) return "";

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `${dd}.${mm}.${yyyy}`;
};

/**
 * Вычисляет возраст с точностью до месяцев.
 * Возвращает строку вида "(X лет и Y месяцев)", "(X месяцев)", "(X лет)" и т.д.
 */
export function calculateAgeWithMonths(birthDateStr: string | Date): string {
  const birthDate = birthDateStr instanceof Date ? birthDateStr : new Date(birthDateStr);
  const now = new Date();

  if (isNaN(birthDate.getTime())) return "";
  let y = now.getFullYear() - birthDate.getFullYear();
  let m = now.getMonth() - birthDate.getMonth();
  if (now.getDate() < birthDate.getDate()) {
    m--;
  }
  if (m < 0) {
    m += 12;
    y--;
  }

  const getDeclension = (number: number, titles: [string, string, string]): string => {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[
      number % 100 > 4 && number % 100 < 20
        ? 2
        : cases[number % 10 < 5 ? number % 10 : 5]
    ];
  };

  const yearStr = getDeclension(y, ["год", "года", "лет"]);
  const monthStr = getDeclension(m, ["месяц", "месяца", "месяцев"]);

  if (y === 0 && m === 0) return "(меньше месяца)";
  if (y === 0) return `(${m} ${monthStr})`;
  if (m === 0) return `(${y} ${yearStr})`;

  return `(${y} ${yearStr} и ${m} ${monthStr})`;
}
