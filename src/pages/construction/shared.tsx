import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";

import type { HistoryEntry } from "../../api/construction";
import { subtleBg } from "../../theme/uiHelpers";
import type { Tone } from "./format";

/** Статус-пилюля с точкой: цвет — по тону статуса, фон нейтральный. */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Box
      component="span"
      sx={(th) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.3,
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: tone ? `${tone}.main` : "text.secondary",
        bgcolor: subtleBg(th, true),
      })}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" }} />
      {label}
    </Box>
  );
}

/** Полоса готовности 0–100. */
export function ProgressBar({ value, color = "primary.main", height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <Box sx={(th) => ({ height, borderRadius: height / 2, bgcolor: subtleBg(th, true), overflow: "hidden" })}>
      <Box sx={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: height / 2, bgcolor: color }} />
    </Box>
  );
}

/** Заголовок секции шторки. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
      <Typography sx={{ flex: 1, fontWeight: 700, fontSize: "0.9rem" }}>{children}</Typography>
      {action}
    </Box>
  );
}

/** История действий: дата, автор, текст. */
export function HistoryList({ items, empty }: { items: HistoryEntry[]; empty: string }) {
  if (items.length === 0) return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{empty}</Typography>;
  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {items.map((h, i) => (
        <Box key={i} sx={{ display: "grid", gridTemplateColumns: "88px minmax(0, 1fr)", gap: 1 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{h.at ? new Date(h.at).toLocaleDateString("ru-RU") : ""}</Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem" }}>{h.text}</Typography>
            {h.by && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{h.by}</Typography>}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
