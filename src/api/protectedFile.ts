import { API_BASE, ApiError } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Файлы документов AIVIO (ЭДО, «Документы CRM») отдаются только защищённой
 * ручкой: с сессией и организацией вызывающего, `Content-Disposition:
 * attachment`. Прямые `/media/...` закрыты, поэтому `<a href>` на ссылку из
 * ответа не годится — качаем fetch-ем в blob.
 *
 * Бэк присылает абсолютный URL своего домена; в dev фронт ходит через прокси,
 * и чужой origin с куками упал бы на CORS — берём из ссылки путь после `/api`
 * и шлём его через тот же базовый адрес, что и остальные запросы.
 */
export function protectedFilePath(url: string): string {
  const index = url.indexOf("/api/");
  if (index < 0) return url;
  return `${API_BASE}${url.slice(index + "/api".length)}`;
}

/** Имя файла из `Content-Disposition` (в т. ч. `filename*=utf-8''…`). */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=(?:utf-8|UTF-8)''([^;]+)/.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return encoded[1];
    }
  }
  const plain = /filename="?([^";]+)"?/.exec(header);
  return plain ? plain[1] : null;
}

export async function fetchProtectedFile(url: string, scope?: RealtyScope): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await fetch(protectedFilePath(url), { credentials: "include", headers: realtyHeaders(scope) });
  if (response.status === 401) window.dispatchEvent(new Event("mamadoc:api-unauthorized"));
  if (!response.ok) {
    const message = response.status === 404 ? "Файл не найден или недоступен" : `Не удалось получить файл (${response.status})`;
    throw new ApiError(message, response.status, null);
  }
  return { blob: await response.blob(), fileName: fileNameFromDisposition(response.headers.get("Content-Disposition")) };
}

/** Скачать файл под исходным именем. */
export async function downloadProtectedFile(url: string, fallbackName: string, scope?: RealtyScope): Promise<void> {
  const { blob, fileName } = await fetchProtectedFile(url, scope);
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName || fallbackName || "file";
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
