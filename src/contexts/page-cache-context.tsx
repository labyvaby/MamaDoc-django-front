import React, { createContext, useContext, useCallback, useRef } from 'react';

/**
 * Типы для состояния страниц
 */
export interface PageState<T = unknown> {
  data: T;
  timestamp: number;
  scrollPosition?: number;
}

interface PageCacheContextValue {
  getPageState: <T>(key: string) => PageState<T> | null;
  setPageState: <T>(key: string, data: T, scrollPosition?: number) => void;
  clearPageState: (key: string) => void;
  clearAllPages: () => void;
  hasPageState: (key: string) => boolean;
}

const PageCacheContext = createContext<PageCacheContextValue | null>(null);

/**
 * Provider для кеширования состояния страниц
 * Хранит данные в памяти (не в localStorage)
 */
export const PageCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cacheRef = useRef<Map<string, PageState>>(new Map());

  const getPageState = useCallback(<T,>(key: string): PageState<T> | null => {
    const state = cacheRef.current.get(key);
    return state ? (state as PageState<T>) : null;
  }, []);

  const setPageState = useCallback(<T,>(key: string, data: T, scrollPosition?: number) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now(),
      scrollPosition,
    });
  }, []);

  const clearPageState = useCallback((key: string) => {
    cacheRef.current.delete(key);
  }, []);

  const clearAllPages = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const hasPageState = useCallback((key: string): boolean => {
    return cacheRef.current.has(key);
  }, []);

  const value: PageCacheContextValue = {
    getPageState,
    setPageState,
    clearPageState,
    clearAllPages,
    hasPageState,
  };

  return <PageCacheContext.Provider value={value}>{children}</PageCacheContext.Provider>;
};

/**
 * Hook для использования кеша страниц
 */
export const usePageCache = () => {
  const context = useContext(PageCacheContext);
  if (!context) {
    throw new Error('usePageCache must be used within PageCacheProvider');
  }
  return context;
};

/**
 * Типизированный hook для конкретной страницы
 * Использование:
 *
 * const cache = usePageCacheTyped<MyPageData>('patient-search');
 *
 * // Сохранить
 * cache.save({ patients: [...], selected: patient });
 *
 * // Загрузить
 * const cached = cache.load();
 * if (cached) {
 *   setPatients(cached.patients);
 *   setSelected(cached.selected);
 * }
 */
export const usePageCacheTyped = <T,>(pageKey: string) => {
  const { getPageState, setPageState, clearPageState, hasPageState } = usePageCache();

  return {
    load: (): T | null => {
      const state = getPageState<T>(pageKey);
      return state ? state.data : null;
    },
    save: (data: T, scrollPosition?: number) => {
      setPageState(pageKey, data, scrollPosition);
    },
    clear: () => {
      clearPageState(pageKey);
    },
    exists: (): boolean => {
      return hasPageState(pageKey);
    },
    getScrollPosition: (): number | undefined => {
      const state = getPageState<T>(pageKey);
      return state?.scrollPosition;
    },
  };
};
