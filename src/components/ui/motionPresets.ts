/**
 * Пресеты framer-motion по гайду (docs/ui-style-guide.md §6): один аккуратный
 * каскад появления блоков на загрузку страницы, без микро-анимаций на всём.
 *
 * @example
 * const MotionBox = motion(Box);
 * <MotionBox variants={cascadeContainer} initial="hidden" animate="show">
 *   <MotionBox variants={cascadeItem}>…</MotionBox>
 * </MotionBox>
 */

/** Контейнерный вариант — каскадное появление дочерних блоков при загрузке. */
export const cascadeContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.03 },
  },
};

/** Элемент каскада — мягкий подъём + проявление. */
export const cascadeItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
};
