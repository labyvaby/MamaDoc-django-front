import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import dayjs, { type Dayjs } from "dayjs";

import {
  createScheduleRule,
  getScheduleConflicts,
  updateScheduleRule,
  parseShiftOverlapConflict,
  SCHEDULE_RULE_ONLINE_BOOKING_ENABLED,
  isRuleOnlineBookingEnabled,
  type ScheduleConflictAppointment,
  type ScheduleException,
  type ScheduleRule,
  type ShiftOverlapConflict,
} from "../../../api/scheduling";
import { parseBackendError } from "../../../api/appointments";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import { CustomDatePicker } from "../../../components/ui";
import { usePermissions } from "../../../hooks/usePermissions";
import { useFormValidation } from "../../../hooks/useFormValidation";
import EmployeePicker from "./EmployeePicker";
import ShiftOverlapDialog from "./ShiftOverlapDialog";
import { WEEKDAY_SHORT, formatWeeklyHours, ruleWeeklyMinutes, weekdaysShort } from "./scheduleSettingsModel";
import {
  appointmentLine,
  appointmentsLosingCoverage,
  hourPresets,
  periodPresets,
  pluralDays,
  shortName,
  visitsOutOfSchedule,
  type EmployeeRef,
  type RuleFormMode,
} from "./scheduleMatrixModel";
import { FullSegment, PanelHeader, PresetPill, SectionLabel, SwitchCard, SwitchLine, TimeRange } from "./scheduleUi";
import { accentFg } from "./scheduleTones";

const ALL_BRANCHES = "all";
/** Больше вариантов сегмент не вмещает — подписи обрезаются до «М…». */
const SEGMENT_MAX_OPTIONS = 3;
const fmtShort = (d: Dayjs | string) => dayjs(d).format("DD.MM.YY");
const iso = (d: Dayjs) => d.format("YYYY-MM-DD");

/** «Пн–Пт 09:00–17:00 · Центр» — строка правила в «Как у коллеги». */
const ruleLabel = (r: ScheduleRule) =>
  weekdaysShort(r.weekdays) + " " + r.startTime + "–" + r.endTime + " · " + (r.branchName ?? "все филиалы");

