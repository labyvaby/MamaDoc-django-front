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
 * Количество из decimal-строки бэка («2.000», «-1.000») в человеческий вид:
 * «2», «-1», «2,5». Хвостовые нули смысла не несут, разделитель — запятая (ru).
 * Пустое значение и мусор → «—» (остаток бывает неизвестен: склада у филиала нет).
 *
 * Без Intl намеренно: для ru-RU знак минуса зависит от сборки ICU (ASCII `-`
 * против типографского `−`), и вывод расходился между браузером и Node в тестах.
 */
export const formatQuantity = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const rounded = Math.round(num * 1000) / 1000;
  return String(rounded).replace(".", ",");
};

/**
 * Процент скидки от суммы до скидки; null — считать не из чего.
 *
 * Единая точка расчёта: процент показывают чип приёма, строка «Итого» в списке
 * и блок оплаты в карточке — они обязаны совпадать. Округление до 100%
 * разрешено, только когда скидка действительно покрывает весь чек: «100%»
 * читается как «платить нечего», и округлённые 99.6% выдали бы пациента без
 * оплаты.
 */
export const discountPercentOf = (
  total: number | string | null | undefined,
  discount: number | string | null | undefined,
): number | null => {
  const t = Number(total ?? 0);
  const d = Number(discount ?? 0);
  if (!(d > 0) || !(t > 0)) return null;
  if (d >= t) return 100;
  return Math.min(99, Math.round((d / t) * 100));
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
