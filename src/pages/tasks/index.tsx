import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { motion, useMotionValue, useTransform } from "framer-motion";

import AddOutlined from "@mui/icons-material/AddOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import PriorityHighOutlined from "@mui/icons-material/PriorityHighOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import SwapVertOutlined from "@mui/icons-material/SwapVertOutlined";
import TableRowsOutlined from "@mui/icons-material/TableRowsOutlined";
import TodayOutlined from "@mui/icons-material/TodayOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
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
  deleteTask,
  getMyTaskStats,
  getTaskCategories,
  getTasks,
  getTasksSummary,
  takeTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TasksFilters,
  type TasksResponse,
} from "../../api/tasks";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { TaskPriorityChip, TaskPriorityDot, TaskStatusChip } from "../../components/tasks/TaskChips";
import CreateTaskDrawer from "../../components/tasks/CreateTaskDrawer";
import TaskDetailDrawer from "../../components/tasks/TaskDetailDrawer";
import TaskNotificationsBell from "../../components/tasks/TaskNotificationsBell";
import {
  dueInfo,
  formatDateTime,
  relativeTime,
  TASK_ARCHIVE_STATUSES,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASKS_DELETE_ENABLED,
  TASKS_REFRESH_MS,
} from "./meta";
import TaskBoard from "./TaskBoard";

const PAGE_SIZE = 20;

type TasksTab = "board" | "mine" | "my-requests" | "archive";
type TasksView = "board" | "table";
/** Быстрые пресеты по сроку поверх произвольного периода. */
type QuickDue = "" | "overdue" | "today" | "week";
/** Что показывать в архиве: обе закрытые группы или одну из них. */
type ArchiveStatus = "all" | "done" | "cancelled";

const TABS: { id: TasksTab; label: string; icon: React.ElementType }[] = [
  { id: "board", label: "Доска", icon: DashboardOutlined },
  { id: "mine", label: "Мои задачи", icon: PersonOutlined },
  { id: "my-requests", label: "Мои заявки", icon: SendOutlined },
  { id: "archive", label: "Архив", icon: Inventory2Outlined },
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

/**
 * Показатель сводки: число и подпись без рамки и подложки. Плитки с иконками
 * по весу спорили с вкладками — а сводка здесь второстепенна, читается «между
 * делом». Кликом фильтрует, если передан onClick.
 */
const StatItem: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: "error" | "success";
  onClick?: () => void;
  active?: boolean;
}> = ({ label, value, tone, onClick, active }) => (
  <Stack
    direction="row"
    alignItems="baseline"
    gap={0.75}
    component={onClick ? ButtonBase : "div"}
    {...(onClick ? { onClick, focusRipple: true } : {})}
    sx={(t) => ({
      px: 1,
      py: 0.5,
      borderRadius: "8px",
      textAlign: "left",
      transition: "background-color .15s ease",
      ...(onClick && {
        cursor: "pointer",
        bgcolor: active ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08) : "transparent",
        "&:hover": { bgcolor: active ? alpha(t.palette.primary.main, 0.2) : subtleBg(t, true) },
      }),
    })}
  >
    <Typography
      variant="subtitle2"
      fontWeight={600}
      sx={(t) => ({
        lineHeight: 1.2,
        color:
          tone === "error"
            ? t.palette.mode === "dark"
              ? t.palette.error.light
              : t.palette.error.dark
            : tone === "success"
            ? t.palette.mode === "dark"
              ? t.palette.success.light
              : t.palette.success.dark
            : "text.primary",
      })}
    >
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary" noWrap>
      {label}
    </Typography>
  </Stack>
);

/** Лента показателей: одинаковая на всех вкладках, разделители вместо рамок. */
const StatStrip: React.FC<React.PropsWithChildren> = ({ children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ rowGap: 0.5 }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <Divider orientation="vertical" flexItem sx={{ mx: 0.75, height: 16, alignSelf: "center" }} />
          )}
          {item}
        </React.Fragment>
      ))}
    </Stack>
  );
};

