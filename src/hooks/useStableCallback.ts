import React from "react";

/**
 * Колбэк с неизменной ссылкой, который всегда вызывает свежую версию `fn`.
 *
 * Родитель часто передаёт обработчики стрелками прямо в JSX — новая ссылка на
 * каждый его рендер. Мемоизированным тяжёлым детям (сетка «Окон») это ломает
 * `React.memo`: любой рендер родителя перерисовывает всё дерево. Через эту
 * обёртку ссылка одна на всё время жизни компонента.
 *
 * Результат вызывать только из обработчиков событий, не во время рендера.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  return React.useCallback((...args: A) => ref.current(...args), []);
}
