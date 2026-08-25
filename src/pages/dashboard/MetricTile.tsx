import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link as RouterLink } from "react-router";
import NorthEastOutlined from "@mui/icons-material/NorthEastOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import { subtleBg } from "../../theme/uiHelpers";
import { describeDelta, type DeltaDirection, type MetricDelta } from "./delta";

export type MetricTone = "neutral" | "success" | "warning" | "error";

export type MetricTileProps = {
  label: string;
  /** Готовая к показу строка: форматирование денег и чисел — на стороне виджета. */
  value?: React.ReactNode;
  /** Пояснение под значением: из чего сложилось, с чем сравнивать. */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: MetricTone;
  loading?: boolean;
  /** Подсказка при наведении — для метрик, чьё правило расчёта неочевидно. */
  title?: string;
  /** Сравнение с предыдущим периодом; чип рисуется справа от значения. */
  delta?: MetricDelta;
  /**
   * Куда ведёт клик по плитке. Метрика без перехода — тупик: человек видит
   * проблему и идёт искать её руками через меню.
   */
  href?: string;
};

const TONE_COLOR: Record<MetricTone, "primary" | "success" | "warning" | "error"> = {
  neutral: "primary",
  success: "success",
  warning: "warning",
  error: "error",
};

/** Числа выравниваем по разрядам: иначе значения в соседних плитках «пляшут». */
const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;

const DIRECTION_ICON: Record<DeltaDirection, React.ReactNode> = {
  up: <ArrowUpwardOutlined />,
  down: <ArrowDownwardOutlined />,
  flat: <RemoveOutlined />,
};

// ── Чип изменения ─────────────────────────────────────────────────────────────

const DeltaChip: React.FC<{ delta: MetricDelta }> = ({ delta }) => {
  const view = describeDelta(delta);
  if (!view) return null;

  return (
    <Tooltip title={view.title} arrow placement="top">
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.25}
        sx={(t) => ({
          height: 22,
          px: 0.75,
          borderRadius: "7px",
          flexShrink: 0,
          bgcolor:
            view.tone === "muted"
              ? subtleBg(t, true)
              : alpha(t.palette[view.tone].main, t.palette.mode === "dark" ? 0.2 : 0.14),
          color:
            view.tone === "muted"
              ? "text.secondary"
              : t.palette.mode === "dark"
                ? t.palette[view.tone].light
                : t.palette[view.tone].dark,
          "& .MuiSvgIcon-root": { fontSize: 13 },
        })}
      >
        {DIRECTION_ICON[view.direction]}
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, ...TABULAR }}>
          {view.text}
        </Typography>
      </Stack>
    </Tooltip>
  );
};

// ── Плитка ────────────────────────────────────────────────────────────────────

/**
 * Плитка одной метрики: подпись, крупное значение, чип изменения и приглушённое
 * пояснение. Плоская, как весь новый UI (docs/ui-style-guide.md §5.2) — глубина
 * только тонкой гранью и едва заметной подложкой, без теней и градиентов.
 *
 * Отличие от InfoTile: там значение справочное и мелкое, здесь оно — главное
 * на плитке, потому что дашборд читают глазами по числам, а не по подписям.
 */
export const MetricTile: React.FC<MetricTileProps> = ({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  loading = false,
  title,
  delta,
  href,
}) => {
  const palette = TONE_COLOR[tone];

  const linkProps = href ? ({ component: RouterLink, to: href } as const) : {};

  const body = (
    <Box
      {...linkProps}
      sx={(t) => ({
        p: 2,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: subtleBg(t),
        height: "100%",
        minWidth: 0,
        display: "block",
        textDecoration: "none",
        color: "inherit",
        transition: "background-color .15s ease, border-color .15s ease",
        "&:hover": {
          bgcolor: subtleBg(t, true),
          borderColor: alpha(t.palette.primary.main, href ? 0.45 : 0.28),
        },
        // Стрелка перехода проявляется на ховере — постоянная иконка на каждой
        // плитке засоряла бы экран, а её отсутствие скрывало бы кликабельность.
        "&:hover .metric-tile-go": { opacity: 1 },
      })}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        {icon && (
          <Box
            sx={(t) => ({
              width: 28,
              height: 28,
              borderRadius: "8px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: `${palette}.main`,
              bgcolor: alpha(t.palette[palette].main, t.palette.mode === "dark" ? 0.16 : 0.1),
              "& .MuiSvgIcon-root": { fontSize: 17 },
            })}
          >
            {icon}
          </Box>
        )}
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", fontWeight: 600, lineHeight: 1.2, minWidth: 0 }}
        >
          {label}
        </Typography>
        {href && (
          <NorthEastOutlined
            className="metric-tile-go"
            sx={{
              ml: "auto",
              fontSize: 15,
              color: "text.secondary",
              opacity: 0,
              transition: "opacity .15s ease",
            }}
          />
        )}
      </Stack>

      {loading ? (
        <Skeleton variant="text" width="60%" height={34} />
      ) : (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Typography
            sx={{
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: tone === "neutral" ? "text.primary" : `${palette}.main`,
              overflowWrap: "anywhere",
              ...TABULAR,
            }}
          >
            {value ?? "—"}
          </Typography>
          {delta && <DeltaChip delta={delta} />}
        </Stack>
      )}

      {hint && !loading && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );

  return title ? (
    <Tooltip title={title} placement="top" arrow>
      {body}
    </Tooltip>
  ) : (
    body
  );
};

export default MetricTile;