/**
 * Единая геометрия элементов ряда фильтров: чипы, селекты-пилюли, поля периода
 * и кнопки сортировки имеют одну высоту и радиус, поэтому ряд читается как одна
 * линия, а не как случайный набор контролов разного размера.
 */
const FILTER_PILL_HEIGHT = 30;

const pillSx = (t: Theme, active = false, tone?: "error") => {
  const accent = tone === "error" ? t.palette.error : t.palette.primary;
  const activeColor = t.palette.mode === "dark" ? accent.light : accent.dark;
  return {
    height: FILTER_PILL_HEIGHT,
    px: 1.25,
    borderRadius: "9px",
    border: 1,
    borderColor: active ? alpha(accent.main, 0.45) : "divider",
    bgcolor: active ? alpha(accent.main, t.palette.mode === "dark" ? 0.18 : 0.1) : "transparent",
    color: active ? activeColor : "text.secondary",
    fontSize: "0.8125rem",
    fontWeight: 500,
    textTransform: "none" as const,
    flexShrink: 0,
    transition: "border-color .15s ease, background-color .15s ease, color .15s ease",
    "&:hover": {
      bgcolor: active
        ? alpha(accent.main, t.palette.mode === "dark" ? 0.24 : 0.14)
        : subtleBg(t, true),
      borderColor: alpha(accent.main, 0.35),
      color: active ? activeColor : "text.primary",
    },
  };
};

/**
 * Селект-пилюля с выпадающим меню — замена TextField(select) в ряду фильтров.
 * Пока значение не выбрано, показывает название фильтра; после выбора —
 * «Название: значение», чтобы по ряду было видно, что именно включено.
 */
