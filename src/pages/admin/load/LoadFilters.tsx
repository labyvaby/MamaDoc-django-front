import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Stack,
  TextField,
} from "@mui/material";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../../../components/ui";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../../api/staff";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";

export type LoadPreset = "today" | "7d" | "30d" | "month" | "custom";

export interface LoadFiltersProps {
  preset: LoadPreset;
  dateFrom: Dayjs;
  dateTo: Dayjs;
  employees: DjangoEmployeeListItem[];
  onPreset: (preset: LoadPreset) => void;
  onDateFrom: (d: Dayjs | null) => void;
  onDateTo: (d: Dayjs | null) => void;
  onEmployeesChange: (employees: DjangoEmployeeListItem[]) => void;
}

const PRESETS: { key: LoadPreset; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
  { key: "month", label: "Месяц" },
];

/** Resolve a preset into an inclusive [from, to] range (today for custom). */
export function presetRange(preset: LoadPreset): [Dayjs, Dayjs] {
  const today = dayjs();
  switch (preset) {
    case "7d":
      return [today.subtract(6, "day").startOf("day"), today.endOf("day")];
    case "30d":
      return [today.subtract(29, "day").startOf("day"), today.endOf("day")];
    case "month":
      return [today.startOf("month"), today.endOf("month")];
    default:
      return [today.startOf("day"), today.endOf("day")];
  }
}

const LoadFilters: React.FC<LoadFiltersProps> = ({
  preset,
  dateFrom,
  dateTo,
  employees,
  onPreset,
  onDateFrom,
  onDateTo,
  onEmployeesChange,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [empInput, setEmpInput] = React.useState("");
  const empQuery = useQuery({
    queryKey: ["django", "load", "employees", empInput],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ search: empInput || undefined, status: "active", pageSize: 20 }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const options = empQuery.data?.results ?? [];

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "14px",
        bgcolor: "background.paper",
        p: { xs: 1.5, sm: 2 },
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", md: "center" }}
        useFlexGap
        flexWrap="wrap"
      >
        {/* Пресеты периода */}
        <ButtonGroup size="small" variant="outlined" fullWidth={isMobile}>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              onClick={() => onPreset(p.key)}
              variant={preset === p.key ? "contained" : "outlined"}
              sx={{ textTransform: "none", whiteSpace: "nowrap", flex: isMobile ? 1 : "unset" }}
            >
              {p.label}
            </Button>
          ))}
        </ButtonGroup>

        {/* Свой диапазон дат */}
        <Stack direction="row" spacing={1} sx={{ width: { xs: "100%", md: "auto" }, flex: { md: "0 0 auto" } }}>
          <CustomDatePicker
            value={dateFrom}
            onChange={onDateFrom}
            slotProps={{ textField: { size: "small", label: "С", sx: { flex: 1, minWidth: 0 } } }}
          />
          <CustomDatePicker
            value={dateTo}
            onChange={onDateTo}
            slotProps={{ textField: { size: "small", label: "По", sx: { flex: 1, minWidth: 0 } } }}
          />
        </Stack>

        {/* Мультиселект сотрудников (пусто = все) */}
        <Autocomplete
          multiple
          size="small"
          sx={{ flex: 1, minWidth: 220 }}
          options={options}
          loading={empQuery.isLoading}
          value={employees}
          getOptionLabel={(o) => o.fullName}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, v) => onEmployeesChange(v)}
          onInputChange={(_, v) => setEmpInput(v)}
          filterSelectedOptions
          renderInput={(params) => (
            <TextField
              {...params}
              label="Сотрудники"
              placeholder={employees.length === 0 ? "Все" : undefined}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {empQuery.isLoading && <CircularProgress size={14} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      </Stack>
    </Box>
  );
};

export default LoadFilters;
