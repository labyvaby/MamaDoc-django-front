import React from "react";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

/** Плитка итога: подпись, крупное число, мелкая подсказка. */
export const TotalTile: React.FC<{ label: string; value: string; hint?: string; accent?: boolean }> = ({
  label,
  value,
  hint,
  accent,
}) => (
  <Box
    sx={(th) => ({
      minWidth: 120,
      px: 1.5,
      py: 0.75,
      borderRadius: "10px",
      border: 1,
      borderColor: accent ? alpha(th.palette.primary.main, 0.4) : "divider",
      bgcolor: accent ? alpha(th.palette.primary.main, 0.08) : "background.paper",
      textAlign: "left",
    })}
  >
    <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ maxWidth: 200 }}>
      {label}
    </Typography>
    <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ maxWidth: 220 }}>
        {hint}
      </Typography>
    )}
  </Box>
);
