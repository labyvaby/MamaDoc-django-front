import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Fab,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { motion, useMotionValue, useTransform } from "framer-motion";

import AddOutlined from "@mui/icons-material/AddOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import FiberNewOutlined from "@mui/icons-material/FiberNewOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import PriorityHighOutlined from "@mui/icons-material/PriorityHighOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import SwapVertOutlined from "@mui/icons-material/SwapVertOutlined";
import TableRowsOutlined from "@mui/icons-material/TableRowsOutlined";
import TodayOutlined from "@mui/icons-material/TodayOutlined";
import ViewKanbanOutlined from "@mui/icons-material/ViewKanbanOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import {
  AppButton,
  DateRangeField,
  DEFAULT_RANGE_PRESETS,
  PageHeader,
  UserAvatar,
  type DateRange,
  type DateRangePreset,
} from "../../components/ui";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { usePageTitle } from "../../hooks/usePageTitle";
import { PHOTO_ACCEPT } from "../../utility/imageCompression";
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useInvalidateTasks } from "../../hooks/useInvalidateTasks";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { subtleBg } from "../../theme/uiHelpers";
import {
  approveTask,
  completeTask,
  getMyTaskStats,
  getTaskCategories,
  getTasks,
  getTasksSummary,
  takeTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TasksFilters,
} from "../../api/tasks";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { TaskPriorityChip, TaskStatusChip } from "../../components/tasks/TaskChips";
import CreateTaskDrawer from "../../components/tasks/CreateTaskDrawer";
import TaskDetailDrawer from "../../components/tasks/TaskDetailDrawer";
import TaskNotificationsBell from "../../components/tasks/TaskNotificationsBell";
import {
  dueInfo,
  formatDateTime,
  relativeTime,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASKS_REFRESH_MS,
} from "./meta";
import TaskBoard from "./TaskBoard";

const PAGE_SIZE = 20;

type TasksTab = "board" | "mine" | "my-requests";
type TasksView = "board" | "table";
/** Быстрые пресеты по сроку поверх произвольного периода. */
type QuickDue = "" | "overdue" | "today" | "week";

const TABS: { id: TasksTab; label: string; icon: React.ElementType }[] = [
  { id: "board", label: "Доска", icon: DashboardOutlined },
  { id: "mine", label: "Мои задачи", icon: PersonOutlined },
  { id: "my-requests", label: "Мои заявки", icon: SendOutlined },
];

const VIEWS: { id: TasksView; label: string; icon: React.ElementType }[] = [
  { id: "board", label: "Канбан по статусам", icon: ViewKanbanOutlined },
  { id: "table", label: "Таблица", icon: TableRowsOutlined },
];

/** Неделя с понедельника независимо от глобальной локали dayjs. */
const startOfRuWeek = () => dayjs().locale("ru").startOf("week");

/** Пресеты фильтра по сроку — «вперёд-смотрящие», в отличие от дефолтных. */
const DUE_RANGE_PRESETS: DateRangePreset[] = [
  { key: "today", label: "Сегодня", range: () => [dayjs().startOf("day"), dayjs().endOf("day")] },
  { key: "week", label: "Эта неделя", range: () => [startOfRuWeek(), startOfRuWeek().endOf("week")] },
  {
    key: "next7",
    label: "Следующие 7 дней",
    range: () => [dayjs().startOf("day"), dayjs().add(6, "day").endOf("day")],
  },
  { key: "month", label: "Этот месяц", range: () => [dayjs().startOf("month"), dayjs().endOf("month")] },
];

/** Быстрое действие для задачи в списке (без открытия карточки). */
type RowAction = {
  key: "take" | "complete" | "approve";
  label: string;
  icon: React.ReactNode;
  fn: (taskId: number, organizationId?: number) => Promise<Task>;
};

