import { ApiError, apiRequest } from "./client";

/**
 * Раздел «Чаты» — встроенный дашборд Chatwoot (`chat.operator.kg`).
 *
 * Бэкенд не проксирует Chatwoot: он лишь выдаёт одноразовую ссылку входа,
 * которую фронт подставляет в `src` iframe. Ссылка короткоживущая и сгорает при
 * первом переходе, поэтому её **нельзя кэшировать** — запрашиваем заново при
 * каждом открытии раздела.
 *
 * Контракт: `docs/chatwoot-embed-design.md` в MamaDoc-backend.
 */

export type ChatwootEmbed = {
  /** Одноразовая ссылка `/app/login?email=…&sso_auth_token=…`. */
  url: string;
  /** Аккаунт (тенант) организации в Chatwoot — куда вести iframe после входа. */
  accountId: number;
};

/**
 * Почему у сотрудника не открылся раздел. Разделяем три случая: у них разный
 * текст и разные действия пользователя.
 */
export type ChatwootUnavailableReason =
  /** Интеграция выключена на деплое или у организации (404). */
  | "disabled"
  /** Сотрудника нет в Chatwoot — нужно запросить доступ у администратора (403). */
  | "no_account"
  /** Chatwoot недоступен или отвечает ошибкой (502). Наша проблема, не пользователя. */
  | "unavailable";

/** Машинный код, которым бэк помечает «нет учётки в Chatwoot». */
const NO_ACCOUNT_MARKER = "chatwoot_no_account";

export async function fetchChatwootEmbed(): Promise<ChatwootEmbed> {
  return apiRequest<ChatwootEmbed>("/chatwoot/embed/");
}

/**
 * Причина отказа по ответу бэкенда.
 *
 * 403 приходит и когда у роли нет права `chatwoot.view`, и когда права есть, но
 * учётки в Chatwoot нет. Различаем по маркеру `chatwoot_no_account`: без него
 * это отказ по правам, и до страницы дело всё равно не дойдёт — её закрывает
 * `RequirePermission`.
 */
export function chatwootUnavailableReason(
  error: unknown,
): ChatwootUnavailableReason {
  if (!(error instanceof ApiError)) return "unavailable";
  if (error.status === 404) return "disabled";
  if (error.status === 403) {
    const marker = `${error.code ?? ""} ${error.message}`;
    return marker.includes(NO_ACCOUNT_MARKER) ? "no_account" : "disabled";
  }
  return "unavailable";
}

/**
 * Адрес дашборда аккаунта. После входа по SSO-ссылке Chatwoot открывает
 * последний использованный аккаунт — у пользователя, состоящего в нескольких,
 * это может быть чужой. Поэтому сразу переводим iframe на нужный.
 */
export function chatwootDashboardUrl(
  embedUrl: string,
  accountId: number,
): string {
  const origin = new URL(embedUrl).origin;
  return `${origin}/app/accounts/${accountId}/dashboard`;
}
