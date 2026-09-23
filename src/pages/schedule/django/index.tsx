import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Fab,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  useMediaQuery,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { ConfirmDialog, CustomDatePicker } from "../../../components/ui";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../../api/staff";
import {
  getScheduleRules,
  createScheduleRule,
  deleteScheduleRule,
  getScheduleExceptions,
  createScheduleException,
  createScheduleExceptionPeriod,
  deleteScheduleExceptionPeriod,
  updateScheduleException,
  deleteScheduleException,
  parseShiftOverlapConflict,
  PARTIAL_ABSENCE_ENABLED,
  SCHEDULE_RULE_ONLINE_BOOKING_ENABLED,
  type ScheduleRule,
  type ScheduleException,
  type ScheduleExceptionKind,
  type ShiftOverlapConflict,
} from "../../../api/scheduling";
import { parseBackendError } from "../../../api/appointments";
import { pluralRu } from "../../../utility/amountInWords";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";
import ScheduleCalendar from "./ScheduleCalendar";
import { useFormValidation } from "../../../hooks/useFormValidation";
import ScheduleDayDrawer from "./ScheduleDayDrawer";
import SchedulePointEditDialog, { type SchedulePointEditValues } from "./SchedulePointEditDialog";
import ShiftOverlapDialog from "./ShiftOverlapDialog";
import AbsenceConflictsDrawer, { type AbsenceSpan } from "./AbsenceConflictsDrawer";
import { isScheduleQueryExceptConflicts } from "./scheduleInvalidation";
import { isAbsenceKind, useAbsenceConflicts } from "./useAbsenceConflicts";
import { computeDayOccurrences, type DayOccurrence } from "./occurrences";
import { absencesOfDay, type AbsenceMark } from "./absenceRows";
import { useEmployeeColorMap } from "./employeeColors";
import EmployeePicker from "./EmployeePicker";
import ScheduleSettingsMatrix from "./ScheduleSettingsMatrix";
import EmployeePanel from "./EmployeePanel";
import RuleForm from "./RuleForm";
import AbsenceForm from "./AbsenceForm";
import { buildEmployeeSchedules, weekdaysShort, type EmployeeSchedule } from "./scheduleSettingsModel";
import {
  buildWeekCells,
  employeeIssue,
  mondayOf,
  type EmployeeIssue,
  type EmployeeRef,
  type RuleFormMode,
} from "./scheduleMatrixModel";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const KIND_LABELS: Record<ScheduleExceptionKind, string> = {
  day_off: "Выходной",
  vacation: "Отпуск",
  extra: "Смена",
  override: "Замена смены",
};

/** dayjs считает 0=Вс, а бэкенд расписания — 0=Пн. */
function toRuleWeekday(date: Dayjs): number {
  return (date.day() + 6) % 7;
}

function pluralDays(n: number): string {
  return pluralRu(n, ["день", "дня", "дней"]);
}

// ── Мелкие общие блоки форм ───────────────────────────────────────────────────

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="body2" color="text.secondary" fontWeight={600}>
    {children}
  </Typography>
);

/** Чипы дней недели: используются и в правиле, и в форме смены с повтором. */
const WeekdayChips: React.FC<{
  value: number[];
  onToggle: (day: number) => void;
}> = ({ value, onToggle }) => (
  <Stack direction="row" gap={0.5} flexWrap="wrap">
    {WEEKDAY_LABELS.map((label, d) => {
      const active = value.includes(d);
      return (
        <Chip
          key={label}
          label={label}
          size="small"
          clickable
          onClick={() => onToggle(d)}
          sx={(t) => ({
            borderRadius: "7px",
            fontWeight: 500,
            border: 1,
            borderColor: active ? alpha(t.palette.primary.main, 0.4) : "divider",
            color: active ? "primary.onSurface" : "text.secondary",
            bgcolor: active
              ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1)
              : "transparent",
          })}
        />
      );
    })}
  </Stack>
);

/** Сегмент-переключатель на два состояния (гайд §5.7). */
const SegmentToggle = <T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  disabled?: boolean;
}) => (
  <Stack
    direction="row"
    sx={{
      p: 0.5,
      gap: 0.25,
      border: 1,
      borderColor: "divider",
      borderRadius: "10px",
      bgcolor: "background.paper",
      width: "fit-content",
      opacity: disabled ? 0.6 : 1,
      pointerEvents: disabled ? "none" : "auto",
    }}
  >
    {options.map(({ id, label }) => {
      const active = value === id;
      return (
        <ButtonBase
          key={id}
          onClick={() => onChange(id)}
          sx={{
            px: 1.5,
            py: 0.6,
            borderRadius: "7px",
            fontSize: "0.85rem",
            fontWeight: 500,
            color: active ? "primary.contrastText" : "text.secondary",
            bgcolor: active ? "primary.main" : "transparent",
            transition: "color .15s ease, background-color .15s ease",
          }}
        >
          {label}
        </ButtonBase>
      );
    })}
  </Stack>
);

// ── Форма исключения (правый сайдбар) ─────────────────────────────────────────

const ExceptionDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  /** Активный филиал — новое исключение создаётся в нём, а не «общим». */
  branchId?: number;
  /**
   * Сохранение прошло. Для отсутствия (выходной/отпуск) приходит и период, за
   * который его поставили — страница поднимает по нему разбор уже записанных
   * приёмов (см. AbsenceConflictsDrawer).
   */
  onSaved: (absence?: AbsenceSpan) => void;
  initialDate?: Dayjs | null;
  /** Тип, с которым открывается форма. «Добавить смену» → "extra". */
  initialKind?: ScheduleExceptionKind;
  /** Заголовок панели — зависит от точки входа. */
  title?: string;
}> = ({
  open,
  onClose,
  organizationId,
  branchId,
  onSaved,
  initialDate,
  initialKind = "day_off",
  title = "Исключение из расписания",
}) => {
  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(null);
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [kind, setKind] = React.useState<ScheduleExceptionKind>("day_off");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("13:00");
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // См. RuleForm: пересечение смен подтверждается тем же диалогом.
  // Выходной и отпуск бэк не проверяет — они ничего не занимают.
  const [overlap, setOverlap] = React.useState<ShiftOverlapConflict | null>(null);
  // Повтор: разовая смена уходит в исключения, «по дням недели» — в недельный
  // шаблон (/scheduling/rules/), чтобы не заводить смены по одной.
  const [repeat, setRepeat] = React.useState<"once" | "weekly">("once");
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [dateTo, setDateTo] = React.useState<Dayjs>(dayjs().add(1, "year"));
  // Выходной и отпуск ставятся либо на день, либо на период: отпуск на две
  // недели — это 14 исключений, и раньше их заводили по одному. Период уходит
  // отдельной ручкой (POST exceptions/period/), которая создаёт всю пачку
  // атомарно и возвращает groupId для снятия одним запросом.
  const [span, setSpan] = React.useState<"single" | "period">("single");
  const [absenceDateTo, setAbsenceDateTo] = React.useState<Dayjs>(dayjs());
  // Отсутствие не на весь день: «уйдёт с 14 до 16». Интервал уходит теми же
  // полями startTime/endTime, что и у смены (см. PARTIAL_ABSENCE_ENABLED).
  const [absenceHours, setAbsenceHours] = React.useState(false);
  const [hasLunch, setHasLunch] = React.useState(true);
  const [lunchStart, setLunchStart] = React.useState("13:00");
  const [lunchEnd, setLunchEnd] = React.useState("14:00");
  // Постоянный график уходит правилом — у него есть признак онлайн-записи
  // (см. SCHEDULE_RULE_ONLINE_BOOKING_ENABLED). У разовой смены его нет.
  const [onlineBooking, setOnlineBooking] = React.useState(true);

  const isRule = kind === "extra" && repeat === "weekly";
  const isAbsence = kind === "day_off" || kind === "vacation";
  const isAbsencePeriod = isAbsence && span === "period";
  /** Отсутствие интервалом, а не целым днём. */
  const isPartialAbsence = PARTIAL_ABSENCE_ENABLED && isAbsence && absenceHours;
  // Потолок периода на бэке — 366 дней; проверяем до запроса, чтобы вместо
  // 400-го показать понятную подсказку под полем.
  const absenceDays = isAbsencePeriod ? absenceDateTo.diff(date, "day") + 1 : 1;

  React.useEffect(() => {
    if (open) {
      const start = initialDate ?? dayjs();
      setEmployee(null);
      setDate(start);
      setKind(initialKind);
      setStartTime("09:00");
      setEndTime("13:00");
      setComment("");
      setError(null);
      setBusy(false);
      setOverlap(null);
      setRepeat("once");
      // Предзаполняем днём недели выбранной даты: пользователь пришёл из
      // конкретного дня календаря, «повторять как сегодня» — ожидаемый сценарий.
      setWeekdays([toRuleWeekday(start)]);
      setDateTo(start.add(1, "year"));
      setSpan("single");
      setAbsenceDateTo(start);
      setAbsenceHours(false);
      setHasLunch(true);
      setLunchStart("13:00");
      setLunchEnd("14:00");
      setOnlineBooking(true);
    }
  }, [open, initialDate, initialKind]);

  // При переключении на график время по умолчанию — полный рабочий день,
  // а не половина (у разовой доп. смены дефолт 09:00–13:00).
  const handleRepeatChange = (next: "once" | "weekly") => {
    setRepeat(next);
    if (next === "weekly" && startTime === "09:00" && endTime === "13:00") setEndTime("17:00");
  };

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );

  // Порядок ключей = порядок полей: в первое проблемное уйдёт фокус.
  const form = useFormValidation({
    employee: employee ? null : "Выберите сотрудника",
    date: isRule || date.isValid() ? null : "Укажите дату",
    weekdays: !isRule || weekdays.length > 0 ? null : "Выберите хотя бы один день недели",
    period: !isRule
      ? null
      : !date.isValid() || !dateTo.isValid()
        ? "Укажите период действия"
        : date.isAfter(dateTo)
          ? "Начало периода позже его конца"
          : null,
    absencePeriod: !isAbsencePeriod
      ? null
      : !date.isValid() || !absenceDateTo.isValid()
        ? "Укажите период отсутствия"
        : date.isAfter(absenceDateTo)
          ? "Начало периода позже его конца"
          : absenceDays > 366
            ? "Период длиннее года — разбейте на части"
            : null,
    hours:
      (kind !== "extra" && !isRule && !isPartialAbsence) || startTime < endTime
        ? null
        : isPartialAbsence
          ? "Начало отсутствия должно быть раньше его конца"
          : "Начало смены должно быть раньше конца",
    lunch:
      !isRule || !hasLunch || lunchStart < lunchEnd
        ? null
        : "Начало обеда должно быть раньше его конца",
  });

  const handleSubmit = async (allowOverlap = false) => {
    if (!form.validate()) return;
    setError(null);
    setBusy(true);
    try {
      if (isRule) {
        await createScheduleRule({
          employeeId: employee!.id,
          ...(allowOverlap ? { allowOverlap: true } : {}),
          dateFrom: date.format("YYYY-MM-DD"),
          dateTo: dateTo.format("YYYY-MM-DD"),
          weekdays,
          startTime,
          endTime,
          lunchStart: hasLunch ? lunchStart : undefined,
          lunchEnd: hasLunch ? lunchEnd : undefined,
          comment: comment.trim(),
          organizationId,
          branchId,
          ...(SCHEDULE_RULE_ONLINE_BOOKING_ENABLED
            ? { onlineBookingEnabled: onlineBooking }
            : {}),
        });
      } else if (isAbsencePeriod) {
        await createScheduleExceptionPeriod({
          employeeId: employee!.id,
          dateFrom: date.format("YYYY-MM-DD"),
          dateTo: absenceDateTo.format("YYYY-MM-DD"),
          kind,
          // Тот же интервал применяется к каждому дню периода.
          ...(isPartialAbsence ? { startTime, endTime } : {}),
          comment: comment.trim(),
          organizationId,
          branchId,
        });
      } else {
        await createScheduleException({
          employeeId: employee!.id,
          ...(allowOverlap ? { allowOverlap: true } : {}),
          date: date.format("YYYY-MM-DD"),
          kind,
          startTime: kind === "extra" || isPartialAbsence ? startTime : undefined,
          endTime: kind === "extra" || isPartialAbsence ? endTime : undefined,
          comment: comment.trim(),
          organizationId,
          branchId,
        });
      }
      setOverlap(null);
      // Отсутствие поставлено — но записанные пациенты об этом ещё не знают:
      // отдаём период наверх, чтобы страница подняла разбор их приёмов.
      onSaved(
        isAbsence && employee
          ? {
              employeeId: employee.id,
              employeeName: employee.fullName,
              dateFrom: date.format("YYYY-MM-DD"),
              dateTo: (isAbsencePeriod ? absenceDateTo : date).format("YYYY-MM-DD"),
              kind,
              // Разбирать нужно только приёмы внутри интервала отсутствия
              // и только в филиале, где оно поставлено.
              ...(isPartialAbsence ? { startTime, endTime } : {}),
              branchId: branchId ?? null,
            }
          : undefined,
      );
      onClose();
    } catch (e) {
      const conflict = parseShiftOverlapConflict(e);
      if (conflict && !allowOverlap) {
        setOverlap(conflict);
        return;
      }
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  const HeaderIcon = isRule
    ? CalendarMonthOutlined
    : initialKind === "extra"
      ? AddOutlined
      : EventBusyOutlined;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 440 },
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <HeaderIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            {isRule ? "Постоянный график" : title}
          </Typography>
        </Stack>
        <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2.5, flex: 1, overflowY: "auto" }}>
        <Stack spacing={2.5}>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Сотрудник *
            </Typography>
            <Box ref={form.anchor("employee")}>
              <EmployeePicker value={employee} onChange={setEmployee} disabled={busy} />
            </Box>
            {form.errorOf("employee") && (
              <Typography variant="caption" color="error">{form.errorOf("employee")}</Typography>
            )}
          </Stack>
          <Stack spacing={0.5}>
            <FieldLabel>Тип *</FieldLabel>
            <TextField
              select
              size="small"
              value={kind}
              onChange={(e) => {
                const next = e.target.value as ScheduleExceptionKind;
                setKind(next);
                // Повтор осмыслен только для рабочей смены (недельный шаблон).
                if (next !== "extra") setRepeat("once");
              }}
              disabled={busy}
            >
              <MenuItem value="day_off">Выходной</MenuItem>
              <MenuItem value="vacation">Отпуск</MenuItem>
              <MenuItem value="extra">Смена</MenuItem>
            </TextField>
          </Stack>

          {isAbsence && (
            <Stack spacing={0.75}>
              <FieldLabel>Насколько</FieldLabel>
              <SegmentToggle
                value={span}
                onChange={(next: "single" | "period") => {
                  setSpan(next);
                  if (next === "period" && !absenceDateTo.isAfter(date)) {
                    setAbsenceDateTo(date);
                  }
                }}
                disabled={busy}
                options={[
                  { id: "single", label: "Один день" },
                  { id: "period", label: "Период" },
                ]}
              />
              <Typography variant="caption" color="text.disabled">
                {isAbsencePeriod
                  ? `Отсутствие на все дни периода — ${absenceDays} ${pluralDays(absenceDays)}. Снимается одной кнопкой целиком.`
                  : "Отсутствие на выбранную дату."}
              </Typography>
            </Stack>
          )}

          {kind === "extra" && (
            <Stack spacing={0.75}>
              <FieldLabel>Повтор</FieldLabel>
              <SegmentToggle
                value={repeat}
                onChange={handleRepeatChange}
                disabled={busy}
                options={[
                  { id: "once", label: "Разово" },
                  { id: "weekly", label: "По дням недели" },
                ]}
              />
              <Typography variant="caption" color="text.disabled">
                {isRule
                  ? "Постоянный график: смены появятся во все выбранные дни недели за период."
                  : "Одна смена на выбранную дату."}
              </Typography>
            </Stack>
          )}

          {isRule ? (
            <>
              <Stack spacing={0.5}>
                <FieldLabel>Дни недели *</FieldLabel>
                <Box ref={form.anchor("weekdays")}>
                  <WeekdayChips value={weekdays} onToggle={toggleWeekday} />
                </Box>
                {form.errorOf("weekdays") && (
                  <Typography variant="caption" color="error">
                    {form.errorOf("weekdays")}
                  </Typography>
                )}
              </Stack>
              <Stack spacing={0.5}>
                <FieldLabel>Период действия</FieldLabel>
                <Stack ref={form.anchor("period")} direction="row" spacing={1}>
                  <CustomDatePicker shortYearMode="nearest"
                    value={date}
                    onChange={(v) => v && setDate(v)}
                    slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
                  />
                  <CustomDatePicker shortYearMode="nearest"
                    value={dateTo}
                    onChange={(v) => v && setDateTo(v)}
                    slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
                  />
                </Stack>
                {form.errorOf("period") && (
                  <Typography variant="caption" color="error">
                    {form.errorOf("period")}
                  </Typography>
                )}
              </Stack>
            </>
          ) : isAbsencePeriod ? (
            <Stack spacing={0.5}>
              <FieldLabel>Период отсутствия *</FieldLabel>
              <Stack ref={form.anchor("absencePeriod")} direction="row" spacing={1}>
                <CustomDatePicker shortYearMode="nearest"
                  value={date}
                  onChange={(v) => v && setDate(v)}
                  slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
                />
                <CustomDatePicker shortYearMode="nearest"
                  value={absenceDateTo}
                  onChange={(v) => v && setAbsenceDateTo(v)}
                  slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
                />
              </Stack>
              {form.errorOf("absencePeriod") && (
                <Typography variant="caption" color="error">
                  {form.errorOf("absencePeriod")}
                </Typography>
              )}
            </Stack>
          ) : (
            <Stack spacing={0.5}>
              <FieldLabel>Дата *</FieldLabel>
              <CustomDatePicker shortYearMode="nearest"
                value={date}
                onChange={(v) => v && setDate(v)}
                slotProps={{
                  textField: {
                    size: "small",
                    fullWidth: true,
                    error: Boolean(form.errorOf("date")),
                    helperText: form.errorOf("date") ?? undefined,
                    ref: form.anchor("date"),
                  },
                }}
              />
            </Stack>
          )}

          {PARTIAL_ABSENCE_ENABLED && isAbsence && (
            <Stack spacing={0.75}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <FieldLabel>Часы отсутствия</FieldLabel>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setAbsenceHours((v) => !v)}
                  sx={{ textTransform: "none", fontSize: "0.75rem" }}
                  disabled={busy}
                >
                  {absenceHours ? "Весь день" : "Указать часы"}
                </Button>
              </Stack>
              {absenceHours ? (
                <>
                  <Stack ref={form.anchor("hours")} direction="row" spacing={1} alignItems="center">
                    <TextField
                      type="time"
                      size="small"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      sx={{ flex: 1 }}
                      disabled={busy}
                      error={Boolean(form.errorOf("hours"))}
                    />
                    <Typography color="text.secondary">—</Typography>
                    <TextField
                      type="time"
                      size="small"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      sx={{ flex: 1 }}
                      disabled={busy}
                      error={Boolean(form.errorOf("hours"))}
                    />
                  </Stack>
                  {form.errorOf("hours") && (
                    <Typography variant="caption" color="error">
                      {form.errorOf("hours")}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled">
                    {isAbsencePeriod
                      ? "Интервал закрывается в каждый день периода, остальное время сотрудник работает."
                      : "Закрыт только этот интервал, остальное время дня остаётся рабочим."}
                  </Typography>
                </>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  {isAbsencePeriod ? "Каждый день периода закрыт целиком." : "День закрыт целиком."}
                </Typography>
              )}
            </Stack>
          )}

          {kind === "extra" && (
            <Stack spacing={0.5}>
              <FieldLabel>{isRule ? "Рабочие часы *" : "Время смены *"}</FieldLabel>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  type="time"
                  size="small"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  sx={{ flex: 1 }}
                  disabled={busy}
                  error={Boolean(form.errorOf("hours"))}
                  helperText={form.errorOf("hours")}
                  ref={form.anchor("hours")}
                />
                <Typography color="text.secondary">—</Typography>
                <TextField
                  type="time"
                  size="small"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  sx={{ flex: 1 }}
                  disabled={busy}
                />
              </Stack>
            </Stack>
          )}

          {isRule && (
            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <FieldLabel>Обед</FieldLabel>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setHasLunch((v) => !v)}
                  sx={{ textTransform: "none", fontSize: "0.75rem" }}
                  disabled={busy}
                >
                  {hasLunch ? "Убрать обед" : "Добавить обед"}
                </Button>
              </Stack>
              {hasLunch && (
                <>
                  <Stack ref={form.anchor("lunch")} direction="row" spacing={1} alignItems="center">
                    <TextField
                      type="time"
                      size="small"
                      value={lunchStart}
                      onChange={(e) => setLunchStart(e.target.value)}
                      sx={{ flex: 1 }}
                      disabled={busy}
                    />
                    <Typography color="text.secondary">—</Typography>
                    <TextField
                      type="time"
                      size="small"
                      value={lunchEnd}
                      onChange={(e) => setLunchEnd(e.target.value)}
                      sx={{ flex: 1 }}
                      disabled={busy}
                    />
                  </Stack>
                  {form.errorOf("lunch") && (
                    <Typography variant="caption" color="error">
                      {form.errorOf("lunch")}
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          )}

          {isRule && SCHEDULE_RULE_ONLINE_BOOKING_ENABLED && (
            <Paper
              elevation={0}
              variant="outlined"
              sx={{
                p: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Stack spacing={0.25}>
                <Typography variant="body2">Онлайн-запись</Typography>
                <Typography variant="caption" color="text.secondary">
                  Показывать окна этого графика на сайте записи.
                </Typography>
              </Stack>
              <Switch
                checked={onlineBooking}
                onChange={(e) => setOnlineBooking(e.target.checked)}
                disabled={busy}
              />
            </Paper>
          )}

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Комментарий
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Необязательно"
              disabled={busy}
              inputProps={{ maxLength: 255 }}
            />
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
        {/* Ошибка сохранения — в футере, рядом с кнопкой: внизу прокручиваемой
            формы её не видно, и отказ бэка выглядит как «кнопка не работает». */}
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => void handleSubmit()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          {busy
            ? "Сохранение…"
            : isRule
              ? "Добавить график"
              : isAbsencePeriod
                ? `Отметить отсутствие (${absenceDays} ${pluralDays(absenceDays)})`
                : "Добавить"}
        </Button>
      </Box>

      <ShiftOverlapDialog
        conflict={overlap}
        saving={busy}
        onCancel={() => setOverlap(null)}
        onConfirm={() => void handleSubmit(true)}
      />
    </Drawer>
  );
};

// ── Вкладки страницы ────────────────────────────────────────────────────────

type ScheduleTab = "calendar" | "settings";

const SCHEDULE_TABS: { id: ScheduleTab; label: string; icon: React.ElementType }[] = [
  { id: "calendar", label: "Календарь", icon: CalendarMonthOutlined },
  { id: "settings", label: "Настройка", icon: TuneOutlined },
];

/** Форма в правой панели «Настройки». */
type PanelForm =
  | { type: "rule"; mode: RuleFormMode; rule: ScheduleRule | null; employee: EmployeeRef | null }
  | { type: "absence"; employee: EmployeeRef | null };

// ── Страница ──────────────────────────────────────────────────────────────────

const DjangoSchedulePage: React.FC = () => {
  usePageTitle("Расписание");
  const theme = useTheme();
  const canManage = useCan("schedule.manage");
  const { isSuperAdmin, activeOrganization, activeBranch, activeEmployee } = usePermissions();
  const orgId = isSuperAdmin() ? activeOrganization?.id ?? undefined : undefined;
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();

  const [tab, setTab] = React.useState<ScheduleTab>("calendar");
  const [month, setMonth] = React.useState<Dayjs>(dayjs());

  // Телефон: действия уходят в плавающую кнопку, табы — на всю ширину.
  // Брейкпоинт md: sm в теме = 360px, и телефон попадает в sm.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [fabMenuAnchor, setFabMenuAnchor] = React.useState<HTMLElement | null>(null);

  // «Настройка»: неделя матрицы (всегда с понедельника) и правая панель —
  // сотрудник и/или открытая в ней форма. «Назад» из формы возвращает к
  // сотруднику, «закрыть» сбрасывает оба.
  const [weekStart, setWeekStart] = React.useState<Dayjs>(() => mondayOf(dayjs()));
  const [panel, setPanel] = React.useState<{ employeeId: number | null; form: PanelForm | null } | null>(null);
  // Ключ формы: каждое открытие монтирует её заново с чистыми полями.
  const formSeq = React.useRef(0);
  // Удаление — только через подтверждение: правило одним промахом мимо
  // карандаша стирало график врача на месяцы вперёд вместе с окнами записи.
  const [ruleToDelete, setRuleToDelete] = React.useState<ScheduleRule | null>(null);
  const [exceptionToDelete, setExceptionToDelete] = React.useState<ScheduleException | null>(null);
  // Одна и та же форма исключения работает в разных режимах (см. openExceptionDialog):
  // «Добавить смену» → kind "extra", «Исключение» → kind "day_off".
  const [exceptionDialog, setExceptionDialog] = React.useState<{
    open: boolean;
    kind: ScheduleExceptionKind;
    title: string;
    date: Dayjs | null;
  }>({ open: false, kind: "day_off", title: "Исключение из расписания", date: null });
  const [selectedDay, setSelectedDay] = React.useState<Dayjs | null>(null);
  const [dayDrawerOpen, setDayDrawerOpen] = React.useState(false);
  const [pointEdit, setPointEdit] = React.useState<{
    occurrence: DayOccurrence;
    existing: ScheduleException | null;
    startTime: string;
    endTime: string;
    comment: string;
  } | null>(null);
  // Пересечение смен при точечной правке: подтверждение показываем поверх дня,
  // потому что диалог правки к этому моменту уже закрыт.
  const [pointOverlap, setPointOverlap] = React.useState<{
    conflict: ShiftOverlapConflict;
    values: SchedulePointEditValues;
  } | null>(null);
  const [pointOverlapSaving, setPointOverlapSaving] = React.useState(false);

  // Правила/исключения скоупятся по активному филиалу на сервере (branchId =
  // этот филиал ИЛИ общие, branchId=null) — тикет
  // MamaDoc/backend_ticket_scheduling_branch_scoping.md, подтверждено на живом
  // API 20.07.2026. Суперадмин без активного филиала не фильтрует.
  const branchId = activeBranch?.id ?? undefined;

  // Сотрудника на вкладке «Настройка» ищут локально по карточкам — правила и
  // исключения грузим целиком по филиалу.
  const rulesParams = { employeeId: null, branchId: branchId ?? null, orgId: orgId ?? null };
  const rulesQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.rules(rulesParams),
    queryFn: ({ signal }) =>
      getScheduleRules({ branchId, organizationId: orgId }, signal),
  });

  const exceptionsParams = {
    employeeId: null,
    from: dayjs().format("YYYY-MM-DD"),
    branchId: branchId ?? null,
    orgId: orgId ?? null,
  };
  const exceptionsQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.exceptions(exceptionsParams),
    queryFn: ({ signal }) =>
      getScheduleExceptions(
        {
          dateFrom: dayjs().format("YYYY-MM-DD"),
          branchId,
          organizationId: orgId,
        },
        signal,
      ),
  });

  // Исключения за видимый диапазон месячной сетки (шире месяца — грид
  // из 6 недель захватывает хвосты соседних месяцев). Отдельный запрос
  // от exceptionsQuery выше (тот — только "с сегодняшнего дня" для вкладки
  // «Настройка»).
  const monthRange = {
    dateFrom: month.startOf("month").subtract(7, "day").format("YYYY-MM-DD"),
    dateTo: month.endOf("month").add(13, "day").format("YYYY-MM-DD"),
  };
  const monthExceptionsQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.exceptions({
      ...monthRange,
      branchId: branchId ?? null,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getScheduleExceptions({ ...monthRange, branchId, organizationId: orgId }, signal),
    enabled: tab === "calendar",
  });

  // Исключения недели матрицы «Настройки»: неделю можно листать и назад, а
  // exceptionsQuery грузит только с сегодняшнего дня.
  const weekRange = {
    dateFrom: weekStart.format("YYYY-MM-DD"),
    dateTo: weekStart.add(6, "day").format("YYYY-MM-DD"),
  };
  const weekExceptionsQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.exceptions({
      ...weekRange,
      branchId: branchId ?? null,
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getScheduleExceptions({ ...weekRange, branchId, organizationId: orgId }, signal),
    enabled: tab === "settings",
  });

  const employeesQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, branchId ?? null, orgId ?? null],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ pageSize: 200, branchId, organizationId: orgId }, signal),
    // Нужен и «Настройке»: врачи филиала без графика показываются карточкой
    // «Действующего графика нет».
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  // Правила, исключения и свободные окна — но не conflicts: отметка выходного
  // приёмы не меняет, а их перезапрос по всем сотрудникам стоил секунды на
  // каждый клик (см. scheduleInvalidation.ts).
  const invalidate = () => {
    void queryClient.invalidateQueries({
      predicate: (query) => isScheduleQueryExceptConflicts(query.queryKey),
    });
  };

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => deleteScheduleRule(id),
    onSuccess: () => {
      invalidate();
      setRuleToDelete(null);
      // Удаляли из формы «Изменить график» — возвращаемся к сотруднику.
      setPanel((p) => (p?.form?.type === "rule" ? (p.employeeId != null ? { ...p, form: null } : null) : p));
      notify?.({ type: "success", message: "Правило удалено" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Ошибка", description: parseBackendError(e) }),
  });
  const deleteExceptionMutation = useMutation({
    mutationFn: (id: number) => deleteScheduleException(id),
    onSuccess: () => {
      invalidate();
      setExceptionToDelete(null);
      notify?.({ type: "success", message: "Исключение удалено" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Ошибка", description: parseBackendError(e) }),
  });

  // Отпуск, поставленный периодом, снимается целиком: пачка живёт как N
  // однодневных исключений с общим groupId, и удалять их по одному —
  // ровно та работа, от которой период и избавляет.
  const deletePeriodMutation = useMutation({
    mutationFn: (groupId: string) => deleteScheduleExceptionPeriod(groupId),
    onSuccess: () => {
      invalidate();
      notify?.({ type: "success", message: "Период отсутствия снят" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: "Ошибка", description: parseBackendError(e) }),
  });
  const [periodToDelete, setPeriodToDelete] = React.useState<ScheduleException | null>(null);
  // Отсутствие поставлено — но записанные пациенты об этом не знают: сразу
  // поднимаем разбор их приёмов (отменить / передать коллеге / перенести /
  // оставить как есть, отметив разобранными).
  const [absenceReview, setAbsenceReview] = React.useState<AbsenceSpan | null>(null);

  const employees = React.useMemo(() => employeesQuery.data?.results ?? [], [employeesQuery.data]);

  const rules = React.useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const exceptions = React.useMemo(() => exceptionsQuery.data ?? [], [exceptionsQuery.data]);
  const monthExceptions = React.useMemo(
    () => monthExceptionsQuery.data ?? [],
    [monthExceptionsQuery.data],
  );
  const employeesById = React.useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  // Сколько дней в каждой пачке периода — считаем по загруженному списку, чтобы
  // строка честно говорила «часть периода», а не выглядела одиночным днём.
  const periodSizes = React.useMemo(() => {
    const sizes = new Map<string, number>();
    for (const exc of exceptions) {
      if (!exc.groupId) continue;
      sizes.set(exc.groupId, (sizes.get(exc.groupId) ?? 0) + 1);
    }
    return sizes;
  }, [exceptions]);
  // Дни каждой пачки — чтобы «Разобрать записи» на любой её строке считало
  // приёмы за весь период, а не только за эту дату.
  const periodDates = React.useMemo(() => {
    const dates = new Map<string, string[]>();
    for (const exc of exceptions) {
      if (!exc.groupId) continue;
      const list = dates.get(exc.groupId) ?? [];
      list.push(exc.date);
      dates.set(exc.groupId, list);
    }
    return dates;
  }, [exceptions]);
  // Записанные пациенты в дни отсутствия: и для кнопки разбора в таблице, и для
  // маркера на календаре. Без права на приёмы не запрашиваем.
  const canViewAppointments = useCan("appointments.view");
  const absenceConflicts = useAbsenceConflicts(
    React.useMemo(() => [...exceptions, ...monthExceptions], [exceptions, monthExceptions]),
    orgId,
    canViewAppointments,
  );

  /** Открыть разбор по строке исключения — днём или всей пачкой периода. */
  const openAbsenceReview = (exc: ScheduleException) => {
    const dates = exc.groupId ? periodDates.get(exc.groupId) ?? [exc.date] : [exc.date];
    const sorted = [...dates].sort();
    setAbsenceReview({
      employeeId: exc.employeeId,
      employeeName: exc.employeeName,
      dateFrom: sorted[0],
      dateTo: sorted[sorted.length - 1],
      kind: exc.kind,
      // У пачки периода интервал и филиал одинаковы во все дни — берём со строки.
      startTime: exc.startTime,
      endTime: exc.endTime,
      branchId: exc.branchId,
    });
  };
  // Карточки вкладки «Настройка»: правила и исключения по сотрудникам, плюс
  // врачи/медсёстры филиала без единого правила — их иначе просто не видно.
  const today = dayjs().format("YYYY-MM-DD");
  const employeeSchedules = React.useMemo(
    () =>
      buildEmployeeSchedules(
        rules,
        exceptions,
        today,
        employees.filter(
          (e) => e.status === "active" && (e.clinicalRole === "doctor" || e.clinicalRole === "nurse"),
        ),
      ),
    [rules, exceptions, today, employees],
  );
  const absenceCountFor = React.useCallback(
    (item: { days: ScheduleException[] }) =>
      item.days.length === 0
        ? 0
        : absenceConflicts.countForDays(
            item.days[0].employeeId,
            item.days.map((d) => d.date),
          ),
    [absenceConflicts],
  );

  // Матрица: ячейки недели, одна проблема на сотрудника, его основной филиал.
  const weekExceptions = React.useMemo(() => weekExceptionsQuery.data ?? [], [weekExceptionsQuery.data]);
  const weekCells = React.useMemo(
    () => buildWeekCells(weekStart, rules, weekExceptions),
    [weekStart, rules, weekExceptions],
  );
  const issues = React.useMemo(
    () => new Map(employeeSchedules.map((s) => [s.employeeId, employeeIssue(s, absenceCountFor)])),
    [employeeSchedules, absenceCountFor],
  );
  const issueOf = React.useCallback((id: number) => issues.get(id) ?? null, [issues]);
  const employeeBranch = React.useMemo(
    () => new Map(employees.flatMap((e) => (e.branch ? [[e.id, e.branch.name] as const] : []))),
    [employees],
  );
  const panelSchedule =
    panel?.employeeId != null ? employeeSchedules.find((s) => s.employeeId === panel.employeeId) ?? null : null;

  // ── Панель сотрудника и формы в ней ──
  const openEmployee = (employeeId: number) => setPanel({ employeeId, form: null });
  const closePanel = () => setPanel(null);
  const openPanelForm = (form: PanelForm, employeeId: number | null = panel?.employeeId ?? null) => {
    formSeq.current += 1;
    setPanel({ employeeId, form });
  };
  const openRuleForm = (mode: RuleFormMode, rule: ScheduleRule | null, employee: EmployeeRef | null) =>
    openPanelForm({ type: "rule", mode, rule, employee }, employee?.id ?? null);
  const openAbsenceForm = (employee: EmployeeRef | null) =>
    openPanelForm({ type: "absence", employee }, employee?.id ?? null);
  const refOf = (s: EmployeeSchedule): EmployeeRef => ({ id: s.employeeId, fullName: s.employeeName });
  /** Правила сотрудника с тем же концом — «Продлить вместе с ним». */
  const siblingsOf = (rule: ScheduleRule) =>
    rules.filter((r) => r.employeeId === rule.employeeId && r.id !== rule.id && r.dateTo === rule.dateTo);

  const handleIssueAction = (employeeId: number, issue: EmployeeIssue) => {
    const s = employeeSchedules.find((x) => x.employeeId === employeeId);
    if (!s) return;
    if (issue.action.kind === "review") openAbsenceReview(issue.action.exception);
    else if (issue.action.kind === "extend") openRuleForm("extend", issue.action.rule, refOf(s));
    else openRuleForm("create", null, refOf(s));
  };

  const handlePanelSaved = (employeeId: number, message: string, absence?: AbsenceSpan) => {
    invalidate();
    notify?.({ type: "success", message });
    // После сохранения — к панели сотрудника; отсутствие сразу поднимает разбор записей.
    setPanel({ employeeId, form: null });
    if (absence) setAbsenceReview(absence);
  };

  // Пул цветов — сотрудники со сменами в отображаемом периоде (месяц + 2
  // недели, как monthRange). Раньше нумерация шла по всему справочнику, и
  // соседние строки календаря часто делили один оттенок. Карта одна на
  // календарь и дровер дня — цвета согласованы.
  const scheduledIds = React.useMemo(() => {
    const ids = new Set<number>();
    const start = month.startOf("month");
    const days = month.daysInMonth() + 13;
    for (let d = 0; d < days; d += 1) {
      for (const occ of computeDayOccurrences(start.add(d, "day"), rules, monthExceptions)) {
        ids.add(occ.employeeId);
      }
    }
    return ids;
  }, [month, rules, monthExceptions]);
  const employeeColorMap = useEmployeeColorMap(employees, scheduledIds);

  const selectedDayOccurrences = React.useMemo<DayOccurrence[]>(
    () => (selectedDay ? computeDayOccurrences(selectedDay, rules, monthExceptions) : []),
    [selectedDay, rules, monthExceptions],
  );

  // Отпуска и выходные того же дня: смен они не порождают, поэтому в дровер
  // идут отдельным списком — иначе отсутствующего там просто нет.
  const selectedDayAbsences = React.useMemo<AbsenceMark[]>(
    () =>
      selectedDay
        ? absencesOfDay(monthExceptions, selectedDay.format("YYYY-MM-DD"))
        : [],
    [selectedDay, monthExceptions],
  );

  const openExceptionDialog = (opts: {
    kind?: ScheduleExceptionKind;
    title?: string;
    date?: Dayjs | null;
  }) =>
    setExceptionDialog({
      open: true,
      kind: opts.kind ?? "day_off",
      title: opts.title ?? "Исключение из расписания",
      date: opts.date ?? null,
    });

  const closeExceptionDialog = () => setExceptionDialog((s) => ({ ...s, open: false }));

  const handleDayClick = (day: Dayjs) => {
    setSelectedDay(day);
    setDayDrawerOpen(true);
  };

  const handleMarkDayOff = async (employeeId: number) => {
    if (!selectedDay) return;
    const date = selectedDay.format("YYYY-MM-DD");
    try {
      await createScheduleException({
        employeeId,
        date,
        kind: "day_off",
        organizationId: orgId,
        branchId,
      });
      invalidate();
      notify?.({ type: "success", message: "Выходной отмечен" });
      setAbsenceReview({
        employeeId,
        employeeName: employeesById.get(employeeId)?.fullName ?? "Сотрудник",
        dateFrom: date,
        dateTo: date,
        kind: "day_off",
        branchId: branchId ?? null,
      });
    } catch (e) {
      notify?.({ type: "error", message: "Ошибка", description: parseBackendError(e) });
      throw e;
    }
  };

  const handleDeleteShift = async (exceptionId: number) => {
    try {
      await deleteScheduleException(exceptionId);
      invalidate();
      notify?.({ type: "success", message: "Смена удалена" });
    } catch (e) {
      notify?.({ type: "error", message: "Ошибка", description: parseBackendError(e) });
      throw e;
    }
  };

  const handleAddShiftForSelectedDay = () => {
    openExceptionDialog({ kind: "extra", title: "Добавить смену", date: selectedDay });
  };

  const handleEditOccurrence = (occurrence: DayOccurrence) => {
    const existing = occurrence.kind === "rule"
      ? null
      : monthExceptions.find((exception) => exception.id === occurrence.sourceId) ?? null;
    const rule = occurrence.kind === "rule"
      ? rules.find((item) => item.id === occurrence.sourceId)
      : null;
    setPointEdit({
      occurrence,
      existing,
      // For a rule split by lunch, edit the whole original shift. The
      // override replaces the rule for the date, not just one lunch segment.
      startTime: rule?.startTime ?? existing?.startTime ?? occurrence.startTime,
      endTime: rule?.endTime ?? existing?.endTime ?? occurrence.endTime,
      comment: rule?.comment ?? existing?.comment ?? "",
    });
  };

  // Клик по полосе смены в дневном виде: сразу карточка «Изменить смену».
  // Диалог и сохранение берут дату из selectedDay, поэтому его выставляем
  // первым — дровер дня при этом не открываем. Без права управления
  // показываем панель дня, как при клике на имя сотрудника.
  const handleOccurrenceClick = (day: Dayjs, occurrence: DayOccurrence) => {
    if (!canManage) {
      handleDayClick(day);
      return;
    }
    setSelectedDay(day);
    handleEditOccurrence(occurrence);
  };

  const handleSavePointEdit = async (
    values: SchedulePointEditValues,
    allowOverlap = false,
  ) => {
    if (!selectedDay || !pointEdit) return;
    const date = selectedDay.format("YYYY-MM-DD");
    try {
      if (pointEdit.existing) {
        await updateScheduleException(pointEdit.existing.id, {
          ...(allowOverlap ? { allowOverlap: true } : {}),
          date,
          kind: pointEdit.existing.kind,
          startTime: values.startTime,
          endTime: values.endTime,
          comment: values.comment,
          ...(pointEdit.existing.branchId != null ? { branchId: pointEdit.existing.branchId } : {}),
        });
      } else {
        await createScheduleException({
          employeeId: pointEdit.occurrence.employeeId,
          ...(allowOverlap ? { allowOverlap: true } : {}),
          date,
          kind: "override",
          startTime: values.startTime,
          endTime: values.endTime,
          comment: values.comment,
          organizationId: orgId,
          branchId,
        });
      }
      setPointOverlap(null);
      invalidate();
      notify?.({ type: "success", message: "Точечное расписание сохранено" });
    } catch (e) {
      // Пересечение смен в режиме «warn» — не ошибка, а вопрос: показываем
      // список и повторяем сохранение с подтверждением.
      const conflict = parseShiftOverlapConflict(e);
      if (conflict && !allowOverlap) {
        setPointOverlap({ conflict, values });
        // Диалог правки закрывается сам — подтверждение идёт поверх дня.
        return;
      }
      notify?.({ type: "error", message: "Ошибка", description: parseBackendError(e) });
      throw e;
    }
  };

  /** Повтор точечного сохранения после подтверждения пересечения. */
  const confirmPointOverlap = async () => {
    if (!pointOverlap) return;
    setPointOverlapSaving(true);
    try {
      await handleSavePointEdit(pointOverlap.values, true);
    } catch {
      // Текст уже показан уведомлением внутри handleSavePointEdit.
    } finally {
      setPointOverlapSaving(false);
    }
  };

  // Сегмент-табы по гайду §5.7; на телефоне на всю ширину, половинки под палец.
  const tabsNode = (
    <Stack
      direction="row"
      sx={{
        p: 0.5,
        gap: 0.25,
        border: 1,
        borderColor: "divider",
        borderRadius: "10px",
        bgcolor: "background.paper",
        width: isMobile ? "100%" : "fit-content",
      }}
    >
      {SCHEDULE_TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <ButtonBase
            key={id}
            onClick={() => setTab(id)}
            sx={{
              position: "relative",
              flex: isMobile ? 1 : "0 0 auto",
              px: 1.5,
              py: isMobile ? 1 : 0.75,
              borderRadius: "7px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: active ? "primary.contrastText" : "text.secondary",
              transition: "color .15s ease",
            }}
          >
            {active && (
              <Box
                component={motion.span}
                layoutId="schedule-tab-bg"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                sx={{ position: "absolute", inset: 0, borderRadius: "7px", bgcolor: "primary.main" }}
              />
            )}
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ position: "relative" }}>
              <Icon sx={{ fontSize: 17 }} />
              <span>{label}</span>
            </Stack>
          </ButtonBase>
        );
      })}
    </Stack>
  );

  return (
    <Box
      sx={(t) => ({
        height: {
          xs: `calc(100dvh - ${t.appLayout.header.height.mobile}px)`,
          md: `calc(100dvh - ${t.appLayout.header.height.desktop}px)`,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      })}
    >
      {/* Строка-хедер: кнопка действия слева (как на других экранах), переключатель
          справа. На десктопной «Настройке» её нет — табы и «График» живут в
          тулбаре матрицы. */}
      {(tab === "calendar" || isMobile) && (
        <Box sx={{ px: theme.appLayout.page.paddingX, pt: 0, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" useFlexGap>
            {/* На телефоне действия — в плавающей кнопке: в шапке переносились
                на вторую строку. */}
            {canManage && !isMobile && (
              <Button
                size="small"
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() =>
                  openExceptionDialog({ kind: "extra", title: "Добавить смену", date: dayjs() })
                }
              >
                Добавить смену
              </Button>
            )}
            {!isMobile && <Box sx={{ flex: 1 }} />}
            {tabsNode}
          </Stack>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          // Календарь скроллится внутри себя; на вкладке «Настройка» скроллим
          // содержимое (таблицы правил/исключений).
          overflowY: tab === "calendar" ? "hidden" : "auto",
          px: theme.appLayout.page.paddingX,
          pb: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {tab === "calendar" && (
          <>
            {monthExceptionsQuery.isError && (
              <Alert severity="error">{parseBackendError(monthExceptionsQuery.error)}</Alert>
            )}
            <ScheduleCalendar
              employees={employees}
              rules={rules}
              exceptions={monthExceptions}
              month={month}
              onMonthChange={setMonth}
              onDayClick={handleDayClick}
              currentEmployeeId={activeEmployee?.id ?? null}
              employeeColorMap={employeeColorMap}
              absenceDayTotals={absenceConflicts.dayTotals}
              absenceDayEmployees={absenceConflicts.dayEmployees}
              onAbsenceBadgeClick={(employeeId, date) => {
                // Маркер посчитан по отсутствию этого дня — разбор открываем в
                // его же рамках (вид, интервал, филиал), иначе список в дровере
                // разойдётся со счётчиком. Рабочие исключения того же дня
                // (доп. смена рядом с выходным) — не отсутствие.
                const absence = [...exceptions, ...monthExceptions].find(
                  (e) => e.employeeId === employeeId && e.date === date && isAbsenceKind(e.kind),
                );
                setAbsenceReview({
                  employeeId,
                  employeeName: employeesById.get(employeeId)?.fullName ?? "Сотрудник",
                  dateFrom: date,
                  dateTo: date,
                  kind: absence?.kind ?? "day_off",
                  startTime: absence?.startTime ?? null,
                  endTime: absence?.endTime ?? null,
                  branchId: absence?.branchId ?? null,
                });
              }}
              onOccurrenceClick={handleOccurrenceClick}
            />
          </>
        )}

        {tab === "settings" && (
          <>
            {(rulesQuery.isError || exceptionsQuery.isError || weekExceptionsQuery.isError) && (
              <Alert severity="error">
                {parseBackendError(rulesQuery.error ?? exceptionsQuery.error ?? weekExceptionsQuery.error)}
              </Alert>
            )}
            <Box sx={{ pb: { xs: 10, md: 0 } }}>
              <ScheduleSettingsMatrix
                schedules={employeeSchedules}
                issueOf={issueOf}
                cells={weekCells}
                weekStart={weekStart}
                onWeekChange={setWeekStart}
                today={today}
                loading={rulesQuery.isLoading || exceptionsQuery.isLoading}
                isMobile={isMobile}
                canManage={canManage}
                employeeBranch={employeeBranch}
                absenceCount={absenceCountFor}
                trailing={
                  isMobile ? undefined : (
                    <>
                      {tabsNode}
                      {canManage && (
                        <Button
                          variant="contained"
                          startIcon={<AddOutlined />}
                          onClick={() => openRuleForm("create", null, null)}
                        >
                          График
                        </Button>
                      )}
                    </>
                  )
                }
                onOpenEmployee={openEmployee}
                onIssueAction={handleIssueAction}
                onExtend={(rule) =>
                  openRuleForm("extend", rule, { id: rule.employeeId, fullName: rule.employeeName })
                }
                onAddAbsence={() => openAbsenceForm(null)}
              />
            </Box>
          </>
        )}
      </Box>

      {/* Правая панель «Настройки»: сотрудник, а поверх — формы графика и
          отсутствия. На телефоне — на всю ширину. */}
      <Drawer
        anchor="right"
        open={panel !== null && (panel.form !== null || panelSchedule !== null)}
        onClose={closePanel}
        PaperProps={{
          sx: { width: { xs: "100%", sm: 440 }, maxWidth: "100%", display: "flex", flexDirection: "column" },
        }}
      >
        {panel?.form?.type === "rule" && (
          <RuleForm
            key={formSeq.current}
            mode={panel.form.mode}
            rule={panel.form.rule}
            employee={panel.form.employee}
            siblings={
              panel.form.mode === "extend" && panel.form.rule
                ? siblingsOf(panel.form.rule)
                : []
            }
            organizationId={orgId}
            branchId={branchId}
            onBack={panelSchedule ? () => setPanel({ employeeId: panel.employeeId, form: null }) : undefined}
            onClose={closePanel}
            onSaved={(employeeId, message) => handlePanelSaved(employeeId, message)}
            onDelete={setRuleToDelete}
          />
        )}
        {panel?.form?.type === "absence" && (
          <AbsenceForm
            key={formSeq.current}
            employee={panel.form.employee}
            rules={rules}
            exceptions={exceptions}
            organizationId={orgId}
            branchId={branchId}
            onBack={panelSchedule ? () => setPanel({ employeeId: panel.employeeId, form: null }) : undefined}
            onClose={closePanel}
            onSaved={handlePanelSaved}
          />
        )}
        {panel && !panel.form && panelSchedule && (
          <EmployeePanel
            schedule={panelSchedule}
            issue={issueOf(panelSchedule.employeeId)}
            branchLabel={
              employeeBranch.get(panelSchedule.employeeId) ??
              panelSchedule.liveRules.find((r) => r.branchName)?.branchName ??
              null
            }
            canManage={canManage}
            absenceCount={absenceCountFor}
            onIssueAction={(issue) => handleIssueAction(panelSchedule.employeeId, issue)}
            onEditRule={(rule) => openRuleForm("edit", rule, refOf(panelSchedule))}
            onAddRule={() => openRuleForm("create", null, refOf(panelSchedule))}
            onAddAbsence={() => openAbsenceForm(refOf(panelSchedule))}
            onDeleteException={(item) =>
              item.groupId ? setPeriodToDelete(item.days[0]) : setExceptionToDelete(item.days[0])
            }
            onClose={closePanel}
          />
        )}
      </Drawer>

      <ExceptionDrawer
        open={exceptionDialog.open}
        onClose={closeExceptionDialog}
        organizationId={orgId}
        branchId={branchId}
        onSaved={(absence) => {
          invalidate();
          if (absence) setAbsenceReview(absence);
        }}
        initialDate={exceptionDialog.date}
        initialKind={exceptionDialog.kind}
        title={exceptionDialog.title}
      />
      <AbsenceConflictsDrawer
        open={absenceReview !== null}
        onClose={() => setAbsenceReview(null)}
        absence={absenceReview}
        employeeOptions={employees}
      />
      <ScheduleDayDrawer
        open={dayDrawerOpen}
        onClose={() => setDayDrawerOpen(false)}
        day={selectedDay}
        occurrences={selectedDayOccurrences}
        absences={selectedDayAbsences}
        employeesById={employeesById}
        employeeColorMap={employeeColorMap}
        canManage={canManage}
        onMarkDayOff={handleMarkDayOff}
        onDeleteShift={handleDeleteShift}
        onEditOccurrence={handleEditOccurrence}
        onAddShift={handleAddShiftForSelectedDay}
      />
      <ConfirmDialog
        open={periodToDelete !== null}
        onClose={() => setPeriodToDelete(null)}
        onConfirm={() => {
          const groupId = periodToDelete?.groupId;
          if (groupId) deletePeriodMutation.mutate(groupId);
          setPeriodToDelete(null);
        }}
        title="Снять весь период отсутствия"
        message={
          periodToDelete
            ? `${periodToDelete.employeeName}: снять ${
                periodToDelete.groupId ? periodSizes.get(periodToDelete.groupId) ?? 1 : 1
              } ${pluralDays(
                periodToDelete.groupId ? periodSizes.get(periodToDelete.groupId) ?? 1 : 1,
              )} отсутствия целиком? Приёмы, отменённые из-за него, не восстановятся.`
            : ""
        }
        confirmText="Снять период"
        variant="warning"
        loading={deletePeriodMutation.isPending}
      />
      <ConfirmDialog
        open={ruleToDelete !== null}
        onClose={() => (deleteRuleMutation.isPending ? undefined : setRuleToDelete(null))}
        onConfirm={() => ruleToDelete && deleteRuleMutation.mutate(ruleToDelete.id)}
        title="Удалить правило расписания"
        message={
          ruleToDelete
            ? `${ruleToDelete.employeeName}: ${weekdaysShort(ruleToDelete.weekdays)}, ${ruleToDelete.startTime}–${ruleToDelete.endTime}, ${dayjs(ruleToDelete.dateFrom).format("DD.MM.YY")} — ${dayjs(ruleToDelete.dateTo).format("DD.MM.YY")}. Смены по этому правилу пропадут из расписания, а окна — из онлайн-записи.`
            : ""
        }
        confirmText="Удалить"
        variant="error"
        loading={deleteRuleMutation.isPending}
      />
      <ConfirmDialog
        open={exceptionToDelete !== null}
        onClose={() => (deleteExceptionMutation.isPending ? undefined : setExceptionToDelete(null))}
        onConfirm={() => exceptionToDelete && deleteExceptionMutation.mutate(exceptionToDelete.id)}
        title={exceptionToDelete?.groupId ? "Удалить день из периода" : "Удалить исключение"}
        message={
          exceptionToDelete
            ? `${exceptionToDelete.employeeName}: ${KIND_LABELS[exceptionToDelete.kind].toLowerCase()} ${dayjs(exceptionToDelete.date).format("DD.MM.YYYY")}.${
                exceptionToDelete.groupId ? " Остальные дни периода останутся." : ""
              }`
            : ""
        }
        confirmText="Удалить"
        variant="warning"
        loading={deleteExceptionMutation.isPending}
      />

      {/* Телефон: действия вкладки в плавающей кнопке. На «Настройке» — выбор
          «график / отсутствие», в календаре — сразу смена. */}
      {isMobile && canManage && (
        <>
          <Fab
            color="primary"
            aria-label={tab === "calendar" ? "Добавить смену" : "Добавить"}
            onClick={(e) =>
              tab === "calendar"
                ? openExceptionDialog({ kind: "extra", title: "Добавить смену", date: dayjs() })
                : setFabMenuAnchor(e.currentTarget)
            }
            sx={{
              position: "fixed",
              right: 16,
              bottom: "calc(24px + env(safe-area-inset-bottom))",
              boxShadow: "none",
              zIndex: (t) => t.zIndex.fab,
            }}
          >
            <AddOutlined />
          </Fab>
          <Menu
            anchorEl={fabMenuAnchor}
            open={fabMenuAnchor !== null}
            onClose={() => setFabMenuAnchor(null)}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            transformOrigin={{ vertical: "bottom", horizontal: "right" }}
          >
            <MenuItem
              sx={{ minHeight: 48 }}
              onClick={() => {
                setFabMenuAnchor(null);
                openRuleForm("create", null, null);
              }}
            >
              <ListItemIcon>
                <CalendarMonthOutlined fontSize="small" />
              </ListItemIcon>
              График
            </MenuItem>
            <MenuItem
              sx={{ minHeight: 48 }}
              onClick={() => {
                setFabMenuAnchor(null);
                openAbsenceForm(null);
              }}
            >
              <ListItemIcon>
                <EventBusyOutlined fontSize="small" />
              </ListItemIcon>
              Отсутствие или разовая смена
            </MenuItem>
          </Menu>
        </>
      )}

      <ShiftOverlapDialog
        conflict={pointOverlap?.conflict ?? null}
        saving={pointOverlapSaving}
        onCancel={() => setPointOverlap(null)}
        onConfirm={() => void confirmPointOverlap()}
      />

      <SchedulePointEditDialog
        open={pointEdit !== null}
        onClose={() => setPointEdit(null)}
        employeeName={pointEdit?.occurrence.employeeName ?? ""}
        date={selectedDay}
        initialStartTime={pointEdit?.startTime ?? "09:00"}
        initialEndTime={pointEdit?.endTime ?? "17:00"}
        initialComment={pointEdit?.comment}
        existing={pointEdit?.existing !== null && pointEdit?.existing !== undefined}
        onSave={handleSavePointEdit}
      />
    </Box>
  );
};

export default DjangoSchedulePage;
