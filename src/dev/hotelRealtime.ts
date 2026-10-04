/**
 * Одна подписка отеля на `/ws/changes/` на всё приложение (r3 §2.2, r4 §11):
 * `hotel.reservation` — новая, подтверждённая, отменённая или истёкшая бронь
 * (в том числе заявка с сайта и закрытие ночным аудитом), `hotel.alert` —
 * уведомление сотрудникам. Сокет только подсказывает «что-то изменилось» —
 * данные перезапрашиваются обычным REST. Пока он жив, опрос заявок с сайта
 * редкий (страховка от «тихого» обрыва), без него — прежний частый.
 *
 * Монтируется один раз в HotelSiteRequestsNotifier: каждый вызов
 * useChangesSocket открывает своё соединение.
 */
import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useChangesSocket } from "../hooks/useChangesSocket";
import { usePermissions } from "../hooks/usePermissions";

let connected = false;
const listeners = new Set<() => void>();
const setConnected = (value: boolean) => {
  if (value === connected) return;
  connected = value;
  for (const l of listeners) l();
};

/** Жив ли гостиничный сокет — чтобы реже опрашивать сервер. */
export function useHotelSocketConnected(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => connected,
  );
}

const DEBOUNCE_MS = 300;

export function useHotelRealtime(enabled: boolean): void {
  const { activeBranch } = usePermissions();
  const queryClient = useQueryClient();
  const pending = React.useRef(new Set<string>());
  const timer = React.useRef<number | undefined>(undefined);
  const flush = React.useCallback(() => {
    const kinds = pending.current;
    pending.current = new Set();
    if (kinds.has("hotel.reservation")) {
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "alerts"] });
    }
    if (kinds.has("hotel.alert")) void queryClient.invalidateQueries({ queryKey: ["hotel", "alerts"] });
  }, [queryClient]);
  const isOpen = useChangesSocket({
    branchId: enabled ? activeBranch?.id : undefined,
    onMessage: (msg) => {
      if (msg.entity !== "hotel.reservation" && msg.entity !== "hotel.alert") return;
      pending.current.add(msg.entity);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, DEBOUNCE_MS);
    },
  });
  React.useEffect(() => {
    setConnected(enabled && isOpen);
  }, [enabled, isOpen]);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
}
