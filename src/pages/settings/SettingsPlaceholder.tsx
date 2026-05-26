import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";

/**
 * Minimal empty-state placeholder rendered while the matching backend
 * API is being built in a separate chat.  Intentionally short — no
 * marketing copy.
 */
export const SettingsPlaceholder: React.FC<{
  title: string;
  hint?: string;
}> = ({ title, hint }) => (
  <Stack spacing={2} sx={{ height: "100%" }}>
    <Typography variant="h6" fontWeight={600}>
      {title}
    </Typography>
    <Box
      sx={{
        flex: 1,
        minHeight: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "text.secondary",
        border: (theme) => `1px dashed ${theme.palette.divider}`,
        borderRadius: 1,
        p: 3,
        gap: 1.5,
      }}
    >
      <HourglassEmptyOutlined
        sx={{ fontSize: 36, color: "text.disabled" }}
      />
      <Typography variant="body2">
        {hint ?? "Раздел в разработке."}
      </Typography>
    </Box>
  </Stack>
);

export default SettingsPlaceholder;
