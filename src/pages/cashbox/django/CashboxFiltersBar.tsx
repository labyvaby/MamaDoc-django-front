import React from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from "@mui/material";
import dayjs from "dayjs";
import { DateRangeField } from "../../../components/ui";
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
  { value: "insurance", label: "Страховка" },
];

const CashboxFiltersBar: React.FC<Props> = ({ value, branches, onChange }) => {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      alignItems={{ xs: "stretch", sm: "center" }}
      flexWrap="wrap"
      useFlexGap
    >
      {/* Период: единое поле-диапазон с пресетами */}
      <DateRangeField
        value={{
          from: value.dateFrom ? dayjs(value.dateFrom) : dayjs().startOf("month"),
          to: value.dateTo ? dayjs(value.dateTo) : dayjs().endOf("month"),
        }}
        onChange={(r) =>
          onChange({
            ...value,
            preset: "custom",
            dateFrom: r.from.format("YYYY-MM-DD"),
            dateTo: r.to.format("YYYY-MM-DD"),
          })
        }
        minWidth={220}
      />

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
