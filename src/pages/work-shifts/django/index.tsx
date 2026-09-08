import React from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Stack,
  IconButton,
  TextField,
  MenuItem,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
  alpha,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTimeOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useDjangoSkudActions } from "../../../hooks/useDjangoSkud";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { getDjangoEmployees } from "../../../api/staff";
import {
  createShift,
  deleteShift,
  updateShift,
  type ShiftWriteData,
  type WorkShiftRow,
} from "../../../api/attendance";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";
import { PageHeader, ListLoadingSkeleton, ListEmptyState, CustomDatePicker } from "../../../components/ui";
import ShiftFormDrawer, { type EmployeeOption } from "./ShiftFormDrawer";
import {
  buildBranchOptions,
  filterShiftsByBranch,
  unassignedShifts,
  type ShiftBranchFilter,
} from "./branchFilter";

dayjs.extend(duration);

const formatDuration = (start: string, end: string | null): string => {
  if (!end) return "Активна";
  const diff = dayjs(end).diff(dayjs(start));
  const dur = dayjs.duration(diff);
  const totalHours = Math.floor(dur.asHours());
  const minutes = dur.minutes().toString().padStart(2, "0");
  const seconds = dur.seconds().toString().padStart(2, "0");
  return `${totalHours}:${minutes}:${seconds}`;
};

// ── Page ─────────────────────────────────────────────────────────────────────

