/** Класс подсказки выбора на миниатюре строки (см. SelectionMark). */
export const SELECTION_HINT_CLASS = "selection-mark-hint";

/** Добавить в sx строки: показывает подсказку выбора при наведении мыши. */
export const selectionHintHoverSx = {
  [`&:hover .${SELECTION_HINT_CLASS}`]: { opacity: 1 },
} as const;
