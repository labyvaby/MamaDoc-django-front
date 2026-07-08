import React from "react";
import { getAppointmentsLastUpdate } from "../api/appointments";
import { isAbortError } from "../api/client";
import { DJANGO_HEARTBEAT_INTERVAL_MS } from "../api/queryKeys";

type Options = {
  /** Узкий фильтр по филиалу (как у списка приёмов). */
  branchId?: number;
  /** Пауза фонового чека (например, открыт дровер создания/редактирования). */
  paused?: boolean;
  /** Вызывается ОДИН РАЗ, когда обнаружено изменение приёмов. */
  onChange: () => void;
};

/**
 * Лёгкая timestamp-синхронизация календаря приёмов вместо интервального
 * поллинга тяжёлого списка.
 *
 * Каждые DJANGO_HEARTBEAT_INTERVAL_MS (2.5с) запрашивает дешёвый `last-update`
 * (max updated_at). Базовый таймстамп фиксируется при первом ответе БЕЗ вызова
 * onChange (открытие страницы не должно дёргать refetch). Дальше, если
 * таймстамп сдвинулся — значит кто-то в клинике добавил/изменил приём —
 * вызывает onChange() ровно один раз (там делается единичный refetch
 * тяжёлого списка).
 *
 * Чек не идёт когда `paused` (открыт дровер) или вкладка скрыта. База при этом
 * СОХРАНЯЕТСЯ: первый чек после снятия паузы/возврата на вкладку сравнивает с
 * базой до паузы, поэтому изменения, случившиеся пока дровер был открыт,
 * подтягиваются сразу после его закрытия, а не теряются.
 */
export function useAppointmentsAutoSync({ branchId, paused, onChange }: Options): void {
  const lastSeenRef = React.useRef<string | null>(null);
  // onChange держим в ref, чтобы интервал не пересоздавался на каждый рендер.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

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

    // Мгновенный чек при (пере)запуске. Базу НЕ сбрасываем: после снятия
    // паузы (закрыт дровер) сравниваем с базой до паузы — так не теряются
    // изменения коллег, случившиеся пока дровер был открыт. Сброс базы
    // делается только при смене филиала (эффект выше).
    void check();
    const id = window.setInterval(() => void check(), DJANGO_HEARTBEAT_INTERVAL_MS);

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
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [branchId, paused]);
}
