/**
 * Нормализация человеческих имён (ФИО пациента, сотрудника, название семьи).
 *
 * Регистратор набирает ФИО быстро и часто «как получилось»: то целиком строчными,
 * то с включённым Caps Lock. В списках и документах это выглядит неряшливо, а
 * поиск по началу слова — чувствителен к регистру не везде. Поэтому приводим
 * ввод к единому виду в момент, когда пользователь уходит из поля (и повторно —
 * перед отправкой формы, если он нажал Enter, не покидая поля).
 */

/**
 * Частицы, которые в имени пишутся со строчной буквы и никогда не бывают
 * самостоятельным именем. Кыргызстанские отчества («Айбек уулу Нурсултан»,
 * «Айгуль кызы Асель») — самый частый случай в клинике.
 */
const LOWERCASE_PARTICLES = new Set([
  "уулу",
  "кызы",
  "кизи",
  "гызы",
  "оглы",
  "оглу",
]);

/** Слово набрано целиком в верхнем регистре («ИВАНОВ»), а не «Иванов»/«иванов». */
function isAllUpperCase(word: string): boolean {
  return word === word.toUpperCase() && word !== word.toLowerCase();
}

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Одно слово (часть, разделённая пробелом или дефисом).
 *
 * Регистр остального слова сбиваем только у полностью заглавных слов: так
 * «ИВАНОВ» становится «Ивановым», но осознанно набранное «МакДональд» или
 * «оглы» остаётся как есть.
 */
function capitalizeWord(word: string, isFirst: boolean): string {
  if (!word) return word;
  const normalized = isAllUpperCase(word) ? word.toLowerCase() : word;
  // Первое слово имени частицей быть не может — «Уулу Нурсултан» так и оставим.
  if (!isFirst && LOWERCASE_PARTICLES.has(normalized.toLowerCase())) {
    return normalized.toLowerCase();
  }
  return upperFirst(normalized);
}

/**
 * ФИО «с большой буквы»: каждое слово с заглавной, лишние пробелы схлопнуты,
 * составные фамилии через дефис — обе части с заглавной.
 *
 * @example
 * capitalizeFullName("  иванов   иван ивановичь ") // "Иванов Иван Ивановичь"
 * capitalizeFullName("ПЕТРОВА-ВОДКИНА АННА")       // "Петрова-Водкина Анна"
 * capitalizeFullName("АЙБЕК УУЛУ НУРСУЛТАН")       // "Айбек уулу Нурсултан"
 */
export function capitalizeFullName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  let wordIndex = 0;
  return trimmed
    .split(" ")
    .map((token) =>
      // Дефис — часть одного слова: «петрова-водкина» → «Петрова-Водкина».
      token
        .split("-")
        .map((part) => capitalizeWord(part, wordIndex++ === 0))
        .join("-"),
    )
    .join(" ");
}
