import { useRef, useCallback } from 'react';

/**
 * Hook для сохранения и восстановления позиции скролла
 *
 * Использование:
 * const { scrollRef, saveScroll, restoreScroll } = useScrollRestoration();
 *
 * <Box ref={scrollRef} sx={{ overflow: 'auto' }}>
 *   // content
 * </Box>
 */
export const useScrollRestoration = () => {
  const scrollRef = useRef<HTMLElement | null>(null);
  const savedPosition = useRef<number>(0);

  const saveScroll = useCallback(() => {
    if (scrollRef.current) {
      savedPosition.current = scrollRef.current.scrollTop;
      return savedPosition.current;
    }
    return 0;
  }, []);

  const restoreScroll = useCallback((position?: number) => {
    if (scrollRef.current) {
      const targetPosition = position ?? savedPosition.current;
      // Используем requestAnimationFrame для надежного восстановления после рендера
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = targetPosition;
        }
      });
    }
  }, []);

  const getCurrentScroll = useCallback(() => {
    return scrollRef.current?.scrollTop ?? 0;
  }, []);

  return {
    scrollRef,
    saveScroll,
    restoreScroll,
    getCurrentScroll,
  };
};
