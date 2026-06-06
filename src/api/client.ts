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

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isFormData = options.formData !== undefined;
  const response = await fetch(`${API_URL}${path}`, {
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

  // 204 No Content — return undefined (void endpoints)
  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `API request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
