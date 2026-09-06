import React from "react";

/**
 * Распознавание сорвавшегося входа в Чат-центр.
 *
 * Прочитать содержимое iframe нельзя — это чужой origin. Поэтому о срыве
 * сообщает сама страница Chatwoot, а здесь лежит приёмная сторона: правило —
 * чистой функцией (её и покрывают тесты), проводка к браузеру — тонким хуком.
 *
 * Раньше рядом жил ещё замок вкладок: раздел разрешалось открыть только в
 * одной. Он строился на том, что новая выдача токена гасит предыдущую — и это
 * оказалось неверно. Ключ в Redis у Chatwoot составной (`user_id` + сам токен),
 * поэтому токены одного пользователя сосуществуют, а с ленивым входом вкладки
 * чаще всего обходятся общей cookie и токен не выписывают вовсе. Замок решал
 * несуществующую проблему и мешал работать, поэтому убран.
 */

/** Сообщение Chatwoot о том, что вход не состоялся. */
export const CHATWOOT_LOGIN_REQUIRED = "chatwoot:login-required";

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