const FilterPill: React.FC<{
  label: string;
  icon: React.ReactElement;
  value: string;
  options: { value: string; label: string }[];
  allLabel: string;
  onChange: (value: string) => void;
}> = ({ label, icon, value, options, allLabel, onChange }) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const active = value !== "";
  const selected = options.find((o) => o.value === value);

  const pick = (next: string) => {
    onChange(next);
    setAnchorEl(null);
  };

  return (
    <>
      <ButtonBase
        focusRipple
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={(t) => ({
          ...pillSx(t, active),
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          maxWidth: 240,
          ...(open ? { borderColor: alpha(t.palette.primary.main, 0.45) } : null),
        })}
      >
        {React.cloneElement(icon, { sx: { fontSize: 15, color: "inherit" } })}
        <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active && selected ? `${label}: ${selected.label}` : label}
        </Box>
        <ExpandMoreOutlined
          sx={{
            fontSize: 15,
            color: "inherit",
            transition: "transform .15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: "12px", minWidth: 200 } } }}
      >
        <MenuItem selected={!active} onClick={() => pick("")} sx={{ fontSize: "0.875rem" }}>
          {allLabel}
        </MenuItem>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            onClick={() => pick(o.value)}
            sx={{ fontSize: "0.875rem" }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

/**
 * Свёртка редко используемых фильтров на узком экране. Ряд фильтров ценен тем,
 * что читается одной линией; при переносе на вторую строку он теряет смысл,
 * поэтому на экранах уже lg лишние контролы уезжают под эту кнопку.
 */
const MoreFilters: React.FC<React.PropsWithChildren<{ activeCount: number }>> = ({
  activeCount,
  children,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <ButtonBase
        focusRipple
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={(t) => ({
          ...pillSx(t, activeCount > 0),
          display: "flex",
          alignItems: "center",
          gap: 0.75,
        })}
      >
        <TuneOutlined sx={{ fontSize: 15, color: "inherit" }} />
        <Box component="span">{activeCount > 0 ? `Ещё · ${activeCount}` : "Ещё"}</Box>
      </ButtonBase>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 0.5, borderRadius: "12px" } } }}
      >
        <Stack gap={1} alignItems="flex-start" sx={{ p: 1.5, minWidth: 220 }}>
          {children}
        </Stack>
      </Popover>
    </>
  );
};

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
  /** Уже lg ряд фильтров перестаёт влезать в одну строку — часть складываем. */
  const compactFilters = useMediaQuery(theme.breakpoints.down("lg"));
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
  const [archiveStatus, setArchiveStatus] = React.useState<ArchiveStatus>("all");
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
  /** Задача, для которой открыт диалог подтверждения удаления. */
  const [pendingDelete, setPendingDelete] = React.useState<Task | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const isArchive = tab === "archive";
  /** Удаление доступно только ответственному за задачи и только из архива. */
  const canDelete = canManage && TASKS_DELETE_ENABLED;

  const handleTabChange = (t: TasksTab) => {
    setTab(t);
    sessionStorage.setItem("tasks-tab", t);
    // В архиве статус задаёт сегмент «Все закрытые / Исполненные / Отменённые»,
    // а фильтры по сроку бессмысленны — иначе они бы молча резали выборку.
    if (t === "archive") {
      setStatus("");
      setQuickDue("");
      setDueRange(null);
    }
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
  }, [tab, status, archiveStatus, categoryId, priority, search, dueRange, createdRange, quickDue, ordering]);

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

  /** Период по дате подачи доступен в «Моих заявках» и в архиве. */
  const createdFilterOn = tab === "my-requests" || isArchive;

  const filters: TasksFilters = {
    status: isArchive
      ? archiveStatus === "all"
        ? undefined // подставляется в queryFn: серверный `status` — одно значение
        : archiveStatus
      : status === ""
      ? undefined
      : status,
    categoryId: categoryId === "" ? undefined : categoryId,
    priority: priority === "" ? undefined : priority,
    assignee: tab === "mine" ? "me" : undefined,
    author: tab === "my-requests" ? "me" : undefined,
    search: search || undefined,
    dueFrom: isArchive
      ? undefined
      : quickDue
      ? quickDueRange.from
      : dueRange
      ? dueRange.from.format("YYYY-MM-DD")
      : undefined,
    dueTo: isArchive
      ? undefined
      : quickDue
      ? quickDueRange.to
      : dueRange
      ? dueRange.to.format("YYYY-MM-DD")
      : undefined,
    createdFrom: createdFilterOn && createdRange ? createdRange.from.format("YYYY-MM-DD") : undefined,
    createdTo: createdFilterOn && createdRange ? createdRange.to.format("YYYY-MM-DD") : undefined,
    // В архиве «умная» сортировка (просрочка → приоритет) смысла не имеет:
    // закрытые задачи листают по свежести.
    ordering: isArchive ? "created" : ordering,
    organizationId: orgId,
  };

  /** Канбан сам грузит колонки по статусам — общий список ему не нужен. */
  const boardMode = tab === "board" && view === "board" && !isMobile;

  const enabled = !permLoading && canList;

  const query = useQuery({
    queryKey: djangoQueryKeys.tasks.list({
      ...filters,
      tab,
      archiveStatus: isArchive ? archiveStatus : undefined,
      page: page + 1,
    }),
    queryFn: async ({ signal }): Promise<TasksResponse> => {
      // «Все закрытые» — две выборки вместо одной: серверный `status` принимает
      // единственное значение (второй параметр перетирает первый, запятая даёт
      // пустой список — проверено на API 07.08.2026). Обе отсортированы по
      // одному ключу (ordering=created), поэтому топ-N объединения гарантированно
      // лежит в объединении топ-N каждой — срез по странице корректен.
      if (isArchive && archiveStatus === "all") {
        const need = (page + 1) * PAGE_SIZE;
        const parts = await Promise.all(
          TASK_ARCHIVE_STATUSES.map((s) =>
            getTasks({ ...filters, status: s, page: 1, pageSize: need }, signal),
          ),
        );
        const merged = parts
          .flatMap((p) => p.results)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const start = page * PAGE_SIZE;
        return {
          results: merged.slice(start, start + PAGE_SIZE),
          count: parts.reduce((sum, p) => sum + p.count, 0),
          next: null,
          previous: null,
        };
      }
      return getTasks({ ...filters, page: page + 1, pageSize: PAGE_SIZE }, signal);
    },
    enabled: enabled && !boardMode,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    // Задачи разбирают несколько человек одновременно — держим список живым,
    // иначе кнопки действий бьют в уже изменившийся статус. Архив статичен.
    refetchInterval: isArchive ? false : TASKS_REFRESH_MS,
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

  const deleteMutation = useMutation({
    mutationFn: (task: Task) => deleteTask(task.id, orgId),
    onSuccess: () => {
      setPendingDelete(null);
      invalidateTasks();
    },
    onError: (e) => {
      setPendingDelete(null);
      setActionError(e instanceof Error ? e.message : "Не удалось удалить задачу");
    },
  });

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
    createdRange != null ||
    (isArchive && archiveStatus !== "all");

  const handleResetFilters = () => {
    setStatus("");
    setArchiveStatus("all");
    setCategoryId("");
    setPriority("");
    setSearchInput("");
    setQuickDue("");
    setDueRange(null);
    setCreatedRange(null);
  };

  const columns = React.useMemo<GridColDef<Task>[]>(
    () => {
      /** В архиве срок не актуален — важнее, когда задачу закрыли. */
      const closedColumn: GridColDef<Task> = {
        field: "updatedAt",
        headerName: "Закрыта",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <Tooltip title={formatDateTime(row.updatedAt)}>
            <Typography variant="body2" color="text.secondary">
              {relativeTime(row.updatedAt)}
            </Typography>
          </Tooltip>
        ),
      };

      const deleteColumn: GridColDef<Task> = {
        field: "actions",
        headerName: "",
        width: 64,
        sortable: false,
        align: "center",
        renderCell: ({ row }) => (
          <Tooltip title="Удалить задачу безвозвратно">
            <IconButton
              size="small"
              aria-label="Удалить задачу"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(row);
              }}
              sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
            >
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        ),
      };

      const base: GridColDef<Task>[] = [
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
        renderCell: ({ row }) => <TaskPriorityDot priority={row.priority} />,
      },
      isArchive
        ? closedColumn
        : {
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
    ];

      // В архиве задача закрыта — рабочих действий нет, остаётся удаление.
      if (isArchive) {
        if (canDelete) base.push(deleteColumn);
      } else {
        base.push({
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
        });
      }

      return base;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTakeAction, getCompleteAction, rowMutation.isPending, isArchive, canDelete, deleteMutation.isPending],
  );

  if (!permLoading && !canList) return <AccessDenied />;

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const summary = summaryQuery.data;
  const myStats = myStatsQuery.data;

  /** Текст пустого списка зависит от вкладки. */
  const emptyText =
    tab === "mine"
      ? "У вас нет назначенных задач"
      : tab === "my-requests"
      ? "Вы ещё не подавали заявок"
      : isArchive
      ? "В архиве пусто — закрытых задач нет"
      : "Задач не найдено";

  /* Контролы, которые на узком экране уезжают под кнопку «Ещё». Держим их
     переменными, чтобы один и тот же элемент рендерился и в строке, и в
     свёртке — без копии разметки. */
  const statusFilter =
    // На канбане статус — это колонка, в архиве — сегмент выше;
    // отдельный селект в обоих случаях только запутывает.
    !boardMode && !isArchive ? (
      <FilterPill
        label="Статус"
        icon={<PlayArrowOutlined />}
        value={status}
        options={TASK_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        allLabel="Все статусы"
        onChange={(v) => setStatus(v as TaskStatus | "")}
      />
    ) : null;

  /* Дата подачи — в «Моих заявках» и в архиве */
  const createdFilter = !createdFilterOn ? null : createdRange ? (
    <Stack direction="row" alignItems="center" gap={0.25}>
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        Подана:
      </Typography>
      <DateRangeField
        dense
        value={createdRange}
        onChange={(r) => setCreatedRange(r)}
        presets={DEFAULT_RANGE_PRESETS}
        minWidth={190}
      />
      <IconButton
        size="small"
        aria-label="Убрать фильтр по дате подачи"
        onClick={() => setCreatedRange(null)}
        sx={{ p: 0.5 }}
      >
        <CloseOutlined sx={{ fontSize: 15 }} />
      </IconButton>
    </Stack>
  ) : (
    <Button
      size="small"
      startIcon={<CalendarMonthOutlined sx={{ fontSize: 15 }} />}
      onClick={() =>
        setCreatedRange({ from: dayjs().subtract(29, "day").startOf("day"), to: dayjs().endOf("day") })
      }
      sx={(t) => pillSx(t)}
    >
      Дата подачи
    </Button>
  );

  const foldedActiveCount = (status !== "" ? 1 : 0) + (createdRange ? 1 : 0);

  const NoRowsOverlay = () => (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", opacity: 0.75 }}>
      {isArchive ? (
        <Inventory2Outlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
      ) : (
        <AssignmentOutlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {emptyText}
      </Typography>
      {hasActiveFilters ? (
        <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
          Сбросить фильтры
        </Button>
      ) : (
        !isArchive &&
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
            <StatStrip>
              <StatItem
                label="новых"
                value={summary.new}
                onClick={boardMode ? undefined : () => toggleStatus("new")}
                active={status === "new"}
              />
              <StatItem
                label="в работе"
                value={summary.inProgress}
                onClick={boardMode ? undefined : () => toggleStatus("in_progress")}
                active={status === "in_progress"}
              />
              {canManage && summary.awaitingApproval > 0 ? (
                <StatItem
                  label="ждут подтверждения"
                  value={summary.awaitingApproval}
                  onClick={boardMode ? undefined : () => toggleStatus("awaiting_approval")}
                  active={status === "awaiting_approval"}
                />
              ) : null}
              {summary.overdue > 0 ? (
                <StatItem
                  label="просрочено"
                  value={summary.overdue}
                  tone="error"
                  onClick={() => toggleQuickDue("overdue")}
                  active={quickDue === "overdue"}
                />
              ) : null}
            </StatStrip>
          )}
          {tab === "mine" && myStats && !isMobile && (
            <StatStrip>
              <StatItem label="исполнено за неделю" value={myStats.doneLast7Days} tone="success" />
            </StatStrip>
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

        {/* ── Фильтры: быстрые пресеты и точные значения — одной строкой ── */}
        <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" sx={{ mb: 1.5 }}>
          {isArchive ? (
            <>
              <FilterChip
                label="Все закрытые"
                icon={<Inventory2Outlined sx={{ fontSize: 15 }} />}
                active={archiveStatus === "all"}
                onClick={() => setArchiveStatus("all")}
              />
              <FilterChip
                label="Исполненные"
                icon={<DoneAllOutlined sx={{ fontSize: 15 }} />}
                active={archiveStatus === "done"}
                onClick={() => setArchiveStatus("done")}
              />
              <FilterChip
                label="Отменённые"
                icon={<CancelOutlined sx={{ fontSize: 15 }} />}
                tone="error"
                active={archiveStatus === "cancelled"}
                onClick={() => setArchiveStatus("cancelled")}
              />
            </>
          ) : (
          <>
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
          {/* Чипов «Срочные» и «В работе» здесь нет намеренно: в одном ряду они
              дублировали пилюли «Приоритет» и «Статус», подсвечиваясь вместе с
              ними — два контрола об одном состоянии. */}
          </>
          )}

          {/* Граница между «быстрыми» переключателями и точными фильтрами */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: "center" }} />

          {!compactFilters && statusFilter}

          <FilterPill
            label="Категория"
            icon={<AssignmentOutlined />}
            value={categoryId === "" ? "" : String(categoryId)}
            options={(categoriesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
            allLabel="Все категории"
            onChange={(v) => setCategoryId(v === "" ? "" : Number(v))}
          />

          <FilterPill
            label="Приоритет"
            icon={<PriorityHighOutlined />}
            value={priority}
            options={TASK_PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            allLabel="Любой приоритет"
            onChange={(v) => setPriority(v as TaskPriority | "")}
          />

          {/* Срок: опционально, чтобы не скрывать задачи без due_date.
              В архиве срок не фильтрует — задачи уже закрыты. */}
          {isArchive ? null : dueRange ? (
            <Stack direction="row" alignItems="center" gap={0.25}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Срок:
              </Typography>
              <DateRangeField
                dense
                value={dueRange}
                onChange={(r) => setDueRange(r)}
                presets={DUE_RANGE_PRESETS}
                minWidth={190}
              />
              <IconButton
                size="small"
                aria-label="Убрать фильтр по сроку"
                onClick={() => setDueRange(null)}
                sx={{ p: 0.5 }}
              >
                <CloseOutlined sx={{ fontSize: 15 }} />
              </IconButton>
            </Stack>
          ) : (
            <Button
              size="small"
              startIcon={<CalendarMonthOutlined sx={{ fontSize: 15 }} />}
              onClick={() => setDueRange({ from: startOfRuWeek(), to: startOfRuWeek().endOf("week") })}
              sx={(t) => pillSx(t)}
            >
              Срок
            </Button>
          )}

          {!compactFilters && createdFilter}

          {/* Узкий экран: редкие фильтры под кнопкой, чтобы строка не переносилась */}
          {compactFilters && (statusFilter || createdFilter) && (
            <MoreFilters activeCount={foldedActiveCount}>
              {statusFilter}
              {createdFilter}
            </MoreFilters>
          )}

          {hasActiveFilters && (
            <Button
              size="small"
              onClick={handleResetFilters}
              startIcon={<CloseOutlined sx={{ fontSize: 15 }} />}
              sx={{ textTransform: "none", flexShrink: 0, fontSize: "0.8125rem" }}
            >
              Сбросить
            </Button>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Сортировка: серверный ordering (smart | created) */}
          {!isArchive && (
            <Tooltip
              title={
                ordering === "smart"
                  ? "Сначала просроченные и срочные, затем по сроку"
                  : "Сначала недавно созданные"
              }
            >
              <Button
                size="small"
                startIcon={<SwapVertOutlined sx={{ fontSize: 15 }} />}
                onClick={() => setOrdering((o) => (o === "smart" ? "created" : "smart"))}
                sx={(t) => pillSx(t)}
              >
                {ordering === "smart" ? "Умная сортировка" : "Сначала новые"}
              </Button>
            </Tooltip>
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
                {isArchive ? (
                  <Inventory2Outlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
                ) : (
                  <AssignmentOutlined sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {emptyText}
                </Typography>
                {hasActiveFilters ? (
                  <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
                    Сбросить фильтры
                  </Button>
                ) : (
                  !isArchive &&
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
          <Box sx={{ flex: 1, minHeight: 0 }}>
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
                "& .MuiDataGrid-row:hover": { bgcolor: subtleBg(t, true) },
                // Шапка — служебная строка, а не заголовок: тише по цвету и
                // мельче по кеглю, чтобы первым читалось название задачи.
                "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
                "& .MuiDataGrid-columnHeaderTitle": {
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  color: "text.secondary",
                },
                // Вертикальные линии между колонками дробят строку; горизонтальные
                // оставляем — они держат ритм списка.
                "& .MuiDataGrid-columnSeparator": { display: "none" },
                // Рамка фокуса на ячейке после клика по строке — визуальный мусор:
                // выделения строк здесь нет, клик открывает карточку.
                "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
                  { outline: "none" },
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

      {/* ── Подтверждение удаления ── */}
      <Dialog open={pendingDelete != null} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить задачу?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            «{pendingDelete?.title}» будет удалена безвозвратно вместе с комментариями, вложениями и
            историей статусов. Восстановить её нельзя.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <AppButton variant="outlined" onClick={() => setPendingDelete(null)}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
          >
            Удалить
          </AppButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TasksPage;
