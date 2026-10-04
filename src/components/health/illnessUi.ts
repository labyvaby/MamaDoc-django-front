import type { Theme } from "@mui/material/styles";

import type { CounterGroup } from "./illnessData";

/**
 * Цвета «Истории болезней» и «Операций и травм» — только из темы, чтобы
 * точки ленты, столбики по месяцам и плитки счётчиков читались и в светлой,
 * и в тёмной теме. Одна группа — один цвет на всех трёх.
 */
export type IllnessMark = CounterGroup | "stay" | "infection";

export function markColor(theme: Theme, mark: IllnessMark): string {
  switch (mark) {
    case "ari":
      return theme.palette.info.main;
    case "otitis":
      return theme.palette.purple.main;
    case "intestinal":
      return theme.palette.teal.main;
    case "stay":
      return theme.palette.error.main;
    case "infection":
      return theme.palette.warning.main;
    default:
      return theme.palette.grey[500];
  }
}

/** Тот же цвет как текст на поверхности (контраст ≈AA в обеих темах). */
export function markTextColor(theme: Theme, mark: IllnessMark): string {
  switch (mark) {
    case "ari":
      return theme.palette.info.onSurface;
    case "otitis":
      return theme.palette.purple.onSurface;
    case "intestinal":
      return theme.palette.teal.onSurface;
    case "stay":
      return theme.palette.error.onSurface;
    case "infection":
      return theme.palette.warning.onSurface;
    default:
      return theme.palette.text.secondary;
  }
}

/**
 * Раскладка карточки раздела зависит от ширины самой карточки, а не экрана:
 * в книжке она широкая, а во вкладке «Здоровье» карточки пациента — узкая
 * колонка и на большом мониторе. Брейкпоинты темы этого не видят.
 */
export const CARD_CONTAINER = "health-card";
export const cardContainerSx = { containerType: "inline-size", containerName: CARD_CONTAINER } as const;
export const whenCardWide = (minWidth: number): string => `@container ${CARD_CONTAINER} (min-width: ${minWidth}px)`;
/** С этой ширины кнопки шапки — с подписью, уже — значками. */
export const CARD_LABELS_FROM = 600;

export const MARK_LABELS: Record<IllnessMark, string> = {
  ari: "ОРЗ",
  otitis: "Отиты",
  intestinal: "Кишечные инфекции",
  other: "Другие болезни",
  stay: "Стационар",
  infection: "Детские инфекции",
};
