import React from "react";

/**
 * Сообщение real-time канала `/ws/changes/` (Django Channels).
 * Формат — по контракту бэка: короткий hint «что-то изменилось», данные по
 * сокету не передаются, клиент перезапрашивает нужный экран обычным REST.
 */
export type ChangeMessage = {
  /** Раздел: пока только "appointment"; заключения/касса — следующие срезы. */
  entity: string;
  action: "created" | "updated" | "deleted";
  /** id изменённой записи — информативно, на него не завязываемся. */
  objectId: number | null;
  /** Филиал события (совпадает с активным на момент подключения). */
  branchId: number;
};

type Options = {
  /**
   * Активный филиал. Без филиала (режим «вся организация») real-time на бэке
   * недоступен — сокет не открываем, экран живёт на polling. При смене филиала
   * сокет переоткрывается (события скоупятся по филиалу на момент подключения).
   */
  branchId?: number;
  /** Вызывается на каждое входящее сообщение. */
  onMessage: (msg: ChangeMessage) => void;
};

/** Верхняя граница backoff: 1с·2^6 = 64с между попытками переподключения. */
const MAX_RETRY_EXPONENT = 6;

/**
 * Клиент real-time канала `/ws/changes/`.
 *
 * Аутентификация — той же сессионной cookie, что и REST (браузер шлёт её при
 * открытии WebSocket на своём origin автоматически). Сервер закрывает сокет
 * кодом 4401, если нет валидной сессии или не выбран активный филиал — в этом
 * случае переподключение НЕ выполняется (не долбим сервер), вызывающий код
 * продолжает работать на polling.
 *
 * Обрывы по другим причинам (wifi, сон ноутбука, прокси) переподключаются с
 * экспоненциальным backoff; при возврате на вкладку / восстановлении сети —
 * немедленная попытка. Сокет может отвалиться и «тихо», поэтому этот хук —
 * ускоритель, а не замена polling-страховки (см. useAppointmentsAutoSync).
 *
 * @returns true, пока соединение открыто (вызывающий код по этому флагу
 * замедляет страховочный polling).
 */
export function useChangesSocket({ branchId, onMessage }: Options): boolean {
  const [connected, setConnected] = React.useState(false);
  // Колбэк в ref — чтобы сокет не переоткрывался на каждый рендер страницы.
  const onMessageRef = React.useRef(onMessage);
  onMessageRef.current = onMessage;

  React.useEffect(() => {
    if (branchId == null) return;

    let disposed = false;
    // Сервер отверг подключение (4401): нет сессии или филиала. Автоматически
    // не переподключаемся до смены филиала/страницы — только polling.
    let denied = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let retryTimer: number | undefined;

    const open = () => {
      if (disposed || denied) return;
      // В dev Vite проксирует /ws/* на ws-контейнер, в проде — Caddy на daphne.
      const url = `${window.location.origin.replace(/^http/, "ws")}/ws/changes/`;
      ws = new WebSocket(url); // сессионная cookie уходит автоматически

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };

      ws.onmessage = (e: MessageEvent) => {
        let msg: ChangeMessage;
        try {
          msg = JSON.parse(e.data as string) as ChangeMessage;
        } catch {
          return; // некорректный кадр игнорируем
        }
        if (msg && typeof msg.entity === "string") onMessageRef.current(msg);
      };

      ws.onclose = (e: CloseEvent) => {
        setConnected(false);
        if (disposed) return;
        if (e.code === 4401) {
          denied = true;
          return;
        }
        retry = Math.min(retry + 1, MAX_RETRY_EXPONENT);
        retryTimer = window.setTimeout(open, 1000 * 2 ** retry);
      };
    };

    open();

    // Немедленное переподключение при возврате на вкладку / восстановлении
    // сети — иначе после сна ноутбука ждали бы хвост backoff-таймера.
    const onWake = () => {
      if (disposed || denied || document.hidden) return;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      window.clearTimeout(retryTimer);
      retry = 0;
      open();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      setConnected(false);
      // Обработчик уже видит disposed=true и не станет переподключаться.
      ws?.close();
    };
  }, [branchId]);

  return connected;
}
