import { Box } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";

import type { BillingState } from "../../api/billing";

/** Цвет статуса счёта: просрочка — ошибка, «сегодня» — предупреждение. */
export function stateColor(t: Theme, state: BillingState | "partial" | "paid") {
  if (state === "overdue") return t.palette.error;
  if (state === "due" || state === "partial") return t.palette.warning;
  if (state === "completed" || state === "paid") return t.palette.success;
  return t.palette.info;
}

export function StateChip({ state, label }: { state: BillingState | "partial" | "paid"; label: string }) {
  return (
    <Box
      component="span"
      sx={(t) => {
        const color = stateColor(t, state);
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
          color: color.onSurface ?? color.main,
          bgcolor: alpha(color.main, t.palette.mode === "dark" ? 0.18 : 0.1),
          "&::before": { content: '""', width: 6, height: 6, borderRadius: "50%", bgcolor: color.main },
        };
      }}
    >
      {label}
    </Box>
  );
}

