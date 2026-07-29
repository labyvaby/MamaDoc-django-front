import React from "react";
import {
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";

import { subtleBg } from "../../../theme";

export type SummaryCardColor =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info";

export interface SummaryCard {
  title: string;
  primaryValue: string;
  secondaryText: string;
  /**
   * Акцентный цвет плитки. Не задан — нейтральная плитка (подложка + текст
   * темы). Цвет оставляем только тому, что требует реакции (ожидание, отмены,
   * долги): когда раскрашены все плитки, глазу не за что зацепиться.
   */
  color?: SummaryCardColor;
}

export interface SummaryCardGroup {
  /** Подпись группы; без неё группа рисуется просто как ряд плиток. */
  title?: string;
  cards: SummaryCard[];
}

interface SummaryCardsProps {
  /** Плоский список плиток (одна группа без заголовка). */
  cards?: SummaryCard[];
  /** Смысловые группы плиток; имеет приоритет над `cards`. */
  groups?: SummaryCardGroup[];
  loading?: boolean;
}

/**
 * Минимальная ширина плитки. Ниже неё подписи вида «Всего: 264 · Отменено: 11»
 * уже не помещаются, поэтому лишние плитки переносятся на следующую строку, а
 * не сжимаются до неразборчивого состояния.
 */
const MIN_CARD_WIDTH = 168;

const gridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(2, minmax(0, 1fr))",
    sm: `repeat(auto-fit, minmax(${MIN_CARD_WIDTH}px, 1fr))`,
  },
  gap: { xs: 1, md: 1.5 },
} as const;

const SummaryCardTile: React.FC<{ card: SummaryCard }> = ({ card }) => {
  const { color } = card;
  return (
    <Tooltip title={card.secondaryText || ""} disableInteractive>
      <Card
        variant="outlined"
        sx={(t) => ({
          height: "100%",
          bgcolor: color
            ? alpha(t.palette[color].main, t.palette.mode === "dark" ? 0.16 : 0.08)
            : subtleBg(t),
          borderColor: color
            ? alpha(t.palette[color].main, t.palette.mode === "dark" ? 0.32 : 0.22)
            : "divider",
        })}
      >
        <CardContent
          sx={{
            p: { xs: 1, md: 1.25 },
            "&:last-child": { pb: { xs: 1, md: 1.25 } },
          }}
        >
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            <Typography
              noWrap
              sx={{
                color: color ? `${color}.onSurface` : "text.secondary",
                fontWeight: 600,
                fontSize: { xs: "0.65rem", md: "0.7rem" },
                lineHeight: 1.3,
              }}
            >
              {card.title}
            </Typography>
            <Typography
              noWrap
              fontWeight={700}
              sx={{
                color: color ? `${color}.onSurface` : "text.primary",
                fontSize: { xs: "1.05rem", sm: "1.15rem", md: "1.25rem" },
                lineHeight: 1.15,
              }}
            >
              {card.primaryValue}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: "text.secondary",
                display: "block",
                fontSize: { xs: "0.6rem", md: "0.65rem" },
                lineHeight: 1.3,
              }}
            >
              {card.secondaryText}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Tooltip>
  );
};

/**
 * Ряды сводных плиток над отчётами. Один визуал для «Отчётов» и «Отчёта по
 * зарплате»: плоско, тинт цвета статуса вместо градиента, текст — контраст-
 * безопасный `*.onSurface` (в тёмной теме `*.dark` сливался с фоном).
 */
export const SummaryCards: React.FC<SummaryCardsProps> = ({
  cards,
  groups,
  loading = false,
}) => {
  const resolvedGroups: SummaryCardGroup[] = groups ?? [{ cards: cards ?? [] }];
  const totalCards = resolvedGroups.reduce((sum, g) => sum + g.cards.length, 0);

  if (loading) {
    return (
      <Box sx={gridSx}>
        {Array.from({ length: Math.max(totalCards, 6) }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={76} sx={{ borderRadius: "14px" }} />
        ))}
      </Box>
    );
  }

  return (
    <Stack spacing={{ xs: 1.25, md: 1.5 }}>
      {resolvedGroups.map((group, groupIdx) => (
        <Box key={group.title ?? groupIdx}>
          {group.title && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 0.75,
                color: "text.secondary",
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
            >
              {group.title}
            </Typography>
          )}
          <Box sx={gridSx}>
            {group.cards.map((card, idx) => (
              <SummaryCardTile key={idx} card={card} />
            ))}
          </Box>
        </Box>
      ))}
    </Stack>
  );
};
