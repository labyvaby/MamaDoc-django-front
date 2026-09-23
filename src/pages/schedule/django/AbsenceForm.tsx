import React from "react";
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import dayjs, { type Dayjs } from "dayjs";

import {
  createScheduleException,
  createScheduleExceptionPeriod,
  parseShiftOverlapConflict,
  PARTIAL_ABSENCE_ENABLED,
  type ScheduleException,
  type ScheduleRule,
  type ShiftOverlapConflict,
} from "../../../api/scheduling";
import { parseBackendError } from "../../../api/appointments";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import { CustomDatePicker } from "../../../components/ui";
import { useFormValidation } from "../../../hooks/useFormValidation";
import type { AbsenceSpan } from "./AbsenceConflictsDrawer";
import EmployeePicker from "./EmployeePicker";
import ShiftOverlapDialog from "./ShiftOverlapDialog";
import { pluralDays, workingDaysInRange, type EmployeeRef } from "./scheduleMatrixModel";
import { FullSegment, PanelHeader, PresetPill, SectionLabel, SwitchLine, TimeRange } from "./scheduleUi";
import { accentFg, warningFg } from "./scheduleTones";

export type AbsenceFormKind = "day_off" | "vacation" | "extra";

const KIND_OPTIONS: { id: AbsenceFormKind; label: string }[] = [
  { id: "day_off", label: "Выходной" },
  { id: "vacation", label: "Отпуск" },
  { id: "extra", label: "Разовая смена" },
];

const iso = (d: Dayjs) => d.format("YYYY-MM-DD");
const dm = (d: string) => dayjs(d).format("DD.MM");

export interface AbsenceFormProps {
  employee: EmployeeRef | null;
  initialKind?: AbsenceFormKind;
  /** Правила и исключения — для плашки «попадает на N рабочих дней». */
  rules: ScheduleRule[];
  exceptions: ScheduleException[];
  organizationId?: number;
  /** Активный филиал — исключение ставится в нём. */
  branchId?: number;
  onBack?: () => void;
  onClose: () => void;
  /** Для отсутствия приходит период — страница поднимет разбор записей. */
  onSaved: (employeeId: number, message: string, absence?: AbsenceSpan) => void;
}

/**
 * Отсутствие (выходной/отпуск, день или период, целиком или интервалом) либо
 * разовая смена — в правой панели. До сохранения показываем, на сколько дней
 * по графику попадает отсутствие: записи на них разберём сразу после.
 */
