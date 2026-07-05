import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { EmployeeLoad } from "../../../api/load";

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

export const LoadByEmployee: React.FC<Props> = ({ rows, selectedIds, onToggle }) => {
  const maxAppts = rows.reduce((m, r) => Math.max(m, r.appointments), 0) || 1;

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ py: 3, textAlign: "center" }}>
        Нет данных за выбранный период
      </Typography>
    );
  }

  return (
    <Stack spacing={1.25}>
      {rows.map((r) => {
        const selected = selectedIds.includes(r.employeeId);
        const pct = Math.round((r.appointments / maxAppts) * 100);
        const hoursNum = parseFloat(r.hours);
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
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" fontWeight={selected ? 600 : 500} noWrap>
                  {r.fullName}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {r.appointments} приёмов{hoursNum > 0 ? ` · ${hoursNum.toLocaleString("ru-RU")} ч` : ""}
                </Typography>
              </Stack>
              <Box
                sx={(t) => ({
                  mt: 0.5,
                  height: 8,
                  borderRadius: "4px",
                  bgcolor: alpha(t.palette.text.primary, t.palette.mode === "dark" ? 0.1 : 0.06),
                  overflow: "hidden",
                })}
              >
                <Box
                  sx={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: "4px",
                    bgcolor: "primary.main",
                    transition: "width .3s ease",
                  }}
                />
              </Box>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
};

export default LoadByEmployee;
