/**
 * «Уборка» — список задач горничным (после выезда/текущая/проверка/
 * обслуживание), назначение исполнителя и срока, закрытие с установкой
 * состояния номера. Реальный бэкенд полностью готов (POST/GET/PATCH
 * /hotel/housekeeping-tasks/, см. src/api/hotel.ts) — раньше на него никто
 * не смотрел, кроме счётчика «Задачи уборки» в HotelOccupancyBanner.tsx.
 *
 * Доступ страницы — PAGE_PERMISSIONS.hotelHousekeeping (hotel.housekeeping.view
 * ИЛИ hotel.manage, см. accessPermissions.ts), не общий isHotelOrg, как было
 * сначала по образцу «Кухни»: тут назначение и закрытие задач, а не просто
 * справочная страница — любой сотрудник Viva видеть и трогать её не должен.
 * vivaActive-редирект ниже — доп. защита при прямом переходе по ссылке, не
 * замена RequirePermission на роуте (см. App.tsx). Смена состояния номера
 * при закрытии задачи — тот же принцип, что в RoomStateControl: права
 * конкретного действия проверяет бэк, 403 показываем как есть.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ArrowDropDownOutlined from "@mui/icons-material/ArrowDropDownOutlined";
import Menu from "@mui/material/Menu";
import dayjs from "dayjs";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { CustomDateTimePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HOTEL_ROOM_STATE_LABELS, HOTEL_ROOM_STATES } from "./hotelDisplay";
import {
  listRooms,
  listHousekeepingTasks,
  createHousekeepingTask,
  updateHousekeepingTask,
  type HotelHousekeepingTask,
  type HotelHousekeepingTaskCreateData,
} from "../api/hotel";
import { getAllDjangoEmployees } from "../api/staff";
import { getErrorMessage } from "../api/client";

type TaskKind = "checkout" | "stayover" | "inspection" | "maintenance";
type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
type StatusFilter = TaskStatus | "all";

const KIND_LABELS: Record<TaskKind, string> = {
  checkout: "После выезда",
  stayover: "Текущая уборка",
  inspection: "Проверка",
  maintenance: "Обслуживание/ремонт",
};
const TASK_KINDS: TaskKind[] = ["checkout", "stayover", "inspection", "maintenance"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Открыта",
  in_progress: "В работе",
  done: "Готово",
  cancelled: "Отменена",
};
const TASK_STATUSES: TaskStatus[] = ["open", "in_progress", "done", "cancelled"];

function statusColor(status: TaskStatus, theme: Theme): string {
  switch (status) {
    case "open":
      return theme.palette.warning.main;
    case "in_progress":
      return theme.palette.info.main;
    case "done":
      return theme.palette.success.main;
    case "cancelled":
      return theme.palette.text.disabled;
  }
}

const formatDue = (iso: string | null) => (iso ? dayjs(iso).format("DD.MM HH:mm") : "—");

interface TaskFormState {
  roomId: number | "";
  kind: TaskKind;
  assignedToId: number | "";
  dueAt: dayjs.Dayjs | null;
  note: string;
}

const emptyForm: TaskFormState = { roomId: "", kind: "checkout", assignedToId: "", dueAt: null, note: "" };

export const HotelHousekeepingPage: React.FC = () => {
  usePageTitle("Уборка");
  const theme = useTheme();
  const vivaActive = useIsVivaActive();
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("open");
  const [mineOnly, setMineOnly] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<HotelHousekeepingTask | null>(null);
  const [form, setForm] = React.useState<TaskFormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const [statusMenuAnchor, setStatusMenuAnchor] = React.useState<{ el: HTMLElement; task: HotelHousekeepingTask } | null>(null);
  const [doneTask, setDoneTask] = React.useState<HotelHousekeepingTask | null>(null);
  const [doneRoomState, setDoneRoomState] = React.useState<string>("clean");

  const tasksQuery = useQuery({
    queryKey: ["hotel", "housekeepingTasks", property?.id, statusFilter, mineOnly],
    queryFn: ({ signal }) =>
      listHousekeepingTasks(
        { propertyId: property!.id, status: statusFilter === "all" ? undefined : statusFilter, mine: mineOnly || undefined },
        signal,
      ),
    enabled: property != null,
  });
  const tasks = tasksQuery.data ?? [];

  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null,
  });
  const rooms = roomsQuery.data ?? [];

  // Список сотрудников для назначения — если у роли нет staff.view, запрос
  // просто вернёт ошибку и пикер останется пустым (задачу всё ещё можно
  // создать без исполнителя), поэтому isError здесь намеренно не проверяем.
  const employeesQuery = useQuery({
    queryKey: ["staff", "employees", "all", "active"],
    queryFn: ({ signal }) => getAllDjangoEmployees({ status: "active" }, signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const employees = employeesQuery.data ?? [];

  const invalidateAfterChange = (roomStateChanged: boolean) => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "housekeepingTasks"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
    if (roomStateChanged) void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms"] });
  };

  const openCreate = () => {
    setEditingTask(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (task: HotelHousekeepingTask) => {
    setEditingTask(task);
    setForm({
      roomId: task.roomId,
      kind: task.kind,
      assignedToId: task.assignedToId ?? "",
      dueAt: task.dueAt ? dayjs(task.dueAt) : null,
      note: task.note,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const submitForm = async () => {
    if (!property) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingTask) {
        await updateHousekeepingTask(editingTask.id, {
          assignedToId: form.assignedToId === "" ? undefined : form.assignedToId,
          clearAssignee: form.assignedToId === "",
          dueAt: form.dueAt ? form.dueAt.toISOString() : null,
          note: form.note,
        });
      } else {
        if (form.roomId === "") {
          setFormError("Выберите номер");
          setSaving(false);
          return;
        }
        const payload: HotelHousekeepingTaskCreateData = {
          propertyId: property.id,
          roomId: form.roomId,
          kind: form.kind,
          assignedToId: form.assignedToId === "" ? undefined : form.assignedToId,
          dueAt: form.dueAt ? form.dueAt.toISOString() : undefined,
          note: form.note || undefined,
        };
        await createHousekeepingTask(payload);
      }
      invalidateAfterChange(false);
      setFormOpen(false);
      enqueueSnackbar(editingTask ? "Задача обновлена" : "Задача создана", { variant: "success" });
    } catch (err) {
      setFormError(getErrorMessage(err, "Не удалось сохранить задачу"));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (task: HotelHousekeepingTask, status: TaskStatus) => {
    setStatusMenuAnchor(null);
    if (status === task.status) return;
    if (status === "done") {
      setDoneRoomState(task.kind === "inspection" ? "inspected" : "clean");
      setDoneTask(task);
      return;
    }
    try {
      await updateHousekeepingTask(task.id, { status });
      invalidateAfterChange(false);
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось изменить статус задачи"), { variant: "error" });
    }
  };

  const confirmDone = async () => {
    if (!doneTask) return;
    const task = doneTask;
    setDoneTask(null);
    try {
      await updateHousekeepingTask(task.id, { status: "done", roomState: doneRoomState || undefined });
      invalidateAfterChange(Boolean(doneRoomState));
      enqueueSnackbar("Задача закрыта", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось закрыть задачу"), { variant: "error" });
    }
  };

  if (!vivaActive) return <Navigate to="/" replace />;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Уборка
        </Typography>
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            size="small"
            onChange={(_, v: StatusFilter | null) => v && setStatusFilter(v)}
          >
            <ToggleButton value="open">Открытые</ToggleButton>
            <ToggleButton value="in_progress">В работе</ToggleButton>
            <ToggleButton value="done">Готово</ToggleButton>
            <ToggleButton value="cancelled">Отменено</ToggleButton>
            <ToggleButton value="all">Все</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel
            control={<Switch size="small" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />}
            label={<Typography variant="body2">Мои задачи</Typography>}
          />
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={openCreate}>
            Новая задача
          </Button>
        </Stack>
      </Stack>

      {tasksQuery.isLoading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : tasksQuery.isError ? (
        <Alert severity="error">{getErrorMessage(tasksQuery.error, "Не удалось загрузить задачи уборки")}</Alert>
      ) : tasks.length === 0 ? (
        <Paper elevation={0} variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">Задач нет</Typography>
        </Paper>
      ) : (
        <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden" }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Номер</TableCell>
                  <TableCell>Вид</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Исполнитель</TableCell>
                  <TableCell>Срок</TableCell>
                  <TableCell>Заметка</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.map((task) => {
                  const color = statusColor(task.status, theme);
                  const dark = theme.palette.mode === "dark";
                  return (
                    <TableRow key={task.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{task.roomNumber}</TableCell>
                      <TableCell>{KIND_LABELS[task.kind]}</TableCell>
                      <TableCell>
                        <Chip
                          label={
                            <Stack component="span" direction="row" alignItems="center" gap={0.5}>
                              {STATUS_LABELS[task.status]}
                              <ArrowDropDownOutlined fontSize="small" />
                            </Stack>
                          }
                          size="small"
                          onClick={(e) => setStatusMenuAnchor({ el: e.currentTarget, task })}
                          sx={{
                            bgcolor: alpha(color, dark ? 0.25 : 0.14),
                            color: "text.primary",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        />
                      </TableCell>
                      <TableCell>{task.assignedToName || <Typography color="text.disabled">—</Typography>}</TableCell>
                      <TableCell>{formatDue(task.dueAt)}</TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>
                        <Typography variant="body2" color="text.secondary" noWrap title={task.note}>
                          {task.note || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Изменить">
                          <IconButton size="small" onClick={() => openEdit(task)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      )}

      {/* Смена статуса — тот же приём, что чип в RoomStateControl. */}
      <Menu
        anchorEl={statusMenuAnchor?.el ?? null}
        open={statusMenuAnchor !== null}
        onClose={() => setStatusMenuAnchor(null)}
      >
        {TASK_STATUSES.map((s) => (
          <MenuItem
            key={s}
            selected={statusMenuAnchor?.task.status === s}
            onClick={() => statusMenuAnchor && void changeStatus(statusMenuAnchor.task, s)}
            sx={{ gap: 1.25, minWidth: 160 }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: statusColor(s, theme), flexShrink: 0 }} />
            <Typography variant="body2">{STATUS_LABELS[s]}</Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* Закрытие задачи — заодно предлагает поставить состояние номера. */}
      <Dialog open={doneTask !== null} onClose={() => setDoneTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Закрыть задачу — номер {doneTask?.roomNumber}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Можно сразу поставить состояние номера — как в чипе состояния номера.
          </DialogContentText>
          <TextField select label="Состояние номера" value={doneRoomState} onChange={(e) => setDoneRoomState(e.target.value)} fullWidth>
            <MenuItem value="">Не менять</MenuItem>
            {HOTEL_ROOM_STATES.map((s) => (
              <MenuItem key={s} value={s}>
                {HOTEL_ROOM_STATE_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDoneTask(null)}>Отмена</Button>
          <Button variant="contained" onClick={() => void confirmDone()}>
            Закрыть задачу
          </Button>
        </DialogActions>
      </Dialog>

      {/* Создание/правка задачи — номер и вид фиксируются при создании. */}
      <Dialog open={formOpen} onClose={closeForm} maxWidth="xs" fullWidth>
        <DialogTitle>{editingTask ? `Задача — номер ${editingTask.roomNumber}` : "Новая задача уборки"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            {!editingTask && (
              <>
                <TextField
                  select
                  label="Номер"
                  value={form.roomId}
                  onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value === "" ? "" : Number(e.target.value) }))}
                  fullWidth
                >
                  {rooms.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.number} — {r.roomTypeName}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Вид задачи"
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TaskKind }))}
                  fullWidth
                >
                  {TASK_KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}
            <TextField
              select
              label="Исполнитель"
              value={form.assignedToId}
              onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value === "" ? "" : Number(e.target.value) }))}
              fullWidth
            >
              <MenuItem value="">Без исполнителя</MenuItem>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.fullName}
                </MenuItem>
              ))}
            </TextField>
            <CustomDateTimePicker
              label="Срок"
              value={form.dueAt}
              onChange={(v) => setForm((f) => ({ ...f, dueAt: v }))}
              slotProps={{ textField: { fullWidth: true }, field: { clearable: true } }}
            />
            <TextField
              label="Заметка"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm} disabled={saving}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void submitForm()} disabled={saving}>
            {saving ? "Сохраняем…" : editingTask ? "Сохранить" : "Создать"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HotelHousekeepingPage;
