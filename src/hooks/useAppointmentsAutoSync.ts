import React from "react";
import { getAppointmentsLastUpdate } from "../api/appointments";
import { isAbortError } from "../api/client";
import {
  DJANGO_HEARTBEAT_INTERVAL_MS,
  DJANGO_REALTIME_FALLBACK_INTERVAL_MS,
} from "../api/queryKeys";
import { useChangesSocket } from "./useChangesSocket";

type Options = {
  /** Узкий фильтр по филиалу (как у списка приёмов). */
  branchId?: number;
  /** Пауза фонового чека (например, открыт дровер создания/редактирования). */
  paused?: boolean;
  /** Вызывается ОДИН РАЗ, когда обнаружено изменение приёмов. */
  onChange: () => void;
};

/**
 * Склейка WS-событий: бэк на одно действие может прислать несколько сообщений
 * подряд (например, оплата = update приёма + платёж) — рефетчим один раз.
 */
const WS_EVENT_DEBOUNCE_MS = 200;

/**
 * Синхронизация календаря приёмов: WebSocket как мгновенный триггер +
 * лёгкий timestamp-polling как страховка.
 *
 * Real-time: сокет `/ws/changes/` (см. useChangesSocket) присылает hint при
 * изменении приёмов/оплат своего филиала → перечитываем базу last-update и
 * зовём onChange() сразу, не дожидаясь тика polling.
 *
 * Страховка (WebSocket может тихо отвалиться — wifi, сон ноутбука, прокси, —
 * а это медцентр: надёжность важнее скорости): каждые intervalMs запрашиваем
 * дешёвый `last-update` (max updated_at). Пока сокет жив — редкий тик
 * (DJANGO_REALTIME_FALLBACK_INTERVAL_MS); сокет отвалился или недоступен
 * (нет филиала, 4401) — прежний частый (DJANGO_HEARTBEAT_INTERVAL_MS).
 * Базовый таймстамп фиксируется при первом ответе БЕЗ вызова onChange
 * (открытие страницы не должно дёргать refetch). Дальше, если таймстамп
 * сдвинулся — значит кто-то в клинике добавил/изменил приём — вызывает
 * onChange() ровно один раз (там делается единичный refetch тяжёлого списка).
 *
 * Чек не идёт когда `paused` (открыт дровер) или вкладка скрыта; WS-события в
 * это время тоже не рефетчат (не мешаем вводу). База при этом СОХРАНЯЕТСЯ:
 * первый чек после снятия паузы/возврата на вкладку сравнивает с базой до
 * паузы, поэтому изменения, случившиеся пока дровер был открыт, подтягиваются
 * сразу после его закрытия, а не теряются.
 */
export function useAppointmentsAutoSync({ branchId, paused, onChange }: Options): void {
  const lastSeenRef = React.useRef<string | null>(null);
  // onChange держим в ref, чтобы интервал не пересоздавался на каждый рендер.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  // Мост «сокет → активный polling-эффект»: эффект ниже кладёт сюда обработчик
  // на время своей жизни. Пока paused / нет эффекта — здесь null, события
  // игнорируются (их подхватит немедленный чек при снятии паузы: сравнение с
  // базой до паузы обнаружит сдвиг таймстампа).
  const wsEventRef = React.useRef<(() => void) | null>(null);

  const wsConnected = useChangesSocket({
    branchId,
    onMessage: (msg) => {
      // Оплаты и возвраты приходят тоже как entity="appointment" (платёж
      // меняет кэш-поля приёма) — отдельной ветки для них не нужно.
      if (msg.entity === "appointment") wsEventRef.current?.();
    },
  });

  // База валидна только в рамках одного филиала: max(updated_at) другого
  // филиала — другое число, сравнение с ним дало бы ложный onChange.
  React.useEffect(() => {
    lastSeenRef.current = null;
  }, [branchId]);

  React.useEffect(() => {
    if (paused) return;

    let cancelled = false;
    const controller = new AbortController();

    const check = async () => {
      if (document.hidden) return; // вкладка не активна — не дёргаем сеть
      try {
        const latest = await getAppointmentsLastUpdate(branchId, controller.signal);
        if (cancelled) return;
        // Первый успешный ответ — только запоминаем базу, без refetch.
        if (lastSeenRef.current === null) {
          lastSeenRef.current = latest;
          return;
        }
        if (latest !== lastSeenRef.current) {
          lastSeenRef.current = latest;
          onChangeRef.current();
        }
      } catch (err) {
        if (!isAbortError(err)) {
          // Heartbeat — best-effort; сетевые сбои игнорируем тихо.
        }
      }
    };

    // Реакция на WS-событие. onChange зовём БЕЗУСЛОВНО (не сравнивая базу):
    // при удалении приёма max(updated_at) может не сдвинуться, а событие —
    // доверенный сигнал. Но сперва перечитываем базу, чтобы следующий тик
    // polling не среагировал на то же изменение вторым refetch. Порядок
    // важен: база фиксируется ДО onChange — если между ними успеет прилететь
    // ещё одно изменение, его таймстамп будет отличаться от базы и polling
    // его не потеряет.
    const forcedCheck = async () => {
      try {
        const latest = await getAppointmentsLastUpdate(branchId, controller.signal);
        if (cancelled) return;
        lastSeenRef.current = latest;
      } catch (err) {
        if (isAbortError(err)) return;
        // База не перечиталась — рефетчим всё равно; максимум один
        // дублирующий onChange от следующего тика страховки.
      }
      if (!cancelled) onChangeRef.current();
    };

    let wsDebounce: number | undefined;
    wsEventRef.current = () => {
      if (document.hidden) return; // подхватится чеком при возврате на вкладку
      window.clearTimeout(wsDebounce);
      wsDebounce = window.setTimeout(() => void forcedCheck(), WS_EVENT_DEBOUNCE_MS);
    };

    // Мгновенный чек при (пере)запуске. Базу НЕ сбрасываем: после снятия
    // паузы (закрыт дровер) сравниваем с базой до паузы — так не теряются
    // изменения коллег, случившиеся пока дровер был открыт. Сброс базы
    // делается только при смене филиала (эффект выше).
    void check();
    const intervalMs = wsConnected
      ? DJANGO_REALTIME_FALLBACK_INTERVAL_MS
      : DJANGO_HEARTBEAT_INTERVAL_MS;
    const id = window.setInterval(() => void check(), intervalMs);

    // Мгновенная проверка при возврате на вкладку/окно — иначе обновление ждало
    // бы следующего тика интервала. Главный кейс: работа в двух окнах
    // (регистратор создал приём → врач переключился на свой кабинет и сразу
    // видит его, не дожидаясь следующего тика и не обновляя страницу вручную).
    const onFocus = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      controller.abort();
      wsEventRef.current = null;
      window.clearTimeout(wsDebounce);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [branchId, paused, wsConnected]);
}
