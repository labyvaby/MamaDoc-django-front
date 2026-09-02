import React from "react";

/**
 * Живучесть встроенного Чат-центра: одна вкладка на пользователя и распознавание
 * сорвавшегося входа.
 *
 * Chatwoot хранит `sso_auth_token` **по одному на пользователя**, и каждая новая
 * выдача гасит предыдущую. Пока раздел открыт в одном месте, это незаметно; но
 * стоит открыть его во второй вкладке — та берёт свежую ссылку, и первая
 * остаётся с мёртвым токеном: вместо диалогов пользователь видит форму пароля.
 * По логам прода за сутки так срывалось 6 входов из 46.
 *
 * Решение состоит из двух частей, и обе живут здесь: правила — чистыми
 * функциями (их и покрывают тесты), проводка к браузеру — тонкими хуками.
 */

/** Канал между вкладками CRM одного браузера. */
const CHANNEL = "chatwoot-embed";

/** Сообщение Chatwoot о том, что вход не состоялся. */
export const CHATWOOT_LOGIN_REQUIRED = "chatwoot:login-required";

/** Роль вкладки: владелец монтирует iframe, ожидающий — нет. */
export type LockRole = "owner" | "standby";

export type LockMessage =
  /** «Беру раздел себе». */
  | { type: "claim"; id: string }
  /** «Занято мной» — ответ действующего владельца. */
  | { type: "busy"; id: string }
  /** «Отпускаю» — вкладка закрылась или уступила. */
  | { type: "release"; id: string };

/**
 * Что делать вкладке, получившей сообщение от соседней.
 *
 * Чистая функция: на входе текущая роль и сообщение, на выходе новая роль и,
 * если нужно, ответ. Вся координация вкладок описывается этими правилами.
 */
export function reduceLock(
  role: LockRole,
  message: LockMessage,
  me: string,
): { role: LockRole; reply?: LockMessage } {
  // Собственное эхо игнорируем: канал доставляет сообщения всем, включая себя
  // в некоторых браузерах.
  if (message.id === me) return { role };

  if (message.type === "claim") {
    // Занято нами — сообщаем новичку и остаёмся владельцем.
    return role === "owner"
      ? { role, reply: { type: "busy", id: me } }
      : { role };
  }
  if (message.type === "busy") {
    // Кто-то уже держит раздел: уступаем, чтобы не погасить его токен.
    return { role: role === "owner" ? "standby" : role };
  }
  // release: владелец ушёл — ожидающая вкладка забирает раздел.
  return { role: role === "standby" ? "owner" : role };
}

/**
 * Считать ли сообщение из iframe сигналом «вход не состоялся».
 *
 * Отправитель проверяется по origin: сообщения откуда угодно ещё не повод
 * показывать пользователю ошибку.
 */
export function isLoginRequiredMessage(
  origin: string,
  data: unknown,
  expectedOrigin: string,
): boolean {
  if (origin !== expectedOrigin) return false;
  const type =
    typeof data === "string" ? data : (data as { type?: unknown } | null)?.type;
  return type === CHATWOOT_LOGIN_REQUIRED;
}

/** Origin Чат-центра по ссылке входа; `null`, если ссылки ещё нет. */
export function chatwootOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Раздел живёт ровно в одной вкладке.
 *
 * Ожидающая вкладка не запрашивает ссылку и не монтирует iframe, поэтому чужой
 * токен не гасит. Владение можно перехватить кнопкой — тогда прежний владелец
 * сам уходит в ожидание: пользователь всегда может продолжить там, где смотрит
 * сейчас, а не гадать, какая вкладка «настоящая».
 *
 * `BroadcastChannel` есть во всех браузерах, которые поддерживает CRM; если его
 * всё же нет, хук отдаёт роль владельца — поведение откатывается к прежнему.
 */
export function useChatwootTabLock(): { role: LockRole; takeOver: () => void } {
  const idRef = React.useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  const [role, setRole] = React.useState<LockRole>("owner");
  const roleRef = React.useRef<LockRole>("owner");
  roleRef.current = role;

  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;

    const me = idRef.current;
    const channel = new BroadcastChannel(CHANNEL);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<LockMessage>) => {
      if (!event.data) return;
      const next = reduceLock(roleRef.current, event.data, me);
      if (next.role !== roleRef.current) setRole(next.role);
      if (next.reply) channel.postMessage(next.reply);
    };

    channel.postMessage({ type: "claim", id: me } satisfies LockMessage);

    return () => {
      if (roleRef.current === "owner") {
        channel.postMessage({ type: "release", id: me } satisfies LockMessage);
      }
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const takeOver = React.useCallback(() => {
    const channel = channelRef.current;
    const me = idRef.current;
    setRole("owner");
    // Сначала просим отпустить, затем занимаем: прежний владелец увидит claim
    // уже будучи в ожидании и не пришлёт busy в ответ.
    channel?.postMessage({ type: "release", id: me } satisfies LockMessage);
    channel?.postMessage({ type: "claim", id: me } satisfies LockMessage);
  }, []);

  return { role, takeOver };
}

/**
 * Сигнал от Chatwoot, что вход не состоялся.
 *
 * Прочитать содержимое iframe нельзя — это чужой origin, браузер запрещает и
 * адрес, и DOM. Поэтому о срыве сообщает сама страница Чат-центра: открывшись
 * внутри рамки без токена входа, она шлёт родителю `chatwoot:login-required`.
 */
export function useChatwootLoginFailed(
  chatwootUrl: string | null,
  onFailed: () => void,
): void {
  const handlerRef = React.useRef(onFailed);
  handlerRef.current = onFailed;

  React.useEffect(() => {
    const expected = chatwootOrigin(chatwootUrl);
    if (!expected) return undefined;

    const onMessage = (event: MessageEvent) => {
      if (isLoginRequiredMessage(event.origin, event.data, expected)) {
        handlerRef.current();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [chatwootUrl]);
}
