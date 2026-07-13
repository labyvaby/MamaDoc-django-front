import React from "react";

import { usePermissions } from "./usePermissions";
import { useChangesSocket, type ChangeMessage } from "./useChangesSocket";

type Options = {
  /** Какие `entity` из `/ws/changes/` триггерят onEvent. */
  entities: readonly string[];
  /** Вызывается один раз на пачку событий (склейка бурста). */
  onEvent: () => void;
};

/**
 * Склейка WS-событий: одно действие на бэке может дать несколько сообщений
 * подряд (продажа = create + движения; товар = веер по филиалам) — рефетчим
 * один раз.
 */
const WS_EVENT_DEBOUNCE_MS = 300;

/**
 * Лёгкая realtime-подписка для списочных страниц (товары, продажи, расходы).
 *
 * Обёртка над useChangesSocket: фильтрует события по `entity`, склеивает
 * бурсты и не дёргает refetch в скрытой вкладке — событие буферизуется и
 * выстреливает один раз при возврате на вкладку (не теряется, как если бы
 * его просто проигнорировали). Филиал берётся из активного контекста; без
 * филиала realtime недоступен по контракту — страница живёт как раньше
 * (свои focus-refetch / polling-механизмы остаются страховкой).
 *
 * @returns true, пока сокет жив (можно использовать для индикации).
 */
export function useRealtimeRefetch({ entities, onEvent }: Options): boolean {
  const { activeBranch } = usePermissions();

  // Колбэк и список сущностей в ref — чтобы сокет не переоткрывался на
  // каждый рендер страницы (identity этих значений меняется постоянно).
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;
  const entitiesRef = React.useRef(entities);
  entitiesRef.current = entities;

  // Событие пришло, пока вкладка была скрыта — отдаём при первом фокусе.
  const pendingRef = React.useRef(false);
  const debounceRef = React.useRef<number | undefined>(undefined);

  const fire = React.useCallback(() => {
    pendingRef.current = false;
    onEventRef.current();
  }, []);

  const connected = useChangesSocket({
    branchId: activeBranch?.id,
    onMessage: (msg: ChangeMessage) => {
      if (!entitiesRef.current.includes(msg.entity)) return;
      if (document.hidden) {
        pendingRef.current = true;
        return;
      }
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(fire, WS_EVENT_DEBOUNCE_MS);
    },
  });

  React.useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && pendingRef.current) fire();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(debounceRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fire]);

  return connected;
}
