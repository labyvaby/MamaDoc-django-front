import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { compactSom, formatShare } from "../../features/pnl/format";
import type { WaterfallBar } from "../../features/pnl/model";

/** «Водопад»: как выручка за период превращается в чистую прибыль. На столбиках — сумма и % от выручки. */
export function PnlWaterfall({ bars, caption }: { bars: WaterfallBar[]; caption: string }) {
  const theme = useTheme();
  const min = Math.min(0, ...bars.map((b) => b.low));
  const max = Math.max(0, ...bars.map((b) => b.high));
  const span = max - min || 1;
  const pct = (value: number) => ((value - min) / span) * 100;
  const color = (bar: WaterfallBar) => {
    if (bar.kind === "revenue") return theme.palette.primary.main;
    if (bar.kind === "net") return bar.value >= 0 ? theme.palette.success.main : theme.palette.error.main;
    return bar.kind === "down" ? alpha(theme.palette.error.main, 0.45) : alpha(theme.palette.success.main, 0.45);
  };
  const labelColor = (bar: WaterfallBar) => {
    if (bar.kind === "down") return "error.main";
    if (bar.kind === "net") return bar.value >= 0 ? "success.main" : "error.main";
    return "text.primary";
  };

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper", p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 1, flexWrap: "wrap" }}>
        <Typography variant="subtitle2">Из чего сложилась прибыль</Typography>
        <Typography variant="caption" color="text.secondary">{caption}</Typography>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: bars.length * 88 }}>
          <Box sx={{ display: "flex", gap: 1.5, height: 220, pt: 5, borderBottom: 1, borderColor: "divider" }}>
            {bars.map((bar) => (
              <Box key={bar.key} sx={{ flex: 1, position: "relative", height: "100%" }}>
                <Box
                  sx={{
                    position: "absolute",
                    left: "10%",
                    right: "10%",
                    borderRadius: 1,
                    bgcolor: color(bar),
                    bottom: `${pct(bar.low)}%`,
                    height: `max(2px, ${pct(bar.high) - pct(bar.low)}%)`,
                  }}
                />
                <Box
                  sx={{
                    position: "absolute",
                    left: -12,
                    right: -12,
                    bottom: `calc(${pct(bar.high)}% + 4px)`,
                    textAlign: "center",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ display: "block", fontWeight: 700, lineHeight: 1.2, color: labelColor(bar) }}
                  >
                    {compactSom(bar.value)}
                  </Typography>
                  {bar.sharePct != null && (
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                      {formatShare(bar.sharePct)}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, pt: 0.75 }}>
            {bars.map((bar) => (
              <Typography
                key={bar.key}
                variant="caption"
                color="text.secondary"
                sx={{ flex: 1, textAlign: "center", lineHeight: 1.25, overflowWrap: "anywhere" }}
              >
                {bar.label}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