const AbsenceForm: React.FC<AbsenceFormProps> = ({
  employee: fixedEmployee,
  initialKind = "day_off",
  rules,
  exceptions,
  organizationId,
  branchId,
  onBack,
  onClose,
  onSaved,
}) => {
  const today = dayjs().startOf("day");
  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(
    fixedEmployee ? ({ id: fixedEmployee.id, fullName: fixedEmployee.fullName } as DjangoEmployeeListItem) : null,
  );
  const [kind, setKind] = React.useState<AbsenceFormKind>(initialKind);
  const [span, setSpan] = React.useState<"single" | "period">(initialKind === "vacation" ? "period" : "single");
  const [date, setDate] = React.useState<Dayjs>(today);
  const [dateTo, setDateTo] = React.useState<Dayjs>(initialKind === "vacation" ? today.add(13, "day") : today);
  const [partial, setPartial] = React.useState(false);
  const [startTime, setStartTime] = React.useState(initialKind === "extra" ? "10:00" : "09:00");
  const [endTime, setEndTime] = React.useState(initialKind === "extra" ? "14:00" : "13:00");
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [overlap, setOverlap] = React.useState<ShiftOverlapConflict | null>(null);

  const isAbsence = kind !== "extra";
  const isPeriod = isAbsence && span === "period";
  const isPartial = PARTIAL_ABSENCE_ENABLED && isAbsence && partial;
  const showTimes = !isAbsence || isPartial;
  const endDate = isPeriod ? dateTo : date;
  const days = endDate.isValid() && date.isValid() ? endDate.diff(date, "day") + 1 : 0;

  const changeKind = (next: AbsenceFormKind) => {
    setKind(next);
    if (next === "vacation") {
      // Отпуск почти всегда периодом — сразу две недели.
      setSpan("period");
      if (!dateTo.isAfter(date, "day")) setDateTo(date.add(13, "day"));
    } else if (next === "extra") {
      setSpan("single");
      setStartTime("10:00");
      setEndTime("14:00");
    }
  };

  const changeSpan = (next: "single" | "period") => {
    setSpan(next);
    if (next === "period" && !dateTo.isAfter(date, "day")) setDateTo(date.add(6, "day"));
  };

  const form = useFormValidation({
    employee: employee ? null : "Выберите сотрудника",
    date: date.isValid() ? null : "Укажите дату",
    period: !isPeriod
      ? null
      : !dateTo.isValid() || dateTo.isBefore(date, "day")
        ? "Конец периода раньше начала"
        : days > 366
          ? "Период длиннее года — разбейте на части"
          : null,
    hours: !showTimes || startTime < endTime ? null : "Начало должно быть раньше конца",
  });

  // Дни по графику, на которые ляжет отсутствие.
  const workDays = React.useMemo(
    () =>
      employee && isAbsence && date.isValid() && endDate.isValid() && days > 0 && days <= 366
        ? workingDaysInRange(employee.id, iso(date), iso(endDate), rules, exceptions)
        : [],
    [employee, isAbsence, date, endDate, days, rules, exceptions],
  );

  const impact = !employee
    ? null
    : !isAbsence
      ? {
          tone: "neutral" as const,
          text: `Смена появится в расписании${date.isValid() ? ` ${dm(iso(date))}` : ""} и откроет окна для онлайн-записи.`,
        }
      : workDays.length > 0
        ? {
            tone: "warning" as const,
            text: `Попадает на ${workDays.length} ${pluralDays(workDays.length)} по графику: ${workDays
              .slice(0, 5)
              .map(dm)
              .join(", ")}${workDays.length > 5 ? ` и ещё ${workDays.length - 5}` : ""}. Если на эти дни есть записи, сразу после сохранения откроем их разбор.`,
          }
        : { tone: "neutral" as const, text: "По графику в эти дни смен нет — записи не затронет." };

  const handleSubmit = async (allowOverlap = false) => {
    if (!form.validate()) return;
    setError(null);
    setBusy(true);
    try {
      if (isPeriod) {
        await createScheduleExceptionPeriod({
          employeeId: employee!.id,
          dateFrom: iso(date),
          dateTo: iso(dateTo),
          kind,
          // Тот же интервал применяется к каждому дню периода.
          ...(isPartial ? { startTime, endTime } : {}),
          comment: comment.trim(),
          organizationId,
          branchId,
        });
      } else {
        await createScheduleException({
          employeeId: employee!.id,
          ...(allowOverlap ? { allowOverlap: true } : {}),
          date: iso(date),
          kind,
          startTime: showTimes ? startTime : undefined,
          endTime: showTimes ? endTime : undefined,
          comment: comment.trim(),
          organizationId,
          branchId,
        });
      }
    } catch (e) {
      setBusy(false);
      // Пересечение проверяется только у рабочей смены.
      const conflict = parseShiftOverlapConflict(e);
      if (conflict && !allowOverlap) {
        setOverlap(conflict);
        return;
      }
      setOverlap(null);
      setError(parseBackendError(e));
      return;
    }
    setBusy(false);
    setOverlap(null);
    onSaved(
      employee!.id,
      isAbsence ? "Отсутствие отмечено" : "Смена добавлена",
      isAbsence
        ? {
            employeeId: employee!.id,
            employeeName: employee!.fullName,
            dateFrom: iso(date),
            dateTo: iso(endDate),
            kind,
            // Разбирать только приёмы внутри интервала и в филиале отсутствия.
            ...(isPartial ? { startTime, endTime } : {}),
            branchId: branchId ?? null,
          }
        : undefined,
    );
  };

  const saveLabel = !isAbsence
    ? "Добавить смену"
    : isPeriod
      ? `Отметить ${kind === "vacation" ? "отпуск" : "выходные"} · ${days > 0 ? `${days} ${pluralDays(days)}` : "…"}`
      : `Отметить ${kind === "vacation" ? "отпуск" : "выходной"}`;

  return (
    <>
      <PanelHeader
        title={isAbsence ? "Отметить отсутствие" : "Разовая смена"}
        subtitle={employee?.fullName ?? "Сотрудник не выбран"}
        onBack={onBack}
        onClose={onClose}
        disabled={busy}
      />

      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        <Stack gap={2.75}>
          {!fixedEmployee && (
            <Box>
              <SectionLabel>Сотрудник</SectionLabel>
              <Box ref={form.anchor("employee")}>
                <EmployeePicker value={employee} onChange={setEmployee} disabled={busy} />
              </Box>
              {form.errorOf("employee") && (
                <Typography variant="caption" color="error">
                  {form.errorOf("employee")}
                </Typography>
              )}
            </Box>
          )}

          <Box>
            <SectionLabel>Что отметить</SectionLabel>
            <FullSegment
              layoutId="absence-form-kind"
              options={KIND_OPTIONS}
              value={kind}
              onChange={changeKind}
              disabled={busy}
            />
          </Box>

          <Box>
            <SectionLabel
              action={
                isAbsence ? (
                  <Stack direction="row" gap={0.5}>
                    <PresetPill active={span === "single"} onClick={() => changeSpan("single")}>
                      Один день
                    </PresetPill>
                    <PresetPill active={span === "period"} onClick={() => changeSpan("period")}>
                      Период
                    </PresetPill>
                  </Stack>
                ) : undefined
              }
            >
              Когда
            </SectionLabel>
            <Stack ref={form.anchor(isPeriod ? "period" : "date")} direction="row" alignItems="center" gap={1}>
              <CustomDatePicker
                shortYearMode="nearest"
                value={date}
                onChange={(v) => v && setDate(v)}
                disabled={busy}
                slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
              />
              {isPeriod && (
                <>
                  <Typography color="text.secondary">—</Typography>
                  <CustomDatePicker
                    shortYearMode="nearest"
                    value={dateTo}
                    onChange={(v) => v && setDateTo(v)}
                    disabled={busy}
                    slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
                  />
                </>
              )}
            </Stack>
            {(form.errorOf("date") || form.errorOf("period")) && (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
                {form.errorOf("date") ?? form.errorOf("period")}
              </Typography>
            )}
            {isAbsence && PARTIAL_ABSENCE_ENABLED && (
              <Box sx={{ mt: 1 }}>
                <SwitchLine checked={partial} onChange={setPartial} label="Не весь день" disabled={busy} />
              </Box>
            )}
            {showTimes && (
              <Box sx={{ mt: 1 }}>
                <TimeRange
                  start={startTime}
                  end={endTime}
                  onStart={setStartTime}
                  onEnd={setEndTime}
                  disabled={busy}
                  error={form.errorOf("hours")}
                  anchorRef={form.anchor("hours")}
                />
              </Box>
            )}
          </Box>

          {impact && (
            <Stack
              direction="row"
              gap={1.25}
              sx={(t) => ({
                p: 1.5,
                borderRadius: "10px",
                fontSize: 13,
                ...(impact.tone === "warning"
                  ? { bgcolor: alpha(t.palette.warning.main, 0.1), color: warningFg(t) }
                  : { bgcolor: "primary.lighter", color: accentFg(t) }),
              })}
            >
              {impact.tone === "warning" ? (
                <InfoOutlined sx={{ fontSize: 18, mt: "1px" }} />
              ) : (
                <EventAvailableOutlined sx={{ fontSize: 18, mt: "1px" }} />
              )}
              <Typography sx={{ fontSize: 13 }}>{impact.text}</Typography>
            </Stack>
          )}

          <Box>
            <SectionLabel>Комментарий</SectionLabel>
            <TextField
              size="small"
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Например, по заявлению"
              disabled={busy}
              inputProps={{ maxLength: 255 }}
            />
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={busy}
          onClick={() => void handleSubmit()}
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : saveLabel}
        </Button>
      </Box>

      <ShiftOverlapDialog
        conflict={overlap}
        saving={busy}
        onCancel={() => setOverlap(null)}
        onConfirm={() => void handleSubmit(true)}
      />
    </>
  );
};

export default AbsenceForm;
