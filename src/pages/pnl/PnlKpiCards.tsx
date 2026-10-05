import { Box, Typography } from "@mui/material";

import { formatSom } from "../../features/pnl/format";
import type { PnlKpi } from "../../features/pnl/model";

/** Четыре итога периода: значение, маржа и изменение к тому же периоду прошлого года. */
export function PnlKpiCards({ kpis, compareLabel }: { kpis: PnlKpi[]; compareLabel: string }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
      {kpis.map((kpi) => (
        <Box
          key={kpi.code}
          sx={{ border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper", p: 1.75, minWidth: 0 }}
        >
          <Typography variant="caption" color="text.secondary">{kpi.label}</Typography>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: kpi.code === "200" ? (kpi.value < 0 ? "error.main" : "success.main") : "text.primary",
            }}
          >
            {formatSom(kpi.value)}
          </Typography>
          <Box sx={{ display: "flex", columnGap: 1, flexWrap: "wrap" }}>
            {kpi.deltaPct != null && (
              <Typography variant="caption" color={kpi.deltaPct >= 0 ? "success.main" : "error.main"}>
                {kpi.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(Math.round(kpi.deltaPct))}% {compareLabel}
              </Typography>
            )}
            {kpi.ratioPct != null && (
              <Typography variant="caption" color="text.secondary">
                {kpi.ratioLabel} {Math.round(kpi.ratioPct)}%
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
