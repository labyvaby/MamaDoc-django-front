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

/** Сообщение при обрыве связи (offline, DNS, CORS-preflight, сервер недоступен). */
export const NETWORK_ERROR_MESSAGE =
  "Нет связи с сервером. Проверьте подключение к интернету и попробуйте снова.";

/**
 * Человеко-понятные подписи технических имён полей. Ключи бэкенда приходят
 * то в snake_case, то в camelCase — normalizeFieldKey приводит их к единому
 * виду и отрезает суффикс Id (patientId и patient_id → patient). Неизвестные
 * поля показываем без префикса вовсе — сырой англоключ пользователю не нужен.
 */
const FIELD_LABELS: Record<string, string> = {
  // Общие
  name: "Название",
  title: "Заголовок",
  description: "Описание",
  comment: "Комментарий",
  amount: "Сумма",
  price: "Цена",
  unitPrice: "Цена за единицу",
  quantity: "Количество",
  date: "Дата",
  startsAt: "Дата и время начала",
  endsAt: "Дата и время окончания",
  dueDate: "Срок",
  expiryDate: "Срок годности",
  status: "Статус",
  priority: "Приоритет",
  discount: "Скидка",
  discountAmount: "Скидка",
  dose: "Доза",
  // Люди / контакты
  phone: "Телефон",
  email: "Email",
  address: "Адрес",
  firstName: "Имя",
  lastName: "Фамилия",
  middleName: "Отчество",
  patronymic: "Отчество",
  fullName: "ФИО",
  birthDate: "Дата рождения",
  dateOfBirth: "Дата рождения",
  gender: "Пол",
  sex: "Пол",
  // Авторизация
  password: "Пароль",
  oldPassword: "Текущий пароль",
  currentPassword: "Текущий пароль",
  newPassword: "Новый пароль",
  username: "Имя пользователя",
  login: "Логин",
  // Доменные сущности (id → читаемое имя)
  patient: "Пациент",
  employee: "Сотрудник",
  doctor: "Врач",
  service: "Услуга",
  services: "Услуги",
  product: "Товар",
  products: "Товары",
  warehouse: "Склад",
  category: "Категория",
  branch: "Филиал",
  organization: "Организация",
  assignee: "Исполнитель",
  author: "Автор",
  role: "Роль",
  vaccine: "Вакцина",
  batch: "Партия",
  diagnosis: "Диагноз",
};

/** snake_case → camelCase и отрезаем суффикс Id, чтобы найти подпись в словаре. */
function normalizeFieldKey(key: string): string {
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return camel.replace(/Id$/, "") || camel;
}

/** Технические ключи-обёртки, у которых префикс не нужен (это общая ошибка). */
function isNonFieldKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "non_field_errors" || k === "nonfielderrors" || k === "__all__" || k === "detail";
}

/** «поле: текст» → «Подпись: текст»; неизвестное поле → только текст. */
function formatFieldError(key: string, message: string): string {
  if (isNonFieldKey(key)) return message;
  const label = FIELD_LABELS[normalizeFieldKey(key)];
  return label ? `${label}: ${message}` : message;
}

/** Резервный человеческий текст по коду статуса, когда в теле нет сообщения. */
function fallbackByStatus(status: number): string {
  switch (status) {
    case 0:
      return NETWORK_ERROR_MESSAGE;
    case 400:
      return "Проверьте правильность заполнения полей.";
    case 401:
      return "Требуется вход в систему.";
    case 403:
      return "Недостаточно прав для этого действия.";
    case 404:
      return "Запрашиваемые данные не найдены.";
    case 409:
      return "Конфликт данных. Обновите страницу и попробуйте снова.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Ошибка на сервере. Попробуйте позже.";
    default:
      return `Ошибка сервера (${status})`;
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
 *
 * Технические имена полей переводятся в русские подписи (FIELD_LABELS),
 * неизвестные — показываются без префикса, коды статусов — человеческим текстом.
 */
export function extractErrorMessage(payload: unknown, status: number): string {
  if (status === 429) {
    return "Слишком много запросов. Подождите немного и повторите попытку.";
  }
  if (status === 0) return NETWORK_ERROR_MESSAGE;
  if (!payload || typeof payload !== "object") {
    return fallbackByStatus(status);
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
        parts.push(formatFieldError(field, msgs.join(", ")));
      } else if (typeof msgs === "string") {
        parts.push(formatFieldError(field, msgs));
      }
    }
    if (parts.length) return parts.join("; ");
  }

  // { code, message, ... } — структурированная бизнес-ошибка с готовым текстом
  // (например, appointment_overlap: { code, message, requestedSlot, overlaps[] }).
  // Берём message, иначе overlaps (массив объектов) уходит в дикт-fallback ниже
  // и печатается как «overlaps: [object Object]».
  if (typeof p.message === "string" && p.message) return p.message;

  // Django validation dict — keys are field names, values are string[]
  const fieldErrors: string[] = [];
  for (const [key, val] of Object.entries(p)) {
    if (key === "error" || key === "detail" || key === "errors") continue;
    if (Array.isArray(val)) {
      // Только примитивы: массив объектов дал бы «[object Object]».
      const strs = val
        .filter((v) => typeof v === "string" || typeof v === "number")
        .map(String);
      if (strs.length) fieldErrors.push(formatFieldError(key, strs.join(", ")));
    }
  }
  if (fieldErrors.length) return fieldErrors.join("; ");

  return fallbackByStatus(status);
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
    // Сетевые ошибки (DNS, offline, CORS preflight fail) — status=0.
    // Сырое «Failed to fetch» пользователю непонятно: показываем инструкцию,
    // оригинал оставляем в консоли для отладки.
    if (import.meta.env.DEV) console.error("[api] network error:", err);
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, null);
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
