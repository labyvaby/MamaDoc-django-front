import { useMemo, type CSSProperties } from "react";
import { alpha, useTheme } from "@mui/material";

import { subtleBorder } from "../../../../theme/uiHelpers";

/** Оценка на рисунке: норма, пограничное, патология, не оценено. */
export type ArtStatus = "ok" | "warn" | "bad" | "unknown";

/** Цвета рисунков из темы MUI вместо CSS-переменных макета; в скобках — бывшая переменная. */
export interface ArtColors {
  /** Контуры костей (--art). */
  ink: string;
  /** Пунктир нормы, контур стопы, канал позвоночника (--art-soft). */
  inkSoft: string;
  /** Второстепенные подписи (--muted). */
  muted: string;
  /** Заливка мягких тканей (--tissue). */
  tissue: string;
  /** Контур мягких тканей (--tissue-line). */
  tissueLine: string;
  /** Заливка позвонков и черепа (--bone). */
  bone: string;
  /** Поверхность карточки (--surface). */
  surface: string;
  /** Подложка врезки (--sunk). */
  sunk: string;
  /** Тонкая рамка (--rule). */
  rule: string;
  /** Рамка заметнее — контур снимка УЗИ (--rule-strong). */
  ruleStrong: string;
  /** Отвес и размерные линии (--accent). */
  accent: string;
  /** Цвет оценки: линии, подписи. */
  status: (s: ArtStatus) => string;
  /** Полупрозрачная заливка цветом оценки. */
  statusFill: (s: ArtStatus) => string;
}

export function useArtColors(): ArtColors {
  const theme = useTheme();
  return useMemo(() => {
    const text = theme.palette.text.primary;
    const status = (s: ArtStatus): string => {
      if (s === "ok") return theme.palette.success.main;
      if (s === "warn") return theme.palette.warning.main;
      if (s === "bad") return theme.palette.error.main;
      return theme.palette.grey[500];
    };
    return {
      ink: text,
      inkSoft: alpha(text, 0.38),
      muted: theme.palette.text.secondary,
      tissue: alpha(text, theme.palette.mode === "dark" ? 0.1 : 0.07),
      tissueLine: alpha(text, 0.3),
      bone: theme.palette.background.paper,
      surface: theme.palette.background.paper,
      sunk: alpha(text, 0.03),
      rule: subtleBorder(theme),
      ruleStrong: alpha(text, 0.2),
      accent: theme.palette.primary.main,
      status,
      statusFill: (s: ArtStatus) => alpha(status(s), s === "warn" ? 0.22 : 0.16),
    };
  }, [theme]);
}

/** Снимок УЗИ всегда тёмный, поэтому его цвета одинаковы в обеих темах. */
export const US = {
  bg: "#070b0d",
  echo: "#eaf4f5",
  mid: "#8ea4a8",
  ok: "#6fe0a4",
  warn: "#ffc95c",
  bad: "#ff8a7a",
  unknown: "#8ea4a8",
} as const;

/** Рисунок занимает ширину контейнера, высота — по пропорциям viewBox. */
export const artSvgStyle: CSSProperties = { width: "100%", height: "auto", display: "block", fontFamily: "inherit" };
