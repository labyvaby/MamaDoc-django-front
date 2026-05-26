/**
 * AddShiftSidebar.tsx
 * Боковая панель (Drawer) для добавления новой смены в таблицу Shifts (Supabase).
 * Содержит форму: выбор сотрудника (Autocomplete), дата (TextField type="date"),
 * время начала/окончания (TextField type="time").
 * Презентационный+контейнерный компонент: содержит простую логику загрузки сотрудников и вставки смены.
 */
import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
  CircularProgress,
  MenuItem,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";

import { supabase } from "../../utility/supabaseClient";
import { useNotification } from "@refinedev/core";
import { useEmployees } from "../../hooks/useEmployees";
// import { fetchEmployees } from "../../services/employees"; // Removed direct fetch
import type { EmployeesRow } from "../../pages/expenses/types";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { CustomTimePicker, CustomDatePicker } from "../ui";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void; // колбэк для обновления календаря снаружи
};

type ShiftType = "day" | "night";

const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const AddShiftSidebar: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
  const { open: notify } = useNotification();
  // Сотрудники — Load via hook
  const { employees, loading: loadingEmps } = useEmployees(isOpen);
  // const [employees, setEmployees] = React.useState<EmployeesRow[]>([]);
  // const [loadingEmps, setLoadingEmps] = React.useState(false);

  // Форма
  const [employee, setEmployee] = React.useState<EmployeesRow | null>(null);
  const [shiftDate, setShiftDate] = React.useState<string>(toYMD(new Date()));
  const [shiftType, setShiftType] = React.useState<ShiftType>("day");
  const [startTime, setStartTime] = React.useState<string>("09:00");
  const [endTime, setEndTime] = React.useState<string>("18:00");

  const [busy, setBusy] = React.useState(false);

  // Загрузка сотрудников теперь через хук useEmployees

  // Сброс при закрытии
  React.useEffect(() => {
    if (!isOpen) {
      setEmployee(null);
      setShiftDate(toYMD(new Date()));
      setShiftType("day");
      setStartTime("09:00");
      setEndTime("18:00");
      setBusy(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!employee || !shiftDate || busy) {
      notify?.({ type: "error", message: "Выберите сотрудника и дату смены" });
      return;
    }
    try {
      setBusy(true);

      // Берём полный UUID сотрудника: если в объекте есть full_uuid — используем его, иначе стандартный id
      const empId = String((employee as unknown as { full_uuid?: string; id: string }).full_uuid ?? employee.id);

      const payload: Record<string, unknown> = {
        employes_id: empId,
        shift_date: shiftDate,
        start_time: startTime || null,
        end_time: endTime || null,
        shift_type: shiftType,
      };
      const { error } = await supabase.from("shifts").insert(payload).select("*").single();
      if (error) throw error;

      onSaved?.();
      notify?.({ type: "success", message: "Смена добавлена" });
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      notify?.({ type: "error", message: "Не удалось добавить смену" });
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = !employee || !shiftDate || busy;

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: { width: { xs: "100%", sm: 420, md: "36vw" }, maxWidth: "100vw" },
      }}
    >
      <Box sx={{ width: 1, minWidth: 0 }}>
        {/* Заголовок */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" px={2} py={1.5}>
          <Typography variant="h6">Добавить смену</Typography>
          <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
            <CloseOutlined />
          </IconButton>
        </Stack>
        <Divider />

        {/* Форма */}
        <Box px={2} py={2}>
          <Stack spacing={2}>
            {/* Сотрудник */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Сотрудник
              </Typography>
              <Autocomplete
                options={employees}
                loading={loadingEmps}
                value={employee}
                getOptionLabel={(o) =>
                  `${o.full_name || o.id} — ${o.specialization || "Нет специализации"}`
                }
                filterOptions={createFilterOptions<EmployeesRow>({
                  matchFrom: "start",
                  stringify: (o) => `${o.full_name ?? ""} ${o.specialization ?? ""}`.trim(),
                })}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                onChange={(_, v) => setEmployee(v)}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Checkbox size="small" checked={employee?.id === option.id} sx={{ mr: 1 }} />
                    {(option.full_name || option.id) + " — " + (option.specialization || "Нет специализации")}
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Поиск по ФИО или специализации" fullWidth size="small" />
                )}
                sx={{ flex: 1 }}
              />
            </Stack>

            {/* Дата */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Дата смены
              </Typography>
              <CustomDatePicker
                value={shiftDate ? dayjs(shiftDate) : null}
                onChange={(val) => setShiftDate(val ? val.format('YYYY-MM-DD') : toYMD(new Date()))}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: "small",
                    InputLabelProps: { shrink: true }
                  }
                }}
              />
            </Stack>

            {/* Тип смены */}
            <TextField
              label="Тип смены"
              select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value as ShiftType)}
              fullWidth
            >
              <MenuItem value="day">Дневная</MenuItem>
              <MenuItem value="night">Ночная</MenuItem>
            </TextField>

            {/* Время начала / окончания */}
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <Stack direction="row" gap={1}>
                <CustomTimePicker
                  label="Начало"
                  value={dayjs(`2000-01-01T${startTime}`)}
                  onChange={(val) => setStartTime(val ? val.format("HH:mm") : "")}
                  minutesStep={15}
                  slotProps={{ textField: { fullWidth: true, InputLabelProps: { shrink: true } } }}
                />
                <CustomTimePicker
                  label="Окончание"
                  value={dayjs(`2000-01-01T${endTime}`)}
                  onChange={(val) => setEndTime(val ? val.format("HH:mm") : "")}
                  minutesStep={15}
                  slotProps={{ textField: { fullWidth: true, InputLabelProps: { shrink: true } } }}
                />
              </Stack>
            </LocalizationProvider>
          </Stack>
        </Box>
        <Divider />

        {/* Кнопки */}
        <Box px={2} py={1.5} display="flex" justifyContent="flex-end" gap={1.5}>
          <Button onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} variant="contained" disabled={submitDisabled}>
            {busy ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <span>Сохранение…</span>
              </Stack>
            ) : (
              "Сохранить"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default AddShiftSidebar;
