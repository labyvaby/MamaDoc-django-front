/**
 * Расхождение часов компьютера с сервером — по заголовку Date ответов API.
 *
 * Отдельного запроса не делаем: apiRequest отмечает каждый ответ. Заголовок
 * точен до секунды, сравниваем с серединой запроса — погрешность до полсекунды
 * плюс половина времени запроса, поэтому медленные ответы отбрасываем. Порог
 * предупреждения (utils/deviceClock) — минуты, этого с запасом хватает.
 */

/** Ответы дольше этого для сверки не годятся: середина запроса слишком размыта. */
const MAX_ROUND_TRIP_MS = 30_000;

/** Меньшие колебания между запросами подписчикам не сообщаем. */
const SIGNIFICANT_CHANGE_MS = 30_000;

let publishedSkewMs: number | null = null;
const listeners = new Set<() => void>();

/** Время сервера минус время компьютера (мс); null — сверить нельзя. */
export function computeSkewMs(dateHeader: string | null, startedAt: number, receivedAt: number): number | null {
  if (!dateHeader) return null;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return null;
  const roundTrip = receivedAt - startedAt;
  // Отрицательная длительность — часы перевели посреди запроса.
  if (roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return null;
  // +500 мс: заголовок обрезан до целой секунды.
  return serverMs + 500 - (startedAt + roundTrip / 2);
}

export function noteServerClock(response: Pick<Response, "headers">, startedAt: number, receivedAt: number): void {
  let dateHeader: string | null = null;
  try {
    dateHeader = response.headers?.get("date") ?? null;
  } catch {
    // Моки fetch в тестах отдают заголовки чем угодно — сверка не важнее запроса.
    return;
  }
  const next = computeSkewMs(dateHeader, startedAt, receivedAt);
  if (next == null) return;
  if (publishedSkewMs != null && Math.abs(next - publishedSkewMs) < SIGNIFICANT_CHANGE_MS) return;
  publishedSkewMs = next;
  listeners.forEach((listener) => listener());
}

/** Для useSyncExternalStore. */
export const getServerSkewMs = (): number | null => publishedSkewMs;

export function subscribeServerSkew(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetServerClockForTests(): void {
  publishedSkewMs = null;
  listeners.clear();
}
