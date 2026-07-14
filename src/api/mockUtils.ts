/**
 * Общие помощники mock-слоя модулей, работающих без бэка
 * (documents / cleaning / knowledge — см. флаги *_USE_MOCKS в api/<module>.ts).
 *
 * Схема модуля: `if (FLAG) → мок, else → apiRequest` — переключение на живой
 * бэк одним флагом. Новые mock-модули должны использовать эти помощники,
 * а не заводить свои копии.
 */

const MOCK_LATENCY_MS = 250;

/** Резолвит значение с задержкой, имитируя сетевой запрос. */
export function mockDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

/** DRF-подобный ответ пагинации: {results, count, next, previous}. */
export interface Paginated<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

/** Срез списка под DRF-пагинацию (для моков; page — 1-based). */
export function paginate<T>(list: T[], page = 1, pageSize = 20): Paginated<T> {
  const start = (page - 1) * pageSize;
  return {
    results: list.slice(start, start + pageSize),
    count: list.length,
    next: start + pageSize < list.length ? "mock" : null,
    previous: page > 1 ? "mock" : null,
  };
}

/**
 * Дописывает organizationId к пути — обязателен суперпользователю на
 * эндпоинтах, скоупленных по организации (иначе 400); значение берётся
 * из useApiOrgId. Такой же помощник живёт в api/tasks.ts (историческая
 * копия — модуль уже в проде, не трогаем без повода).
 */
export function withOrg(path: string, organizationId?: number): string {
  if (organizationId == null) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${organizationId}`;
}
