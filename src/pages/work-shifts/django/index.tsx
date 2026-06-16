import React from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Container,
  CircularProgress,
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
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { useDjangoSkudActions } from "../../../hooks/useDjangoSkud";
import { getDjangoEmployees } from "../../../api/staff";
import {
  createShift,
  deleteShift,
  updateShift,
  type ShiftWriteData,
  type WorkShiftRow,
} from "../../../api/attendance";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../../api/queryKeys";
import ShiftFormDrawer, { type EmployeeOption } from "./ShiftFormDrawer";

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
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();

  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<number | null>(null);
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
    currentShift,
    handleStartShift,
    handleEndShift,
  } = useDjangoSkudActions(true, selectedEmployeeId, startDate, endDate);

  const employeesQuery = useQuery({
    queryKey: djangoQueryKeys.reference.employees,
    queryFn: ({ signal }) => getDjangoEmployees({ pageSize: 200 }, signal),
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

  const processedShifts = React.useMemo(
    () =>
      shifts.map((shift) => {
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
    [shifts],
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<WorkShiftRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<WorkShiftRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

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
        await updateShift(editId, rows[0]);
        notify?.({ type: "success", message: "Смена обновлена" });
      } else {
        // Weekday bulk-create persists each generated shift (one POST per day).
        for (const row of rows) {
          await createShift(row);
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
      await deleteShift(deleteTarget.id);
      notify?.({ type: "success", message: "Смена удалена" });
      void invalidate();
      setDeleteTarget(null);
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setDeleting(false);
    }
  };

  const statusChip = (shift: typeof processedShifts[number]) => {
    if (!shift.clockOut) return <Chip label="Активна" color="success" size="small" />;
    if (shift.isAnomalous) return <Chip label="Аномально" color="error" size="small" />;
    return <Chip label="Завершено" color="info" size="small" />;
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ═══ STICKY TOP ZONE ═══ */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "background.default",
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Container maxWidth="lg" sx={{ pt: 1, pb: 1 }}>
          {canClock && (
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              sx={{ mb: 1 }}
            >
              <Box sx={{ minWidth: 0 }}>
                {!effectiveAllowedIp && (
                  <Typography variant="caption" sx={{ color: "warning.main", display: "block" }}>
                    IP не настроен
                  </Typography>
                )}
                {effectiveAllowedIp && !isIpCorrect && (
                  <Typography variant="caption" sx={{ color: "error.main", display: "block" }}>
                    Не в офисном Wi-Fi
                  </Typography>
                )}
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
              <Box sx={{ flexShrink: 0 }}>
                {!currentShift ? (
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<PlayArrowIcon />}
                    onClick={handleStartShift}
                    disabled={actionLoading || !isIpCorrect}
                  >
                    Начать
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    size="small"
                    startIcon={<StopIcon />}
                    onClick={handleEndShift}
                    disabled={actionLoading}
                  >
                    Завершить
                  </Button>
                )}
              </Box>
            </Stack>
          )}

          {/* Filters */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {canManage && (
              <TextField
                select
                size="small"
                label="Сотрудник"
                value={selectedEmployeeId ?? ""}
                onChange={(e) => setSelectedEmployeeId(e.target.value ? Number(e.target.value) : null)}
                sx={{ flex: "1 1 160px", minWidth: 0 }}
              >
                <MenuItem value="">Все</MenuItem>
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              type="date"
              size="small"
              label="От"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: "1 1 130px", minWidth: 0 }}
            />
            <TextField
              type="date"
              size="small"
              label="До"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: "1 1 130px", minWidth: 0 }}
            />
            {canManage && (
              <Button
                variant="contained"
                size="small"
                onClick={openCreate}
                sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
              >
                + Добавить
              </Button>
            )}
          </Stack>
        </Container>
        {isFetching && !loading && (
          <Box sx={{ position: "absolute", bottom: 0, left: 0, right: 0, transform: "translateY(100%)" }}>
            <LinearProgress sx={{ height: 2 }} />
          </Box>
        )}
      </Box>

      {/* ═══ SCROLLABLE LIST ═══ */}
      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, position: "relative" }}>
        <Container maxWidth="lg" sx={{ pt: 1.5, pb: { xs: 12, md: 4 } }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : shifts.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
              <Typography color="text.secondary">История пуста</Typography>
            </Paper>
          ) : (
            <>
              {/* Desktop table (md+) */}
              <TableContainer
                component={Paper}
                variant="outlined"
                elevation={0}
                sx={{ display: { xs: "none", md: "block" } }}
              >
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Режим</TableCell>
                      {canManage && <TableCell>Сотрудник</TableCell>}
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
                              <TableRow sx={{ position: "sticky", top: 56, zIndex: 2, bgcolor: "background.default" }}>
                                <TableCell
                                  colSpan={canManage ? 8 : 6}
                                  sx={{
                                    py: 1,
                                    fontWeight: 600,
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
                                  <WbSunnyOutlined sx={{ color: "primary.main" }} titleAccess="Дневная смена" />
                                )}
                              </TableCell>
                              {canManage && <TableCell>{shift.employeeName}</TableCell>}
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
              <Box sx={{ display: { xs: "block", md: "none" } }}>
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
                            sx={{ display: "block", mt: 2, mb: 0.5, px: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}
                          >
                            {shift.dayStr}
                          </Typography>
                        )}
                        <Card variant="outlined" sx={{ mb: 1 }}>
                          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                            <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                                  {shift.isNightShift ? (
                                    <NightlightOutlined sx={{ color: "warning.main", fontSize: "1rem" }} />
                                  ) : (
                                    <WbSunnyOutlined sx={{ color: "primary.main", fontSize: "1rem" }} />
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
                          </CardContent>
                        </Card>
                      </React.Fragment>
                    );
                  });
                })()}
              </Box>
            </>
          )}
        </Container>
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
