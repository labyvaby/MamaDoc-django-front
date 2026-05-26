import { useEffect, useRef, useState, useCallback } from 'react';
import { usePageCacheTyped } from '../contexts/page-cache-context';

/**
 * Универсальный hook для кеширования состояния страниц
 *
 * Использование:
 *
 * const {
 *   state,
 *   setState,
 *   isRestored
 * } = usePageStateCache<MyPageState>('my-page', initialState);
 *
 * if (!isRestored) {
 *   return <Loading />; // Показываем loader только при первой загрузке
 * }
 */
export function usePageStateCache<T>(
  pageKey: string,
  initialState: T,
  options?: {
    debounceMs?: number;
    onRestore?: (cachedState: T) => void;
  }
) {
  const cache = usePageCacheTyped<T>(pageKey);
  const [isRestored, setIsRestored] = useState(false);

  // Восстанавливаем состояние из кеша или используем начальное
  const cachedData = cache.load();
  const [state, setStateInternal] = useState<T>(cachedData ?? initialState);

  // Флаг для отслеживания первого рендера
  const isFirstRender = useRef(true);

  // Восстановление из кеша при монтировании
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;

      if (cachedData) {
        // Вызываем callback если нужно
        options?.onRestore?.(cachedData);
      }

      setIsRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced сохранение в кеш
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  useEffect(() => {
    // Не сохраняем пока не восстановились
    if (!isRestored) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const debounceMs = options?.debounceMs ?? 100;
    saveTimeoutRef.current = setTimeout(() => {
      cache.save(state);
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, isRestored, cache, options?.debounceMs]);

  // Обертка для setState с возможностью функционального обновления
  const setState = useCallback((update: T | ((prev: T) => T)) => {
    setStateInternal(update);
  }, []);

  // Метод для очистки кеша
  const clearCache = useCallback(() => {
    cache.clear();
  }, [cache]);

  // Метод для сохранения scroll position
  const saveScrollPosition = useCallback((position: number) => {
    cache.save(state, position);
  }, [cache, state]);

  // Получение scroll position
  const getScrollPosition = useCallback(() => {
    return cache.getScrollPosition();
  }, [cache]);

  return {
    state,
    setState,
    isRestored,
    hasCachedData: !!cachedData,
    clearCache,
    saveScrollPosition,
    getScrollPosition,
  };
}
