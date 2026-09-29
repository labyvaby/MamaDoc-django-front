/**
 * React.lazy со счётчиком «грузится код страницы».
 *
 * BrowserRouter (react-router 7) выполняет каждый переход внутри
 * React.startTransition: пока подгружается код новой страницы, React держит на
 * экране старую и НЕ показывает Suspense-fallback. Адрес уже новый, а экран
 * прежний — выглядит как зависание (жалоба с «Поднять цены» в «Событиях»).
 * Этот счётчик видит, что код страницы грузится, и RouteLoadingBar показывает
 * полоску загрузки сверху.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function subscribeRouteLoading(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRouteLoadingCount(): number {
  return pending;
}

/** Учесть загрузку чанка. Уведомление — микрозадачей: lazy-фабрику React зовёт во время рендера. */
export function trackChunk<T>(promise: Promise<T>): Promise<T> {
  pending += 1;
  queueMicrotask(emit);
  return promise.finally(() => {
    pending -= 1;
    queueMicrotask(emit);
  });
}

// ComponentType<any> — та же сигнатура, что у самого React.lazy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithProgress<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() => trackChunk(factory()));
}
