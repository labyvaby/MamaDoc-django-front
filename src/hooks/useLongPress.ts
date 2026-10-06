import React from "react";

/** Как в галерее телефона: столько держать палец, чтобы включить выбор. */
const LONG_PRESS_MS = 450;
/** Сдвиг пальца дальше этого — прокрутка списка, а не долгое нажатие. */
const MOVE_TOLERANCE_PX = 10;

type Handlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

/**
 * Долгое нажатие на строку списка. `bind(id)` раздаёт обработчики строке,
 * `consumeClick()` говорит, что текущий click — хвост долгого нажатия и его
 * надо проглотить (иначе отпускание пальца тут же снимет только что
 * поставленную отметку или откроет карточку).
 */
export function useLongPress(onLongPress: (id: number) => void, enabled: boolean) {
  const timerRef = React.useRef<number | undefined>(undefined);
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const firedRef = React.useRef(false);
  const callbackRef = React.useRef(onLongPress);
  callbackRef.current = onLongPress;

  const cancel = React.useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    startRef.current = null;
  }, []);

  React.useEffect(() => cancel, [cancel]);

  const bind = React.useCallback(
    (id: number): Handlers => ({
      onPointerDown: (e) => {
        // Только основная кнопка мыши; касание и перо — всегда.
        if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
        firedRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = undefined;
          startRef.current = null;
          firedRef.current = true;
          callbackRef.current(id);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e) => {
        const start = startRef.current;
        if (!start) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // Долгое касание на Android открывает контекстное меню браузера.
      onContextMenu: (e) => {
        if (timerRef.current !== undefined || firedRef.current) e.preventDefault();
      },
    }),
    [cancel, enabled],
  );

  const consumeClick = React.useCallback(() => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  }, []);

  return { bind, consumeClick };
}
