/**
 * Чистые функции отображения журнала действий — отдельно от JSX, чтобы
 * покрыть их vitest (render-библиотек в проекте нет).
 *
 * Правило одно: неизвестное не ломает экран. Неизвестный код события,
 * поле или значение показываются как есть.
 */
import type { AuditCatalog, AuditChange, AuditEvent, AuditOutcome } from "../../../api/audit";
import type { ToneName } from "../../../components/ui";

/** Подписи часто встречающихся полей diff; прочие показываются как есть. */
const FIELD_LABELS: Record<string, string> = {
  full_name: "ФИО",
  name: "Название",
  phone: "Телефон",
  phones: "Телефоны",
  email: "Email",
  status: "Статус",
  role: "Роль",
  branch: "Филиал",
  branches: "Филиалы",
  isActive: "Активен",
  is_active: "Активен",
  isOwner: "Владелец",
  isEnabled: "Включён",
  clinical_role: "Клиническая роль",
  nickname: "Псевдоним",
  notes: "Заметки",
  birth_date: "Дата рождения",
  hired_at: "Дата найма",
  inn: "ИНН",
  address: "Адрес",
  bank: "Банк",
  bik: "БИК",
  bank_account_number: "Счёт",
  price: "Цена",
  amount: "Сумма",
  timezone: "Часовой пояс",
  vertical: "Вид бизнеса",
  logo: "Логотип",
  theme_config: "Оформление",
  bakai_openbanking_token: "Токен Bakai OpenBanking",
  online_payment_enabled: "Онлайн-оплата",
  code: "Код",
  description: "Описание",
};

export const ACTOR_TYPE_LABELS: Record<string, string> = {
  user: "Сотрудник",
  platform_admin: "Администратор платформы",
  customer: "Клиент",
  system: "Система",
  integration: "Интеграция",
  anonymous: "Не определён",
};

export const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  success: "Успешно",
  failure: "Ошибка",
  denied: "Отказано",
};

export const AUTH_METHOD_LABELS: Record<string, string> = {
  password: "Пароль",
  otp: "Код из SMS",
  sso: "Вход через ProfiChat",
  token: "API-токен",
  api_key: "Ключ партнёра",
  session: "Сессия",
};

export const SOURCE_LABELS: Record<string, string> = {
  web: "Веб-интерфейс",
  api: "API",
  admin: "Админка",
  portal: "Кабинет клиента",
  celery: "Фоновая задача",
  webhook: "Вебхук",
  command: "Команда сервера",
  system: "Система",
  legacy: "Старый журнал",
};

export function outcomeTone(outcome: AuditOutcome): ToneName {
  if (outcome === "success") return "success";
  if (outcome === "denied") return "warning";
  return "error";
}

/** Человеческое название события; fallback — сам код. */
export function actionText(event: AuditEvent, catalog?: AuditCatalog): string {
  if (event.actionLabel) return event.actionLabel;
  const fromCatalog = catalog?.actions.find((item) => item.code === event.action);
  return fromCatalog?.label ?? event.action;
}

export function categoryText(code: string, catalog?: AuditCatalog): string {
  return catalog?.categories.find((item) => item.code === code)?.label ?? code;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Кто: снимок имени, а для системы/интеграции — их тип. */
export function actorText(event: AuditEvent): string {
  if (event.actor.name) return event.actor.name;
  return ACTOR_TYPE_LABELS[event.actor.type] ?? event.actor.type;
}

const PHONE_RE = /^\+?\d{9,15}$/;

/** `+996700123123` → `+996700***123`: номер узнаваем, но не выписываем. */
export function maskPhone(value: string): string {
  if (!PHONE_RE.test(value)) return value;
  return `${value.slice(0, 7)}***${value.slice(-3)}`;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string") return maskPhone(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.length ? value.map(formatValue).join(", ") : "—";
  }
  return JSON.stringify(value);
}

export interface ChangeLine {
  field: string;
  label: string;
  /** null — значение скрыто (секрет, медицинский текст): только «изменено». */
  from: string | null;
  to: string | null;
}

function isChangedOnly(change: AuditChange): change is { changed: true } {
  return typeof change === "object" && change !== null && "changed" in change;
}

/** diff события → строки «Поле: было → стало». */
export function changeLines(changes: Record<string, AuditChange>): ChangeLine[] {
  return Object.entries(changes ?? {}).map(([field, change]) => {
    if (isChangedOnly(change)) {
      return { field, label: fieldLabel(field), from: null, to: null };
    }
    const pair = (change ?? {}) as { old?: unknown; new?: unknown };
    return {
      field,
      label: fieldLabel(field),
      from: formatValue(pair.old),
      to: formatValue(pair.new),
    };
  });
}

/** Объект события для таблицы: подпись, иначе «тип #id». */
export function resourceText(event: AuditEvent): string {
  if (event.resource.label) return event.resource.label;
  if (event.resource.type && event.resource.id) {
    return `${event.resource.type} #${event.resource.id}`;
  }
  return "—";
}
