import React from "react";
import {
  Box,
  Button,
  ButtonGroup,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import dayjs from "dayjs";
import type { CashboxFilters, CashboxMethod } from "../../../api/cashbox";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PeriodPreset = "today" | "month" | "custom";

export type FilterState = {
  preset: PeriodPreset;
  dateFrom: string;
  dateTo: string;
  branchId: number | "";
  method: CashboxMethod | "";
};

type Branch = { id: number; name: string };

type Props = {
  value: FilterState;
  branches: Branch[];
  onChange: (next: FilterState) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayRange(): { dateFrom: string; dateTo: string } {
  const d = dayjs().format("YYYY-MM-DD");
  return { dateFrom: d, dateTo: d };
}

function monthRange(): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: dayjs().startOf("month").format("YYYY-MM-DD"),
    dateTo: dayjs().endOf("month").format("YYYY-MM-DD"),
  };
}

export function filtersToApiParams(f: FilterState): Omit<CashboxFilters, "organizationId"> {
  return {
    dateFrom: f.dateFrom || undefined,
    dateTo: f.dateTo || undefined,
    branchId: f.branchId !== "" ? f.branchId : undefined,
    method: f.method !== "" ? f.method : undefined,
  };
}

export function initialFilterState(): FilterState {
  return {
    preset: "month",
    ...monthRange(),
    branchId: "",
    method: "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

const METHOD_OPTIONS: { value: CashboxMethod | ""; label: string }[] = [
  { value: "", label: "Все методы" },
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "balance", label: "Баланс" },
];

const CashboxFiltersBar: React.FC<Props> = ({ value, branches, onChange }) => {
  const handlePreset = (preset: PeriodPreset) => {
    if (preset === "today") {
      onChange({ ...value, preset, ...todayRange() });
    } else if (preset === "month") {
      onChange({ ...value, preset, ...monthRange() });
    } else {
      onChange({ ...value, preset });
    }
  };

  const handleDateFrom = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, preset: "custom", dateFrom: e.target.value });

  const handleDateTo = (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, preset: "custom", dateTo: e.target.value });

  const rangeInvalid =
    value.dateFrom && value.dateTo
      ? dayjs(value.dateFrom).isAfter(dayjs(value.dateTo))
      : false;

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      alignItems={{ xs: "stretch", sm: "center" }}
      flexWrap="wrap"
      useFlexGap
    >
      {/* Period presets */}
      <ButtonGroup size="small" variant="outlined">
        <Button
          variant={value.preset === "today" ? "contained" : "outlined"}
          onClick={() => handlePreset("today")}
        >
          Сегодня
        </Button>
        <Button
          variant={value.preset === "month" ? "contained" : "outlined"}
          onClick={() => handlePreset("month")}
        >
          Месяц
        </Button>
        <Button
          variant={value.preset === "custom" ? "contained" : "outlined"}
          onClick={() => handlePreset("custom")}
        >
          Диапазон
        </Button>
      </ButtonGroup>

      {/* Date inputs */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <TextField
          type="date"
          size="small"
          label="С"
          value={value.dateFrom}
          onChange={handleDateFrom}
          error={!!rangeInvalid}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
        <TextField
          type="date"
          size="small"
          label="По"
          value={value.dateTo}
          onChange={handleDateTo}
          error={!!rangeInvalid}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
      </Box>

      {/* Branch */}
      {branches.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Филиал</InputLabel>
          <Select
            value={value.branchId}
            label="Филиал"
            onChange={(e) => onChange({ ...value, branchId: e.target.value as number | "" })}
          >
            <MenuItem value="">Все филиалы</MenuItem>
            {branches.map((b) => (
              <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Method */}
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>Метод</InputLabel>
        <Select
          value={value.method}
          label="Метод"
          onChange={(e) => onChange({ ...value, method: e.target.value as CashboxMethod | "" })}
        >
          {METHOD_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
};

export default CashboxFiltersBar;
