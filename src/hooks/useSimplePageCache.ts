import { useEffect, useRef } from 'react';
import { usePageCache } from '../contexts/page-cache-context';

/**
 * Простой hook для автоматического кеширования любых данных страницы
 * Не требует изменения логики компонента
 *
 * Использование:
 * function MyPage() {
 *   const [data, setData] = useState([]);
 *   const [selected, setSelected] = useState(null);
 *
 *   // Автоматически кеширует и восстанавливает состояние
 *   const { restoreState, saveState, skipFetch } = useSimplePageCache('my-page', {
 *     data, selected
 *   });
 *
 *   useEffect(() => {
 *     const cached = restoreState();
 *     if (cached) {
 *       setData(cached.data);
 *       setSelected(cached.selected);
 *       return; // Пропускаем fetch
 *     }
 *     // Загружаем данные только если нет кеша
 *     fetchData();
 *   }, []);
 *
 *   // Автоматически сохраняет при изменении
 *   useEffect(() => {
 *     saveState({ data, selected });
 *   }, [data, selected]);
 * }
 */
export function useSimplePageCache<T extends Record<string, unknown>>(
  pageKey: string,
  currentState?: T
) {
  const { getPageState, setPageState, hasPageState } = usePageCache();
  const isRestoredRef = useRef(false);

  // Восстановление состояния
  const restoreState = (): T | null => {
    if (isRestoredRef.current) return null;
    isRestoredRef.current = true;

    const cached = getPageState<T>(pageKey);
    return cached ? cached.data : null;
  };

  // Сохранение состояния с debounce
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const saveState = (state: T, scrollPosition?: number) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      setPageState(pageKey, state, scrollPosition);
    }, 100);
  };

  // Автоматическое сохранение при изменении currentState
  useEffect(() => {
    if (currentState && isRestoredRef.current) {
      saveState(currentState);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [currentState]);

  return {
    restoreState,
    saveState,
    hasCachedData: hasPageState(pageKey),
    skipFetch: hasPageState(pageKey),
  };
}
