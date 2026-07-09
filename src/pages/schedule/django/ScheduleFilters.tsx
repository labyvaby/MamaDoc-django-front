import React from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PersonOutlined from "@mui/icons-material/PersonOutlined";

import type { ClinicalRole } from "../../../api/staff";
import type { ScheduleFiltersState } from "./useScheduleFilters";

const ROLE_LABELS: Record<ClinicalRole, string> = {
  doctor: "Врачи",
  nurse: "Медсёстры",
  other: "Прочие",
};

export interface ScheduleFiltersProps {
  filters: ScheduleFiltersState;
  onChange: <K extends keyof ScheduleFiltersState>(key: K, value: ScheduleFiltersState[K]) => void;
  onReset: () => void;
  availableSpecs: string[];
  /** Кнопка «Мои смены» показывается, только если известен свой employeeId. */
  showMine: boolean;
}

const ScheduleFilters: React.FC<ScheduleFiltersProps> = ({
  filters,
  onChange,
  onReset,
  availableSpecs,
  showMine,
}) => {
  const theme = useTheme();
  const allActive = filters.role === "all" && !filters.spec;

  return (
    <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          gap: 0.75,
          pb: 0.5,
          alignItems: "center",
          flex: 1,
          minWidth: 0,
        }}
      >
        {showMine && (
          <Button
            size="small"
            variant={filters.mine ? "contained" : "outlined"}
            startIcon={<PersonOutlined sx={{ fontSize: "0.9rem !important" }} />}
            onClick={() => onChange("mine", !filters.mine)}
            sx={{ flexShrink: 0, borderRadius: "8px", fontWeight: 700, fontSize: "0.75rem", py: 0.3, px: 1.25 }}
          >
            Мои смены
          </Button>
        )}
        <Chip
          label="Все"
          size="small"
          variant={allActive ? "filled" : "outlined"}
          color={allActive ? "primary" : "default"}
          onClick={onReset}
          clickable
          sx={{ flexShrink: 0, fontWeight: 600 }}
        />
        {(["doctor", "nurse", "other"] as const).map((role) => (
          <Chip
            key={role}
            label={ROLE_LABELS[role]}
            size="small"
            variant={filters.role === role ? "filled" : "outlined"}
            color={filters.role === role ? "primary" : "default"}
            onClick={() => onChange("role", filters.role === role ? "all" : role)}
            clickable
            sx={{ flexShrink: 0 }}
          />
        ))}
        {availableSpecs.length > 0 && (
          <Box sx={{ width: "1px", height: 20, bgcolor: "divider", mx: 0.25, flexShrink: 0 }} />
        )}
        {availableSpecs.map((spec) => (
          <Chip
            key={spec}
            label={spec}
            size="small"
            variant={filters.spec === spec ? "filled" : "outlined"}
            color={filters.spec === spec ? "secondary" : "default"}
            onClick={() => onChange("spec", filters.spec === spec ? null : spec)}
            clickable
            sx={{ flexShrink: 0 }}
          />
        ))}
      </Box>

      {/* Легенда — справа, только на широких экранах */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0, display: { xs: "none", lg: "flex" } }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <PersonOutlined sx={{ fontSize: 13, color: "text.secondary" }} />
          <Typography variant="caption" color="text.disabled" noWrap>
            Сотрудников
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box
            sx={{ width: 14, height: 10, borderRadius: "3px", border: `1.5px dashed ${theme.palette.success.main}` }}
          />
          <Typography variant="caption" color="text.disabled" noWrap>
            Доп. смена
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );
};

export default ScheduleFilters;
