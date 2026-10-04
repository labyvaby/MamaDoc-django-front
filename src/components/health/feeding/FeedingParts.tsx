import React from "react";
import { Box, Stack, Typography, useTheme, type SxProps, type Theme } from "@mui/material";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";

import type { StatusTone } from "./feedingAdvice";
import { toneBg, toneColor, toneText } from "./feedingUi";

/** Панель блока: рамка, заголовок и подпись справа — как панели «Опорно-двигательной». */
export const FeedingPanel: React.FC<{
  title: React.ReactNode;
  caption?: React.ReactNode;
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}> = ({ title, caption, children, sx }) => {
  const theme = useTheme();
  return (
    <Box
      sx={[
        {
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: "14px",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          minWidth: 0,
          bgcolor: "background.paper",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1} flexWrap="wrap">
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        {caption && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
            {caption}
          </Typography>
        )}
      </Stack>
      {children}
    </Box>
  );
};

/**
 * «Пилюля» статуса: мягкая подложка, текст цветом статуса; длинный текст
 * переносится (в отличие от Chip). Точка — по желанию.
 */
export const Pill: React.FC<{
  tone: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  dense?: boolean;
  outlined?: boolean;
  title?: string;
  sx?: SxProps<Theme>;
}> = ({ tone, children, dot = false, dense = false, outlined = false, title, sx }) => {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  return (
    <Box
      component="span"
      title={title}
      sx={[
        {
          display: "inline-flex",
          alignItems: "baseline",
          gap: 0.75,
          maxWidth: "100%",
          px: dense ? 0.875 : 1.25,
          py: dense ? 0.125 : 0.375,
          borderRadius: dense ? "999px" : "10px",
          fontSize: dense ? 11.5 : 12.5,
          lineHeight: 1.45,
          fontWeight: 500,
          color: toneText(theme, tone),
          bgcolor: outlined ? "transparent" : toneBg(theme, tone),
          border: `1px solid ${outlined ? color : "transparent"}`,
          whiteSpace: dense ? "nowrap" : "normal",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {dot && (
        <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, flexShrink: 0, alignSelf: "center" }} />
      )}
      <span>{children}</span>
    </Box>
  );
};

/** Строка предупреждения окна и подсказки: красная, жёлтая или серая. */
export const NoticeLine: React.FC<{ tone: StatusTone; children: React.ReactNode; action?: React.ReactNode }> = ({ tone, children, action }) => {
  const theme = useTheme();
  const muted = tone === "muted" || tone === "on";
  const Icon = tone === "bad" ? ErrorOutlineRounded : tone === "warn" ? WarningAmberRounded : InfoOutlined;
  return (
    <Stack
      direction="row"
      gap={1}
      alignItems="flex-start"
      sx={{
        px: muted ? 0.25 : 1.25,
        py: muted ? 0 : 0.875,
        borderRadius: "10px",
        bgcolor: muted ? "transparent" : toneBg(theme, tone),
        flexWrap: "wrap",
      }}
    >
      <Icon sx={{ fontSize: 18, mt: "1px", color: muted ? theme.palette.text.secondary : toneColor(theme, tone), flexShrink: 0 }} />
      <Typography
        variant="body2"
        sx={{ flex: "1 1 200px", minWidth: 0, color: muted ? "text.secondary" : toneText(theme, tone), fontWeight: muted ? 400 : 500 }}
      >
        {children}
      </Typography>
      {action}
    </Stack>
  );
};
