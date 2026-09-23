/**
 * Сессия уволенного сотрудника.
 *
 * Увольнение выключает членство в организации, но открытая вкладка держала
 * живую сессию и показывала пустой кабинет. Бэк закрывает такую сессию на
 * ближайшем /auth/me или /auth/context и отвечает 401 с `reason: "no_access"`.
 * Приложение уводит на /login, а эта записка переносит туда объяснение —
 * иначе человек видит голую форму и снова просит код, который не придёт.
 *
 * Записка лежит в localStorage, а не в sessionStorage: сессию закрывает одна
 * вкладка, а остальные вкладки того же человека получают уже обычный 401 без
 * причины — объяснение должно дойти и до них. Срок жизни короткий, чтобы
 * записка не всплыла у следующего, кто войдёт с этого компьютера.
 */
const KEY = "mamadoc:access-ended";
const TTL_MS = 15 * 60 * 1000;

type Note = { message: string; at: number };

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Текст отказа, если ответ — закрытая из-за увольнения сессия; иначе `null`. */
export function accessEndedMessage(status: number, payload: unknown): string | null {
  if (status !== 401 || !payload || typeof payload !== "object") return null;
  const p = payload as { reason?: unknown; error?: unknown };
  if (p.reason !== "no_access") return null;
  return typeof p.error === "string" && p.error ? p.error : null;
}

export function rememberAccessEnded(message: string, now = Date.now()): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ message, at: now } satisfies Note));
  } catch {
    // приватный режим / выключенное хранилище — без записки, не страшно
  }
}

/** Прочитать записку, не удаляя (инициализатор useState зовётся дважды в StrictMode). */
export function peekAccessEnded(now = Date.now()): string | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const note = JSON.parse(raw) as Partial<Note>;
    if (typeof note.message !== "string" || typeof note.at !== "number") return null;
    if (now - note.at > TTL_MS) return null;
    return note.message;
  } catch {
    return null;
  }
}

export function clearAccessEnded(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // см. rememberAccessEnded
  }
}
