import React from "react";

/**
 * Сколько держать палец, чтобы включить выбор. Чуть меньше системного
 * долгого касания Android (400–500 мс): иначе браузер успевает забрать жест
 * себе раньше таймера.
 */
const LONG_PRESS_MS = 380;
/** Сдвиг пальца дальше этого — прокрутка списка, а не долгое нажатие. */
const MOVE_TOLERANCE_PX = 10;
/** contextmenu позже этого после касания — уже не наш жест. */
const CONTEXT_MENU_WINDOW_MS = 1500;

type Press = {
  id: number;
  pointerType: string;
  x: number;
  y: number;
  startedAt: number;
  /** Палец ушёл дальше допуска — это прокрутка, жест отменён насовсем. */
  moved: boolean;
};

type Handlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

/**
 * Долгое нажатие на строку списка. `bind(id)` раздаёт обработчики строке,
 * `consumeClick()` говорит, что текущий click — хвост долгого нажатия и его
 * надо проглотить (иначе отпускание пальца тут же снимет только что
 * поставленную отметку или откроет карточку).
 *
 * Срабатывает по тому, что наступит раньше: свой таймер или системное
 * долгое касание. Chrome на Android сам распознаёт долгое касание, шлёт
 * contextmenu и прерывает касание (pointercancel), поэтому contextmenu от
 * неподвижного пальца тоже включает выбор, а pointercancel без сдвига жест
 * не сбрасывает — прокрутку отсекает отдельный сторож по событию scroll.
 */
export function useLongPress(onLongPress: (id: number) => void, enabled: boolean) {
  const timerRef = React.useRef<number | undefined>(undefined);
  const pressRef = React.useRef<Press | null>(null);
  const firedRef = React.useRef(false);
  const callbackRef = React.useRef(onLongPress);
  callbackRef.current = onLongPress;

  const stopScrollGuardRef = React.useRef<(() => void) | null>(null);

  const clearTimer = React.useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    stopScrollGuardRef.current?.();
    stopScrollGuardRef.current = null;
  }, []);

  const reset = React.useCallback(() => {
    clearTimer();
    pressRef.current = null;
  }, [clearTimer]);

  const fire = React.useCallback(() => {
    const press = pressRef.current;
    clearTimer();
    pressRef.current = null;
    if (!press || press.moved) return;
    firedRef.current = true;
    callbackRef.current(press.id);
  }, [clearTimer]);

  React.useEffect(() => reset, [reset]);

  const bind = React.useCallback(
    (id: number): Handlers => ({
      onPointerDown: (e) => {
        // Только основная кнопка мыши; касание и перо — всегда.
        if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
        firedRef.current = false;
        pressRef.current = {
          id,
          pointerType: e.pointerType,
          x: e.clientX,
          y: e.clientY,
          startedAt: Date.now(),
          moved: false,
        };
        clearTimer();
        timerRef.current = window.setTimeout(fire, LONG_PRESS_MS);
        // Любая прокрутка, пока палец лежит, — это не долгое нажатие. Ловим
        // само событие scroll: после pointercancel браузер pointermove уже
        // не шлёт, и по сдвигу пальца прокрутку не отличить.
        const onScroll = () => {
          if (pressRef.current) pressRef.current.moved = true;
          clearTimer();
        };
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        stopScrollGuardRef.current = () =>
          document.removeEventListener("scroll", onScroll, { capture: true });
      },
      onPointerMove: (e) => {
        const press = pressRef.current;
        if (!press || press.moved) return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) {
          press.moved = true;
          clearTimer();
        }
      },
      onPointerUp: reset,
      // Браузер забрал касание себе: либо прокрутка — её отсекает
      // scroll-сторож выше, либо его собственное долгое касание (Android
      // следом пришлёт contextmenu, iOS — ничего). Неподвижное касание
      // поэтому не сбрасываем: сработает таймер или contextmenu.
      onPointerCancel: () => {
        const press = pressRef.current;
        if (!press || press.moved || press.pointerType === "mouse") reset();
      },
      onPointerLeave: (e) => {
        // У касания leave приходит и при отпускании — это не повод отменять.
        if (e.pointerType === "mouse") reset();
      },
      onContextMenu: (e) => {
        const press = pressRef.current;
        const ours =
          press !== null &&
          !press.moved &&
          press.pointerType !== "mouse" &&
          Date.now() - press.startedAt < CONTEXT_MENU_WINDOW_MS;
        if (ours) {
          e.preventDefault();
          fire();
        } else if (firedRef.current) {
          // Системное меню после уже сработавшего жеста.
          e.preventDefault();
        }
      },
    }),
    [clearTimer, enabled, fire, reset],
  );

  const consumeClick = React.useCallback(() => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  }, []);

  return { bind, consumeClick };
}
