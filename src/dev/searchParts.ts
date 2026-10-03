/**
 * Поиск по частям — то же правило, что на сервере (be: server/apps/hotel/search.py),
 * для списков, которые фильтруются в браузере (отчёт «Заезды»). Запрос режется на
 * слова; каждое слово должно найтись хоть в одном поле, все слова — сразу.
 * «Иван Иванов» находит «Иванов Иван», «Бекова 201» — бронь Бековой в 201-м,
 * «Королев» — «Королёва». Телефон — по цифрам: «0555 58-88-74» и
 * «+996 (555) 58 88 74» — один номер. Короткие числа («2», «17») — только номер
 * брони или комнаты целиком, а не часть каждого документа с двойкой.
 */

const PHONE_LIKE = /^[\d\s()+\-.]+$/;
const MAX_WORDS = 6;
/** Столько цифр в «телефонном» запросе — это один телефон, а не несколько чисел. */
const PHONE_MIN_DIGITS = 7;
/** Короче — номер комнаты или брони, по телефонам не ищем. */
const PHONE_PART_MIN_DIGITS = 3;

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Регистр и ё — как сравниваются имена. */
export const foldText = (value: string | null | undefined): string => (value ?? "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");

export function searchWords(query: string | null | undefined): string[] {
  const q = (query ?? "").trim();
  if (!q) return [];
  if (PHONE_LIKE.test(q) && digitsOf(q).length >= PHONE_MIN_DIGITS) return [digitsOf(q)];
  return q.split(/[\s,;]+/).filter(Boolean).slice(0, MAX_WORDS);
}

export function phoneVariants(word: string): string[] {
  const digits = digitsOf(word);
  if (digits.length < PHONE_PART_MIN_DIGITS) return [];
  return digits.startsWith("0") && digits.length > PHONE_PART_MIN_DIGITS ? [digits, digits.slice(1)] : [digits];
}

export interface SearchableFields {
  /** Имена, юрлица, номер брони канала — по части слова, е = ё. */
  texts?: (string | null | undefined)[];
  /** Телефоны — по цифрам. */
  phones?: (string | null | undefined)[];
  /** Номер комнаты, номер брони — слово целиком. */
  exact?: (string | number | null | undefined)[];
}

/** Каждое слово запроса нашлось хоть в одном поле. Пустой запрос — подходит всё. */
export function matchesByParts(query: string | null | undefined, fields: SearchableFields): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const texts = (fields.texts ?? []).map(foldText).filter(Boolean);
  const phones = (fields.phones ?? []).map((p) => digitsOf(p ?? "")).filter(Boolean);
  const exact = (fields.exact ?? []).filter((v) => v != null && v !== "").map((v) => foldText(String(v)));
  return words.every((word) => {
    const w = foldText(word);
    const shortNumber = /^\d+$/.test(word) && word.length < PHONE_PART_MIN_DIGITS;
    if (exact.includes(w)) return true;
    if (!shortNumber && texts.some((t) => t.includes(w))) return true;
    return phoneVariants(word).some((v) => phones.some((p) => p.includes(v)));
  });
}
