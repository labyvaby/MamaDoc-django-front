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
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import ArrowDropDownOutlined from "@mui/icons-material/ArrowDropDownOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import AutorenewOutlined from "@mui/icons-material/AutorenewOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import Menu from "@mui/material/Menu";
import { EmptyState, FilterChip, HotelPage, HotelPageHeader, plural, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import dayjs from "dayjs";
import { Navigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { CustomDateTimePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { initialsOf, useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { HOTEL_ROOM_STATE_LABELS, HOTEL_ROOM_STATES, hotelRoomStateColor } from "./hotelDisplay";
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
import { usePermissions } from "../hooks/usePermissions";
import { appendInspectionResult, isCheckoutInspection, parseInspectionResult } from "./roomInspection";

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

const KIND_ICONS: Record<TaskKind, React.ReactNode> = {
  checkout: <LogoutOutlined sx={{ fontSize: 17 }} />,
  stayover: <AutorenewOutlined sx={{ fontSize: 17 }} />,
  inspection: <FactCheckOutlined sx={{ fontSize: 17 }} />,
  maintenance: <BuildOutlined sx={{ fontSize: 17 }} />,
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Открытые" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Готово" },
  { value: "cancelled", label: "Отменено" },
  { value: "all", label: "Все" },
];

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
  const tableSx = useHotelTableSx();
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
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
  // Проверка перед выездом (#4130): горничная отвечает «всё в порядке» или пишет замечания.
  const [inspectTask, setInspectTask] = React.useState<HotelHousekeepingTask | null>(null);
  const [inspectOk, setInspectOk] = React.useState(true);
  const [inspectRemarks, setInspectRemarks] = React.useState("");
  const [inspectSaving, setInspectSaving] = React.useState(false);
  const { activeEmployee, user } = usePermissions();
  const me = activeEmployee?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || "";
  const openInspect = (task: HotelHousekeepingTask) => {
    setInspectTask(task);
    setInspectOk(true);
    setInspectRemarks("");
  };
  const confirmInspect = async () => {
    if (!inspectTask || (!inspectOk && !inspectRemarks.trim())) return;
    setInspectSaving(true);
    try {
      // Задача остаётся «в работе» до выселения — ресепшен видит ответ в карточке брони и закрывает её сам.
      await updateHousekeepingTask(inspectTask.id, {
        status: "in_progress",
        note: appendInspectionResult(inspectTask.note, inspectOk, inspectRemarks, me),
      });
      invalidateAfterChange(false);
      enqueueSnackbar(inspectOk ? "Отмечено: всё в порядке" : "Замечания отправлены на ресепшен", { variant: "success" });
      setInspectTask(null);
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить проверку"), { variant: "error" });
    } finally {
      setInspectSaving(false);
    }
  };
  const [doneTask, setDoneTask] = React.useState<HotelHousekeepingTask | null>(null);
  const [doneRoomState, setDoneRoomState] = React.useState<string>("clean");
  const [cancellingId, setCancellingId] = React.useState<number | null>(null);

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
    // Список нужен только в форме задачи — не грузим его вместе со страницей.
    enabled: formOpen,
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
    if (status === "done" && isCheckoutInspection(task) && !parseInspectionResult(task.note)) {
      openInspect(task);
      return;
    }
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

  const now = dayjs();
  const isOverdue = (t: HotelHousekeepingTask) =>
    t.dueAt != null && (t.status === "open" || t.status === "in_progress") && dayjs(t.dueAt).isBefore(now);
  const overdueCount = tasks.filter(isOverdue).length;
  // Задача на уборку по номеру, который уже «Убрано»/«Проверено», — противоречие
  // (номер 201 «Убрано», а «После выезда» висит 12 дней). Показываем и даём
  // отменить по одной — статусом «Отменена», не «Выполнена»: уборку никто не
  // делал, и фильтр «Готово» со статистикой горничных не должны это считать.
  // Массово и автоматически при смене состояния номера такие задачи закрывает
  // бэкенд (одной транзакцией), не фронт пачкой PATCH-запросов.
  const isStale = (t: HotelHousekeepingTask) =>
    (t.status === "open" || t.status === "in_progress") &&
    (t.kind === "checkout" || t.kind === "stayover") &&
    (t.roomHousekeepingState === "clean" || t.roomHousekeepingState === "inspected");
  const staleTasks = tasks.filter(isStale);
  const cancelStale = async (task: HotelHousekeepingTask) => {
    setCancellingId(task.id);
    try {
      await updateHousekeepingTask(task.id, { status: "cancelled" });
      invalidateAfterChange(false);
      enqueueSnackbar(`Задача по номеру ${task.roomNumber} отменена`, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось отменить задачу"), { variant: "error" });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <HotelPage>
      <HotelPageHeader
        title="Уборка"
        subtitle={
          tasksQuery.isSuccess
            ? tasks.length === 0
              ? undefined
              : `${tasks.length} ${plural(tasks.length, "задача", "задачи", "задач")}` + (overdueCount > 0 ? ` · ${overdueCount} просрочено` : "")
            : undefined
        }
        info="Задачи горничным: после выезда, текущая уборка, проверка, обслуживание. Статус меняется кликом по нему; при закрытии задачи можно сразу поставить состояние номера."
        actions={
          <Button variant="contained" disableElevation startIcon={<AddOutlined />} onClick={openCreate}>
            Новая задача
          </Button>
        }
      />

      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Stack direction="row" gap={1} flexWrap="wrap">
          {STATUS_FILTERS.map((f) => (
            <FilterChip key={f.value} label={f.label} active={statusFilter === f.value} onClick={() => setStatusFilter(f.value)} />
          ))}
        </Stack>
        <FormControlLabel
          sx={{ mr: 0 }}
          control={<Switch size="small" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />}
          label={<Typography variant="body2">Только мои</Typography>}
        />
      </Stack>

      {staleTasks.length > 0 && (
        <Surface sx={{ py: 1.5, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 240 }}>
            <b>
              {staleTasks.length} {plural(staleTasks.length, "задача", "задачи", "задач")}
            </b>{" "}
            по уже убранным номерам ({staleTasks.map((t) => t.roomNumber).join(", ")}) — уборка не нужна. Отмените
            их в строке: задача получит статус «Отменена», а не «Готово».
          </Typography>
        </Surface>
      )}

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : propertyLoading || tasksQuery.isLoading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : tasksQuery.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(tasksQuery.error, "Не удалось загрузить задачи уборки")}
        </Alert>
      ) : tasks.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<CleaningServicesOutlined />}
            title={statusFilter === "open" ? "Открытых задач нет" : "Задач нет"}
            description={statusFilter === "open" ? "Все номера в порядке. Задачи после выезда появляются здесь автоматически." : "Попробуйте другой фильтр."}
            action={
              <Button variant="outlined" startIcon={<AddOutlined />} onClick={openCreate}>
                Создать задачу
              </Button>
            }
          />
        </Surface>
      ) : (
        <Surface padded={false} sx={{ overflow: "hidden" }}>
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={tableSx}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 2.5 }}>Номер</TableCell>
                  <TableCell>Задача</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Исполнитель</TableCell>
                  <TableCell>Срок</TableCell>
                  <TableCell>Заметка</TableCell>
                  <TableCell align="right" sx={{ pr: 2 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.map((task) => {
                  const overdue = isOverdue(task);
                  return (
                    <TableRow key={task.id}>
                      <TableCell sx={{ pl: 2.5 }}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Tooltip title={`Номер сейчас: ${HOTEL_ROOM_STATE_LABELS[task.roomHousekeepingState as keyof typeof HOTEL_ROOM_STATE_LABELS] ?? task.roomHousekeepingState}`}>
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: hotelRoomStateColor(task.roomHousekeepingState, theme) }} />
                          </Tooltip>
                          <Typography sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{task.roomNumber}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Box sx={{ color: "text.secondary", display: "flex" }}>{KIND_ICONS[task.kind]}</Box>
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {isCheckoutInspection(task) ? "Проверка перед выездом" : KIND_LABELS[task.kind]}
                            </Typography>
                            {isCheckoutInspection(task) &&
                              (() => {
                                const result = parseInspectionResult(task.note);
                                return result ? (
                                  <Typography variant="caption" color={result.ok ? "success.main" : "warning.main"} fontWeight={600}>
                                    {result.ok ? "✓ всё в порядке" : "⚠ есть замечания"}
                                  </Typography>
                                ) : null;
                              })()}
                            {isStale(task) && (
                              <Typography variant="caption" color="success.main" fontWeight={600}>
                                номер уже убран
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          color={statusColor(task.status, theme)}
                          label={STATUS_LABELS[task.status]}
                          endIcon={<ArrowDropDownOutlined sx={{ fontSize: 18, ml: -0.5, color: "text.secondary" }} />}
                          onClick={(e) => setStatusMenuAnchor({ el: e.currentTarget, task })}
                        />
                      </TableCell>
                      <TableCell>
                        {task.assignedToName ? (
                          <Stack direction="row" alignItems="center" gap={1}>
                            <Avatar sx={{ width: 26, height: 26, fontSize: 11, fontWeight: 700 }}>{initialsOf(task.assignedToName)}</Avatar>
                            <Typography variant="body2" noWrap>
                              {task.assignedToName}
                            </Typography>
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            Не назначен
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {task.dueAt ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", color: overdue ? "error.main" : "text.primary", fontWeight: overdue ? 600 : 400 }}>
                              {formatDue(task.dueAt)}
                            </Typography>
                            {overdue && (
                              <Typography variant="caption" color="error.main">
                                просрочено
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            Без срока
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 260 }}>
                        <Typography variant="body2" color="text.secondary" noWrap title={task.note}>
                          {task.note || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 2, whiteSpace: "nowrap" }}>
                        {isCheckoutInspection(task) && !parseInspectionResult(task.note) && (
                          <Button size="small" variant="contained" disableElevation onClick={() => openInspect(task)} sx={{ mr: 0.5 }}>
                            Проверила
                          </Button>
                        )}
                        {isStale(task) && (
                          <Button size="small" disabled={cancellingId != null} onClick={() => void cancelStale(task)} sx={{ mr: 0.5 }}>
                            {cancellingId === task.id ? "Отменяем…" : "Отменить"}
                          </Button>
                        )}
                        <Tooltip title="Изменить">
                          <IconButton size="small" onClick={() => openEdit(task)} aria-label={`Изменить задачу по номеру ${task.roomNumber}`}>
                            <EditOutlined sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Surface>
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

      <Dialog open={inspectTask !== null} onClose={() => !inspectSaving && setInspectTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Проверка номера {inspectTask?.roomNumber} перед выездом</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {inspectTask?.note.split("\n")[0].replace("Проверка перед выездом · ", "")}. Ответ сразу увидит ресепшен в карточке брони.
          </DialogContentText>
          <Stack direction="row" gap={1} sx={{ mb: 2 }}>
            <Button fullWidth variant={inspectOk ? "contained" : "outlined"} color="success" disableElevation onClick={() => setInspectOk(true)}>
              Всё в порядке
            </Button>
            <Button fullWidth variant={!inspectOk ? "contained" : "outlined"} color="warning" disableElevation onClick={() => setInspectOk(false)}>
              Есть замечания
            </Button>
          </Stack>
          {!inspectOk && (
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              label="Что не так"
              placeholder="Например: нет полотенца, выпита вода из мини-бара, пятно на ковре"
              value={inspectRemarks}
              onChange={(e) => setInspectRemarks(e.target.value.slice(0, 500))}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInspectTask(null)} disabled={inspectSaving}>
            Отмена
          </Button>
          <Button variant="contained" disableElevation disabled={inspectSaving || (!inspectOk && !inspectRemarks.trim())} onClick={() => void confirmInspect()}>
            Отправить на ресепшен
          </Button>
        </DialogActions>
      </Dialog>

      {/* Закрытие задачи — заодно предлагает поставить состояние номера. */}
      <Dialog open={doneTask !== null} onClose={() => setDoneTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Закрыть задачу — номер {doneTask?.roomNumber}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Можно сразу поставить состояние номера — как в чипе состояния номера.
          </DialogContentText>
          <TextField
            select
            label="Состояние номера"
            value={doneRoomState}
            onChange={(e) => setDoneRoomState(e.target.value)}
            slotProps={{ input: { startAdornment: <FieldIcon icon={<CleaningServicesOutlined />} /> } }}
            fullWidth
          >
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
                  slotProps={{ input: { startAdornment: <FieldIcon icon={<MeetingRoomOutlined />} /> } }}
                  required
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
                  slotProps={{ input: { startAdornment: <FieldIcon icon={<AssignmentOutlined />} /> } }}
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
              slotProps={{ input: { startAdornment: <FieldIcon icon={<PersonOutlineOutlined />} /> } }}
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
            <FormField
              icon={<NotesOutlined />}
              label="Заметка"
              value={form.note}
              onValueChange={(note) => setForm((f) => ({ ...f, note }))}
              rules={{ maxLength: 500 }}
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
    </HotelPage>
  );
};

export default HotelHousekeepingPage;
