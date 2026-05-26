import React from "react";
import {
  Box,
  Chip,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";

export type AppointmentStatusFilter =
  | "all"
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "completed"
  | "canceled"
  | "no_show";

export const APPOINTMENT_STATUS_OPTIONS: ReadonlyArray<{
  value: AppointmentStatusFilter;
  label: string;
}> = [
  { value: "all", label: "Все статусы" },
  { value: "scheduled", label: "Запланирован" },
  { value: "confirmed", label: "Подтверждён" },
  { value: "arrived", label: "Пришёл" },
  { value: "completed", label: "Завершён" },
  { value: "canceled", label: "Отменён" },
  { value: "no_show", label: "Неявка" },
];

type Props = {
  date: Dayjs | null;
  onDateChange: (next: Dayjs | null) => void;
  status: AppointmentStatusFilter;
  onStatusChange: (next: AppointmentStatusFilter) => void;
  search: string;
  onSearchChange: (next: string) => void;
  activeBranchName?: string | null;
};

/**
 * Compact filter bar for the Appointments shell.
 *
 * - Date picker (single day).
 * - Status select.
 * - Search field (patient name / phone).
 * - Active branch chip (read-only indicator).
 *
 * The component is presentation-only — it does not fetch anything; the
 * parent owns the filter state and will wire it to the API when it
 * becomes available.
 */
export const AppointmentFilters: React.FC<Props> = ({
  date,
  onDateChange,
  status,
  onStatusChange,
  search,
  onSearchChange,
  activeBranchName,
}) => {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      alignItems={{ md: "center" }}
      sx={{ width: "100%" }}
    >
      <DatePicker
        label="Дата"
        value={date}
        onChange={onDateChange}
        slotProps={{
          textField: {
            size: "small",
            sx: { minWidth: { md: 180 } },
          },
        }}
      />

      <TextField
        label="Статус"
        select
        size="small"
        value={status}
        onChange={(e) =>
          onStatusChange(e.target.value as AppointmentStatusFilter)
        }
        sx={{ minWidth: { md: 180 } }}
      >
        {APPOINTMENT_STATUS_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        size="small"
        placeholder="Пациент или телефон"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{ flex: { md: 1 }, minWidth: { md: 220 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <Chip
          icon={<StoreOutlined />}
          label={activeBranchName ?? "Филиал не выбран"}
          variant="outlined"
          size="small"
        />
      </Box>
    </Stack>
  );
};

export default AppointmentFilters;
