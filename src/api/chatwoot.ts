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

/** Машинный код нового конверта, которым бэк помечает «нет учётки». */
const NO_ACCOUNT_CODE = "CHATWOOT_NO_ACCOUNT";

/**
 * Тот же случай в старой форме ответа (`{"detail":[{"msg":"…"}]}`).
 *
 * Конверт `{"error":{code,…}}` выложен пока только на test — прод отвечает
 * по-старому, и там кода в ответе нет вовсе (см. `ApiError.code` в client.ts).
 * Пока обе формы живы, живы и обе ветки разбора.
 */
const NO_ACCOUNT_LEGACY_MARKER = "chatwoot_no_account";

export async function fetchChatwootEmbed(): Promise<ChatwootEmbed> {
  return apiRequest<ChatwootEmbed>("/chatwoot/embed/");
}

/** Открытые диалоги — те же числа, что Chatwoot показывает во вкладках. */
export type ChatwootCounts = {
  /** Назначены на этого сотрудника. */
  mine: number;
  /** Ничьи: ждут, пока кто-нибудь возьмёт. */
  unassigned: number;
  /** Все открытые в доступных ему инбоксах. */
  total: number;
};

export async function fetchChatwootCounts(): Promise<ChatwootCounts> {
  return apiRequest<ChatwootCounts>("/chatwoot/counts/");
}

/**
 * Причина отказа по ответу бэкенда.
 *
 * 403 приходит и когда у роли нет права `chatwoot.view`, и когда права есть, но
 * учётки в Чат-центре нет. В новом конверте их различает `error.code` —
 * ветвиться по тексту сообщения контракт запрещает
 * (docs/backend-error-contract.md). Текст читаем только там, где кода нет в
 * принципе: прод ещё отвечает старой формой. Ни то ни другое — отказ по
 * правам, и до страницы дело всё равно не дойдёт: её закрывает
 * `RequirePermission`.
 */
export function chatwootUnavailableReason(
  error: unknown,
): ChatwootUnavailableReason {
  if (!(error instanceof ApiError)) return "unavailable";
  if (error.status === 404) return "disabled";
  if (error.status === 403) {
    if (error.code === NO_ACCOUNT_CODE) return "no_account";
    if (error.code === null && error.message.includes(NO_ACCOUNT_LEGACY_MARKER)) {
      return "no_account";
    }
    return "disabled";
  }
  return "unavailable";
}
