import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { type Theme } from "@mui/material/styles";
import { keepPreviousData, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import { Board, type BoardCardSpec, type BoardColumnDef } from "../../components/board";
import { UserAvatar } from "../../components/ui";
import { ReasonDialog } from "../../components/ui";
import {
  approveTask,
  completeTask,
  getTasks,
  pauseTask,
  takeTask,
  type Task,
  type TaskStatus,
  type TasksFilters,
  type TasksResponse,
} from "../../api/tasks";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { useInvalidateTasks } from "../../hooks/useInvalidateTasks";
import {
  dueInfo,
  relativeTime,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASKS_REFRESH_MS,
  type ToneName,
} from "./meta";

/** Сколько задач тянем в колонку: доска — оперативный вид, не архив. */
const COLUMN_SIZE = 50;

const COLUMNS: TaskStatus[] = ["new", "in_progress", "paused", "awaiting_approval", "done"];

type Ctx = {
  canManage: boolean;
  canUpdate: boolean;
  meEmployeeId: number | null;
};

type Transition = {
  fn: (id: number, orgId?: number, reason?: string) => Promise<Task>;
  label: string;
  /**
   * Бэк не выполнит переход без причины (пауза) — спрашиваем её диалогом
   * перед вызовом, и только потом двигаем карточку.
   */
  needsReason?: boolean;
  /** Заголовок диалога причины. */
  reasonTitle?: string;
};

/**
 * Перенос карточки = вызов соответствующего действия API, а не произвольная
 * смена статуса: у бэка нет PATCH status, переходы делают эндпоинты
 * take/complete/approve/pause. Возвращает исполнителя перехода или null, если
 * такой перенос недопустим (или не хватает прав).
 */
function transitionFor(task: Task, to: TaskStatus, ctx: Ctx): Transition | null {
  const { canManage, canUpdate, meEmployeeId } = ctx;
  const canWork = canUpdate || canManage;
  const mine = task.assigneeId != null && task.assigneeId === meEmployeeId;
  const from = task.status;

  if (to === "in_progress" && (from === "new" || from === "paused")) {
    if (!canWork) return null;
    if (task.assigneeId != null && !mine && !canManage) return null;
    return { fn: takeTask, label: from === "paused" ? "Возобновить" : "Взять в работу" };
  }
  if (to === "awaiting_approval" && from === "in_progress") {
    // Исполнителю без права приёмки complete/ сам уводит задачу в приёмку.
    if (mine && !canManage) return { fn: (id, orgId) => completeTask(id, orgId), label: "Исполнить" };
    // Обладателю tasks.manage тот же complete/ закрывает задачу сразу в done,
    // поэтому приёмку он запрашивает явным флагом (контракт 31.08.2026).
    if (canManage) {
      return {
        fn: (id, orgId) => completeTask(id, orgId, { requestApproval: true }),
        label: "Отправить на проверку",
      };
    }
    return null;
  }
  if (to === "paused" && from === "in_progress") {
    // Пауза доступна тому же кругу, что и «Исполнить», но требует причины:
    // она уходит в историю задачи и объясняет остановку.
    if (!mine && !canManage) return null;
    return {
      fn: (id, orgId, reason) => pauseTask(id, { reason: reason ?? "" }, orgId),
      label: "Поставить на паузу",
      needsReason: true,
      reasonTitle: "Поставить на паузу",
    };
  }
  if (to === "done") {
    if (from === "awaiting_approval" && canManage) return { fn: approveTask, label: "Подтвердить" };
    // Обладателю tasks.manage бэк закрывает задачу сразу, минуя приёмку.
    if (from === "in_progress" && canManage) {
      return { fn: (id, orgId) => completeTask(id, orgId), label: "Исполнить и закрыть" };
    }
  }
  return null;
}

/** Цвет тона статуса из палитры — точка в шапке колонки и чип в таблице совпадают. */
const toneColor = (t: Theme, name: ToneName) =>
  name ? t.palette[name].main : t.palette.text.disabled;

/** Содержимое карточки задачи; оболочку (drag, меню, анимацию) даёт ядро доски. */
const TaskCardBody: React.FC<{ task: Task; hasActions: boolean }> = ({ task, hasActions }) => {
  const due = dueInfo(task.dueDate, task.status);

  return (
    <>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          // Место под кнопку действий, чтобы заголовок под неё не заезжал.
          pr: hasActions ? 3 : 0,
        }}
      >
        {task.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mt: 0.25 }}>
        {task.categoryName}
      </Typography>

      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 1 }}>
        {task.assigneeName ? (
          <>
            <UserAvatar name={task.assigneeName} size={22} sx={{ borderRadius: "7px", flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {task.assigneeName}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.disabled" noWrap>
            Не назначена
          </Typography>
        )}

        <Box sx={{ flex: 1, minWidth: 8 }} />

        {/* Одна временная метка на карточку: срок, если он есть, иначе возраст
            задачи — чтобы низ карточки читался с одного взгляда. */}
        {due ? (
          <Tooltip title={`Срок: ${due.exact}`}>
            <Typography
              variant="caption"
              noWrap
              sx={{
                flexShrink: 0,
                fontWeight: due.overdue || due.today || due.soon ? 600 : 400,
                color: due.overdue ? "error.main" : due.today || due.soon ? "warning.main" : "text.secondary",
              }}
            >
              {due.text}
            </Typography>
          </Tooltip>
        ) : (
          <Tooltip title="Задача без срока">
            <Typography variant="caption" color="text.disabled" noWrap sx={{ flexShrink: 0 }}>
              {relativeTime(task.createdAt)}
            </Typography>
          </Tooltip>
        )}
      </Stack>
    </>
  );
};

