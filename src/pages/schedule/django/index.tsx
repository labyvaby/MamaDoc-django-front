import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { PageHeader, CustomDatePicker } from "../../../components/ui";
import { getDjangoEmployees, type DjangoEmployeeListItem } from "../../../api/staff";
import {
  getScheduleRules,
  createScheduleRule,
  updateScheduleRule,
  deleteScheduleRule,
  getScheduleExceptions,
  createScheduleException,
  deleteScheduleException,
  type ScheduleRule,
  type ScheduleExceptionKind,
} from "../../../api/scheduling";
import { parseBackendError } from "../../../api/appointments";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const KIND_LABELS: Record<ScheduleExceptionKind, string> = {
  day_off: "Выходной",
  vacation: "Отпуск",
  extra: "Доп. смена",
};

function weekdaysLabel(weekdays: number[]): string {
  return [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ");
}

// ── Employee autocomplete (общий для форм) ────────────────────────────────────

const EmployeePicker: React.FC<{
  value: DjangoEmployeeListItem | null;
  onChange: (v: DjangoEmployeeListItem | null) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const [input, setInput] = React.useState("");
  const query = useQuery({
    queryKey: ["django", "schedule", "employees", input],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ search: input || undefined, status: "active", pageSize: 20 }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const options = query.data?.results ?? [];
  return (
    <Autocomplete
      options={value && !options.some((o) => o.id === value.id) ? [value, ...options] : options}
      loading={query.isLoading}
      value={value}
      inputValue={input}
      getOptionLabel={(o) => o.fullName}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, v) => setInput(v)}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} size="small" placeholder="Введите имя сотрудника..." />
      )}
      noOptionsText="Сотрудники не найдены"
    />
  );
};

// ── Форма правила ─────────────────────────────────────────────────────────────

const RuleFormDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  rule: ScheduleRule | null; // null → создание
  organizationId?: number;
  onSaved: () => void;
}> = ({ open, onClose, rule, organizationId, onSaved }) => {
  const isEdit = rule !== null;
  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(null);
  const [dateFrom, setDateFrom] = React.useState<Dayjs>(dayjs());
  const [dateTo, setDateTo] = React.useState<Dayjs>(dayjs().add(1, "year"));
  const [weekdays, setWeekdays] = React.useState<number[]>([0, 1, 2, 3, 4]);
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("17:00");
  const [hasLunch, setHasLunch] = React.useState(true);
  const [lunchStart, setLunchStart] = React.useState("13:00");
  const [lunchEnd, setLunchEnd] = React.useState("14:00");
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (rule) {
      setEmployee({ id: rule.employeeId, fullName: rule.employeeName } as DjangoEmployeeListItem);
      setDateFrom(dayjs(rule.dateFrom));
      setDateTo(dayjs(rule.dateTo));
      setWeekdays(rule.weekdays);
      setStartTime(rule.startTime);
      setEndTime(rule.endTime);
      setHasLunch(rule.lunchStart != null);
      setLunchStart(rule.lunchStart ?? "13:00");
      setLunchEnd(rule.lunchEnd ?? "14:00");
      setComment(rule.comment);
    } else {
      setEmployee(null);
      setDateFrom(dayjs());
      setDateTo(dayjs().add(1, "year"));
      setWeekdays([0, 1, 2, 3, 4]);
      setStartTime("09:00");
      setEndTime("17:00");
      setHasLunch(true);
      setLunchStart("13:00");
      setLunchEnd("14:00");
      setComment("");
    }
  }, [open, rule]);

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );

  const canSubmit =
    (isEdit || employee != null) &&
    weekdays.length > 0 &&
    startTime < endTime &&
    dateFrom.isValid() &&
    dateTo.isValid() &&
    !dateFrom.isAfter(dateTo) &&
    (!hasLunch || lunchStart < lunchEnd);

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (isEdit) {
        await updateScheduleRule(rule.id, {
          dateFrom: dateFrom.format("YYYY-MM-DD"),
          dateTo: dateTo.format("YYYY-MM-DD"),
          weekdays,
          startTime,
          endTime,
          ...(hasLunch ? { lunchStart, lunchEnd } : { clearLunch: true }),
          comment: comment.trim(),
        });
      } else {
        await createScheduleRule({
          employeeId: employee!.id,
          dateFrom: dateFrom.format("YYYY-MM-DD"),
          dateTo: dateTo.format("YYYY-MM-DD"),
          weekdays,
          startTime,
          endTime,
          lunchStart: hasLunch ? lunchStart : undefined,
          lunchEnd: hasLunch ? lunchEnd : undefined,
          comment: comment.trim(),
          organizationId,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

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
          <CalendarMonthOutlined color="primary" />
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? "Правило расписания" : "Новое правило расписания"}
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
            <EmployeePicker value={employee} onChange={setEmployee} disabled={busy || isEdit} />
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Период действия
            </Typography>
            <Stack direction="row" spacing={1}>
              <CustomDatePicker
                value={dateFrom}
                onChange={(v) => v && setDateFrom(v)}
                slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
              />
              <CustomDatePicker
                value={dateTo}
                onChange={(v) => v && setDateTo(v)}
                slotProps={{ textField: { size: "small", sx: { flex: 1, minWidth: 0 } } }}
              />
            </Stack>
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Дни недели *
            </Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {WEEKDAY_LABELS.map((label, d) => {
                const active = weekdays.includes(d);
                return (
                  <Chip
                    key={label}
                    label={label}
                    size="small"
                    clickable
                    onClick={() => toggleWeekday(d)}
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
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Рабочие часы *
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                type="time"
                size="small"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                sx={{ flex: 1 }}
                disabled={busy}
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

          <Stack spacing={0.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Обед
              </Typography>
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
              <Stack direction="row" spacing={1} alignItems="center">
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
            )}
          </Stack>

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

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={!canSubmit || busy}
          onClick={handleSubmit}
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить правило"}
        </Button>
      </Box>
    </Drawer>
  );
};

// ── Форма исключения ──────────────────────────────────────────────────────────

const ExceptionDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  organizationId?: number;
  onSaved: () => void;
}> = ({ open, onClose, organizationId, onSaved }) => {
  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(null);
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [kind, setKind] = React.useState<ScheduleExceptionKind>("day_off");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("13:00");
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEmployee(null);
      setDate(dayjs());
      setKind("day_off");
      setStartTime("09:00");
      setEndTime("13:00");
      setComment("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const canSubmit =
    employee != null && date.isValid() && (kind !== "extra" || startTime < endTime);

  const handleSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await createScheduleException({
        employeeId: employee!.id,
        date: date.format("YYYY-MM-DD"),
        kind,
        startTime: kind === "extra" ? startTime : undefined,
        endTime: kind === "extra" ? endTime : undefined,
        comment: comment.trim(),
        organizationId,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Исключение из расписания</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Сотрудник *
            </Typography>
            <EmployeePicker value={employee} onChange={setEmployee} disabled={busy} />
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Дата *
            </Typography>
            <CustomDatePicker
              value={date}
              onChange={(v) => v && setDate(v)}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Тип *
            </Typography>
            <TextField
              select
              size="small"
              value={kind}
              onChange={(e) => setKind(e.target.value as ScheduleExceptionKind)}
              disabled={busy}
            >
              <MenuItem value="day_off">Выходной</MenuItem>
              <MenuItem value="vacation">Отпуск</MenuItem>
              <MenuItem value="extra">Доп. смена</MenuItem>
            </TextField>
          </Stack>
          {kind === "extra" && (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                type="time"
                size="small"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                sx={{ flex: 1 }}
                disabled={busy}
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
          )}
          <TextField
            size="small"
            fullWidth
            label="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={busy}
            inputProps={{ maxLength: 255 }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Сохранение…" : "Добавить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Страница ──────────────────────────────────────────────────────────────────

const DjangoSchedulePage: React.FC = () => {
  usePageTitle("Расписание");
  const theme = useTheme();
  const canManage = useCan("schedule.manage");
  const { isSuperAdmin, activeOrganization } = usePermissions();
  const orgId = isSuperAdmin() ? activeOrganization?.id ?? undefined : undefined;
  const queryClient = useQueryClient();

  const [employeeFilter, setEmployeeFilter] = React.useState<DjangoEmployeeListItem | null>(null);
  const [ruleFormOpen, setRuleFormOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<ScheduleRule | null>(null);
  const [exceptionFormOpen, setExceptionFormOpen] = React.useState(false);

  const rulesParams = { employeeId: employeeFilter?.id ?? null, orgId: orgId ?? null };
  const rulesQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.rules(rulesParams),
    queryFn: ({ signal }) =>
      getScheduleRules({ employeeId: employeeFilter?.id, organizationId: orgId }, signal),
  });

  const exceptionsParams = {
    employeeId: employeeFilter?.id ?? null,
    from: dayjs().format("YYYY-MM-DD"),
    orgId: orgId ?? null,
  };
  const exceptionsQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.exceptions(exceptionsParams),
    queryFn: ({ signal }) =>
      getScheduleExceptions(
        {
          employeeId: employeeFilter?.id,
          dateFrom: dayjs().format("YYYY-MM-DD"),
          organizationId: orgId,
        },
        signal,
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["django", "scheduling"] });
  };

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => deleteScheduleRule(id),
    onSuccess: invalidate,
  });
  const deleteExceptionMutation = useMutation({
    mutationFn: (id: number) => deleteScheduleException(id),
    onSuccess: invalidate,
  });

  const rules = rulesQuery.data ?? [];
  const exceptions = exceptionsQuery.data ?? [];

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Расписание"
        showTitle={false}
        showSearch={false}
        actions={
          canManage ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EventBusyOutlined />}
                onClick={() => setExceptionFormOpen(true)}
              >
                Исключение
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => {
                  setEditingRule(null);
                  setRuleFormOpen(true);
                }}
              >
                Добавить правило
              </Button>
            </Stack>
          ) : undefined
        }
      />

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: theme.appLayout.page.paddingX,
          py: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {/* Фильтр по сотруднику */}
        <Box sx={{ maxWidth: 360 }}>
          <EmployeePicker value={employeeFilter} onChange={setEmployeeFilter} />
        </Box>

        {rulesQuery.isError && (
          <Alert severity="error">{parseBackendError(rulesQuery.error)}</Alert>
        )}

        {/* Правила */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            overflow: "hidden",
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ px: 2, py: 1.5 }}>
            Недельные шаблоны
          </Typography>
          <Divider />
          {rulesQuery.isLoading ? (
            <Stack alignItems="center" py={4}>
              <CircularProgress size={24} />
            </Stack>
          ) : rules.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ p: 3, textAlign: "center" }}>
              Правил пока нет — добавьте график сотрудника
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Сотрудник</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Период</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Дни</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Часы</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Обед</TableCell>
                    {canManage && (
                      <TableCell sx={{ fontWeight: 600 }} align="right">
                        Действия
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id} hover>
                      <TableCell>{rule.employeeName}</TableCell>
                      <TableCell>
                        {dayjs(rule.dateFrom).format("DD.MM.YY")} —{" "}
                        {dayjs(rule.dateTo).format("DD.MM.YY")}
                      </TableCell>
                      <TableCell>{weekdaysLabel(rule.weekdays)}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {rule.startTime}–{rule.endTime}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {rule.lunchStart ? `${rule.lunchStart}–${rule.lunchEnd}` : "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Tooltip title="Редактировать">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingRule(rule);
                                setRuleFormOpen(true);
                              }}
                            >
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Удалить">
                            <IconButton
                              size="small"
                              onClick={() => deleteRuleMutation.mutate(rule.id)}
                              disabled={deleteRuleMutation.isPending}
                            >
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* Исключения */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            overflow: "hidden",
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ px: 2, py: 1.5 }}>
            Исключения (с сегодняшнего дня)
          </Typography>
          <Divider />
          {exceptionsQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={22} />
            </Stack>
          ) : exceptions.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ p: 3, textAlign: "center" }}>
              Исключений нет
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Сотрудник</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Дата</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Тип</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Интервал</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Комментарий</TableCell>
                    {canManage && (
                      <TableCell sx={{ fontWeight: 600 }} align="right">
                        Действия
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {exceptions.map((exc) => (
                    <TableRow key={exc.id} hover>
                      <TableCell>{exc.employeeName}</TableCell>
                      <TableCell>{dayjs(exc.date).format("DD.MM.YYYY")}</TableCell>
                      <TableCell>
                        <Chip
                          label={KIND_LABELS[exc.kind]}
                          size="small"
                          variant="outlined"
                          color={exc.kind === "extra" ? "success" : "default"}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {exc.startTime ? `${exc.startTime}–${exc.endTime}` : "—"}
                      </TableCell>
                      <TableCell>{exc.comment || "—"}</TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Tooltip title="Удалить">
                            <IconButton
                              size="small"
                              onClick={() => deleteExceptionMutation.mutate(exc.id)}
                              disabled={deleteExceptionMutation.isPending}
                            >
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>

      <RuleFormDrawer
        open={ruleFormOpen}
        onClose={() => setRuleFormOpen(false)}
        rule={editingRule}
        organizationId={orgId}
        onSaved={invalidate}
      />
      <ExceptionDialog
        open={exceptionFormOpen}
        onClose={() => setExceptionFormOpen(false)}
        organizationId={orgId}
        onSaved={invalidate}
      />
    </Box>
  );
};

export default DjangoSchedulePage;