const QUICK_DAYS: { label: string; days: number[] }[] = [
  { label: "Будни", days: [0, 1, 2, 3, 4] },
  { label: "Все дни", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Сб, Вс", days: [5, 6] },
];

export interface RuleFormProps {
  mode: RuleFormMode;
  /** Правило для edit/extend; null — новое. */
  rule: ScheduleRule | null;
  /** Сотрудник задан (открыли из его панели) — пикера нет. */
  employee: EmployeeRef | null;
  /**
   * Extend: другие правила сотрудника с тем же концом — их можно продлить
   * вместе с этим (обычно это пара «Пн, Ср, Пт» + «Вт, Чт»).
   */
  siblings: ScheduleRule[];
  organizationId?: number;
  /** Активный филиал — новое правило по умолчанию в нём. */
  branchId?: number;
  onBack?: () => void;
  onClose: () => void;
  onSaved: (employeeId: number, message: string) => void;
  /** Edit: удаление — через подтверждение на странице. */
  onDelete?: (rule: ScheduleRule) => void;
  /**
   * Все правила филиала: частые часы организации для пресетов, «Как у
   * коллеги» и расчёт записей, выпадающих из графика после правки.
   */
  allRules: ScheduleRule[];
  /** Исключения с сегодняшнего дня — отпуск и так снимает смену. */
  exceptions: ScheduleException[];
  /** Есть право видеть приёмы — без него проверку записей не делаем. */
  canCheckAppointments: boolean;
}

/**
 * Форма графика в правой панели (create / edit / extend): живая сводка сверху,
 * пресеты срока и дней, филиал сегментом. Монтируется заново на каждое
 * открытие (key у родителя), поэтому начальные значения — в useState.
 */
const RuleForm: React.FC<RuleFormProps> = ({
  mode,
  rule,
  employee: fixedEmployee,
  siblings,
  organizationId,
  branchId,
  onBack,
  onClose,
  onSaved,
  onDelete,
  allRules,
  exceptions,
  canCheckAppointments,
}) => {
  const { activeMembership } = usePermissions();
  const today = dayjs().startOf("day");

  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(
    fixedEmployee ? ({ id: fixedEmployee.id, fullName: fixedEmployee.fullName } as DjangoEmployeeListItem) : null,
  );
  const [dateFrom, setDateFrom] = React.useState<Dayjs>(rule ? dayjs(rule.dateFrom) : today);
  const [dateTo, setDateTo] = React.useState<Dayjs>(() =>
    rule
      ? mode === "extend"
        ? dayjs(rule.dateTo).add(12, "month")
        : dayjs(rule.dateTo)
      : today.add(12, "month").subtract(1, "day"),
  );
  const [weekdays, setWeekdays] = React.useState<number[]>(rule ? [...rule.weekdays] : [0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = React.useState(rule?.startTime ?? "09:00");
  const [endTime, setEndTime] = React.useState(rule?.endTime ?? "17:00");
  const [hasLunch, setHasLunch] = React.useState(rule ? rule.lunchStart != null : true);
  const [lunchStart, setLunchStart] = React.useState(rule?.lunchStart ?? "13:00");
  const [lunchEnd, setLunchEnd] = React.useState(rule?.lunchEnd ?? "14:00");
  // null — правило без филиала («Все филиалы»): видно в расписании каждого.
  const [ruleBranchId, setRuleBranchId] = React.useState<number | null>(
    rule ? rule.branchId : branchId ?? null,
  );
  const [online, setOnline] = React.useState(rule ? isRuleOnlineBookingEnabled(rule) : true);
  const [comment, setComment] = React.useState(rule?.comment ?? "");
  const [extendAll, setExtendAll] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Пересечение смен в режиме «warn»: 409 со списком → подтверждение и повтор.
  const [overlap, setOverlap] = React.useState<ShiftOverlapConflict | null>(null);
  // Записи, которые после правки окажутся вне графика, — показываем до сохранения.
  const [lostAppointments, setLostAppointments] = React.useState<ScheduleConflictAppointment[] | null>(null);
  const [copiedFrom, setCopiedFrom] = React.useState<ScheduleRule | null>(null);

  const branchOptions = React.useMemo(() => {
    const list = (activeMembership?.branches ?? []).map((b) => ({ id: String(b.id), label: b.name }));
    // Правило чужого филиала (нет в членстве) — держим его в опциях, иначе
    // сегмент молча переключит на другой филиал.
    if (rule?.branchId != null && !list.some((b) => b.id === String(rule.branchId))) {
      list.push({ id: String(rule.branchId), label: rule.branchName ?? `Филиал ${rule.branchId}` });
    }
    return [...list, { id: ALL_BRANCHES, label: "Все филиалы" }];
  }, [activeMembership, rule]);
  const branchName =
    ruleBranchId == null
      ? "все филиалы"
      : branchOptions.find((b) => b.id === String(ruleBranchId))?.label ?? null;

  const lunchInside = !hasLunch || (startTime <= lunchStart && lunchStart < lunchEnd && lunchEnd <= endTime);
  // Порядок ключей = порядок полей: фокус уйдёт в первое проблемное.
  const form = useFormValidation({
    employee: employee ? null : "Выберите сотрудника",
    period:
      !dateFrom.isValid() || !dateTo.isValid() || dateFrom.isAfter(dateTo, "day")
        ? "Проверьте период действия"
        : null,
    weekdays: weekdays.length > 0 ? null : "Выберите хотя бы один день недели",
    hours: startTime < endTime ? null : "Начало смены должно быть раньше конца",
    lunch: lunchInside ? null : "Обед должен быть внутри смены",
  });

  const weeklyMinutes =
    startTime < endTime
      ? ruleWeeklyMinutes({
          startTime,
          endTime,
          lunchStart: hasLunch ? lunchStart : null,
          lunchEnd: hasLunch ? lunchEnd : null,
          weekdays,
        } as ScheduleRule)
      : 0;

  const presetBase = mode === "extend" && rule ? rule.dateTo : iso(dateFrom);
  const presets = dateFrom.isValid() ? periodPresets(presetBase, mode) : [];
  const toIso = dateTo.isValid() ? iso(dateTo) : "";
  const addedDays = mode === "extend" && rule && dateTo.isValid() ? dateTo.diff(dayjs(rule.dateTo), "day") : 0;

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  const hours = React.useMemo(() => hourPresets(allRules), [allRules]);
  // Действующие правила команды — источник для «Как у коллеги».
  const todayIso = iso(today);
  const copyOptions = React.useMemo(
    () =>
      allRules
        .filter((r) => r.dateTo >= todayIso)
        .sort(
          (a, b) =>
            a.employeeName.localeCompare(b.employeeName, "ru") || a.startTime.localeCompare(b.startTime),
        ),
    [allRules, todayIso],
  );
  const applyRule = (r: ScheduleRule) => {
    setWeekdays([...r.weekdays]);
    setStartTime(r.startTime);
    setEndTime(r.endTime);
    setHasLunch(r.lunchStart != null);
    setLunchStart(r.lunchStart ?? "13:00");
    setLunchEnd(r.lunchEnd ?? "14:00");
    setRuleBranchId(r.branchId);
    setOnline(isRuleOnlineBookingEnabled(r));
  };

  /** Правило с текущими значениями формы — для сравнения «до / после». */
  const draftRule = (base: ScheduleRule): ScheduleRule => ({
    ...base,
    dateFrom: iso(dateFrom),
    dateTo: iso(dateTo),
    weekdays,
    startTime,
    endTime,
    lunchStart: hasLunch ? lunchStart : null,
    lunchEnd: hasLunch ? lunchEnd : null,
    branchId: ruleBranchId,
  });

  /**
   * Приёмы, которые правка выбросит из графика: сузили часы, убрали день,
   * укоротили срок, перенесли в другой филиал. Бэк их не отменяет, поэтому
   * предупреждаем до сохранения. Смотрим только в пределах старого срока с
   * сегодняшнего дня — дальше графика и так не было.
   */
  const findLostAppointments = async (): Promise<ScheduleConflictAppointment[]> => {
    if (!rule || !canCheckAppointments) return [];
    const from = rule.dateFrom > todayIso ? rule.dateFrom : todayIso;
    if (rule.dateTo < from) return [];
    const appointments = await getScheduleConflicts({
      employeeId: rule.employeeId,
      dateFrom: from,
      dateTo: rule.dateTo,
      organizationId,
    });
    const before = allRules.filter((r) => r.employeeId === rule.employeeId);
    const extendedSiblings = new Set(mode === "extend" && extendAll ? siblings.map((x) => x.id) : []);
    const after = before.map((r) =>
      r.id === rule.id ? draftRule(r) : extendedSiblings.has(r.id) ? { ...r, dateTo: iso(dateTo) } : r,
    );
    const ownExceptions = exceptions.filter((e) => e.employeeId === rule.employeeId);
    return appointmentsLosingCoverage(appointments, before, after, ownExceptions);
  };

  const handleSubmit = async (allowOverlap = false, coverageChecked = false) => {
    if (!form.validate()) return;
    setError(null);
    setBusy(true);
    if (!coverageChecked) {
      try {
        const lost = await findLostAppointments();
        if (lost.length > 0) {
          setBusy(false);
          setLostAppointments(lost);
          return;
        }
      } catch {
        // Проверка — подсказка, а не условие: без неё сохранение всё равно идёт.
      }
    }
    const common = {
      ...(allowOverlap ? { allowOverlap: true } : {}),
      dateFrom: iso(dateFrom),
      dateTo: iso(dateTo),
      weekdays,
      startTime,
      endTime,
      comment: comment.trim(),
      // Поля нет на бэке без выкладки, а неизвестное поле роняет весь запрос.
      ...(SCHEDULE_RULE_ONLINE_BOOKING_ENABLED ? { onlineBookingEnabled: online } : {}),
    };
    try {
      if (rule) {
        await updateScheduleRule(rule.id, {
          ...common,
          ...(hasLunch ? { lunchStart, lunchEnd } : { clearLunch: true }),
          // tri-state: null в JSON филиал не очищает — только явный clearBranch.
          ...(ruleBranchId == null ? { clearBranch: true } : { branchId: ruleBranchId }),
        });
      } else {
        await createScheduleRule({
          ...common,
          employeeId: employee!.id,
          lunchStart: hasLunch ? lunchStart : undefined,
          lunchEnd: hasLunch ? lunchEnd : undefined,
          organizationId,
          branchId: ruleBranchId,
        });
      }
    } catch (e) {
      setBusy(false);
      const conflict = parseShiftOverlapConflict(e);
      if (conflict && !allowOverlap) {
        setOverlap(conflict);
        return;
      }
      setOverlap(null);
      setError(parseBackendError(e));
      return;
    }
    setOverlap(null);

    // Соседние правила продлеваем тем же концом. Основное уже сохранено —
    // если сосед не продлился, говорим об этом, а не молчим.
    if (mode === "extend" && extendAll && siblings.length > 0) {
      try {
        for (const s of siblings) await updateScheduleRule(s.id, { dateTo: iso(dateTo) });
      } catch (e) {
        setBusy(false);
        setError(`График продлён, но не всё: ${parseBackendError(e)}`);
        return;
      }
    }
    setBusy(false);
    onSaved(
      employee!.id,
      mode === "extend"
        ? `График продлён до ${fmtShort(dateTo)}`
        : mode === "edit"
          ? "График сохранён"
          : "График добавлен",
    );
  };

  const lostCount = lostAppointments?.length ?? 0;
  const title = { create: "Новый график", edit: "Изменить график", extend: "Продлить график" }[mode];
  const saveLabel = {
    create: "Добавить график",
    edit: "Сохранить",
    extend: `Продлить до ${dateTo.isValid() ? fmtShort(dateTo) : "…"}`,
  }[mode];

  return (
    <>
      <PanelHeader
        title={title}
        subtitle={employee?.fullName ?? "Сотрудник не выбран"}
        onBack={onBack}
        onClose={onClose}
        disabled={busy}
      />

      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        <Stack gap={2.75}>
          {/* 1. Живая сводка */}
          <Box
            sx={(t) => ({
              px: 2,
              py: 1.75,
              borderRadius: "12px",
              bgcolor: "primary.lighter",
              color: accentFg(t),
            })}
          >
            <Typography sx={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {weekdays.length > 0 ? `${weekdaysShort(weekdays)} · ${startTime}–${endTime}` : "Дни не выбраны"}
            </Typography>
            <Typography sx={{ fontSize: 13, opacity: 0.8 }}>
              {[
                weeklyMinutes > 0 ? `${formatWeeklyHours(weeklyMinutes)} в неделю` : null,
                hasLunch ? `обед ${lunchStart}–${lunchEnd}` : "без обеда",
                branchName,
                SCHEDULE_RULE_ONLINE_BOOKING_ENABLED && !online ? "не на сайте" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
            {mode === "extend" && rule && (
              <Stack
                direction="row"
                alignItems="center"
                gap={1}
                sx={(t) => ({ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: alpha(t.palette.primary.main, 0.18) })}
              >
                <Typography sx={{ fontSize: 14, textDecoration: "line-through", opacity: 0.7 }}>
                  до {fmtShort(rule.dateTo)}
                </Typography>
                <ArrowForwardOutlined sx={{ fontSize: 16 }} />
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                  до {dateTo.isValid() ? fmtShort(dateTo) : "…"}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {addedDays > 0 && (
                  <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                    +{addedDays} {pluralDays(addedDays)}
                  </Typography>
                )}
              </Stack>
            )}
          </Box>

          {/* 2. Сотрудник — только если не задан */}
          {!fixedEmployee && !rule && (
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

          {/* «Как у коллеги»: новый врач обычно работает так же, как кто-то из
              команды, — берём дни, часы, обед, филиал и онлайн-запись. Срок свой. */}
          {mode === "create" && copyOptions.length > 0 && (
            <Box>
              <SectionLabel>Как у коллеги</SectionLabel>
              <Autocomplete
                size="small"
                options={copyOptions}
                value={copiedFrom}
                onChange={(_, r) => {
                  setCopiedFrom(r);
                  if (r) applyRule(r);
                }}
                groupBy={(r) => shortName(r.employeeName)}
                getOptionLabel={(r) => ruleLabel(r)}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => (
                  <TextField {...params} placeholder="Скопировать график сотрудника…" />
                )}
                noOptionsText="Не найдено"
                disabled={busy}
              />
            </Box>
          )}

          {/* 3. Период действия */}
          <Box>
            <SectionLabel>Период действия</SectionLabel>
            <Stack ref={form.anchor("period")} direction="row" alignItems="center" gap={1}>
              <CustomDatePicker
                shortYearMode="nearest"
                value={dateFrom}
                onChange={(v) => v && setDateFrom(v)}
                disabled={busy}
                slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
              />
              <Typography color="text.secondary">—</Typography>
              <CustomDatePicker
                shortYearMode="nearest"
                value={dateTo}
                onChange={(v) => v && setDateTo(v)}
                disabled={busy}
                slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
              />
            </Stack>
            {form.errorOf("period") && (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
                {form.errorOf("period")}
              </Typography>
            )}
            <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mr: 0.25 }}>
                {mode === "extend" ? "Продлить на" : "Срок"}
              </Typography>
              {presets.map((p) => (
                <PresetPill key={p.label} active={toIso === p.value} onClick={() => setDateTo(dayjs(p.value))}>
                  {p.label}
                </PresetPill>
              ))}
            </Stack>
            {mode === "extend" && siblings.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <SwitchCard
                  checked={extendAll}
                  onChange={setExtendAll}
                  disabled={busy}
                  title="Продлить вместе с ним"
                  description={`${siblings
                    .map((s) => `${weekdaysShort(s.weekdays)} ${s.startTime}–${s.endTime}`)
                    .join(", ")} — тоже до ${fmtShort(siblings[0].dateTo)}`}
                />
              </Box>
            )}
          </Box>

          {/* 4. Дни недели */}
          <Box>
            <SectionLabel
              action={
                <Stack direction="row" gap={0.5}>
                  {QUICK_DAYS.map((q) => (
                    <PresetPill
                      key={q.label}
                      active={weekdays.join() === q.days.join()}
                      onClick={() => setWeekdays(q.days)}
                    >
                      {q.label}
                    </PresetPill>
                  ))}
                </Stack>
              }
            >
              Дни недели
            </SectionLabel>
            <Stack ref={form.anchor("weekdays")} direction="row" gap={0.5}>
              {WEEKDAY_SHORT.map((label, d) => {
                const on = weekdays.includes(d);
                return (
                  <ButtonBase
                    key={label}
                    onClick={() => toggleWeekday(d)}
                    disabled={busy}
                    aria-pressed={on}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      height: 40,
                      borderRadius: "10px",
                      fontSize: 13,
                      fontWeight: 600,
                      border: 1,
                      borderColor: on ? "transparent" : "divider",
                      bgcolor: on ? "primary.main" : "transparent",
                      color: on ? "primary.contrastText" : "text.secondary",
                      transition: "background-color .15s ease, color .15s ease, border-color .15s ease",
                    }}
                  >
                    {label}
                  </ButtonBase>
                );
              })}
            </Stack>
            {form.errorOf("weekdays") && (
              <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
                {form.errorOf("weekdays")}
              </Typography>
            )}
          </Box>

          {/* 5. Время работы */}
          <Box>
            <SectionLabel>Время работы</SectionLabel>
            <TimeRange
              start={startTime}
              end={endTime}
              onStart={setStartTime}
              onEnd={setEndTime}
              disabled={busy}
              error={form.errorOf("hours")}
              anchorRef={form.anchor("hours")}
              labels={["Начало смены", "Конец смены"]}
            />
            <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              <Typography sx={{ fontSize: 12, color: "text.secondary", mr: 0.25 }}>Часто</Typography>
              {hours.map((h) => (
                <PresetPill
                  key={h.start + "-" + h.end}
                  active={startTime === h.start && endTime === h.end}
                  onClick={() => {
                    setStartTime(h.start);
                    setEndTime(h.end);
                  }}
                >
                  {h.start}–{h.end}
                </PresetPill>
              ))}
            </Stack>
            <Box sx={{ mt: 1 }} ref={form.anchor("lunch")}>
              <SwitchLine checked={hasLunch} onChange={setHasLunch} label="Обед" disabled={busy} />
              {hasLunch && (
                <Box sx={{ mt: 0.5 }}>
                  <TimeRange
                    start={lunchStart}
                    end={lunchEnd}
                    onStart={setLunchStart}
                    onEnd={setLunchEnd}
                    disabled={busy}
                    compact
                    error={form.errorOf("lunch")}
                    labels={["Начало обеда", "Конец обеда"]}
                  />
                </Box>
              )}
            </Box>
          </Box>

          {/* 6. Филиал */}
          <Box>
            <SectionLabel>Филиал</SectionLabel>
            {/* Сегмент читается до трёх вариантов; у сети из 5–9 филиалов подписи
                сжимались до «М…», поэтому там — выпадающий список. */}
            {branchOptions.length <= SEGMENT_MAX_OPTIONS ? (
              <FullSegment
                layoutId="rule-form-branch"
                options={branchOptions}
                value={ruleBranchId == null ? ALL_BRANCHES : String(ruleBranchId)}
                onChange={(id) => setRuleBranchId(id === ALL_BRANCHES ? null : Number(id))}
                disabled={busy}
              />
            ) : (
              <TextField
                select
                size="small"
                fullWidth
                value={ruleBranchId == null ? ALL_BRANCHES : String(ruleBranchId)}
                onChange={(e) => setRuleBranchId(e.target.value === ALL_BRANCHES ? null : Number(e.target.value))}
                disabled={busy}
              >
                {branchOptions.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {ruleBranchId == null && (
              <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.75 }}>
                Смены будут видны в расписании каждого филиала.
              </Typography>
            )}
          </Box>

          {/* 7. Онлайн-запись */}
          {SCHEDULE_RULE_ONLINE_BOOKING_ENABLED && (
            <SwitchCard
              checked={online}
              onChange={setOnline}
              disabled={busy}
              title="Онлайн-запись"
              description="Показывать окна этих смен на сайте. Регистратура записывает в любом случае."
            />
          )}

          {/* 8. Комментарий */}
          <Box>
            <SectionLabel>Комментарий</SectionLabel>
            <TextField
              size="small"
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Необязательно"
              disabled={busy}
              inputProps={{ maxLength: 255 }}
            />
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
        {/* Ошибка — у кнопки: внизу прокручиваемой формы её не видно. */}
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        <Stack direction="row" gap={1}>
          {mode === "edit" && rule && onDelete && (
            <Button color="error" disabled={busy} onClick={() => onDelete(rule)} sx={{ flexShrink: 0 }}>
              Удалить
            </Button>
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
        </Stack>
      </Box>

      <Dialog
        open={lostAppointments !== null}
        onClose={() => setLostAppointments(null)}
        PaperProps={{ sx: { width: 440, maxWidth: "calc(100% - 32px)", borderRadius: "14px" } }}
      >
        <DialogTitle sx={{ fontSize: 17, fontWeight: 600, pb: 1 }}>
          {visitsOutOfSchedule(lostCount)}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 1.5 }}>
            Записи не отменятся, но в это время у врача не будет смены. Предупредите пациентов или
            перенесите записи.
          </Typography>
          <Stack gap={0.5}>
            {lostAppointments?.slice(0, 5).map((a) => (
              <Typography key={a.id} sx={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                {appointmentLine(a)}
              </Typography>
            ))}
            {lostCount > 5 && (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>и ещё {lostCount - 5}</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLostAppointments(null)}>Вернуться</Button>
          <Button
            variant="contained"
            onClick={() => {
              setLostAppointments(null);
              void handleSubmit(false, true);
            }}
          >
            Сохранить всё равно
          </Button>
        </DialogActions>
      </Dialog>

      <ShiftOverlapDialog
        conflict={overlap}
        saving={busy}
        onCancel={() => setOverlap(null)}
        onConfirm={() => void handleSubmit(true, true)}
      />
    </>
  );
};

export default RuleForm;
