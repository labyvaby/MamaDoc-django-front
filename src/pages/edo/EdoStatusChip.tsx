import { Box } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";

import type { EdoStatus } from "../../api/edo";

/** Цвет статуса документа ЭДО — только токены темы. */
export function edoStatusColor(t: Theme, status: EdoStatus | string) {
  switch (status) {
    case "review":
      return t.palette.warning;
    case "signing":
      return t.palette.info;
    case "signed":
      return t.palette.success;
    case "rejected":
    case "terminated":
      return t.palette.error;
    default:
      return null;
  }
}

/** Пилюля статуса с точкой; черновик и архив — нейтральные. */
export function EdoStatusChip({ status, label, tone }: { status: string; label: string; tone?: "error" }) {
  return (
    <Box
      component="span"
      sx={(t) => {
        const color = tone === "error" ? t.palette.error : edoStatusColor(t, status);
        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 0.6,
          px: 1,
          py: 0.25,
          borderRadius: "999px",
          fontSize: "0.75rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
          lineHeight: 1.4,
          color: color ? color.onSurface ?? color.main : "text.secondary",
          bgcolor: color ? alpha(color.main, t.palette.mode === "dark" ? 0.18 : 0.1) : alpha(t.palette.text.primary, 0.06),
          "&::before": { content: '""', width: 6, height: 6, borderRadius: "50%", bgcolor: color ? color.main : "text.disabled" },
        };
      }}
    >
      {label}
    </Box>
  );
}
