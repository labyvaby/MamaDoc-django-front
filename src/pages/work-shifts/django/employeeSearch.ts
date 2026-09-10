/**
 * Поиск сотрудника в фильтре СКУД.
 *
 * Фильтруем на клиенте: список сотрудников грузится целиком (pageSize: 200) и
 * уже лежит в кэше, так что запрос к бэкенду на каждую букву ничего не даст.
 *
 * Отличия от стандартного фильтра MUI, ради которых написан свой:
 * - «ё» и «е» считаются одной буквой (в карточках встречается и «Королева»,
 *   и «Королёва» — искать должно находить обе);
 * - запрос режется на слова, и порядок слов не важен: «иван петров» находит
 *   «Петров Иван Сергеевич», хотя подстроки такой в имени нет.
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

/** Подходит ли ФИО под поисковый запрос. Пустой запрос подходит всем. */
export function matchesEmployeeQuery(fullName: string, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(fullName);
  return words.every((word) => haystack.includes(word));
}

/** Фильтр в форме, которую ждёт `Autocomplete.filterOptions`. */
export function filterEmployeesByQuery<T extends { fullName: string }>(
  options: T[],
  { inputValue }: { inputValue: string },
): T[] {
  return options.filter((option) => matchesEmployeeQuery(option.fullName, inputValue));
}