const DjangoWorkShiftsPage: React.FC = () => {
  usePageTitle("СКУД");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  // Как в оригинале: без карточки сотрудника отметка невозможна — показываем
  // предупреждение вместо кнопок, а не ошибку 400 после клика.
  const { activeEmployee, activeBranch, activeMembership, switchContext } = usePermissions();
  const orgId = useApiOrgId();

  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<number | null>(null);
  const [branchFilter, setBranchFilter] = React.useState<ShiftBranchFilter>("all");
  const [startDate, setStartDate] = React.useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [endDate, setEndDate] = React.useState(dayjs().endOf("month").format("YYYY-MM-DD"));

  const {
    shifts,
    loading,
    isFetching,
    canClock,
    canManage,
    actionLoading,
    effectiveAllowedIp,
    isIpCorrect,
    isBranchMissing,
    clockBranches,
    currentShift,
    handleStartShift,
    handleEndShift,
  } = useDjangoSkudActions(true, selectedEmployeeId, startDate, endDate);

  const employeesQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, orgId ?? null],
    queryFn: ({ signal }) => getDjangoEmployees({ pageSize: 200, organizationId: orgId }, signal),
    enabled: canManage,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const employees: EmployeeOption[] = React.useMemo(
    () =>
      (employeesQuery.data?.results ?? [])
        .map((e) => ({ id: e.id, fullName: e.fullName }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employeesQuery.data],
  );

  const branchOptions = React.useMemo(
    () => buildBranchOptions(activeMembership?.branches ?? [], shifts),
    [activeMembership, shifts],
  );

  // Фильтр филиала — клиентский; почему именно так, см. branchFilter.ts.
  const visibleShifts = React.useMemo(
    () => filterShiftsByBranch(shifts, branchFilter),
    [shifts, branchFilter],
  );
  const withoutBranch = React.useMemo(() => unassignedShifts(shifts), [shifts]);

  const processedShifts = React.useMemo(
    () =>
      visibleShifts.map((shift) => {
        const clockIn = dayjs(shift.clockIn);
        return {
          ...shift,
          dayStr: clockIn.format("DD.MM.YYYY"),
          shortDayStr: clockIn.format("DD.MM"),
          timeStart: clockIn.format("HH:mm"),
          timeEnd: shift.clockOut ? dayjs(shift.clockOut).format("HH:mm") : "—",
          durationStr: formatDuration(shift.clockIn, shift.clockOut),
        };
      }),
    [visibleShifts],
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<WorkShiftRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkShiftRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Привязка смен без филиала: цель — либо одна строка, либо все найденные.
  const [assignTargets, setAssignTargets] = React.useState<WorkShiftRow[] | null>(null);
  const [assignBranchId, setAssignBranchId] = React.useState<number | "">("");
  const [assigning, setAssigning] = React.useState(false);
  const [assignDone, setAssignDone] = React.useState(0);

  const openAssign = (targets: WorkShiftRow[]) => {
    setAssignBranchId(activeBranch?.id ?? branchOptions[0]?.id ?? "");
    setAssignDone(0);
    setAssignTargets(targets);
  };

  const runAssign = async () => {
    if (!assignTargets || assignBranchId === "") return;
    setAssigning(true);
    setAssignDone(0);
    let failed = 0;
    for (const shift of assignTargets) {
      try {
        // PATCH смены не частичный: без clockIn бэкенд отвечает 400
        // «Обязательное поле» (проверено на проде 02.09.2026). Остальные поля
        // не передаём — непереданное бэкенд сохраняет как есть.
        await updateShift(
          shift.id,
          {
            branchId: assignBranchId,
            clockIn: shift.clockIn,
            ...(shift.clockOut ? { clockOut: shift.clockOut } : {}),
          },
          { organizationId: orgId },
        );
      } catch {
        failed += 1;
      }
      setAssignDone((done) => done + 1);
    }
    setAssigning(false);
    void invalidate();
    setAssignTargets(null);
    notify?.({
      type: failed ? "error" : "success",
      message: failed
        ? `Привязано смен: ${assignTargets.length - failed}, с ошибкой: ${failed}`
        : `Привязано смен: ${assignTargets.length}`,
    });
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.attendance.all });

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (shift: WorkShiftRow) => {
    setEditTarget(shift);
    setFormOpen(true);
  };

  const handleFormSubmit = async ({
    editId,
    rows,
  }: {
    editId: number | null;
    rows: ShiftWriteData[];
  }) => {
    try {
      if (editId != null) {
        // Ручная смена должна быть привязана к текущему филиалу: payroll в
        // филиальном срезе намеренно не включает общеклинические (branch=null)
        // записи. При «Все филиалы» не передаём поле, чтобы не менять старую
        // привязку неожиданно.
        const row = activeBranch
          ? { ...rows[0], branchId: activeBranch.id }
          : rows[0];
        await updateShift(editId, row, { organizationId: orgId });
        notify?.({ type: "success", message: "Смена обновлена" });
      } else {
        // Weekday bulk-create persists each generated shift (one POST per day).
        for (const row of rows) {
          await createShift(
            activeBranch ? { ...row, branchId: activeBranch.id } : row,
            { organizationId: orgId },
          );
        }
        notify?.({
          type: "success",
          message:
            rows.length > 1 ? `Создано смен: ${rows.length}` : "Смена добавлена",
        });
      }
      void invalidate();
      setFormOpen(false);
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteShift(deleteTarget.id, { organizationId: orgId });
      notify?.({ type: "success", message: "Смена удалена" });
      void invalidate();
      setDeleteTarget(null);
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setDeleting(false);
    }
  };

  // Филиал смены: у старых и «потерянных» отметок его нет — показываем это
  // явно, а управляющему даём привязать смену прямо из строки.
  const branchCell = (shift: WorkShiftRow) => {
    if (shift.branchId != null) {
      return (
        <Typography variant="body2" noWrap>
          {shift.branchName ?? `Филиал ${shift.branchId}`}
        </Typography>
      );
    }
    if (canManage && branchOptions.length > 0) {
      return (
        <Tooltip title="Смена не входит в филиальный расчёт ЗП — привязать к филиалу">
          <Chip
            label="Без филиала"
            size="small"
            color="warning"
            variant="outlined"
            icon={<ApartmentOutlined />}
            onClick={() => openAssign([shift])}
          />
        </Tooltip>
      );
    }
    return <Chip label="Без филиала" size="small" color="warning" variant="outlined" />;
  };

  const statusChip = (shift: typeof processedShifts[number]) => {
    if (!shift.clockOut) return <Chip label="Активна" color="success" size="small" />;
    if (shift.isAnomalous) return <Chip label="Аномально" color="error" size="small" />;
    return <Chip label="Завершено" color="info" size="small" />;
  };

  // Фильтры в стиле склада — отдельная полноширинная строка под заголовком,
  // чтобы подписи полей и даты не сжимались рядом с кнопкой «Добавить».
  const filters = (
    <Stack
      direction="row"
      spacing={1.5}
      useFlexGap
      flexWrap="wrap"
      alignItems="center"
      sx={{ width: "100%" }}
    >
      {canManage && (
        <TextField
          select
          size="small"
          label="Сотрудник"
          value={selectedEmployeeId ?? ""}
          onChange={(e) => setSelectedEmployeeId(e.target.value ? Number(e.target.value) : null)}
          sx={{ flex: "1 1 220px", minWidth: 200 }}
        >
          <MenuItem value="">Все сотрудники</MenuItem>
          {employees.map((emp) => (
            <MenuItem key={emp.id} value={emp.id}>
              {emp.fullName}
            </MenuItem>
          ))}
        </TextField>
      )}
      {branchOptions.length > 1 && (
        <TextField
          select
          size="small"
          label="Филиал"
          value={branchFilter === "all" ? "" : String(branchFilter)}
          onChange={(e) => {
            const raw = e.target.value;
            setBranchFilter(raw === "" ? "all" : raw === "none" ? "none" : Number(raw));
          }}
          sx={{ flex: "1 1 200px", minWidth: 180 }}
        >
          <MenuItem value="">Все филиалы</MenuItem>
          {branchOptions.map((branch) => (
            <MenuItem key={branch.id} value={String(branch.id)}>
              {branch.name}
            </MenuItem>
          ))}
          <MenuItem value="none">Без филиала{withoutBranch.length ? ` (${withoutBranch.length})` : ""}</MenuItem>
        </TextField>
      )}
      <CustomDatePicker
        label="От"
        value={dayjs(startDate)}
        onChange={(next) => {
          if (next && next.isValid()) setStartDate(next.format("YYYY-MM-DD"));
        }}
        shortYearMode="nearest"
        slotProps={{ textField: { size: "small", sx: { flex: "1 1 170px", minWidth: 165 } } }}
      />
      <CustomDatePicker
        label="До"
        value={dayjs(endDate)}
        onChange={(next) => {
          if (next && next.isValid()) setEndDate(next.format("YYYY-MM-DD"));
        }}
        shortYearMode="nearest"
        slotProps={{ textField: { size: "small", sx: { flex: "1 1 170px", minWidth: 165 } } }}
      />
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
      <PageHeader
        title="СКУД"
        showTitle={false}
        onAdd={canManage ? openCreate : undefined}
        addButtonText="Добавить смену"
      />

      <Box
        sx={(t) => ({
          px: t.appLayout.page.paddingX,
          pt: 1.5,
          pb: t.appLayout.page.paddingY,
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        })}
      >
        {/* Фильтры */}
        <Box sx={{ mb: 2 }}>{filters}</Box>

        {/* Карточка отметки смены (для тех, кто может отмечаться) */}
        {canClock && !activeEmployee && (
          <Paper
            elevation={0}
            variant="outlined"
            sx={{ mb: 2, p: { xs: 1.75, sm: 2.5 }, borderRadius: "10px" }}
          >
            <Typography variant="body2" sx={{ color: "warning.main" }}>
              Аккаунт не связан с карточкой сотрудника — отметка прихода и ухода недоступна.
            </Typography>
          </Paper>
        )}
        {canClock && activeEmployee && (
          <Paper
            elevation={0}
            variant="outlined"
            sx={{
              mb: 2,
              p: { xs: 1.75, sm: 2.5 },
              borderRadius: "10px",
              borderColor: (t) =>
                currentShift
                  ? alpha(t.palette.success.main, 0.35)
                  : "divider",
              bgcolor: (t) =>
                currentShift
                  ? alpha(t.palette.success.main, 0.06)
                  : "background.paper",
            }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  Моя смена
                </Typography>
                <Box sx={{ mt: 0.75 }}>
                  {currentShift ? (
                    <Chip
                      icon={<AccessTimeIcon />}
                      label={`Активна с ${dayjs(currentShift.clockIn).format("HH:mm")}`}
                      color="success"
                      size="small"
                      variant="outlined"
                    />
                  ) : (
                    <Chip label="Смена не начата" size="small" color="default" variant="outlined" />
                  )}
                </Box>
                {!effectiveAllowedIp && (
                  <Typography variant="caption" sx={{ color: "warning.main", display: "block", mt: 0.75 }}>
                    IP офиса не настроен — проверка отключена
                  </Typography>
                )}
                {effectiveAllowedIp && !isIpCorrect && (
                  <Typography variant="caption" sx={{ color: "error.main", display: "block", mt: 0.75 }}>
                    Вы не в офисном Wi-Fi — начать смену нельзя
                  </Typography>
                )}
                {/* Филиал смены берётся из активного контекста сессии; без него
                    отработанные часы не войдут ни в один филиальный расчёт ЗП. */}
                {!currentShift && isBranchMissing && clockBranches.length > 1 && (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" sx={{ color: "warning.main" }}>
                      Филиал не выбран — выберите, иначе смена не войдёт в расчёт зарплаты филиала:
                    </Typography>
                    <TextField
                      select
                      size="small"
                      label="Филиал смены"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value || !activeMembership) return;
                        void switchContext?.({
                          membershipId: activeMembership.id,
                          branchId: Number(e.target.value),
                        });
                      }}
                      sx={{ minWidth: 200 }}
                    >
                      {clockBranches.map((branch) => (
                        <MenuItem key={branch.id} value={String(branch.id)}>
                          {branch.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                )}
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                {!currentShift ? (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleStartShift}
                    disabled={actionLoading || !isIpCorrect}
                    fullWidth
                    sx={{ minHeight: theme.appLayout.controls.buttonHeight }}
                  >
                    Начать смену
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={handleEndShift}
                    disabled={actionLoading}
                    fullWidth
                    sx={{ minHeight: theme.appLayout.controls.buttonHeight }}
                  >
                    Завершить смену
                  </Button>
                )}
              </Box>
            </Stack>
          </Paper>
        )}

        {/* Смены без филиала не входят ни в один филиальный расчёт зарплаты:
            payroll режет по branchId, поэтому такие часы теряются молча. */}
        {!loading && withoutBranch.length > 0 && (
          <Alert
            severity="warning"
            variant="outlined"
            sx={{ mb: 2, borderRadius: "10px" }}
            action={
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                {branchFilter !== "none" && (
                  <Button color="inherit" size="small" onClick={() => setBranchFilter("none")}>
                    Показать
                  </Button>
                )}
                {canManage && branchOptions.length > 0 && (
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<ApartmentOutlined />}
                    onClick={() => openAssign(withoutBranch)}
                  >
                    Привязать
                  </Button>
                )}
              </Stack>
            }
          >
            Смен без филиала за период: {withoutBranch.length}. Они не попадают в
            филиальный расчёт зарплаты — ни в один из филиалов.
          </Alert>
        )}

        {/* Список смен */}
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            borderRadius: "10px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              История смен{!loading ? ` (${visibleShifts.length})` : ""}
            </Typography>
          </Stack>

          {isFetching && !loading && (
            <LinearProgress sx={{ height: 2 }} />
          )}

          {loading ? (
            <ListLoadingSkeleton rows={6} />
          ) : visibleShifts.length === 0 ? (
            <ListEmptyState
              icon={<EventBusyOutlinedIcon />}
              title="Смен пока нет"
              description={
                branchFilter !== "all" && shifts.length > 0
                  ? "В выбранном филиале отметок за период нет. Смените филиал или период."
                  : "За выбранный период отметок нет. Измените период или добавьте смену вручную."
              }
              action={
                canManage ? (
                  <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={openCreate}>
                    Добавить смену
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop table (md+) */}
              <TableContainer sx={{ display: { xs: "none", md: "block" } }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Режим</TableCell>
                      {canManage && <TableCell>Сотрудник</TableCell>}
                      <TableCell>Филиал</TableCell>
                      <TableCell>Начало</TableCell>
                      <TableCell>Конец</TableCell>
                      <TableCell>Длительность</TableCell>
                      <TableCell>Статус</TableCell>
                      {canManage && <TableCell align="right">Действия</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      let currentDayStr = "";
                      return processedShifts.map((shift) => {
                        const isNewDay = shift.dayStr !== currentDayStr;
                        if (isNewDay) currentDayStr = shift.dayStr;
                        return (
                          <React.Fragment key={shift.id}>
                            {isNewDay && (
                              <TableRow sx={{ position: "sticky", top: 56, zIndex: 2 }}>
                                <TableCell
                                  colSpan={canManage ? 9 : 7}
                                  sx={{
                                    py: 1,
                                    fontWeight: 700,
                                    color: "text.secondary",
                                    borderBottom: "1px solid",
                                    borderColor: "divider",
                                    bgcolor: "background.default",
                                  }}
                                >
                                  {shift.dayStr}
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow hover>
                              <TableCell>
                                <Box sx={{ display: "flex", alignItems: "center" }}>
                                  <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.5, mr: 0.5 }}>
                                    {shift.shortDayStr}
                                  </Typography>
                                  {shift.isAnomalous && (
                                    <Tooltip title="Аномальная длительность (> 36ч)">
                                      <ReportProblemIcon sx={{ color: "error.main", fontSize: "1rem" }} />
                                    </Tooltip>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                {shift.isNightShift ? (
                                  <NightlightOutlined sx={{ color: "warning.main" }} titleAccess="Ночная смена" />
                                ) : (
                                  <WbSunnyOutlined sx={{ color: "primary.onSurface" }} titleAccess="Дневная смена" />
                                )}
                              </TableCell>
                              {canManage && <TableCell>{shift.employeeName}</TableCell>}
                              <TableCell>{branchCell(shift)}</TableCell>
                              <TableCell>{shift.timeStart}</TableCell>
                              <TableCell>{shift.timeEnd}</TableCell>
                              <TableCell>{shift.durationStr}</TableCell>
                              <TableCell>{statusChip(shift)}</TableCell>
                              {canManage && (
                                <TableCell align="right">
                                  <IconButton size="small" onClick={() => openEdit(shift)} title="Редактировать">
                                    <EditOutlined fontSize="small" />
                                  </IconButton>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => setDeleteTarget(shift)}
                                    title="Удалить"
                                  >
                                    <DeleteOutline fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              )}
                            </TableRow>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Mobile/tablet cards (xs, sm) */}
              <Box sx={{ display: { xs: "block", md: "none" }, p: 1.5 }}>
                {(() => {
                  let currentDayStr = "";
                  return processedShifts.map((shift) => {
                    const isNewDay = shift.dayStr !== currentDayStr;
                    if (isNewDay) currentDayStr = shift.dayStr;
                    return (
                      <React.Fragment key={shift.id}>
                        {isNewDay && (
                          <Typography
                            variant="caption"
                            fontWeight={700}
                            color="text.secondary"
                            sx={{ display: "block", mt: 2, mb: 0.75, px: 0.5, letterSpacing: 0.5 }}
                          >
                            {shift.dayStr}
                          </Typography>
                        )}
                        <Box
                          sx={{
                            mb: 1,
                            p: 1.25,
                            borderRadius: 1,
                            border: 1,
                            borderColor: "divider",
                            bgcolor: "background.paper",
                          }}
                        >
                          <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                                {shift.isNightShift ? (
                                  <NightlightOutlined sx={{ color: "warning.main", fontSize: "1rem" }} />
                                ) : (
                                  <WbSunnyOutlined sx={{ color: "primary.onSurface", fontSize: "1rem" }} />
                                )}
                                <Typography variant="body2" fontWeight={600}>
                                  {shift.timeStart} — {shift.timeEnd === "—" ? "активна" : shift.timeEnd}
                                </Typography>
                                {shift.isAnomalous && (
                                  <Tooltip title="Аномальная длительность (> 36ч)">
                                    <ReportProblemIcon sx={{ color: "error.main", fontSize: "1rem" }} />
                                  </Tooltip>
                                )}
                              </Stack>
                              <Stack direction="row" spacing={2} flexWrap="wrap">
                                <Typography variant="caption" color="text.secondary">
                                  Длительность: <strong>{shift.durationStr}</strong>
                                </Typography>
                                {canManage && shift.employeeName && (
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {shift.employeeName}
                                  </Typography>
                                )}
                              </Stack>
                              <Box sx={{ mt: 0.75 }}>{branchCell(shift)}</Box>
                            </Box>
                            <Stack direction="row" alignItems="center" spacing={0.5} ml={1} sx={{ flexShrink: 0 }}>
                              {statusChip(shift)}
                              {canManage && (
                                <>
                                  <IconButton size="small" onClick={() => openEdit(shift)}>
                                    <EditOutlined fontSize="small" />
                                  </IconButton>
                                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(shift)}>
                                    <DeleteOutline fontSize="small" />
                                  </IconButton>
                                </>
                              )}
                            </Stack>
                          </Stack>
                        </Box>
                      </React.Fragment>
                    );
                  });
                })()}
              </Box>
            </>
          )}
        </Paper>
      </Box>

      <ShiftFormDrawer
        open={formOpen}
        shiftToEdit={editTarget}
        employees={employees}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        onDelete={
          editTarget
            ? () => {
                const target = editTarget;
                setFormOpen(false);
                setDeleteTarget(target);
              }
            : undefined
        }
      />

      <Dialog
        open={Boolean(assignTargets)}
        onClose={assigning ? undefined : () => setAssignTargets(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Привязать к филиалу</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {assignTargets && assignTargets.length > 1
              ? `Смен без филиала за период: ${assignTargets.length}. После привязки их часы войдут в расчёт зарплаты выбранного филиала.`
              : `Смена${
                  assignTargets?.[0]
                    ? ` от ${dayjs(assignTargets[0].clockIn).format("DD.MM.YYYY HH:mm")}`
                    : ""
                } войдёт в расчёт зарплаты выбранного филиала.`}
          </DialogContentText>
          <TextField
            select
            fullWidth
            size="small"
            label="Филиал"
            value={assignBranchId === "" ? "" : String(assignBranchId)}
            onChange={(e) => setAssignBranchId(e.target.value ? Number(e.target.value) : "")}
            disabled={assigning}
          >
            {branchOptions.map((branch) => (
              <MenuItem key={branch.id} value={String(branch.id)}>
                {branch.name}
              </MenuItem>
            ))}
          </TextField>
          {assigning && assignTargets && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant="determinate"
                value={(assignDone / Math.max(assignTargets.length, 1)) * 100}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Обработано {assignDone} из {assignTargets.length}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignTargets(null)} disabled={assigning} color="inherit">
            Отмена
          </Button>
          <Button
            onClick={runAssign}
            disabled={assigning || assignBranchId === ""}
            variant="contained"
          >
            Привязать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={deleting ? undefined : () => setDeleteTarget(null)}>
        <DialogTitle>Удалить смену?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Смена{deleteTarget ? ` от ${dayjs(deleteTarget.clockIn).format("DD.MM.YYYY HH:mm")}` : ""} будет
            удалена без возможности восстановления.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting} color="inherit">
            Отмена
          </Button>
          <Button onClick={confirmDelete} disabled={deleting} color="error" variant="contained">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DjangoWorkShiftsPage;
