import { ApiError } from "./client";

/**
 * Сессия уволенного сотрудника.
 *
 * Увольнение выключает членство в организации, но открытая вкладка держала
 * живую сессию и показывала пустой кабинет. Бэк закрывает такую сессию на
 * ближайшем /auth/me (фронт перечитывает его при фокусе и после любого 403)
 * и отвечает 401 с `reason: "no_access"`. Приложение уводит на /login, а эта
 * записка переносит туда объяснение — иначе человек видит просто форму входа
 * и снова запрашивает код, который ему уже не придёт.
 */
const KEY = "mamadoc:access-ended";

/** Текст отказа, если это закрытая из-за увольнения сессия; иначе `null`. */
export function accessEndedMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 401) return null;
  const payload = error.payload as { reason?: unknown } | null;
  if (!payload || payload.reason !== "no_access") return null;
  return error.message || null;
}

export function rememberAccessEnded(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // приватный режим / выключенное хранилище — без записки, не страшно
  }
}

/** Прочитать записку, не удаляя (инициализатор useState зовётся дважды в StrictMode). */
export function peekAccessEnded(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearAccessEnded(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // см. rememberAccessEnded
  }
}