type TaskBoardProps = {
  /** Фильтры страницы без статуса — статус задаёт колонка. */
  filters: TasksFilters;
  orgId?: number;
  onOpenTask: (taskId: number) => void;
  onError: (message: string) => void;
  canManage: boolean;
  canUpdate: boolean;
  meEmployeeId: number | null;
  enabled: boolean;
  /** Что показать, когда задач нет ни в одной колонке (общий для доски и списка). */
  emptyState?: React.ReactNode;
};

const TaskBoard: React.FC<TaskBoardProps> = ({
  filters,
  orgId,
  onOpenTask,
  onError,
  canManage,
  canUpdate,
  meEmployeeId,
  enabled,
  emptyState,
}) => {
  const theme = useTheme();
  const invalidateTasks = useInvalidateTasks();
  const queryClient = useQueryClient();
  /** Сколько задач тянем в каждой колонке — растёт по мере прокрутки. */
  const [limits, setLimits] = React.useState<Partial<Record<TaskStatus, number>>>({});
  /** Открытый диалог причины: перенос ждёт ответа пользователя. */
  const [reasonPrompt, setReasonPrompt] = React.useState<{
    task: Task;
    to: TaskStatus;
    title: string;
  } | null>(null);

  const ctx: Ctx = { canManage, canUpdate, meEmployeeId };

  const columnSize = React.useCallback(
    (status: TaskStatus) => limits[status] ?? COLUMN_SIZE,
    [limits],
  );

  /** Ключ кэша колонки — один и тот же для чтения, записи и оптимистичной правки. */
  const columnKey = React.useCallback(
    (status: TaskStatus, size: number) =>
      djangoQueryKeys.tasks.list({ ...filters, status, page: 1, pageSize: size, board: true }),
    [filters],
  );

  const results = useQueries({
    queries: COLUMNS.map((status) => {
      const pageSize = columnSize(status);
      const columnFilters: TasksFilters = { ...filters, status, page: 1, pageSize };
      return {
        queryKey: columnKey(status, pageSize),
        queryFn: ({ signal }: { signal?: AbortSignal }) => getTasks(columnFilters, signal),
        enabled,
        staleTime: DJANGO_LIST_STALE_TIME_MS,
        // Смена фильтра или догрузка не должна схлопывать колонку в скелетоны:
        // старые карточки остаются на месте, пока не придут новые.
        placeholderData: keepPreviousData,
        // Доска общая: чужие переносы должны проявляться без ручного F5.
        refetchInterval: TASKS_REFRESH_MS,
      };
    }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ task, to, reason }: { task: Task; to: TaskStatus; reason?: string }) => {
      const move = transitionFor(task, to, ctx);
      if (!move) return Promise.reject(new Error("Такой перенос недоступен"));
      return move.fn(task.id, orgId, reason);
    },
    // Карточка переезжает сразу, не дожидаясь ответа сервера: перенос — это
    // жест, и пауза в полсекунды читается как «не сработало».
    onMutate: async ({ task, to }) => {
      await queryClient.cancelQueries({ queryKey: djangoQueryKeys.tasks.all });

      const fromKey = columnKey(task.status, columnSize(task.status));
      const toKey = columnKey(to, columnSize(to));
      const prevFrom = queryClient.getQueryData<TasksResponse>(fromKey);
      const prevTo = queryClient.getQueryData<TasksResponse>(toKey);

      if (prevFrom) {
        queryClient.setQueryData<TasksResponse>(fromKey, {
          ...prevFrom,
          results: prevFrom.results.filter((t) => t.id !== task.id),
          count: Math.max(0, prevFrom.count - 1),
        });
      }
      if (prevTo) {
        queryClient.setQueryData<TasksResponse>(toKey, {
          ...prevTo,
          results: [{ ...task, status: to }, ...prevTo.results],
          count: prevTo.count + 1,
        });
      }

      return { fromKey, toKey, prevFrom, prevTo };
    },
    onError: (e, _vars, snapshot) => {
      // Возвращаем обе колонки к состоянию до переноса — иначе карточка
      // «зависнет» не там, где её на самом деле видит сервер.
      if (snapshot?.prevFrom) queryClient.setQueryData(snapshot.fromKey, snapshot.prevFrom);
      if (snapshot?.prevTo) queryClient.setQueryData(snapshot.toKey, snapshot.prevTo);
      onError(e instanceof Error ? e.message : "Не удалось перенести задачу");
    },
    onSettled: invalidateTasks,
  });

  /** Переходы, доступные задаче прямо сейчас — для меню на карточке. */
  const availableActions = (task: Task) =>
    COLUMNS.filter((to) => to !== task.status)
      .map((to) => ({ to, move: transitionFor(task, to, ctx) }))
      .filter((x): x is { to: TaskStatus; move: Transition } => x.move != null)
      .map(({ to, move }) => ({ to, label: move.label }));

  /**
   * Единая точка перехода для жеста и для меню: переход, которому нужна
   * причина, сперва открывает диалог — карточка поедет только после ответа.
   */
  const startMove = (task: Task, to: TaskStatus) => {
    const move = transitionFor(task, to, ctx);
    if (!move) {
      onError(
        to === "awaiting_approval" && task.status === "in_progress" && canManage
          ? "У вас есть право подтверждать, поэтому «Исполнить» закрывает задачу сразу — переносите в «Исполнена»"
          : `Нельзя перенести «${TASK_STATUS_META[task.status].label}» → «${TASK_STATUS_META[to].label}»`,
      );
      return;
    }
    if (move.needsReason) {
      setReasonPrompt({ task, to, title: move.reasonTitle ?? move.label });
      return;
    }
    moveMutation.mutate({ task, to });
  };

  const tasksOf = (status: TaskStatus) => results[COLUMNS.indexOf(status)]?.data?.results ?? [];

  const columns: BoardColumnDef<TaskStatus>[] = COLUMNS.map((status, i) => {
    const q = results[i];
    const tasks = q.data?.results ?? [];
    const count = q.data?.count ?? 0;

    return {
      id: status,
      title: TASK_STATUS_META[status].label,
      dotColor: toneColor(theme, TASK_STATUS_META[status].color),
      count,
      loading: q.isLoading,
      emptyHint: "Нет задач",
      footer:
        count > tasks.length ? (
          <Stack alignItems="center" sx={{ py: 1 }}>
            {q.isFetching ? (
              <Skeleton variant="rounded" height={92} width="100%" />
            ) : (
              <Typography variant="caption" color="text.disabled">
                Прокрутите, чтобы загрузить ещё {count - tasks.length}
              </Typography>
            )}
          </Stack>
        ) : undefined,
      onScrollEnd: () => {
        if (count <= tasks.length) return;
        setLimits((prev) => {
          const current = prev[status] ?? COLUMN_SIZE;
          if (current >= count || tasks.length < current) return prev;
          return { ...prev, [status]: current + COLUMN_SIZE };
        });
      },
    };
  });

  const card = (task: Task): BoardCardSpec => {
    const actions = availableActions(task);
    // Цветом отмечаем только то, что требует внимания: «низкий» и «обычный»
    // приоритеты полоски не получают — иначе колонка превращается в радугу и
    // срочное перестаёт выделяться.
    const accent = task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : null;

    return {
      ariaLabel: `Задача: ${task.title}`,
      accentColor: accent ? theme.palette[accent].main : null,
      accentTooltip: `Приоритет: ${TASK_PRIORITY_META[task.priority].label}`,
      alert: dueInfo(task.dueDate, task.status)?.overdue ?? false,
      actions: actions.map((a) => ({
        key: a.to,
        label: a.label,
        onSelect: () => startMove(task, a.to),
      })),
      actionsTooltip: "Действия по задаче",
      onOpen: () => onOpenTask(task.id),
      content: <TaskCardBody task={task} hasActions={actions.length > 0} />,
    };
  };

  return (
    <>
      <Board<Task, TaskStatus>
        columns={columns}
        itemsOf={tasksOf}
        getItemId={(task) => task.id}
        columnOf={(task) => task.status}
        canDrop={(task, to) => transitionFor(task, to, ctx) != null}
        onDrop={startMove}
        card={card}
        isEmpty={results.every((q) => !q.isLoading && (q.data?.count ?? 0) === 0)}
        emptyState={emptyState}
      />

      <ReasonDialog
        open={reasonPrompt != null}
        title={reasonPrompt?.title ?? ""}
        description="Причина попадёт в историю задачи — коллеги увидят, почему работа остановлена."
        onCancel={() => setReasonPrompt(null)}
        onConfirm={(reason) => {
          if (reasonPrompt) {
            moveMutation.mutate({ task: reasonPrompt.task, to: reasonPrompt.to, reason });
          }
          setReasonPrompt(null);
        }}
      />
    </>
  );
};

export default TaskBoard;
