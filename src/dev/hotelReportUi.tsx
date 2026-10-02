/**
 * Общие детали отчётов отеля: KPI с динамикой к прошлому периоду, секция с
 * заголовком и ссылкой на связанный отчёт, полоска доли, суммы в валюте.
 * Отчёты связаны между собой — у KPI и секций есть onClick/action, которые
 * открывают соседний отчёт с нужным фильтром.
 */
import React from "react";
import { Box, ButtonBase, LinearProgress, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowOutwardOutlined from "@mui/icons-material/ArrowOutwardOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import NorthEastOutlined from "@mui/icons-material/NorthEastOutlined";
import SouthEastOutlined from "@mui/icons-material/SouthEastOutlined";

import { subtleBorder } from "../theme/uiHelpers";
import { fmtPercent } from "./hotelReportFormat";
import { Surface } from "./hotelUi";

export type ReportTone = "primary" | "success" | "info" | "warning" | "error";

/**
 * KPI отчёта. delta — изменение к прошлому периоду (в процентах или п.п.),
 * goodWhenUp — для расходов и долгов рост — плохо, стрелка краснеет.
 */
export const ReportKpi: React.FC<{
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: ReportTone;
  delta?: number | null;
  deltaUnit?: "%" | "п.п.";
  goodWhenUp?: boolean;
  hint?: React.ReactNode;
  onClick?: () => void;
  emphasis?: boolean;
}> = ({ label, value, icon, tone = "primary", delta, deltaUnit = "%", goodWhenUp = true, hint, onClick, emphasis }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const color = theme.palette[tone].main;
  const hasDelta = delta != null && Number.isFinite(delta);
  const up = hasDelta && (delta as number) > 0;
  const flat = hasDelta && (delta as number) === 0;
  const good = flat ? null : up === goodWhenUp;
  const deltaColor = !hasDelta || flat ? theme.palette.text.secondary : good ? theme.palette.success.main : theme.palette.error.main;
  const body = (
    <Stack gap={1.25} sx={{ width: "100%", minWidth: 0, textAlign: "left" }}>
      <Stack direction="row" alignItems="center" gap={1}>
        {icon && (
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color,
              bgcolor: alpha(color, dark ? 0.2 : 0.1),
              "& svg": { fontSize: 18 },
            }}
          >
            {icon}
          </Box>
        )}
        <Typography
          noWrap
          sx={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
        >
          {label}
        </Typography>
        {onClick && <ChevronRightOutlined sx={{ fontSize: 18, color: "text.disabled" }} />}
      </Stack>
      <Typography
        noWrap
        sx={{
          fontSize: emphasis ? { xs: 22, md: 26 } : { xs: 21, md: 24 },
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: emphasis ? color : "text.primary",
        }}
      >
        {value}
      </Typography>
      {(hasDelta || hint) && (
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
          {hasDelta && (
            <Stack
              direction="row"
              alignItems="center"
              gap={0.25}
              sx={{
                flexShrink: 0,
                px: 0.75,
                py: 0.125,
                borderRadius: "6px",
                color: deltaColor,
                bgcolor: alpha(deltaColor, dark ? 0.18 : 0.1),
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {!flat && (up ? <NorthEastOutlined sx={{ fontSize: 13 }} /> : <SouthEastOutlined sx={{ fontSize: 13 }} />)}
              {`${up ? "+" : ""}${(delta as number).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}${deltaUnit === "%" ? "%" : " п.п."}`}
            </Stack>
          )}
          {hint && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {hint}
            </Typography>
          )}
        </Stack>
      )}
    </Stack>
  );
  const sx = {
    p: { xs: 1.75, md: 2 },
    minWidth: 0,
    position: "relative" as const,
    overflow: "hidden",
    ...(emphasis
      ? { bgcolor: alpha(color, dark ? 0.12 : 0.05), borderColor: alpha(color, dark ? 0.35 : 0.22) }
      : {}),
  };
  if (!onClick) return <Surface sx={sx}>{body}</Surface>;
  return (
    <Surface sx={{ ...sx, p: 0, transition: "border-color .15s, box-shadow .15s", "&:hover": { borderColor: alpha(color, 0.45), boxShadow: dark ? "none" : "0 6px 20px rgba(15,23,42,.07)" } }}>
      <ButtonBase onClick={onClick} sx={{ width: "100%", p: { xs: 1.75, md: 2 }, borderRadius: "inherit", alignItems: "stretch" }}>
        {body}
      </ButtonBase>
    </Surface>
  );
};

/** Секция отчёта: заголовок, подзаголовок и действие справа (обычно — ссылка на связанный отчёт). */
export const ReportSection: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
  sx?: object;
}> = ({ title, subtitle, action, padded = true, children, sx }) => (
  <Surface padded={false} sx={{ overflow: "hidden", minWidth: 0, ...sx }}>
    <Stack direction="row" alignItems="center" gap={1} sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: padded ? 0.5 : 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15.5 }}>{title}</Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" component="div">
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
    <Box sx={padded ? { px: { xs: 2, md: 2.5 }, pb: 2, pt: 1 } : undefined}>{children}</Box>
  </Surface>
);

/** Ссылка «Открыть …» в шапке секции — ведёт в связанный отчёт или страницу. */
export const ReportLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      flexShrink: 0,
      gap: 0.5,
      px: 1,
      py: 0.5,
      borderRadius: "8px",
      fontSize: 13,
      fontWeight: 600,
      color: "primary.main",
      "&:hover": { bgcolor: "action.hover" },
    }}
  >
    {label}
    <ArrowOutwardOutlined sx={{ fontSize: 15 }} />
  </ButtonBase>
);

/** Строка разбивки: точка цвета, подпись, доля полоской, значение. */
export const ShareRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  share: number;
  color?: string;
  caption?: React.ReactNode;
  onClick?: () => void;
  first?: boolean;
}> = ({ label, value, share, color, caption, onClick, first }) => {
  const theme = useTheme();
  const c = color ?? theme.palette.primary.main;
  const content = (
    <Box sx={{ width: "100%", py: 1.25, borderTop: first ? "none" : `1px solid ${subtleBorder(theme)}`, textAlign: "left" }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.75 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: c, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {value}
        </Typography>
      </Stack>
      <Stack direction="row" alignItems="center" gap={1}>
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, share))}
          sx={{
            flex: 1,
            height: 5,
            borderRadius: 3,
            bgcolor: alpha(c, theme.palette.mode === "dark" ? 0.18 : 0.1),
            "& .MuiLinearProgress-bar": { bgcolor: c, borderRadius: 3 },
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {fmtPercent(share, 0)}
        </Typography>
      </Stack>
      {caption && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
  return onClick ? (
    <ButtonBase onClick={onClick} sx={{ width: "100%", display: "block", borderRadius: "8px", "&:hover": { bgcolor: "action.hover" } }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
};

/** Пустая разбивка — коротко и по делу, без иллюстраций. */
export const ReportEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
    {children}
  </Typography>
);


export type HotelReportKind = "owner" | "shift" | "balances" | "day";

/**
 * Навигация между отчётами: параметры живут в адресе (?r=balances&balance=debt),
 * поэтому отчёт с фильтром можно открыть ссылкой и вернуться кнопкой «Назад».
 */
export interface ReportNav {
  param: (key: string) => string | null;
  setParams: (patch: Record<string, string | null>) => void;
  go: (report: HotelReportKind, params?: Record<string, string>) => void;
  openReservation: (id: number) => void;
}
