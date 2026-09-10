import * as React from "react";

export type KeyboardViewport = {
  /** CSS-высота листа: над клавиатурой, либо фолбэк, если её нет */
  height: string;
  /** Отступ снизу до клавиатуры (для fixed-листа, прижатого к низу окна) */
  bottom: string;
  /** Клавиатура открыта */
  keyboardOpen: boolean;
  /** Высота видимой области над клавиатурой, px (0 — клавиатуры нет) */
  availableHeight: number;
  /** Сколько экрана снизу занимает клавиатура, px (0 — её нет) */
  keyboardInset: number;
};

/**
 * Размеры мобильного листа с учётом экранной клавиатуры.
 *
 * `100dvh` считается по вьюпорту БЕЗ клавиатуры: открытая клавиатура накрывает
 * нижнюю треть листа вместе с кнопками формы, браузер ещё и проскроллит
 * контейнер к полю — врач печатает «в щель». `visualViewport` даёт реальную
 * область над клавиатурой, и лист сжимается ровно до неё: поле, шапка и
 * кнопки остаются на экране.
 *
 * Если API нет (старый Safari, SSR) или клавиатура закрыта — поведение
 * прежнее: высота `fallback`, лист прижат к низу.
 *
 * @param enabled следить только когда лист открыт — иначе лишние слушатели
 * @param fallback высота листа без клавиатуры
 */
export function useKeyboardViewportHeight(
  enabled: boolean,
  fallback = "100dvh",
): KeyboardViewport {
  const [vv, setVv] = React.useState<{ height: number; inset: number } | null>(null);

  React.useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !viewport) {
      setVv(null);
      return;
    }
    const sync = () => {
      // Клавиатуру считаем открытой при заметной разнице с окном: мелкие
      // расхождения дают адресная строка и «резиновый» скролл iOS.
      const inset = window.innerHeight - viewport.height - viewport.offsetTop;
      setVv(
        window.innerHeight - viewport.height > 120
          ? { height: Math.round(viewport.height), inset: Math.max(0, Math.round(inset)) }
          : null,
      );
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [enabled]);

  return {
    height: vv ? `${vv.height}px` : fallback,
    bottom: vv ? `${vv.inset}px` : "0px",
    keyboardOpen: vv !== null,
    availableHeight: vv ? vv.height : 0,
    keyboardInset: vv ? vv.inset : 0,
  };
}

export default useKeyboardViewportHeight;
