import React, { useState, useEffect } from "react";
import {
  Stack,
  TextField,
  Button,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Box,
  Grid,
  Chip,
  Card,
  CardContent,
  Alert,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { Save, RestaurantMenu, Close, Delete } from "@mui/icons-material";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import dayjs, { Dayjs } from "dayjs";
import { roundMinutesToStep } from "../../utility/time";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { CustomTimePicker, CustomDatePicker } from "../ui";
import { useNotification } from "@refinedev/core";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import { AppCard } from "../ui";

// Типы
type Employee = {
  id: string;
  full_name: string;
  specialization?: string;
};

type Shift = {
  id: string;
  employes_id: string;
  startDate: string;
  endDate: string;
  start_time?: string;
  end_time?: string;
  is_night_shift?: boolean;
  lunch_start?: string;
  lunch_end?: string;
  weekdays?: string[];
  employee?: Employee | null;
};

// Пропсы
type Props = {
  initialDate: Dayjs | null;
  shiftToEdit?: Shift | null;
  allEmployees: Employee[];
  onSuccess: (data: Omit<Shift, 'id' | 'employee'> | Omit<Shift, 'id' | 'employee'>[]) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  isDoctor?: boolean;
  currentEmployeeId?: string | null;
};

function inferWorkModeFromTime(timeStr: string): boolean {
  if (!timeStr) return false;
  const [h] = timeStr.split(':').map(Number);
  return h < 8 || h >= 20;
}

const WEEKDAYS = [
  { label: "ПН", value: "monday", dayOfWeek: 1 },
  { label: "ВТ", value: "tuesday", dayOfWeek: 2 },
  { label: "СР", value: "wednesday", dayOfWeek: 3 },
  { label: "ЧТ", value: "thursday", dayOfWeek: 4 },
  { label: "ПТ", value: "friday", dayOfWeek: 5 },
  { label: "СБ", value: "saturday", dayOfWeek: 6 },
  { label: "ВС", value: "sunday", dayOfWeek: 0 },
];

const employeeFilter = createFilterOptions<Employee>({
  matchFrom: "start",
  stringify: (o) => `${o.full_name ?? ""} ${o.specialization ?? ""}`.trim(),
});

const ShiftForm: React.FC<Props> = ({ initialDate, shiftToEdit, allEmployees, onSuccess, onCancel, onDelete, isDoctor, currentEmployeeId }) => {
  const { open: notify } = useNotification();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [isNightShift, setIsNightShift] = useState(false);
  const [manuallySetNightShift, setManuallySetNightShift] = useState(false);
  const [endDateOvernight, setEndDateOvernight] = useState(false); // true = дата конца ≠ дата начала
  const [hasLunch, setHasLunch] = useState(false);
  const [lunchStart, setLunchStart] = useState('13:00');
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  const mode = shiftToEdit ? 'edit' : 'create';

  // Вычисляем конец обеда автоматически (ровно через час)
  const lunchEnd = React.useMemo(() => {
    if (!lunchStart) return '';
    const [h, m] = lunchStart.split(':').map(Number);
    const endHour = (h + 1) % 24;
    return `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [lunchStart]);

  useEffect(() => {
    if (shiftToEdit) {
      const emp = allEmployees.find(e => e.id === shiftToEdit.employes_id);
      setEmployee(emp || null);
      const sd = dayjs(shiftToEdit.startDate).format('YYYY-MM-DD');
      const ed = dayjs(shiftToEdit.endDate).format('YYYY-MM-DD');
      setStartDate(sd);
      setEndDate(ed);
      setEndDateOvernight(sd !== ed);
      setStartTime(roundMinutesToStep(shiftToEdit.start_time?.slice(0, 5) || '09:00', 15));
      setEndTime(roundMinutesToStep(shiftToEdit.end_time?.slice(0, 5) || '18:00', 15));
      setIsNightShift(!!shiftToEdit.is_night_shift);
      setManuallySetNightShift(true);
      const hasLunchTime = !!(shiftToEdit.lunch_start && shiftToEdit.lunch_end);
      setHasLunch(hasLunchTime);
      if (hasLunchTime) {
        setLunchStart(shiftToEdit.lunch_start?.slice(0, 5) || '13:00');
      }
      setSelectedWeekdays(shiftToEdit.weekdays || []);
    } else if (initialDate) {
      if (isDoctor && currentEmployeeId) {
        const emp = allEmployees.find(e => e.id === currentEmployeeId);
        setEmployee(emp || null);
      } else {
        setEmployee(null);
      }
      setStartDate(initialDate.format('YYYY-MM-DD'));
      setEndDate(initialDate.format('YYYY-MM-DD'));
      setEndDateOvernight(false);
      setStartTime('09:00');
      setEndTime('18:00');
      setIsNightShift(false);
      setManuallySetNightShift(false);
      setHasLunch(false);
      setLunchStart('13:00');
      setSelectedWeekdays([]);
      setTouched(false);
    }
  }, [shiftToEdit, initialDate, allEmployees]);

  useEffect(() => {
    if (!manuallySetNightShift && startTime) {
      const isNight = inferWorkModeFromTime(startTime);
      setIsNightShift(isNight);
    }
  }, [startTime, manuallySetNightShift]);

  // When overnight toggle changes: set endDate to next day or same day
  useEffect(() => {
    if (!startDate) return;
    if (endDateOvernight) {
      setEndDate(dayjs(startDate).add(1, 'day').format('YYYY-MM-DD'));
    } else {
      setEndDate(startDate);
    }
  }, [endDateOvernight]);

  const handleSubmit = () => {
    setTouched(true);
    if (!employee || !startDate || !endDate) {
      return;
    }

    // Если выбраны дни недели - создаём несколько смен
    if (selectedWeekdays.length > 0) {
      const shifts: Array<Omit<Shift, 'id' | 'employee'>> = [];
      const startMoment = dayjs(startDate);
      const endMoment = dayjs(endDate);

      // Получаем все даты в диапазоне
      let current = startMoment;
      while (current.isBefore(endMoment) || current.isSame(endMoment, 'day')) {
        const dayOfWeek = current.day(); // 0 = Sunday, 1 = Monday, etc.

        // Проверяем, входит ли этот день в выбранные
        const isSelectedDay = selectedWeekdays.some(wd => {
          const weekday = WEEKDAYS.find(w => w.value === wd);
          return weekday?.dayOfWeek === dayOfWeek;
        });

        if (isSelectedDay) {
          shifts.push({
            employes_id: employee.id,
            startDate: current.format('YYYY-MM-DD'),
            endDate: current.format('YYYY-MM-DD'),
            start_time: startTime,
            end_time: endTime,
            is_night_shift: isNightShift,
            lunch_start: hasLunch ? lunchStart : undefined,
            lunch_end: hasLunch ? lunchEnd : undefined,
            weekdays: selectedWeekdays,
          });
        }

        current = current.add(1, 'day');
      }

      if (shifts.length === 0) {
        notify?.({
          type: "error",
          message: "В указанном диапазоне дат нет выбранных дней недели!"
        });
        return;
      }

      // Отправляем все смены
      onSuccess(shifts);

    } else {
      // Обычное создание одной смены
      onSuccess({
        employes_id: employee.id,
        startDate: startDate,
        endDate: endDate,
        start_time: startTime,
        end_time: endTime,
        is_night_shift: isNightShift,
        lunch_start: hasLunch ? lunchStart : undefined,
        lunch_end: hasLunch ? lunchEnd : undefined,
        weekdays: selectedWeekdays,
      });
    }
  };

  const submitText = mode === 'edit' ? 'Сохранить' : 'Добавить';

  const handleWeekdayToggle = (value: string) => {
    // При первом выборе дня недели автоматически расширяем диапазон на месяц вперед,
    // если он был свернут (начало == конец), чтобы пользователю было удобно.
    if (selectedWeekdays.length === 0 && startDate && endDate === startDate) {
      setEndDate(dayjs(startDate).add(1, 'month').format('YYYY-MM-DD'));
    }

    setSelectedWeekdays(prev =>
      prev.includes(value)
        ? prev.filter(d => d !== value)
        : [...prev, value]
    );
  };

  const workMode = isNightShift ? 'night' : 'day';

  return (
    <Box px={2} py={2} sx={{ overflowY: "auto" }}>
      <Stack spacing={2}>
        {/* Заголовок секции */}
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
          Информация о смене
        </Typography>

        {/* Сотрудник */}
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            Сотрудник *
          </Typography>
          <Autocomplete
            options={allEmployees}
            value={employee}
            disabled={isDoctor}
            onChange={(_, v) => setEmployee(v)}
            getOptionLabel={(o) =>
              `${o.full_name || o.id}${o.specialization ? ` — ${o.specialization}` : ""}`
            }
            filterOptions={employeeFilter}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Выберите сотрудника"
                fullWidth
                size="small"
                error={touched && !employee}
                helperText={touched && !employee ? "Выберите сотрудника" : ""}
              />
            )}
          />
        </Stack>

        {employee && (
          <>
            {/* Дата и режим смены */}
            <Grid container spacing={1.5} alignItems="flex-end">
              <Grid item xs={12} sm={7.5}>
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Дата *
                  </Typography>
                  <CustomDatePicker
                    value={startDate ? dayjs(startDate) : null}
                    onChange={(val) => {
                      const newDate = val ? val.format('YYYY-MM-DD') : '';
                      setStartDate(newDate);
                      if (selectedWeekdays.length === 0) {
                        if (endDateOvernight) {
                          setEndDate(dayjs(newDate).add(1, 'day').format('YYYY-MM-DD'));
                        } else {
                          setEndDate(newDate);
                        }
                      } else {
                        if (!endDate || endDate < newDate) {
                          setEndDate(newDate);
                        }
                      }
                    }}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: "small",
                        InputLabelProps: { shrink: true }
                      }
                    }}
                  />
                </Stack>
              </Grid>
              <Grid
                item
                xs={12}
                sm={4.5}
              >
                <Box sx={{ width: 1 }}>
                  <ToggleButtonGroup
                    exclusive
                    value={workMode}
                    onChange={(_, v) => {
                      if (v) {
                        setIsNightShift(v === 'night');
                        setManuallySetNightShift(true);
                      }
                    }}
                    size="small"
                    sx={{
                      width: 1,
                      bgcolor: "grey.100",
                      borderRadius: 1.5,
                      p: "3px",
                      border: "none",
                      "& .MuiToggleButton-root": {
                        flex: 1,
                        border: "none",
                        borderRadius: 1,
                        py: 0.75,
                        transition: "all 0.2s ease-in-out",
                        bgcolor: "transparent",
                        color: "text.disabled",
                        boxShadow: "none",
                        "&:hover": {
                          bgcolor: "rgba(0,0,0,0.04)",
                        },
                        "&.Mui-selected": {
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          boxShadow:
                            "inset 0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.05)",
                          fontWeight: 600,
                          "&:hover": {
                            bgcolor: "primary.dark",
                          },
                        },
                      },
                    }}
                  >
                    <ToggleButton value="day" aria-label="Дневной">
                      <WbSunnyOutlined
                        sx={{
                          fontSize: 20,
                          color:
                            workMode === "day"
                              ? "primary.contrastText"
                              : "text.disabled",
                        }}
                      />
                    </ToggleButton>
                    <ToggleButton value="night" aria-label="Ночной">
                      <NightlightOutlined
                        sx={{
                          fontSize: 20,
                          color:
                            workMode === "night"
                              ? "primary.contrastText"
                              : "text.disabled",
                        }}
                      />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Grid>
            </Grid>

            {/* Дата окончания (только для массового создания) */}
            {selectedWeekdays.length > 0 && (
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary">
                  Дата окончания диапазона
                </Typography>
                <CustomDatePicker
                  value={endDate ? dayjs(endDate) : null}
                  onChange={(val) => setEndDate(val ? val.format('YYYY-MM-DD') : '')}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      InputLabelProps: { shrink: true }
                    }
                  }}
                />
              </Stack>
            )}

            {/* Рабочее время */}
            <AppCard variant="outlined" sx={{ bgcolor: "background.paper" }} disableContentPadding>
              <CardContent sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Рабочее время
                  </Typography>

                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <Stack direction="row" spacing={2}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary' }}>
                          Начало
                        </Typography>
                        <CustomTimePicker
                          value={dayjs(`2000-01-01T${startTime}`)}
                          onChange={(val) => setStartTime(val ? val.format("HH:mm") : "")}
                          ampm={false}
                          slotProps={{ textField: { size: "small", fullWidth: true } }}
                        />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary' }}>
                          Конец
                        </Typography>
                        <CustomTimePicker
                          value={dayjs(`2000-01-01T${endTime}`)}
                          onChange={(val) => setEndTime(val ? val.format("HH:mm") : "")}
                          ampm={false}
                          slotProps={{ textField: { size: "small", fullWidth: true } }}
                        />
                      </Box>
                    </Stack>

                    {/* Ночная смена: дата окончания на следующий день */}
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
                          <CustomDatePicker
                            value={endDate ? dayjs(endDate) : null}
                            onChange={(val) => setEndDate(val ? val.format('YYYY-MM-DD') : '')}
                            slotProps={{
                              textField: { size: "small", fullWidth: true }
                            }}
                          />
                        </Stack>
                      )}
                    </Box>

                    {/* Обеденное время */}
                    {!hasLunch ? (
                      <Button
                        variant="outlined"
                        startIcon={<RestaurantMenu />}
                        onClick={() => setHasLunch(true)}
                        size="small"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        Добавить обед
                      </Button>
                    ) : (
                      <Box>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Обеденный перерыв (ровно 1 час)
                          </Typography>
                          <Button
                            size="small"
                            startIcon={<Close />}
                            onClick={() => setHasLunch(false)}
                            color="error"
                            sx={{ minWidth: 'auto', px: 1 }}
                          >
                            Убрать
                          </Button>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="flex-end">
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary' }}>
                              Начало обеда
                            </Typography>
                            <CustomTimePicker
                              value={dayjs(`2000-01-01T${lunchStart}`)}
                              onChange={(val) => setLunchStart(val ? val.format("HH:mm") : "")}
                              ampm={false}
                              slotProps={{ textField: { size: "small", fullWidth: true } }}
                            />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary' }}>
                              Конец обеда
                            </Typography>
                            <TextField
                              value={lunchEnd}
                              size="small"
                              fullWidth
                              disabled
                              sx={{
                                '& .MuiInputBase-input.Mui-disabled': {
                                  WebkitTextFillColor: 'text.primary',
                                  color: 'text.primary'
                                }
                              }}
                            />
                          </Box>
                        </Stack>
                        <Alert severity="info" sx={{ mt: 1 }}>
                          Обеденный перерыв: {lunchStart} - {lunchEnd}
                        </Alert>
                      </Box>
                    )}
                  </LocalizationProvider>
                </Stack>
              </CardContent>
            </AppCard>

            {/* Дни недели */}
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
                    color={selectedWeekdays.includes(day.value) ? "primary" : "default"}
                    variant={selectedWeekdays.includes(day.value) ? "filled" : "outlined"}
                    sx={{
                      fontWeight: selectedWeekdays.includes(day.value) ? 600 : 400,
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </Stack>
              {selectedWeekdays.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  Будут созданы смены на все {selectedWeekdays.map(d => WEEKDAYS.find(w => w.value === d)?.label).join(', ')}
                  {' '}с {dayjs(startDate).format('DD.MM.YYYY')} по {dayjs(endDate).format('DD.MM.YYYY')}
                </Alert>
              )}
            </Box>
          </>
        )}
      </Stack>

      {/* Кнопки */}
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 3 }}>
        <Button onClick={onCancel} color="inherit">
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          startIcon={mode === 'edit' ? <Save /> : undefined}
          disableElevation
          disabled={!employee || !startDate || !endDate}
        >
          {submitText}
        </Button>
        {mode === 'edit' && onDelete && (
          <Button
            variant="outlined"
            color="error"
            onClick={() => shiftToEdit && onDelete(shiftToEdit.id)}
            startIcon={<Delete />}
          >
            Удалить смену
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default ShiftForm;
