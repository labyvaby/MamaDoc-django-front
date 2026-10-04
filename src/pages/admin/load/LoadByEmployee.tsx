import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { EmployeeLoad } from "../../../api/load";
import { useT } from "../../../i18n/VerticalProvider";
import { employeeLoadPct, employeeMeta, loadBarSegments, sortByLoad } from "./loadBuckets";

interface Props {
  rows: EmployeeLoad[];
  selectedIds: number[];
  onToggle: (emp: { id: number; fullName: string }) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const LegendItem: React.FC<{ swatch: React.ReactNode; label: string }> = ({ swatch, label }) => (
  <Stack direction="row" alignItems="center" spacing={0.5}>
    {swatch}
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
  </Stack>
);

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <Box sx={{ width: 10, height: 6, borderRadius: "3px", bgcolor: color, flexShrink: 0 }} />
);

export const LoadByEmployee: React.FC<Props> = ({ rows, selectedIds, onToggle }) => {
  const { t } = useT("load");
  const sorted = React.useMemo(() => sortByLoad(rows), [rows]);
  const anyOutside = rows.some((r) => r.scheduleMinutes > 0 && r.outsideMinutes > 0);
  const anyOver = rows.some((r) => (employeeLoadPct(r) ?? 0) > 100);

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
        Нет данных за выбранный период
      </Typography>
    );
  }

  return (
    <Stack spacing={1.25}>
      {(anyOutside || anyOver) && (
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ px: 0.75 }}>
          <LegendItem swatch={<Dot color="primary.main" />} label="в смену" />
          <LegendItem swatch={<Dot color="warning.main" />} label="сверх графика" />
          {anyOver && (
            <LegendItem
              swatch={<Box sx={{ width: 2, height: 10, bgcolor: "text.primary", opacity: 0.7 }} />}
              label="конец графика"
            />
          )}
        </Stack>
      )}
      {sorted.map((r) => {
        const selected = selectedIds.includes(r.employeeId);
        const pct = employeeLoadPct(r);
        const over = pct != null && pct > 100;
        const bar = loadBarSegments(r);
        return (
          <Stack
            key={r.employeeId}
            direction="row"
            alignItems="center"
            spacing={1.25}
            onClick={() => onToggle({ id: r.employeeId, fullName: r.fullName })}
            sx={{
              cursor: "pointer",
              borderRadius: "10px",
              p: 0.75,
              transition: "background-color .15s ease",
              bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.1) : "transparent"),
              "&:hover": { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
            }}
          >
            <Box
              sx={(t) => ({
                width: 30,
                height: 30,
                borderRadius: "9px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "primary.onSurface",
                bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
              })}
            >
              {initials(r.fullName)}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Typography variant="body2" fontWeight={selected ? 600 : 500} noWrap>
                  {r.fullName}
                </Typography>
                {pct != null ? (
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{ flexShrink: 0, color: over ? "warning.main" : "text.primary" }}
                  >
                    {pct}%
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                    нет графика
                  </Typography>
                )}
              </Stack>
              <Box
                sx={(t) => ({
                  position: "relative",
                  mt: 0.5,
                  height: 8,
                  borderRadius: "4px",
                  bgcolor: alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.1 : 0.06),
                  overflow: "hidden",
                  display: "flex",
                })}
              >
                <Box sx={{ width: `${bar.inside}%`, bgcolor: "primary.main", transition: "width .3s ease" }} />
                <Box sx={{ width: `${bar.outside}%`, bgcolor: "warning.main", transition: "width .3s ease" }} />
                {bar.marker != null && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `calc(${bar.marker}% - 1px)`,
                      width: 2,
                      bgcolor: "text.primary",
                      opacity: 0.7,
                    }}
                  />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {employeeMeta(r, t("count", { count: r.appointments }))}
              </Typography>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
};

export default LoadByEmployee;
