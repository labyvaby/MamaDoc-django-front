import React from "react";
import { Box, Chip, Stack, Typography, alpha, useMediaQuery, useTheme } from "@mui/material";
import TrendingDownRounded from "@mui/icons-material/TrendingDownRounded";
import TrendingFlatRounded from "@mui/icons-material/TrendingFlatRounded";
import TrendingUpRounded from "@mui/icons-material/TrendingUpRounded";

import { EyeGraphic } from "./EyeGraphic";
import { refractionLine, type RefractionEye } from "./visionData";
import { displayAcuity, formatAcuity, type EyeStatus } from "./visionNorms";
import { statusColor } from "./visionUi";

const STATUS_LABEL: Record<EyeStatus, string> = {
  ok: "Норма",
  borderline: "Ниже нормы",
  low: "Снижено",
  unknown: "Нет оценки",
};

export interface EyeCardProps {
  side: "OD" | "OS";
  raw: string;
  status: EyeStatus;
  norm: number | null;
  corrected: string;
  /** Острота на прошлом осмотре — для стрелки. */
  previous: string | null;
  trend: "up" | "down" | "same" | null;
  refraction: RefractionEye | null;
}

/**
 * Глаз последнего осмотра: цвет нормы, острота, стрелка к прошлому, рефракция.
 * Как у ребёнка: левый глаз слева, правый справа; рисунки обращены к центру,
 * текст прижат к внешнему краю. На телефоне рисунок над текстом.
 */
export const EyeCard: React.FC<EyeCardProps> = ({ side, raw, status, norm, corrected, previous, trend, refraction }) => {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const color = statusColor(theme, status);
  const left = side === "OS";
  const outer = left ? "flex-start" : "flex-end";
  const inner = left ? "flex-end" : "flex-start";
  const TrendIcon = trend === "up" ? TrendingUpRounded : trend === "down" ? TrendingDownRounded : TrendingFlatRounded;
  const trendColor =
    trend === "up" ? theme.palette.success.main : trend === "down" ? theme.palette.error.main : theme.palette.text.secondary;
  const line = refractionLine(refraction);
  return (
    <Box
      sx={{
        p: { xs: 1.25, md: 1.75 },
        borderRadius: "16px",
        border: `1px solid ${alpha(color, 0.45)}`,
        bgcolor: alpha(color, 0.06),
        display: "flex",
        flexDirection: { xs: "column", md: left ? "row-reverse" : "row" },
        alignItems: { xs: "stretch", md: "center" },
        gap: { xs: 1, md: 1.75 },
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: { xs: inner, md: "center" }, flexShrink: 0 }}>
        <EyeGraphic status={status} mirrored={left} size={narrow ? 76 : 92} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, textAlign: left ? "left" : "right" }}>
        <Typography variant="caption" color="text.secondary">
          {left ? "Левый глаз · OS" : "Правый глаз · OD"}
        </Typography>
        <Stack direction="row" alignItems="baseline" justifyContent={outer} gap={1} flexWrap="wrap">
          <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
            {raw.trim() ? displayAcuity(raw) : "—"}
          </Typography>
          {trend && previous && (
            <Stack direction="row" alignItems="center" gap={0.25} sx={{ color: trendColor }}>
              <TrendIcon fontSize="small" />
              <Typography variant="caption" color="inherit">
                было {displayAcuity(previous)}
              </Typography>
            </Stack>
          )}
        </Stack>
        <Chip
          size="small"
          label={norm != null ? `${STATUS_LABEL[status]} · норма от ${formatAcuity(norm)}` : STATUS_LABEL[status]}
          sx={{
            mt: 0.5,
            height: "auto",
            minHeight: 22,
            py: 0.25,
            maxWidth: "100%",
            "& .MuiChip-label": { whiteSpace: "normal" },
            borderRadius: "6px",
            fontWeight: 600,
            bgcolor: alpha(color, 0.16),
            color: status === "unknown" ? "text.secondary" : color,
          }}
        />
        {corrected.trim() && (
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            с коррекцией {displayAcuity(corrected)}
          </Typography>
        )}
        {line && (
          <Typography variant="caption" color="text.secondary" display="block">
            {line}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
