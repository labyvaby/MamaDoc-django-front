import React from "react";
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { Dayjs } from "dayjs";

export type AppointmentStatusFilter =
  | "all"
  | "scheduled"
  | "waiting"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export const APPOINTMENT_STATUS_OPTIONS: ReadonlyArray<{
  value: AppointmentStatusFilter;
  label: string;
}> = [
  { value: "all", label: "Все статусы" },
  { value: "scheduled", label: "Запланирован" },
  { value: "waiting", label: "Ожидает" },
  { value: "in_progress", label: "Принимается" },
  { value: "completed", label: "Завершён" },
  { value: "cancelled", label: "Отменён" },
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
  loading?: boolean;
  onRefresh?: () => void;
  onReset?: () => void;
};

export const AppointmentFilters: React.FC<Props> = ({
  date,
  onDateChange,
  status,
  onStatusChange,
  search,
  onSearchChange,
  activeBranchName,
  loading,
  onRefresh,
  onReset,
}) => {
  const isDirty = date !== null || status !== "all" || search !== "";

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
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => onSearchChange("")}>
                <CloseOutlined fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      {/* Branch chip */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <Chip
          icon={<StoreOutlined />}
          label={activeBranchName ?? "Филиал не выбран"}
          variant="outlined"
          size="small"
        />
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={0.5} alignItems="center">
        {onReset && isDirty && (
          <Tooltip title="Сбросить фильтры">
            <IconButton size="small" onClick={onReset}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {onRefresh && (
          <Tooltip title="Обновить">
            <span>
              <IconButton size="small" onClick={onRefresh} disabled={loading}>
                <RefreshOutlined
                  fontSize="small"
                  sx={{
                    animation: loading ? "spin 1s linear infinite" : "none",
                    "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } },
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
};

export default AppointmentFilters;
