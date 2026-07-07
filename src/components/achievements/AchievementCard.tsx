import React from "react";
import { Box, Chip, LinearProgress, Stack, Typography, alpha } from "@mui/material";

import { formatDateRu } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import type {
  AchievementDefinition,
  AchievementProgress,
  EarnedAchievement,
} from "../../api/achievements";
import { AchievementBadge } from "./AchievementBadge";
import { tierColors, tierTone } from "./meta";

export interface AchievementCardProps {
  definition: AchievementDefinition;
  /** Высший полученный уровень (null — ещё не получено). */
  earned: EarnedAchievement | null;
  /** Текущее значение метрики и следующий порог (null — нет данных, напр. чужой профиль). */
  progress: AchievementProgress | null;
}

const formatNumber = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

/**
 * Карточка достижения: бейдж уровня + название + прогресс до следующего порога.
 * Главный мотивирующий элемент — видимый прогресс («487 из 500»), не сам бейдж.
 */
export const AchievementCard: React.FC<AchievementCardProps> = ({
  definition,
  earned,
  progress,
}) => {
  const tiersCount = definition.tiers.length;
  const earnedTone = earned ? tierTone(earned.level, tiersCount) : null;

  const nextTier =
    progress?.nextLevel != null
      ? definition.tiers.find((t) => t.level === progress.nextLevel) ?? null
      : null;
  const maxed = progress != null && progress.nextLevel == null;

  // Доля до следующего порога; для полученного максимума полоса не нужна.
  const pct =
    nextTier && progress
      ? Math.min(100, Math.round((progress.currentValue / nextTier.threshold) * 100))
      : null;
  const nextTone = nextTier ? tierTone(nextTier.level, tiersCount) : null;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={(t) => ({
        px: 1.5,
        py: 1.25,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: earned ? "background.paper" : subtleBg(t),
        minWidth: 0,
      })}
    >
      <AchievementBadge code={definition.code} tone={earnedTone} />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {definition.title}
          </Typography>
          {earned && (
            <Chip
              size="small"
              label={earned.tierName}
              sx={(t) => {
                const colors = tierColors(t, earnedTone!);
                return {
                  height: 20,
                  borderRadius: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: colors.fg,
                  bgcolor: alpha(colors.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                };
              }}
            />
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {definition.description}
        </Typography>

        {nextTier && progress && (
          <Box sx={{ mt: 0.75 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
              <Typography variant="caption" color="text.secondary">
                {formatNumber(progress.currentValue)} из {formatNumber(nextTier.threshold)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                след. {nextTier.name}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={pct ?? 0}
              sx={(t) => {
                const colors = tierColors(t, nextTone!);
                return {
                  height: 6,
                  borderRadius: 3,
                  bgcolor: subtleBg(t, true),
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 3,
                    bgcolor: colors.main,
                  },
                };
              }}
            />
          </Box>
        )}

        {maxed && (
          <Typography
            variant="caption"
            sx={(t) => ({
              mt: 0.5,
              display: "inline-block",
              fontWeight: 600,
              color: t.palette.mode === "dark" ? t.palette.success.light : t.palette.success.dark,
            })}
          >
            Максимальный уровень
            {earned && ` · ${formatDateRu(earned.achievedAt)}`}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

export default AchievementCard;
