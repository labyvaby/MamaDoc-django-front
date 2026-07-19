export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const API_URL = API_BASE;

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Pass a FormData object to send multipart/form-data (skips JSON serialization) */
  formData?: FormData;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Extract a human-readable error message from a backend error payload.
 *
 * Handles the following shapes:
 *   { error: "..." }                       — DMR string error
 *   { detail: "..." }                      — DRF string detail
 *   { detail: [{ msg: "..." }, ...] }      — msgspec validation list
 *   { errors: { field: ["msg", ...] } }    — field-level errors dict
 *   { <field>: ["msg", ...] }              — Django validation dict
 */
export function extractErrorMessage(payload: unknown, status: number): string {
  if (status === 429) {
    return "Слишком много запросов. Подождите немного и повторите попытку.";
  }
  if (!payload || typeof payload !== "object") {
    return `Ошибка сервера (${status})`;
  }
  const p = payload as Record<string, unknown>;

  // { error: "..." }
  if (typeof p.error === "string" && p.error) return p.error;

  // { detail: "..." }
  if (typeof p.detail === "string" && p.detail) return p.detail;

  // { detail: [{ msg: "..." }, ...] } — msgspec validation errors
  if (Array.isArray(p.detail)) {
    const msgs = p.detail
      .map((item: unknown) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as Record<string, unknown>).msg)
          : null,
      )
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }

  // { errors: { field: ["msg", ...] } }
  if (p.errors && typeof p.errors === "object" && !Array.isArray(p.errors)) {
    const parts: string[] = [];
    for (const [field, msgs] of Object.entries(p.errors as Record<string, unknown>)) {
      if (Array.isArray(msgs)) {
        parts.push(`${field}: ${msgs.join(", ")}`);
      } else if (typeof msgs === "string") {
        parts.push(`${field}: ${msgs}`);
      }
    }
    if (parts.length) return parts.join("; ");
  }

  // Django validation dict — keys are field names, values are string[]
  const fieldErrors: string[] = [];
  for (const [key, val] of Object.entries(p)) {
    if (key === "error" || key === "detail" || key === "errors") continue;
    if (Array.isArray(val)) {
      fieldErrors.push(`${key}: ${val.join(", ")}`);
    }
  }
  if (fieldErrors.length) return fieldErrors.join("; ");

  return `Ошибка сервера (${status})`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isFormData = options.formData !== undefined;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: isFormData
        ? { ...options.headers }  // let browser set multipart boundary
        : {
            "Content-Type": "application/json",
            ...options.headers,
          },
      body: isFormData
        ? options.formData
        : options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
    });
  } catch (err) {
    // AbortError — пробрасываем как есть, не маскируем под ApiError
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // Сетевые ошибки (DNS, offline, CORS preflight fail) — status=0
    const message = err instanceof Error ? err.message : "Network error";
    throw new ApiError(message, 0, null);
  }

  // 204 No Content — return undefined (void endpoints)
  if (response.status === 204) {
    return undefined as T;
  }

  // Сессия протухла посреди работы: уведомляем приложение глобально,
  // usePermissions переведёт authStatus в unauthenticated и RequireAuth
  // уведёт на /login вместо бесконечных «Ошибка загрузки».
  if (response.status === 401) {
    window.dispatchEvent(new Event("mamadoc:api-unauthorized"));
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(extractErrorMessage(payload, response.status), response.status, payload);
  }

  return payload as T;
}

/** true для отменённых запросов (AbortController) — такие ошибки не показываем. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Человекочитаемое сообщение из любого исключения — для catch-блоков страниц.
 * ApiError уже несёт готовое сообщение (см. apiRequest → extractErrorMessage),
 * поэтому достаточно err.message.
 */
export function getErrorMessage(err: unknown, fallback = "Неизвестная ошибка"): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}
