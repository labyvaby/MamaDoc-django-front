/**
 * Отложенная накладная — в браузере, не на сервере: поля формы в
 * localStorage, файлы (фото/PDF накладной) — в IndexedDB, потому что
 * localStorage держит только строки и в несколько мегабайт.
 *
 * Черновик один на организацию и на этот браузер. На другом устройстве
 * его не видно — осознанно: серверного статуса «черновик» у приёмки нет,
 * а проводить наполовину заполненный приход нельзя.
 *
 * Любая ошибка хранилища (приватный режим, переполнение) глотается: форма
 * от этого работать не перестаёт, пропадает только отложенная копия.
 */

const VERSION = 1;
const DB_NAME = "mamadoc-drafts";
const STORE = "receipt-files";

const keyOf = (organizationId: number | null | undefined) => `mamadoc.receiptDraft.v${VERSION}.${organizationId ?? "none"}`;

/** Что показать на стартовом экране, не разбирая весь черновик. */
export interface ReceiptDraftSummary {
  savedAt: string;
  supplierName: string | null;
  linesCount: number;
  filesCount: number;
}

export interface StoredReceiptDraft<T> {
  version: number;
  summary: ReceiptDraftSummary;
  form: T;
}

export function loadReceiptDraft<T>(organizationId: number | null | undefined): StoredReceiptDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(keyOf(organizationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReceiptDraft<T>;
    return parsed?.version === VERSION && parsed.form ? parsed : null;
  } catch {
    return null;
  }
}

export function saveReceiptDraft<T>(organizationId: number | null | undefined, summary: ReceiptDraftSummary, form: T): boolean {
  try {
    const body: StoredReceiptDraft<T> = { version: VERSION, summary, form };
    window.localStorage.setItem(keyOf(organizationId), JSON.stringify(body));
    return true;
  } catch {
    return false;
  }
}

export function clearReceiptDraft(organizationId: number | null | undefined): void {
  try {
    window.localStorage.removeItem(keyOf(organizationId));
  } catch {
    /* хранилище недоступно — удалять нечего */
  }
  void saveReceiptDraftFiles(organizationId, []);
}

// ── Файлы ────────────────────────────────────────────────────────────────

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

interface StoredFile {
  name: string;
  type: string;
  blob: Blob;
}

export async function saveReceiptDraftFiles(organizationId: number | null | undefined, files: File[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = keyOf(organizationId);
      if (files.length === 0) store.delete(key);
      else store.put(files.map((file): StoredFile => ({ name: file.name, type: file.type, blob: file })), key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* без IndexedDB черновик просто сохранится без файлов */
  }
}

export async function loadReceiptDraftFiles(organizationId: number | null | undefined): Promise<File[]> {
  try {
    const db = await openDb();
    const stored = await new Promise<StoredFile[] | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(keyOf(organizationId));
      request.onsuccess = () => resolve(request.result as StoredFile[] | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return (stored ?? []).map((item) => new File([item.blob], item.name, { type: item.type }));
  } catch {
    return [];
  }
}
