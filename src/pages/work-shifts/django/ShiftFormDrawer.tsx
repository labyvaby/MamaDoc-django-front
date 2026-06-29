import React from "react";
import {
  Drawer,
  Box,
  Stack,
  Divider,
  Typography,
  IconButton,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  CardContent,
  Chip,
  Alert,
  FormControlLabel,
  Checkbox,
  Autocomplete,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { SaveOutlined as Save, RestaurantMenuOutlined as RestaurantMenu, CloseOutlined as Close, DeleteOutline as Delete } from "@mui/icons-material";
import { subtleBg } from "../../../theme";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import type { ShiftWriteData, WorkShiftRow } from "../../../api/attendance";

export interface EmployeeOption {
  id: number;
  fullName: string;
}

interface ShiftFormDrawerProps {
  open: boolean;
  /** The shift being edited, or null when creating a new one. */
  shiftToEdit: WorkShiftRow | null;
  employees: EmployeeOption[];
  onClose: () => void;
  /** Persist the form: one row (create/edit) or many (weekday bulk-create). */
  onSubmit: (params: {
    editId: number | null;
    rows: ShiftWriteData[];
  }) => Promise<void>;
  /** Trigger deletion of the shift being edited (edit mode only). */
  onDelete?: () => void;
}

const WEEKDAYS = [
  { label: "ПН", value: "monday", dayOfWeek: 1 },
  { label: "ВТ", value: "tuesday", dayOfWeek: 2 },
  { label: "СР", value: "wednesday", dayOfWeek: 3 },
  { label: "ЧТ", value: "thursday", dayOfWeek: 4 },
  { label: "ПТ", value: "friday", dayOfWeek: 5 },
  { label: "СБ", value: "saturday", dayOfWeek: 6 },
  { label: "ВС", value: "sunday", dayOfWeek: 0 },
] as const;

/** Night when the shift starts before 08:00 or at/after 20:00 (day window 08–20). */
function inferNightFromTime(timeStr: string): boolean {
  if (!timeStr) return false;
  const [h] = timeStr.split(":").map(Number);
  return h < 8 || h >= 20;
}

const ShiftFormDrawer: React.FC<ShiftFormDrawerProps> = ({
  open,
  shiftToEdit,
  employees,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const { open: notify } = useNotification();
  const isEdit = shiftToEdit != null;

  const [employeeId, setEmployeeId] = React.useState<number | null>(null);
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("18:00");
  const [isNightShift, setIsNightShift] = React.useState(false);
  const [manuallySetNight, setManuallySetNight] = React.useState(false);
  const [endDateOvernight, setEndDateOvernight] = React.useState(false);
  const [hasLunch, setHasLunch] = React.useState(false);
  const [lunchStart, setLunchStart] = React.useState("13:00");
  const [selectedWeekdays, setSelectedWeekdays] = React.useState<string[]>([]);
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Lunch always ends exactly one hour after it starts.
  const lunchEnd = React.useMemo(() => {
    if (!lunchStart) return "";
    const [h, m] = lunchStart.split(":").map(Number);
    return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }, [lunchStart]);

  // Reset form whenever the drawer opens (for create or a specific edit target).
  React.useEffect(() => {
    if (!open) return;
    if (shiftToEdit) {
      const start = dayjs(shiftToEdit.clockIn);
      const end = shiftToEdit.clockOut ? dayjs(shiftToEdit.clockOut) : start;
      setEmployeeId(shiftToEdit.employeeId);
      setStartDate(start.format("YYYY-MM-DD"));
      setEndDate(end.format("YYYY-MM-DD"));
      setEndDateOvernight(!start.isSame(end, "day"));
      setStartTime(start.format("HH:mm"));
      setEndTime(shiftToEdit.clockOut ? end.format("HH:mm") : "18:00");
      setIsNightShift(shiftToEdit.isNightShift);
      setManuallySetNight(true);
      setHasLunch(shiftToEdit.hasLunch);
      setLunchStart(shiftToEdit.lunchStart ?? "13:00");
      setSelectedWeekdays([]);
    } else {
      const today = dayjs().format("YYYY-MM-DD");
      setEmployeeId(null);
      setStartDate(today);
      setEndDate(today);
      setEndDateOvernight(false);
      setStartTime("09:00");
      setEndTime("18:00");
      setIsNightShift(false);
      setManuallySetNight(false);
      setHasLunch(false);
      setLunchStart("13:00");
      setSelectedWeekdays([]);
    }
    setTouched(false);
  }, [open, shiftToEdit]);

  // Auto-infer day/night from the start time until the user picks manually.
  React.useEffect(() => {
    if (!manuallySetNight && startTime) {
      setIsNightShift(inferNightFromTime(startTime));
    }
  }, [startTime, manuallySetNight]);

  // Keep the end date aligned with the overnight toggle.
  React.useEffect(() => {
    if (!startDate) return;
    setEndDate(
      endDateOvernight
        ? dayjs(startDate).add(1, "day").format("YYYY-MM-DD")
        : startDate,
    );
  }, [endDateOvernight, startDate]);

  const workMode = isNightShift ? "night" : "day";

  const buildRow = (dateStr: string): ShiftWriteData => {
    const endBase = endDateOvernight
      ? dayjs(dateStr).add(1, "day").format("YYYY-MM-DD")
      : dateStr;
    return {
      employeeId: employeeId ?? undefined,
      clockIn: dayjs(`${dateStr}T${startTime}`).toISOString(),
      clockOut: dayjs(`${endBase}T${endTime}`).toISOString(),
      isNightShift,
      hasLunch,
      lunchStart: hasLunch ? lunchStart : null,
    };
  };

  const handleWeekdayToggle = (value: string) => {
    // First weekday pick widens a collapsed range by a month for convenience.
    if (selectedWeekdays.length === 0 && startDate && endDate === startDate) {
      setEndDate(dayjs(startDate).add(1, "month").format("YYYY-MM-DD"));
    }
    setSelectedWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  };

  const canSave = Boolean(startDate) && (isEdit || employeeId != null);

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSave) return;

    const rows: ShiftWriteData[] = [];
    if (!isEdit && selectedWeekdays.length > 0) {
      let cur = dayjs(startDate);
      const end = dayjs(endDate);
      while (cur.isBefore(end) || cur.isSame(end, "day")) {
        const dow = cur.day();
        const matches = selectedWeekdays.some(
          (w) => WEEKDAYS.find((x) => x.value === w)?.dayOfWeek === dow,
        );
        if (matches) rows.push(buildRow(cur.format("YYYY-MM-DD")));
        cur = cur.add(1, "day");
      }
      if (rows.length === 0) {
        notify?.({
          type: "error",
          message: "В указанном диапазоне дат нет выбранных дней недели!",
        });
        return;
      }
    } else {
      rows.push(buildRow(startDate));
    }

    setSaving(true);
    try {
      await onSubmit({ editId: isEdit ? shiftToEdit!.id : null, rows });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={saving ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: 320, sm: 560 }, maxWidth: "100vw" } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
        }}
      >
        <Typography variant="h6">
          {isEdit ? "Редактировать смену" : "Добавить смену"}
        </Typography>
        <IconButton onClick={onClose} aria-label="Закрыть" disabled={saving}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Box px={2} py={2} sx={{ overflowY: "auto" }}>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Информация о смене
            </Typography>

            {/* Сотрудник */}
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Сотрудник *
              </Typography>
              {isEdit ? (
                <TextField
                  value={shiftToEdit?.employeeName ?? ""}
                  size="small"
                  fullWidth
                  disabled
                />
              ) : (
                <Autocomplete
                  options={employees}
                  value={employees.find((e) => e.id === employeeId) ?? null}
                  onChange={(_, v) => setEmployeeId(v?.id ?? null)}
                  getOptionLabel={(o) => o.fullName}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Выберите сотрудника"
                      fullWidth
                      size="small"
                      error={touched && employeeId == null}
                      helperText={
                        touched && employeeId == null
                          ? "Выберите сотрудника"
                          : ""
                      }
                    />
                  )}
                />
              )}
            </Stack>

            {(isEdit || employeeId != null) && (
              <>
                {/* Дата + режим смены */}
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  alignItems={{ sm: "flex-end" }}
                >
                  <Stack spacing={0.5} sx={{ flex: "1 1 60%" }}>
                    <Typography variant="body2" color="text.secondary">
                      Дата *
                    </Typography>
                    <DatePicker
                      value={startDate ? dayjs(startDate) : null}
                      format="DD.MM.YYYY"
                      onChange={(val) => {
                        const newDate = val ? val.format("YYYY-MM-DD") : "";
                        setStartDate(newDate);
                        if (selectedWeekdays.length === 0) {
                          setEndDate(
                            endDateOvernight
                              ? dayjs(newDate)
                                  .add(1, "day")
                                  .format("YYYY-MM-DD")
                              : newDate,
                          );
                        } else if (!endDate || endDate < newDate) {
                          setEndDate(newDate);
                        }
                      }}
                      slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                  </Stack>
                  <Box sx={{ flex: "1 1 40%" }}>
                    <ToggleButtonGroup
                      exclusive
                      value={workMode}
                      onChange={(_, v) => {
                        if (v) {
                          setIsNightShift(v === "night");
                          setManuallySetNight(true);
                        }
                      }}
                      size="small"
                      sx={{
                        width: 1,
                        bgcolor: (t) => subtleBg(t),
                        borderRadius: "10px",
                        p: "3px",
                        border: "none",
                        "& .MuiToggleButton-root": {
                          flex: 1,
                          border: "none",
                          borderRadius: "7px",
                          py: 0.75,
                          transition: "background-color .15s ease, color .15s ease",
                          bgcolor: "transparent",
                          color: "text.disabled",
                          boxShadow: "none",
                          "&:hover": { bgcolor: (t) => subtleBg(t, true) },
                          "&.Mui-selected": {
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            fontWeight: 600,
                            "&:hover": { bgcolor: "primary.dark" },
                          },
                        },
                      }}
                    >
                      <ToggleButton value="day" aria-label="Дневной">
                        <WbSunnyOutlined sx={{ fontSize: 20 }} />
                      </ToggleButton>
                      <ToggleButton value="night" aria-label="Ночной">
                        <NightlightOutlined sx={{ fontSize: 20 }} />
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Stack>

                {/* Дата окончания диапазона (только для массового создания) */}
                {!isEdit && selectedWeekdays.length > 0 && (
                  <Stack spacing={0.5}>
                    <Typography variant="body2" color="text.secondary">
                      Дата окончания диапазона
                    </Typography>
                    <DatePicker
                      value={endDate ? dayjs(endDate) : null}
                      format="DD.MM.YYYY"
                      onChange={(val) =>
                        setEndDate(val ? val.format("YYYY-MM-DD") : "")
                      }
                      slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                  </Stack>
                )}

                {/* Рабочее время */}
                <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontWeight: 600 }}
                      >
                        Рабочее время
                      </Typography>

                      <Stack direction="row" spacing={2}>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="caption"
                            sx={{ mb: 0.5, display: "block", color: "text.secondary" }}
                          >
                            Начало
                          </Typography>
                          <TimePicker
                            value={dayjs(`2000-01-01T${startTime}`)}
                            onChange={(val) =>
                              setStartTime(val ? val.format("HH:mm") : "")
                            }
                            ampm={false}
                            minutesStep={15}
                            slotProps={{ textField: { size: "small", fullWidth: true } }}
                          />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="caption"
                            sx={{ mb: 0.5, display: "block", color: "text.secondary" }}
                          >
                            Конец
                          </Typography>
                          <TimePicker
                            value={dayjs(`2000-01-01T${endTime}`)}
                            onChange={(val) =>
                              setEndTime(val ? val.format("HH:mm") : "")
                            }
                            ampm={false}
                            minutesStep={15}
                            slotProps={{ textField: { size: "small", fullWidth: true } }}
                          />
                        </Box>
                      </Stack>

                      {/* Смена заканчивается на следующий день */}
                      <Box>
                        <FormControlLabel
                          control={
                            <Checkbox
                              size="small"
                              checked={endDateOvernight}
                              onChange={(e) => setEndDateOvernight(e.target.checked)}
                            />
                          }
                          label={
                            <Typography variant="body2">
                              Смена заканчивается на следующий день
                            </Typography>
                          }
                        />
                        {endDateOvernight && (
                          <Stack spacing={0.5} sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Дата окончания смены
                            </Typography>
                            <DatePicker
                              value={endDate ? dayjs(endDate) : null}
                              format="DD.MM.YYYY"
                              onChange={(val) =>
                                setEndDate(val ? val.format("YYYY-MM-DD") : "")
                              }
                              slotProps={{
                                textField: { size: "small", fullWidth: true },
                              }}
                            />
                          </Stack>
                        )}
                      </Box>

                      {/* Обеденный перерыв */}
                      {!hasLunch ? (
                        <Button
                          variant="outlined"
                          startIcon={<RestaurantMenu />}
                          onClick={() => setHasLunch(true)}
                          size="small"
                          sx={{ alignSelf: "flex-start" }}
                        >
                          Добавить обед
                        </Button>
                      ) : (
                        <Box>
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ mb: 1 }}
                          >
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              Обеденный перерыв (ровно 1 час)
                            </Typography>
                            <Button
                              size="small"
                              startIcon={<Close />}
                              onClick={() => setHasLunch(false)}
                              color="error"
                              sx={{ minWidth: "auto", px: 1 }}
                            >
                              Убрать
                            </Button>
                          </Stack>
                          <Stack direction="row" spacing={2} alignItems="flex-end">
                            <Box sx={{ flex: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{ mb: 0.5, display: "block", color: "text.secondary" }}
                              >
                                Начало обеда
                              </Typography>
                              <TimePicker
                                value={dayjs(`2000-01-01T${lunchStart}`)}
                                onChange={(val) =>
                                  setLunchStart(val ? val.format("HH:mm") : "")
                                }
                                ampm={false}
                                minutesStep={15}
                                slotProps={{ textField: { size: "small", fullWidth: true } }}
                              />
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography
                                variant="caption"
                                sx={{ mb: 0.5, display: "block", color: "text.secondary" }}
                              >
                                Конец обеда
                              </Typography>
                              <TextField value={lunchEnd} size="small" fullWidth disabled />
                            </Box>
                          </Stack>
                          <Alert severity="info" sx={{ mt: 1 }}>
                            Обеденный перерыв: {lunchStart} - {lunchEnd}
                          </Alert>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                {/* Дни недели — массовое создание (только при создании) */}
                {!isEdit && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Рабочие дни недели (не обязательно)
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {WEEKDAYS.map((day) => (
                        <Chip
                          key={day.value}
                          label={day.label}
                          onClick={() => handleWeekdayToggle(day.value)}
                          color={
                            selectedWeekdays.includes(day.value) ? "primary" : "default"
                          }
                          variant={
                            selectedWeekdays.includes(day.value) ? "filled" : "outlined"
                          }
                          sx={{
                            fontWeight: selectedWeekdays.includes(day.value) ? 600 : 400,
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </Stack>
                    {selectedWeekdays.length > 0 && (
                      <Alert severity="warning" sx={{ mt: 1.5 }}>
                        Будут созданы смены на все{" "}
                        {selectedWeekdays
                          .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
                          .join(", ")}{" "}
                        с {dayjs(startDate).format("DD.MM.YYYY")} по{" "}
                        {dayjs(endDate).format("DD.MM.YYYY")}
                      </Alert>
                    )}
                  </Box>
                )}
              </>
            )}
          </Stack>

          {/* Кнопки */}
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 3 }}>
            <Button onClick={onClose} color="inherit" disabled={saving}>
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              startIcon={isEdit ? <Save /> : undefined}
              disableElevation
              disabled={saving || !canSave}
            >
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
            {isEdit && onDelete && (
              <Button
                variant="outlined"
                color="error"
                onClick={onDelete}
                startIcon={<Delete />}
                disabled={saving}
              >
                Удалить смену
              </Button>
            )}
          </Stack>
        </Box>
      </LocalizationProvider>
    </Drawer>
  );
};

export default ShiftFormDrawer;
