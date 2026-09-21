import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import SmartToyOutlined from "@mui/icons-material/SmartToyOutlined";

import { exactMoment } from "../../pages/deals/meta";
import { formatSeconds, type StageSegment } from "./stageSegments";

/** Открытый сегмент дышит: сделка ещё в работе, отрезок растёт. */
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
`;

/** Подпись под сегментом — только если ему хватает ширины. */
const LABEL_MIN_SHARE = 0.15;

interface StageTimelineProps {
  segments: StageSegment[];
  /** `full` — полоса 8px с подписями и тултипами (дровер); `compact` — 3px (карточка). */
  variant?: "full" | "compact";
}

/**
 * Цветная линия пути сделки по этапам: ширина сегмента ∝ времени в этапе.
 *
 * Возвраты назад видны как повтор цвета; последний открытый сегмент
 * пульсирует. Данные — `DealStageLog`, разложенный `buildStageSegments`.
 */
const StageTimeline: React.FC<StageTimelineProps> = ({
  segments,
  variant = "full",
}) => {
  if (segments.length === 0) return null;
  const compact = variant === "compact";
  const height = compact ? 3 : 8;

  return (
    <Stack gap={0.5} sx={{ mt: compact ? 0.75 : 0 }} aria-hidden={compact}>
      <Stack
        direction="row"
        role={compact ? undefined : "img"}
        aria-label={
          compact
            ? undefined
            : segments
                .map((s) => `${s.name} — ${formatSeconds(s.seconds)}`)
                .join(", ")
        }
        sx={{
          height,
          borderRadius: height / 2,
          overflow: "hidden",
          gap: "1px",
          bgcolor: "action.hover",
        }}
      >
        {segments.map((seg, i) => {
          const bar = (
            <Box
              key={`${seg.stageId}-${i}`}
              sx={{
                flex: `${seg.share} 0 0`,
                minWidth: 2,
                bgcolor: seg.color,
                animation: seg.open
                  ? `${pulse} 2s ease-in-out infinite`
                  : "none",
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
              }}
            />
          );
          if (compact) return bar;
          return (
            <Tooltip
              key={`${seg.stageId}-${i}`}
              title={
                <Stack gap={0.25}>
                  <Typography variant="caption" fontWeight={600}>
                    {seg.name} · {formatSeconds(seg.seconds)}
                  </Typography>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    {seg.actorKind === "bot" ? (
                      <SmartToyOutlined
                        sx={{
                          fontSize: 12,
                          color: seg.actorColor ?? "inherit",
                        }}
                      />
                    ) : null}
                    <Typography variant="caption">
                      {seg.actorName ?? "—"} · {exactMoment(seg.from)}
                    </Typography>
                  </Stack>
                </Stack>
              }
              placement="top"
            >
              {bar}
            </Tooltip>
          );
        })}
      </Stack>
      {!compact ? (
        <Stack direction="row" sx={{ gap: "1px" }}>
          {segments.map((seg, i) => (
            <Box
              key={`${seg.stageId}-label-${i}`}
              sx={{ flex: `${seg.share} 0 0`, minWidth: 0 }}
            >
              {seg.share >= LABEL_MIN_SHARE ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ display: "block" }}
                >
                  {seg.name}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

export default StageTimeline;
