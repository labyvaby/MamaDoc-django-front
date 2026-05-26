import React from "react";
import { Box, Typography } from "@mui/material";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";

/**
 * Compact, operational empty state for the Appointments shell.
 *
 * Intentionally short — no marketing copy.  Designed to sit inside a
 * tab body that already has its own padding, so it stretches to fill
 * the available height.
 */
export const AppointmentsEmptyState: React.FC<{ text?: string }> = ({
  text = "Нет приёмов за выбранный период",
}) => (
  <Box
    sx={{
      flex: 1,
      minHeight: 240,
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
    <EventBusyOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
    <Typography variant="body2">{text}</Typography>
  </Box>
);

export default AppointmentsEmptyState;
