import React from "react";
import { Box, Stack, Typography } from "@mui/material";

type Props = {
  light?: boolean;
  compact?: boolean;
};

/** Нейтральный брендовый знак Aximo: буква A + динамичная орбита вокруг неё. */
const AximoLogo: React.FC<Props> = ({ light = false, compact = false }) => {
  const color = light ? "#ffffff" : "#159c91";

  return (
    <Stack direction="row" alignItems="center" gap={compact ? 1 : 1.25}>
      <Box component="svg" viewBox="0 0 40 40" aria-hidden sx={{ width: compact ? 30 : 36, height: compact ? 30 : 36, flexShrink: 0, color }}>
        <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="currentColor" opacity="0.14" />
        <path d="M10 29 20 9l10 20M14 22h12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 18c4-7 11-10 18-8 5 1 9 4 12 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.72" />
      </Box>
      <Typography sx={{ color, fontSize: compact ? "1.08rem" : "1.35rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
        Aximo
      </Typography>
    </Stack>
  );
};

export default AximoLogo;
