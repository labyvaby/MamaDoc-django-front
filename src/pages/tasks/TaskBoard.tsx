import React from "react";
import { Box, IconButton, Menu, MenuItem, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { keepPreviousData, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";

import { UserAvatar } from "../../components/ui";
import { subtleBg } from "../../theme/uiHelpers";
import {
  approveTask,
  completeTask,
  getTasks,
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

/**
 * Перенос карточки = вызов соответствующего действия API, а не произвольная
 * смена статуса: у бэка нет PATCH status, переходы делают эндпоинты
 * take/complete/approve. Возвращает исполнителя перехода или null, если такой
 * перенос недопустим (или не хватает прав).
 */
function transitionFor(
  task: Task,
  to: TaskStatus,
  ctx: Ctx,
): { fn: (id: number, orgId?: number) => Promise<Task>; label: string } | null {
  const { canManage, canUpdate, meEmployeeId } = ctx;
  const canWork = canUpdate || canManage;
  const mine = task.assigneeId != null && task.assigneeId === meEmployeeId;
  const from = task.status;

  if (to === "in_progress" && (from === "new" || from === "paused")) {
    if (!canWork) return null;
    if (task.assigneeId != null && !mine && !canManage) return null;
    return { fn: takeTask, label: from === "paused" ? "Возобновить" : "Взять в работу" };
  }
  if (to === "awaiting_approval" && from === "in_progress" && mine && !canManage) {
    // Только для исполнителя без права приёмки: у обладателя tasks.manage тот же
    // complete/ закрывает задачу сразу в done (api/tasks.ts), поэтому колонка
    // «На подтверждении» для него не цель переноса — иначе доска обещает
    // переход, которого нет, и карточка перепрыгивает через колонку.
    return { fn: completeTask, label: "Исполнить" };
  }
  if (to === "done") {
    if (from === "awaiting_approval" && canManage) return { fn: approveTask, label: "Подтвердить" };
    // Обладателю tasks.manage бэк закрывает задачу сразу, минуя приёмку.
    if (from === "in_progress" && canManage) return { fn: completeTask, label: "Исполнить и закрыть" };
  }
  return null;
}

/** Цвет тона статуса из палитры — точка в шапке колонки и чип в таблице совпадают. */
const toneColor = (t: Theme, name: ToneName) =>
  name ? t.palette[name].main : t.palette.text.disabled;

type BoardCardProps = {
  task: Task;
  /** Порядок в колонке — задаёт лесенку появления. */
  index: number;
  /** Доступные переходы: то же, что даёт перетаскивание, но кликом. */
  actions: { to: TaskStatus; label: string }[];
  onAction: (to: TaskStatus) => void;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
};

const BoardCard: React.FC<BoardCardProps> = ({
  task,
  index,
  actions,
  onAction,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}) => {
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  // Системная настройка «уменьшить движение» — тогда карточки просто появляются.
  const reduceMotion = useReducedMotion();
  const due = dueInfo(task.dueDate, task.status);
  const priority = TASK_PRIORITY_META[task.priority];
  // Цветом отмечаем только то, что требует внимания: «низкий» и «обычный»
  // приоритеты полоски не получают — иначе колонка превращается в радугу и
  // срочное перестаёт выделяться.
  const accent = task.priority === "urgent" ? "error" : task.priority === "high" ? "warning" : null;

  return (
    /* Обёртка отвечает только за появление и исчезновение: у motion.div свои
       onDragStart/onDragEnd (pan-жесты), они конфликтуют с HTML5-перетаскиванием,
       поэтому drag остаётся на внутреннем Box. */
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
      transition={{
        duration: 0.18,
        ease: "easeOut",
        // Лесенка сверху вниз: колонка «собирается», а не мигает целиком.
        delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.15),
      }}
    >
    <Box
      draggable
      /* Карточка открывается и с клавиатуры: перетаскивание мышью — не
         единственный способ работать с доской (и на тач-экране его нет). */
      role="button"
      tabIndex={0}
      aria-label={`Задача: ${task.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Safari не начинает перетаскивание без полезной нагрузки.
        e.dataTransfer.setData("text/plain", String(task.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      sx={(t) => ({
        position: "relative",
        overflow: "hidden",
        p: 1.25,
        pl: 1.75,
        borderRadius: "12px",
        border: 1,
        borderColor: due?.overdue ? alpha(t.palette.error.main, 0.35) : "divider",
        bgcolor: "background.paper",
        cursor: "grab",
        opacity: dragging ? 0.45 : 1,
        transition: "border-color .15s ease, background-color .15s ease, opacity .15s ease",
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35), bgcolor: subtleBg(t, true) },
        "&:active": { cursor: "grabbing" },
      })}
    >
      {/* Приоритет — полоской по левому краю вместо чипа: не занимает строку
          и не спорит с заголовком за внимание. */}
      {accent && (
        <Tooltip title={`Приоритет: ${priority.label}`}>
          <Box
            sx={(t) => ({
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              bgcolor: t.palette[accent].main,
            })}
          />
        </Tooltip>
      )}

      {/* Те же переходы, что и перетаскиванием: на тач-экране HTML5-drag не
          работает вовсе, да и мышью «взять в работу» быстрее одним кликом. */}
      {actions.length > 0 && (
        <>
          <Tooltip title="Действия по задаче">
            <IconButton
              size="small"
              aria-label="Действия по задаче"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor(e.currentTarget);
              }}
              sx={{
                position: "absolute",
                top: 2,
                right: 2,
                color: "text.disabled",
                opacity: menuAnchor ? 1 : 0.5,
                transition: "opacity .15s ease, color .15s ease",
                "&:hover": { opacity: 1, color: "text.primary" },
              }}
            >
              <MoreVertOutlined sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            onClick={(e) => e.stopPropagation()}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: { borderRadius: "12px", minWidth: 190 } } }}
          >
            {actions.map((a) => (
              <MenuItem
                key={a.to}
                sx={{ fontSize: "0.875rem" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuAnchor(null);
                  onAction(a.to);
                }}
              >
                {a.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

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
          pr: actions.length > 0 ? 3 : 0,
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
    </Box>
    </motion.div>
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
  const invalidateTasks = useInvalidateTasks();
  const queryClient = useQueryClient();
  const [dragged, setDragged] = React.useState<Task | null>(null);
  const [hoverColumn, setHoverColumn] = React.useState<TaskStatus | null>(null);
  /** Сколько задач тянем в каждой колонке — растёт по мере прокрутки. */
  const [limits, setLimits] = React.useState<Partial<Record<TaskStatus, number>>>({});

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
    mutationFn: ({ task, to }: { task: Task; to: TaskStatus }) => {
      const move = transitionFor(task, to, ctx);
      if (!move) return Promise.reject(new Error("Такой перенос недоступен"));
      return move.fn(task.id, orgId);
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
      .filter((x): x is { to: TaskStatus; move: { fn: never; label: string } } => x.move != null)
      .map(({ to, move }) => ({ to, label: move.label }));

  const handleDrop = (to: TaskStatus) => {
    setHoverColumn(null);
    const task = dragged;
    setDragged(null);
    if (!task || task.status === to) return;
    if (!transitionFor(task, to, ctx)) {
      onError(
        to === "paused"
          ? "Поставить на паузу можно только из карточки задачи — нужна причина"
          : to === "awaiting_approval" && task.status === "in_progress" && canManage
          ? "У вас есть право подтверждать, поэтому «Исполнить» закрывает задачу сразу — переносите в «Исполнена»"
          : `Нельзя перенести «${TASK_STATUS_META[task.status].label}» → «${TASK_STATUS_META[to].label}»`,
      );
      return;
    }
    moveMutation.mutate({ task, to });
  };

  /* Доска целиком пуста: пять одинаковых пунктирных зон подряд выглядят как
     поломка, поэтому показываем один экран — тот же, что и у списка. */
  const boardIsEmpty =
    emptyState != null &&
    results.every((q) => !q.isLoading && (q.data?.count ?? 0) === 0);

  if (boardIsEmpty) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {emptyState}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        gap: 1.25,
        overflowX: "auto",
        pb: 1,
      }}
    >
      {COLUMNS.map((status, i) => {
        const q = results[i];
        const tasks = q.data?.results ?? [];
        const count = q.data?.count ?? 0;
        const droppable = dragged != null && transitionFor(dragged, status, ctx) != null;
        const isHover = hoverColumn === status && droppable;

        return (
          <Stack
            key={status}
            onDragOver={(e) => {
              if (!droppable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (hoverColumn !== status) setHoverColumn(status);
            }}
            onDragLeave={() => setHoverColumn((c) => (c === status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(status);
            }}
            sx={(t) => ({
              /* Колонки делят всю ширину поровну, но не уже 268px: на широком
                 экране доска не оставляет пустоту справа, на узком — включается
                 горизонтальная прокрутка контейнера. */
              flex: "1 0 268px",
              // Без сброса min-width колонка с длинными именами исполнителей
              // выторговывает себе лишние пиксели и ряд перестаёт быть ровным.
              minWidth: 0,
              minHeight: 0,
              borderRadius: "14px",
              border: 1,
              borderColor: isHover ? alpha(t.palette.primary.main, 0.5) : "divider",
              bgcolor: isHover ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.1 : 0.05) : subtleBg(t),
              transition: "border-color .15s ease, background-color .15s ease",
              // Колонка, куда перенос запрещён, гаснет — правило видно до drop.
              opacity: dragged != null && !droppable && dragged.status !== status ? 0.5 : 1,
            })}
          >
            <Stack
              direction="row"
              alignItems="center"
              gap={0.75}
              sx={{ px: 1.5, py: 1.25, borderBottom: 1, borderColor: "divider" }}
            >
              {/* Тот же цвет, что у чипа статуса в таблице — доска и список
                  говорят на одном языке. */}
              <Box
                sx={(t) => ({
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: toneColor(t, TASK_STATUS_META[status].color),
                })}
              />
              <Typography variant="subtitle2" fontWeight={600} noWrap>
                {TASK_STATUS_META[status].label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {count}
              </Typography>
            </Stack>

            <Stack
              gap={1}
              onScroll={(e) => {
                // Догружаем следующую порцию, не доходя до самого низа, — так
                // прокрутка не упирается в конец списка.
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight > 160) return;
                if (count <= tasks.length) return;
                setLimits((prev) => {
                  const current = prev[status] ?? COLUMN_SIZE;
                  if (current >= count || tasks.length < current) return prev;
                  return { ...prev, [status]: current + COLUMN_SIZE };
                });
              }}
              sx={{ p: 1, overflowY: "auto", flex: 1, minHeight: 0 }}
            >
              {q.isLoading ? (
                Array.from({ length: 3 }).map((_, k) => <Skeleton key={k} variant="rounded" height={92} />)
              ) : tasks.length === 0 ? (
                /* Пустая колонка — норма, а не ошибка: вместо серого «Пусто» в
                   каждой из пяти колонок рисуем спокойную зону, которая заодно
                   показывает, куда можно бросить карточку. */
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  gap={0.75}
                  sx={(t) => ({
                    /* Высота карточки, а не всей колонки: зона читается как
                       место под задачу, а не как пустое полотно. */
                    minHeight: 96,
                    borderRadius: "10px",
                    border: "1px dashed",
                    borderColor: droppable ? alpha(t.palette.primary.main, 0.45) : "divider",
                    opacity: droppable ? 1 : 0.6,
                    transition: "border-color .15s ease, opacity .15s ease",
                  })}
                >
                  <InboxOutlined sx={{ fontSize: 22, color: "text.disabled" }} />
                  <Typography variant="caption" color="text.disabled">
                    {droppable ? "Перенести сюда" : "Нет задач"}
                  </Typography>
                </Stack>
              ) : (
                <>
                  <AnimatePresence>
                    {tasks.map((task, cardIndex) => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        index={cardIndex}
                        actions={availableActions(task)}
                        onAction={(to) => moveMutation.mutate({ task, to })}
                        dragging={dragged?.id === task.id}
                        onOpen={() => onOpenTask(task.id)}
                        onDragStart={() => setDragged(task)}
                        onDragEnd={() => {
                          setDragged(null);
                          setHoverColumn(null);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                  {count > tasks.length && (
                    <Stack alignItems="center" sx={{ py: 1 }}>
                      {q.isFetching ? (
                        <Skeleton variant="rounded" height={92} width="100%" />
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          Прокрутите, чтобы загрузить ещё {count - tasks.length}
                        </Typography>
                      )}
                    </Stack>
                  )}
                </>
              )}
            </Stack>
          </Stack>
        );
      })}
    </Box>
  );
};

export default TaskBoard;
