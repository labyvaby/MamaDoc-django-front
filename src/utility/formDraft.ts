/**
 * Черновик формы в localStorage — общий механизм защиты от потери введённых
 * данных при случайном закрытии дровера (крестик, клик по фону, Esc).
 * Конкретная форма сама решает, что считать «пустым»/«без изменений» —
 * здесь только чтение/запись/TTL.
 */

export function readFormDraft<T extends { savedAt: number }>(
  storageKey: string,
  ttlMs: number,
): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const draft = JSON.parse(raw) as T;
    if (!draft?.savedAt || Date.now() - draft.savedAt > ttlMs) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeFormDraft<T extends object>(storageKey: string, data: T): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // localStorage недоступен (приватный режим, квота) — черновик просто не сохранится
  }
}

export function clearFormDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
