import React from "react";
import { Box, Tooltip } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

export type InfoHintProps = {
  /** Текст пояснения: как читать рисунок, откуда норма и т.п. */
  text: React.ReactNode;
  /** Подпись для экранного диктора. */
  label?: string;
  size?: number;
};

/**
 * Пояснение значком ⓘ вместо постоянной подписи: «как читать рисунок» врач
 * читает один раз, а место под ним занято всегда. Наведение или фокус —
 * на компьютере, касание — на телефоне. Образец — Hint в FlowBreakdown.tsx.
 */
export const InfoHint: React.FC<InfoHintProps> = ({ text, label, size = 15 }) => (
  <Tooltip
    title={text}
    arrow
    describeChild
    enterTouchDelay={0}
    leaveTouchDelay={5000}
    slotProps={{ tooltip: { sx: { maxWidth: 360 } } }}
  >
    <Box
      component="span"
      tabIndex={0}
      role="img"
      aria-label={label ?? "Пояснение"}
      sx={{
        display: "inline-flex",
        verticalAlign: "middle",
        ml: 0.5,
        color: "text.disabled",
        cursor: "help",
        borderRadius: "50%",
        outline: "none",
        "&:hover": { color: "text.secondary" },
        "&:focus-visible": { color: "text.secondary", boxShadow: (t) => `0 0 0 2px ${t.palette.primary.main}` },
      }}
    >
      <InfoOutlined sx={{ fontSize: size }} />
    </Box>
  </Tooltip>
);
