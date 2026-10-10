import React from "react";
import { Box, ButtonBase, Stack, Tooltip, Typography, alpha, useTheme, type SxProps, type Theme } from "@mui/material";

import { sunkBg, toneColor, toneText } from "./anamnesisTone";
import type { ChipTone } from "./anamnesisView";

/**
 * Общие элементы раздела «Анамнез жизни» в стиле проекта книжки: метки с
 * точкой, панели, подписи. Цвета — только из темы (светлая и тёмная).
 */

interface ToneChipProps {
  label: React.ReactNode;
  tone?: ChipTone;
  /** Точка слева — для статусов. */
  dot?: boolean;
  /** Пунктирная рамка — предложение системы. */
  dashed?: boolean;
  dense?: boolean;
  title?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  icon?: React.ReactNode;
}

/** Метка макета: нейтральная, «акцентная» или цветная с точкой. */
export const ToneChip: React.FC<ToneChipProps> = ({ label, tone = "neutral", dot, dashed, dense, title, onClick, icon }) => {
  const theme = useTheme();
  const colored = tone === "ok" || tone === "warn" || tone === "bad";
  const bg = dashed
    ? "transparent"
    : colored
      ? alpha(toneColor(theme, tone), tone === "warn" ? 0.18 : 0.13)
      : tone === "accent"
        ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.1)
        : sunkBg(theme);
  const color = colored || tone === "accent" ? toneText(theme, tone) : theme.palette.text.primary;
  const border = dashed
    ? `1px dashed ${alpha(toneColor(theme, tone === "neutral" ? "warn" : tone), 0.8)}`
    : colored || tone === "accent"
      ? "1px solid transparent"
      : `1px solid ${theme.palette.divider}`;
  const content = (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: dense ? 1 : 1.25,
        py: dense ? "1px" : "3px",
        borderRadius: "999px",
        fontSize: dense ? 11.5 : 12.5,
        lineHeight: 1.5,
        fontWeight: tone === "accent" || colored ? 500 : 400,
        bgcolor: bg,
        color,
        border,
        maxWidth: "100%",
        minWidth: 0,
        whiteSpace: "normal",
        textAlign: "left",
      }}
    >
      {dot && <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "currentColor", flex: "none" }} />}
      {icon}
      <Box component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {label}
      </Box>
    </Box>
  );
  const node = onClick ? (
    <ButtonBase onClick={onClick} sx={{ borderRadius: "999px", maxWidth: "100%", "&:hover > span": { filter: "brightness(0.97)" } }}>
      {content}
    </ButtonBase>
  ) : (
    content
  );
  return title ? (
    <Tooltip title={title} arrow>
      <span style={{ display: "inline-flex", maxWidth: "100%" }}>{node}</span>
    </Tooltip>
  ) : (
    node
  );
};

/** Подпись блока капителью: «ГРУППЫ РИСКА». */
export const Caption: React.FC<{ children: React.ReactNode; sx?: SxProps<Theme> }> = ({ children, sx }) => (
  <Typography
    component="span"
    sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "text.secondary", ...sx }}
  >
    {children}
  </Typography>
);

interface PanelProps {
  title: React.ReactNode;
  caption?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

/** Панель обзора с заголовком и подписью справа. */
export const Panel: React.FC<PanelProps> = ({ title, caption, action, children, sx }) => (
  <Box
    sx={{
      border: 1,
      borderColor: "divider",
      borderRadius: "12px",
      p: 1.5,
      display: "flex",
      flexDirection: "column",
      gap: 1,
      minWidth: 0,
      bgcolor: "background.paper",
      ...sx,
    }}
  >
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" sx={{ minHeight: 28 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ minWidth: 0 }}>
        {title}
        {caption && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 500 }}>
            {caption}
          </Typography>
        )}
      </Typography>
      {action}
    </Stack>
    {children}
  </Box>
);

/** Строка «подпись — значение» для вкладок. */
export const Fact: React.FC<{ label: string; value: React.ReactNode; tone?: ChipTone }> = ({ label, value, tone }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px minmax(0, 1fr)" }, gap: { xs: 0, md: 1.5 }, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: tone && tone !== "neutral" ? toneText(theme, tone) : "text.primary", minWidth: 0, overflowWrap: "anywhere", whiteSpace: "pre-line" }}
      >
        {value}
      </Typography>
    </Box>
  );
};