/** Компактная плитка сводки (по образцу StatTile из «Броней»); кликом фильтрует. */
const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: "error" | "success";
  onClick?: () => void;
  active?: boolean;
}> = ({ icon, label, value, tone, onClick, active }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.25}
    component={onClick ? ButtonBase : "div"}
    {...(onClick ? { onClick, focusRipple: true } : {})}
    sx={(t) => ({
      px: 1.5,
      py: 1,
      borderRadius: "10px",
      border: 1,
      borderColor: active ? alpha(t.palette.primary.main, 0.5) : "divider",
      bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07) : subtleBg(t),
      minWidth: 130,
      textAlign: "left",
      transition: "border-color .15s ease, background-color .15s ease",
      ...(onClick && {
        cursor: "pointer",
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35) },
      }),
    })}
  >
    <Box
      sx={(t) => {
        const accent =
          tone === "error" ? t.palette.error : tone === "success" ? t.palette.success : t.palette.primary;
        return {
          width: 34,
          height: 34,
          borderRadius: "9px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tone ? (t.palette.mode === "dark" ? accent.light : accent.dark) : "primary.onSurface",
          bgcolor: alpha(accent.main, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 18 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={600} noWrap>
        {value}
      </Typography>
    </Box>
  </Stack>
);

/** Чип быстрого фильтра: включается/выключается кликом. */
const FilterChip: React.FC<{
  label: string;
  icon?: React.ReactElement;
  active: boolean;
  onClick: () => void;
  tone?: "error";
  tooltip?: string;
}> = ({ label, icon, active, onClick, tone, tooltip }) => {
  const chip = (
    <Chip
      icon={icon}
      label={label}
      size="small"
      clickable
      onClick={onClick}
      sx={(t) => {
        const accent = tone === "error" ? t.palette.error : t.palette.primary;
        const activeColor = t.palette.mode === "dark" ? accent.light : accent.dark;
        return {
          height: 30,
          borderRadius: "9px",
          fontWeight: 500,
          border: 1,
          borderColor: active ? alpha(accent.main, 0.45) : "divider",
          color: active ? activeColor : "text.secondary",
          bgcolor: active ? alpha(accent.main, t.palette.mode === "dark" ? 0.18 : 0.1) : "transparent",
          "& .MuiChip-icon": { color: "inherit", ml: 0.75 },
          "&:hover": {
            bgcolor: active
              ? alpha(accent.main, t.palette.mode === "dark" ? 0.24 : 0.14)
              : subtleBg(t, true),
            borderColor: alpha(accent.main, 0.35),
            color: active ? activeColor : "text.primary",
          },
        };
      }}
    />
  );
  return tooltip ? <Tooltip title={tooltip}>{chip}</Tooltip> : chip;
};

/** Мобильная карточка со свайпами: вправо — взять, влево — исполнить. */
const SwipeableTaskCard: React.FC<{
  task: Task;
  onOpen: () => void;
  takeAction: RowAction | null;
  completeAction: RowAction | null;
  onAction: (action: RowAction, taskId: number) => void;
  busy: boolean;
}> = ({ task, onOpen, takeAction, completeAction, onAction, busy }) => {
  const x = useMotionValue(0);
  const rightOpacity = useTransform(x, [0, 70], [0, 1]);
  const leftOpacity = useTransform(x, [-70, 0], [1, 0]);
  const due = dueInfo(task.dueDate, task.status);
  const canSwipeRight = takeAction != null && !busy;
  const canSwipeLeft = completeAction != null && !busy;

  return (
    <Box sx={{ position: "relative" }}>
      {/* Подсказки под карточкой */}
      {canSwipeRight && (
        <Box
          component={motion.div}
          style={{ opacity: rightOpacity }}
          sx={(t) => ({
            position: "absolute",
            inset: 0,
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            pl: 2,
            gap: 1,
            color: t.palette.mode === "dark" ? t.palette.success.light : t.palette.success.dark,
            bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14),
          })}
        >
          <PlayArrowOutlined sx={{ fontSize: 20 }} />
          <Typography variant="body2" fontWeight={600}>
            {takeAction?.label}
          </Typography>
        </Box>
      )}
      {canSwipeLeft && (
        <Box
          component={motion.div}
          style={{ opacity: leftOpacity }}
          sx={(t) => ({
            position: "absolute",
            inset: 0,
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            pr: 2,
            gap: 1,
            color: t.palette.mode === "dark" ? t.palette.info.light : t.palette.info.dark,
            bgcolor: alpha(t.palette.info.main, t.palette.mode === "dark" ? 0.2 : 0.14),
          })}
        >
          <Typography variant="body2" fontWeight={600}>
            {completeAction?.label}
          </Typography>
          <CheckOutlined sx={{ fontSize: 20 }} />
        </Box>
      )}

      <Box
        component={motion.div}
        drag={canSwipeRight || canSwipeLeft ? "x" : false}
        dragConstraints={{ left: canSwipeLeft ? -120 : 0, right: canSwipeRight ? 120 : 0 }}
        dragElastic={0.15}
        dragSnapToOrigin
        style={{ x }}
        onDragEnd={(_, info) => {
          if (canSwipeRight && info.offset.x > 90 && takeAction) onAction(takeAction, task.id);
          else if (canSwipeLeft && info.offset.x < -90 && completeAction) onAction(completeAction, task.id);
        }}
      >
        <ButtonBase
          focusRipple
          onClick={onOpen}
          sx={(th) => ({
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            textAlign: "left",
            p: 1.25,
            borderRadius: "14px",
            border: 1,
            borderColor: "divider",
            bgcolor: due?.overdue
              ? alpha(th.palette.error.main, th.palette.mode === "dark" ? 0.08 : 0.05)
              : "background.paper",
            "&:hover": { borderColor: alpha(th.palette.primary.main, 0.28) },
          })}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {task.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {task.categoryName}
              {task.assigneeName ? ` · ${task.assigneeName}` : " · не назначена"}
            </Typography>
            <Stack direction="row" gap={0.75} alignItems="baseline" flexWrap="wrap">
              {due && (
                <Typography
                  variant="caption"
                  sx={{
                    color: due.overdue ? "error.main" : due.today || due.soon ? "warning.main" : "text.secondary",
                    fontWeight: due.overdue || due.today || due.soon ? 600 : 400,
                  }}
                >
                  {due.text}
                </Typography>
              )}
              <Typography variant="caption" color="text.disabled">
                {relativeTime(task.createdAt)}
              </Typography>
            </Stack>
          </Box>
          <Stack alignItems="flex-end" gap={0.5} sx={{ flexShrink: 0 }}>
            <TaskStatusChip status={task.status} />
            <TaskPriorityChip priority={task.priority} />
          </Stack>
        </ButtonBase>
      </Box>
    </Box>
  );
};

const TasksPage: React.FC = () => {
  usePageTitle("Задачи");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { can, loading: permLoading } = useCanChecker();
  const { activeEmployee } = usePermissions();
  const orgId = useApiOrgId();
  const invalidateTasks = useInvalidateTasks();

  const canList = can("tasks.list");
  const canCreate = can("tasks.create");
  const canUpdate = can("tasks.update");
  const canManage = can("tasks.manage");

  const meEmployeeId: number | null =
    (activeEmployee as { id?: number } | null | undefined)?.id ?? null;

  // ── Состояние ──
  const [tab, setTab] = React.useState<TasksTab>(() => {
    const saved = sessionStorage.getItem("tasks-tab");
    return (saved as TasksTab) ?? "board";
  });
  /** Вид доски: канбан по статусам или таблица (на мобиле всегда список). */
  const [view, setView] = React.useState<TasksView>(
    () => (sessionStorage.getItem("tasks-view") as TasksView) ?? "board",
  );
  const [status, setStatus] = React.useState<TaskStatus | "">("");
  const [categoryId, setCategoryId] = React.useState<number | "">("");
  const [priority, setPriority] = React.useState<TaskPriority | "">("");
  /** Быстрый фильтр по сроку: перекрывает произвольный период. */
  const [quickDue, setQuickDue] = React.useState<QuickDue>("");
  /** Опциональные период-фильтры: null — выключен (задачи без срока не скрываются). */
  const [dueRange, setDueRange] = React.useState<DateRange | null>(null);
  const [createdRange, setCreatedRange] = React.useState<DateRange | null>(null);
  const [ordering, setOrdering] = React.useState<"smart" | "created">("smart");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [cameraFile, setCameraFile] = React.useState<File | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const handleTabChange = (t: TasksTab) => {
    setTab(t);
    sessionStorage.setItem("tasks-tab", t);
  };

  const handleViewChange = (v: TasksView) => {
    setView(v);
    sessionStorage.setItem("tasks-view", v);
    // На канбане статус задаёт колонка — держать его ещё и в фильтрах незачем.
    if (v === "board") setStatus("");
  };

  /** Быстрый фильтр по сроку — переключатель: повторный клик снимает. */
  const toggleQuickDue = (q: QuickDue) => {
    setQuickDue((prev) => (prev === q ? "" : q));
    setDueRange(null);
  };

  /** Клик по плитке сводки фильтрует список по этому статусу. */
  const toggleStatus = (s: TaskStatus) => {
    setStatus((prev) => (prev === s ? "" : s));
    if (quickDue === "overdue") setQuickDue("");
  };

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(0);
  }, [tab, status, categoryId, priority, search, dueRange, createdRange, quickDue, ordering]);

  /** Быстрый пресет разворачивается в те же dueFrom/dueTo, что и период. */
  const quickDueRange = React.useMemo((): { from?: string; to?: string } => {
    const fmt = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");
    switch (quickDue) {
      // Просрочка = срок раньше сегодняшнего дня. Серверного `overdue` в
      // контракте нет, поэтому в выборку попадают и закрытые задачи со старым
      // сроком — их видно по статусу (запрошен параметр, см. тикет due_time).
      case "overdue":
        return { to: fmt(dayjs().subtract(1, "day")) };
      case "today":
        return { from: fmt(dayjs()), to: fmt(dayjs()) };
      case "week":
        return { from: fmt(startOfRuWeek()), to: fmt(startOfRuWeek().endOf("week")) };
      default:
        return {};
    }
  }, [quickDue]);

  const filters: TasksFilters = {
    status: status === "" ? undefined : status,
    categoryId: categoryId === "" ? undefined : categoryId,
    priority: priority === "" ? undefined : priority,
    assignee: tab === "mine" ? "me" : undefined,
    author: tab === "my-requests" ? "me" : undefined,
    search: search || undefined,
    dueFrom: quickDue ? quickDueRange.from : dueRange ? dueRange.from.format("YYYY-MM-DD") : undefined,
    dueTo: quickDue ? quickDueRange.to : dueRange ? dueRange.to.format("YYYY-MM-DD") : undefined,
    // Дата подачи имеет смысл только для «Моих заявок».
    createdFrom: tab === "my-requests" && createdRange ? createdRange.from.format("YYYY-MM-DD") : undefined,
    createdTo: tab === "my-requests" && createdRange ? createdRange.to.format("YYYY-MM-DD") : undefined,
    ordering,
    organizationId: orgId,
  };

  /** Канбан сам грузит колонки по статусам — общий список ему не нужен. */
  const boardMode = tab === "board" && view === "board" && !isMobile;

  const enabled = !permLoading && canList;

  const query = useQuery({
    queryKey: djangoQueryKeys.tasks.list({ ...filters, tab, page: page + 1 }),
    queryFn: ({ signal }) => getTasks({ ...filters, page: page + 1, pageSize: PAGE_SIZE }, signal),
    enabled: enabled && !boardMode,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    // Задачи разбирают несколько человек одновременно — держим список живым,
    // иначе кнопки действий бьют в уже изменившийся статус.
    refetchInterval: TASKS_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const categoriesQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.categories,
    queryFn: ({ signal }) => getTaskCategories(orgId, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.summary(orgId),
    queryFn: ({ signal }) => getTasksSummary(orgId, signal),
    enabled: enabled && tab === "board",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: TASKS_REFRESH_MS,
  });

  const myStatsQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.myStats(orgId),
    queryFn: ({ signal }) => getMyTaskStats(orgId, signal),
    enabled: enabled && tab === "mine",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  // ── Быстрые действия из списка ──
  const rowMutation = useMutation({
    mutationFn: ({ action, taskId }: { action: RowAction; taskId: number }) =>
      action.fn(taskId, orgId),
    onSuccess: invalidateTasks,
    onError: (e) => {
      const raw = e instanceof Error ? e.message : "";
      // Частая причина отказа — грид показывал устаревший статус (задачу уже
      // перевели в другой статус в другой вкладке/сессии или поллером). Бэк
      // отвечает вроде «status: Завершить можно только задачу в работе».
      // Подтягиваем актуальные данные, чтобы кнопки действий соответствовали
      // реальному состоянию и повторный клик не бил в ту же ошибку.
      const isStatusConflict = /status|в работе|статус/i.test(raw);
      setActionError(
        isStatusConflict
          ? "Статус задачи изменился (возможно, её уже завершили). Список обновлён — проверьте доступные действия."
          : raw || "Не удалось выполнить действие",
      );
      invalidateTasks();
    },
  });

  const runAction = (action: RowAction, taskId: number) => rowMutation.mutate({ action, taskId });

  /** «Взять/Возобновить» — доступно для new/paused (свободная / моя / manage). */
  const getTakeAction = React.useCallback(
    (t: Task): RowAction | null => {
      const canWork = canUpdate || canManage;
      const mineOrFree = t.assigneeId == null || t.assigneeId === meEmployeeId || canManage;
      if ((t.status === "new" || t.status === "paused") && canWork && mineOrFree) {
        return {
          key: "take",
          label: t.status === "paused" ? "Возобновить" : "Взять",
          icon: <PlayArrowOutlined sx={{ fontSize: 18 }} />,
          fn: takeTask,
        };
      }
      return null;
    },
    [canUpdate, canManage, meEmployeeId],
  );

  /** «Исполнить» — in_progress моя (или manage); «Подтвердить» — awaiting + manage. */
  const getCompleteAction = React.useCallback(
    (t: Task): RowAction | null => {
      if (t.status === "in_progress" && (t.assigneeId === meEmployeeId || canManage)) {
        return {
          key: "complete",
          label: "Исполнить",
          icon: <CheckOutlined sx={{ fontSize: 18 }} />,
          fn: completeTask,
        };
      }
      if (t.status === "awaiting_approval" && canManage) {
        return {
          key: "approve",
          label: "Подтвердить",
          icon: <DoneAllOutlined sx={{ fontSize: 18 }} />,
          fn: approveTask,
        };
      }
      return null;
    },
    [canManage, meEmployeeId],
  );

  const hasActiveFilters =
    status !== "" ||
    categoryId !== "" ||
    priority !== "" ||
    search !== "" ||
    quickDue !== "" ||
    dueRange != null ||
    createdRange != null;

  const handleResetFilters = () => {
    setStatus("");
    setCategoryId("");
    setPriority("");
    setSearchInput("");
    setQuickDue("");
    setDueRange(null);
    setCreatedRange(null);
  };

  const columns = React.useMemo<GridColDef<Task>[]>(
    () => [
      {
        field: "title",
        headerName: "Задача",
        flex: 1,
        minWidth: 220,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0, lineHeight: 1.25, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {row.title}
            </Typography>
            <Tooltip title={`Создана ${formatDateTime(row.createdAt)}`} placement="bottom-start">
              <Typography variant="caption" color="text.secondary" noWrap>
                {row.categoryName} · {relativeTime(row.createdAt)}
              </Typography>
            </Tooltip>
          </Box>
        ),
      },
      {
        field: "priority",
        headerName: "Приоритет",
        width: 115,
        sortable: false,
        renderCell: ({ row }) => <TaskPriorityChip priority={row.priority} />,
      },
      {
        field: "dueDate",
        headerName: "Срок",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => {
          const due = dueInfo(row.dueDate, row.status);
          if (!due) {
            return (
              <Typography variant="body2" color="text.disabled">
                —
              </Typography>
            );
          }
          return (
            <Tooltip title={`Срок: ${due.exact}`}>
              <Typography
                variant="body2"
                sx={{
                  color: due.overdue ? "error.main" : due.today || due.soon ? "warning.main" : undefined,
                  fontWeight: due.overdue || due.today || due.soon ? 600 : 400,
                }}
              >
                {due.text}
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        field: "assigneeName",
        headerName: "Исполнитель",
        width: 190,
        sortable: false,
        renderCell: ({ row }) =>
          row.assigneeName ? (
            <Stack direction="row" alignItems="center" gap={1} sx={{ height: "100%", minWidth: 0 }}>
              <UserAvatar name={row.assigneeName} size={28} sx={{ borderRadius: "8px", flexShrink: 0 }} />
              <Typography variant="body2" noWrap>
                {row.assigneeName}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.disabled">
              Не назначен
            </Typography>
          ),
      },
      {
        field: "status",
        headerName: "Статус",
        width: 165,
        sortable: false,
        renderCell: ({ row }) => <TaskStatusChip status={row.status} />,
      },
      {
        field: "actions",
        headerName: "",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => {
          const action = getTakeAction(row) ?? getCompleteAction(row);
          if (!action) return null;
          return (
            <Button
              size="small"
              variant="outlined"
              startIcon={action.icon}
              disabled={rowMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                runAction(action, row.id);
              }}
              sx={{ textTransform: "none", borderRadius: "8px" }}
            >
              {action.label}
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTakeAction, getCompleteAction, rowMutation.isPending],
  );

  if (!permLoading && !canList) return <AccessDenied />;

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const summary = summaryQuery.data;
  const myStats = myStatsQuery.data;

  const NoRowsOverlay = () => (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", opacity: 0.75 }}>
      <AssignmentOutlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {tab === "mine"
          ? "У вас нет назначенных задач"
          : tab === "my-requests"
          ? "Вы ещё не подавали заявок"
          : "Задач не найдено"}
      </Typography>
      {hasActiveFilters ? (
        <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
          Сбросить фильтры
        </Button>
      ) : (
        canCreate && (
          <Button size="small" onClick={() => setCreateOpen(true)} sx={{ textTransform: "none" }}>
            Подать первую заявку
          </Button>
        )
      )}
    </Stack>
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Задачи"
        showTitle={false}
        showSearch
        searchVal={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Название задачи"
        loading={query.isFetching}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          px: theme.appLayout.page.paddingX,
          pb: 2,
        }}
      >
        {/* ── Вкладки + кнопка создания ── */}
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ mt: 2, mb: 1.5 }}>
          {/* Сегмент-табы (тумблер) по гайду §5.7 */}
          <Stack
            direction="row"
            sx={{
              p: 0.5,
              gap: 0.25,
              border: 1,
              borderColor: "divider",
              borderRadius: "10px",
              bgcolor: "background.paper",
            }}
          >
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <ButtonBase
                  key={id}
                  onClick={() => handleTabChange(id)}
                  sx={{
                    position: "relative",
                    px: 1.5,
                    py: 0.75,
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
                      layoutId="tasks-tab-bg"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      sx={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "7px",
                        bgcolor: "primary.main",
                      }}
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

          <Box sx={{ flex: 1 }} />

          {/* ── Сводка: доска — по группе, мои — личный счётчик ── */}
          {tab === "board" && summary && !isMobile && (
            <Stack direction="row" gap={1} flexWrap="wrap">
              <StatTile
                icon={<FiberNewOutlined />}
                label="Новые"
                value={summary.new}
                onClick={boardMode ? undefined : () => toggleStatus("new")}
                active={status === "new"}
              />
              <StatTile
                icon={<HourglassEmptyOutlined />}
                label="В работе"
                value={summary.inProgress}
                onClick={boardMode ? undefined : () => toggleStatus("in_progress")}
                active={status === "in_progress"}
              />
              {canManage && summary.awaitingApproval > 0 && (
                <StatTile
                  icon={<DoneAllOutlined />}
                  label="Ждут подтверждения"
                  value={summary.awaitingApproval}
                  onClick={boardMode ? undefined : () => toggleStatus("awaiting_approval")}
                  active={status === "awaiting_approval"}
                />
              )}
              {summary.overdue > 0 && (
                <StatTile
                  icon={<WarningAmberOutlined />}
                  label="Просрочено"
                  value={summary.overdue}
                  tone="error"
                  onClick={() => toggleQuickDue("overdue")}
                  active={quickDue === "overdue"}
                />
              )}
            </Stack>
          )}
          {tab === "mine" && myStats && !isMobile && (
            <StatTile
              icon={<EmojiEventsOutlined />}
              label="Исполнено за неделю"
              value={myStats.doneLast7Days}
              tone="success"
            />
          )}

          {/* Вид доски: канбан ↔ таблица */}
          {tab === "board" && !isMobile && (
            <Stack
              direction="row"
              sx={{ p: 0.4, gap: 0.25, border: 1, borderColor: "divider", borderRadius: "10px" }}
            >
              {VIEWS.map(({ id, label, icon: Icon }) => (
                <Tooltip key={id} title={label}>
                  <IconButton
                    size="small"
                    aria-label={label}
                    onClick={() => handleViewChange(id)}
                    sx={(t) => ({
                      borderRadius: "7px",
                      color: view === id ? "primary.onSurface" : "text.secondary",
                      bgcolor:
                        view === id
                          ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1)
                          : "transparent",
                    })}
                  >
                    <Icon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              ))}
            </Stack>
          )}

          <TaskNotificationsBell onOpenTask={(taskId) => setSelectedId(taskId)} />

          {canCreate && !isMobile && (
            <AppButton variant="contained" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)}>
              Новая заявка
            </AppButton>
          )}
        </Stack>

        {/* ── Быстрые фильтры ── */}
        <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" sx={{ mb: 1.25 }}>
          <FilterChip
            label="Просрочено"
            icon={<WarningAmberOutlined sx={{ fontSize: 15 }} />}
            tone="error"
            active={quickDue === "overdue"}
            onClick={() => toggleQuickDue("overdue")}
            tooltip="Срок раньше сегодняшнего дня"
          />
          <FilterChip
            label="На сегодня"
            icon={<TodayOutlined sx={{ fontSize: 15 }} />}
            active={quickDue === "today"}
            onClick={() => toggleQuickDue("today")}
          />
          <FilterChip
            label="Эта неделя"
            icon={<CalendarMonthOutlined sx={{ fontSize: 15 }} />}
            active={quickDue === "week"}
            onClick={() => toggleQuickDue("week")}
          />
          <FilterChip
            label="Срочные"
            icon={<PriorityHighOutlined sx={{ fontSize: 15 }} />}
            tone="error"
            active={priority === "urgent"}
            onClick={() => setPriority((p) => (p === "urgent" ? "" : "urgent"))}
          />
          {!boardMode && (
            <FilterChip
              label="В работе"
              icon={<PlayArrowOutlined sx={{ fontSize: 15 }} />}
              active={status === "in_progress"}
              onClick={() => toggleStatus("in_progress")}
              tooltip="Только задачи в работе"
            />
          )}

          <Box sx={{ flex: 1 }} />

          {/* Сортировка: серверный ordering (smart | created) */}
          <Tooltip
            title={
              ordering === "smart"
                ? "Сначала просроченные и срочные, затем по сроку"
                : "Сначала недавно созданные"
            }
          >
            <Button
              size="small"
              variant="outlined"
              startIcon={<SwapVertOutlined sx={{ fontSize: 17 }} />}
              onClick={() => setOrdering((o) => (o === "smart" ? "created" : "smart"))}
              sx={(t) => ({
                textTransform: "none",
                borderRadius: "10px",
                color: "text.secondary",
                borderColor: "divider",
                flexShrink: 0,
                "&:hover": {
                  color: "text.primary",
                  bgcolor: subtleBg(t, true),
                  borderColor: alpha(t.palette.primary.main, 0.35),
                },
              })}
            >
              {ordering === "smart" ? "Умная сортировка" : "Сначала новые"}
            </Button>
          </Tooltip>
        </Stack>

        {/* ── Фильтры ── */}
        <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          {/* На канбане статус — это колонка, отдельный селект только запутывает. */}
          {!boardMode && (
            <TextField
              select
              size="small"
              label="Статус"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus | "")}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">Все статусы</MenuItem>
              {TASK_STATUS_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            select
            size="small"
            label="Категория"
            value={categoryId === "" ? "" : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">Все категории</MenuItem>
            {(categoriesQuery.data ?? []).map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Приоритет"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">Любой</MenuItem>
            {TASK_PRIORITY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Срок: опционально, чтобы не скрывать задачи без due_date */}
          {dueRange ? (
            <Stack direction="row" alignItems="center" gap={0.25}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Срок:
              </Typography>
              <DateRangeField
                value={dueRange}
                onChange={(r) => setDueRange(r)}
                presets={DUE_RANGE_PRESETS}
                minWidth={200}
              />
              <IconButton size="small" aria-label="Убрать фильтр по сроку" onClick={() => setDueRange(null)}>
                <CloseOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<CalendarMonthOutlined sx={{ fontSize: 17 }} />}
              onClick={() => setDueRange({ from: startOfRuWeek(), to: startOfRuWeek().endOf("week") })}
              sx={(t) => ({
                textTransform: "none",
                borderRadius: "10px",
                color: "text.secondary",
                borderColor: "divider",
                flexShrink: 0,
                "&:hover": {
                  color: "text.primary",
                  bgcolor: subtleBg(t, true),
                  borderColor: alpha(t.palette.primary.main, 0.35),
                },
              })}
            >
              Срок
            </Button>
          )}

          {/* Дата подачи — только в «Моих заявках» */}
          {tab === "my-requests" &&
            (createdRange ? (
              <Stack direction="row" alignItems="center" gap={0.25}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                  Подана:
                </Typography>
                <DateRangeField
                  value={createdRange}
                  onChange={(r) => setCreatedRange(r)}
                  presets={DEFAULT_RANGE_PRESETS}
                  minWidth={200}
                />
                <IconButton size="small" aria-label="Убрать фильтр по дате подачи" onClick={() => setCreatedRange(null)}>
                  <CloseOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<CalendarMonthOutlined sx={{ fontSize: 17 }} />}
                onClick={() =>
                  setCreatedRange({ from: dayjs().subtract(29, "day").startOf("day"), to: dayjs().endOf("day") })
                }
                sx={(t) => ({
                  textTransform: "none",
                  borderRadius: "10px",
                  color: "text.secondary",
                  borderColor: "divider",
                  flexShrink: 0,
                  "&:hover": {
                    color: "text.primary",
                    bgcolor: subtleBg(t, true),
                    borderColor: alpha(t.palette.primary.main, 0.35),
                  },
                })}
              >
                Дата подачи
              </Button>
            ))}

          {hasActiveFilters && (
            <Button
              size="small"
              onClick={handleResetFilters}
              startIcon={<CloseOutlined fontSize="small" />}
              sx={{ textTransform: "none", flexShrink: 0 }}
            >
              Сбросить
            </Button>
          )}
        </Stack>

        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1.5 }}>
            {actionError}
          </Alert>
        )}

        {/* ── Список ── */}
        {query.error ? (
          <Alert severity="error">
            {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
          </Alert>
        ) : boardMode ? (
          <TaskBoard
            filters={filters}
            orgId={orgId}
            enabled={enabled}
            onOpenTask={setSelectedId}
            onError={setActionError}
            canManage={canManage}
            canUpdate={canUpdate}
            meEmployeeId={meEmployeeId}
          />
        ) : isMobile ? (
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 10 }}>
            {query.isLoading ? (
              <Stack spacing={1}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={76} />
                ))}
              </Stack>
            ) : rows.length === 0 ? (
              <Stack alignItems="center" sx={{ py: 6, opacity: 0.75 }}>
                <AssignmentOutlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {tab === "mine"
                    ? "У вас нет назначенных задач"
                    : tab === "my-requests"
                    ? "Вы ещё не подавали заявок"
                    : "Задач не найдено"}
                </Typography>
                {hasActiveFilters ? (
                  <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
                    Сбросить фильтры
                  </Button>
                ) : (
                  canCreate && (
                    <Button size="small" onClick={() => setCreateOpen(true)} sx={{ textTransform: "none" }}>
                      Подать первую заявку
                    </Button>
                  )
                )}
              </Stack>
            ) : (
              <Stack spacing={1}>
                {rows.map((t) => (
                  <SwipeableTaskCard
                    key={t.id}
                    task={t}
                    onOpen={() => setSelectedId(t.id)}
                    takeAction={getTakeAction(t)}
                    completeAction={getCompleteAction(t)}
                    onAction={runAction}
                    busy={rowMutation.isPending}
                  />
                ))}

                {total > PAGE_SIZE && (
                  <Stack direction="row" alignItems="center" justifyContent="center" gap={1} sx={{ pt: 0.5 }}>
                    <IconButton
                      size="small"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeftOutlined fontSize="small" />
                    </IconButton>
                    <Typography variant="caption" color="text.secondary">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
                    </Typography>
                    <IconButton
                      size="small"
                      disabled={(page + 1) * PAGE_SIZE >= total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRightOutlined fontSize="small" />
                    </IconButton>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 360 }}>
            <DataGrid<Task>
              rows={rows}
              columns={columns}
              loading={query.isLoading}
              rowCount={total}
              paginationMode="server"
              paginationModel={{ page, pageSize: PAGE_SIZE }}
              onPaginationModelChange={(m) => setPage(m.page)}
              pageSizeOptions={[PAGE_SIZE]}
              disableColumnMenu
              disableRowSelectionOnClick
              /* Не density="comfortable": тема глобально зажимает
                 .MuiDataGrid-columnHeaders до headerRowHeight (52px), а comfortable
                 раздувает ячейки шапки до 72px — они вылезали из контейнера и
                 закрашивали верх первой строки. Задаём высоты явно. */
              rowHeight={64}
              columnHeaderHeight={theme.appLayout.table.headerRowHeight}
              onRowClick={(p) => setSelectedId(p.row.id)}
              getRowClassName={(p) =>
                dueInfo(p.row.dueDate, p.row.status)?.overdue ? "row-overdue" : ""
              }
              slots={{ noRowsOverlay: NoRowsOverlay }}
              localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
              sx={(t) => ({
                bgcolor: "background.paper",
                borderRadius: "14px",
                "& .MuiDataGrid-row": { cursor: "pointer" },
                "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
                // v7 центрирует контент ячейки line-height'ом — голая Typography
                // из renderCell прилипает к верху строки. Центрируем флексом.
                "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
                // Chrome scroll anchoring после подмены skeleton→строки утаскивал
                // скроллер вниз на высоту шапки — первая строка пряталась под ней.
                "& .MuiDataGrid-virtualScroller": { overflowAnchor: "none" },
                "& .row-overdue": {
                  bgcolor: alpha(t.palette.error.main, t.palette.mode === "dark" ? 0.08 : 0.05),
                  "&:hover": {
                    bgcolor: alpha(t.palette.error.main, t.palette.mode === "dark" ? 0.12 : 0.08),
                  },
                },
              })}
            />
          </Box>
        )}
      </Box>

      {/* ── Мобильный FAB: камера + новая заявка ── */}
      {isMobile && canCreate && (
        <>
          <input
            ref={cameraInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (f) {
                setCameraFile(f);
                setCreateOpen(true);
              }
            }}
          />
          <Stack sx={{ position: "fixed", right: 16, bottom: 84, gap: 1.25, zIndex: (t) => t.zIndex.fab }}>
            <Tooltip title="Сфотографировать и подать заявку" placement="left">
              <Fab
                size="medium"
                onClick={() => cameraInputRef.current?.click()}
                sx={(t) => ({
                  boxShadow: "none",
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  color: "primary.onSurface",
                  "&:hover": { bgcolor: subtleBg(t, true) },
                })}
              >
                <PhotoCameraOutlined />
              </Fab>
            </Tooltip>
            <Fab
              color="primary"
              onClick={() => setCreateOpen(true)}
              sx={{ boxShadow: "none" }}
              aria-label="Новая заявка"
            >
              <AddOutlined />
            </Fab>
          </Stack>
        </>
      )}

      <CreateTaskDrawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCameraFile(null);
        }}
        canManage={canManage}
        initialFile={cameraFile}
      />

      <TaskDetailDrawer
        taskId={selectedId}
        onClose={() => setSelectedId(null)}
        canManage={canManage}
        canUpdate={canUpdate}
        meEmployeeId={meEmployeeId}
      />
    </Box>
  );
};

export default TasksPage;
