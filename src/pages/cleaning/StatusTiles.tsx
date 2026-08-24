import React from "react";
import { Box, ButtonBase, Skeleton, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import HighlightOffOutlined from "@mui/icons-material/HighlightOffOutlined";

import { subtleBg } from "../../theme/uiHelpers";
import type { CleaningRecordStatus } from "../../api/cleaning";

export type StatusTileValue = CleaningRecordStatus | "all";

export interface StatusCounts {
  pending: number;
  approved: number;
  rejected: number;
}

interface TileMeta {
  key: StatusTileValue;
  label: string;
  icon: React.ReactNode;
  /** Ключ палитры: у «всех» нейтральный акцент, у статусов — их собственный. */
  tone: "primary" | "warning" | "success" | "error";
}

const TILES: TileMeta[] = [
  { key: "all", label: "Все уборки", icon: <ChecklistOutlined />, tone: "primary" },
  { key: "pending", label: "Ждут подтверждения", icon: <HourglassEmptyOutlined />, tone: "warning" },
  { key: "approved", label: "Подтверждены", icon: <TaskAltOutlined />, tone: "success" },
  { key: "rejected", label: "Отклонены", icon: <HighlightOffOutlined />, tone: "error" },
];

export interface StatusTilesProps {
  counts: StatusCounts | null;
  value: StatusTileValue;
  onChange: (value: StatusTileValue) => void;
  loading?: boolean;
}

/**
 * Плитки-фильтры по статусу: заменяют выпадающий список «Статус» — те же четыре
 * состояния, но сразу видно, сколько уборок ждёт решения администратора (ради
 * этого числа страницу и открывают). Клик по активной плитке снимает фильтр.
 */
export const StatusTiles: React.FC<StatusTilesProps> = ({ counts, value, onChange, loading }) => {
  const total = counts ? counts.pending + counts.approved + counts.rejected : null;
  const valueOf = (key: StatusTileValue): number | null => {
    if (!counts) return null;
    return key === "all" ? (total ?? 0) : counts[key];
  };

  return (
    <Box
      sx={{
        display: "grid",
        // На телефоне четыре плитки в ряд превратились бы в горизонтальную
        // прокрутку с обрезанными подписями — там сетка 2×2.
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
        gap: 1,
      }}
    >
      {TILES.map((tile) => {
        const active = value === tile.key;
        const count = valueOf(tile.key);
        const toneColor = (t: Theme) => t.palette[tile.tone].main;

        return (
          <ButtonBase
            key={tile.key}
            onClick={() => onChange(active && tile.key !== "all" ? "all" : tile.key)}
            sx={(t) => ({
              minWidth: 0,
              px: 1.5,
              py: 1.25,
              gap: 1.25,
              justifyContent: "flex-start",
              borderRadius: "10px",
              border: 1,
              borderColor: active ? alpha(toneColor(t), 0.5) : "divider",
              bgcolor: active
                ? alpha(toneColor(t), t.palette.mode === "dark" ? 0.16 : 0.08)
                : subtleBg(t),
              transition: "background-color .15s ease, border-color .15s ease",
              "&:hover": {
                borderColor: alpha(toneColor(t), 0.4),
                bgcolor: active
                  ? alpha(toneColor(t), t.palette.mode === "dark" ? 0.2 : 0.11)
                  : subtleBg(t, true),
              },
            })}
          >
            <Box
              sx={(t) => ({
                width: 34,
                height: 34,
                borderRadius: "9px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: t.palette[tile.tone].main,
                bgcolor: alpha(toneColor(t), t.palette.mode === "dark" ? 0.18 : 0.12),
                "& .MuiSvgIcon-root": { fontSize: 18 },
              })}
            >
              {tile.icon}
            </Box>
            <Box sx={{ minWidth: 0, textAlign: "left" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                // Без noWrap: на узкой плитке «Ждут подтверждения» переносится
                // на две строки, а не обрезается многоточием.
                sx={{ display: "block", lineHeight: 1.2 }}
              >
                {tile.label}
              </Typography>
              {loading && count === null ? (
                <Skeleton width={28} height={20} />
              ) : (
                <Typography variant="subtitle2" fontWeight={700}>
                  {count ?? "—"}
                </Typography>
              )}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
};

export default StatusTiles;
