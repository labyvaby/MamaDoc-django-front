import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useMutation, useQueries } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import InboxOutlined from "@mui/icons-material/InboxOutlined";

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
} from "../../api/tasks";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { useInvalidateTasks } from "../../hooks/useInvalidateTasks";
import { dueInfo, relativeTime, TASK_PRIORITY_META, TASK_STATUS_META, TASKS_REFRESH_MS } from "./meta";

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
  if (to === "awaiting_approval" && from === "in_progress" && (mine || canManage)) {
    return { fn: completeTask, label: "Исполнить" };
  }
  if (to === "done") {
    if (from === "awaiting_approval" && canManage) return { fn: approveTask, label: "Подтвердить" };
    // Обладателю tasks.manage бэк закрывает задачу сразу, минуя приёмку.
    if (from === "in_progress" && canManage) return { fn: completeTask, label: "Исполнить и закрыть" };
  }
  return null;
}

type BoardCardProps = {
  task: Task;
  /** Порядок в колонке — задаёт лесенку появления. */
  index: number;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
};

const BoardCard: React.FC<BoardCardProps> = ({
  task,
  index,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}) => {
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

      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
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
}) => {
  const invalidateTasks = useInvalidateTasks();
  const [dragged, setDragged] = React.useState<Task | null>(null);
  const [hoverColumn, setHoverColumn] = React.useState<TaskStatus | null>(null);

  const ctx: Ctx = { canManage, canUpdate, meEmployeeId };

  const results = useQueries({
    queries: COLUMNS.map((status) => {
      const columnFilters: TasksFilters = { ...filters, status, page: 1, pageSize: COLUMN_SIZE };
      return {
        queryKey: djangoQueryKeys.tasks.list({ ...columnFilters, board: true }),
        queryFn: ({ signal }: { signal?: AbortSignal }) => getTasks(columnFilters, signal),
        enabled,
        staleTime: DJANGO_LIST_STALE_TIME_MS,
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
    onSuccess: invalidateTasks,
    onError: (e) => {
      onError(e instanceof Error ? e.message : "Не удалось перенести задачу");
      invalidateTasks();
    },
  });

  const handleDrop = (to: TaskStatus) => {
    setHoverColumn(null);
    const task = dragged;
    setDragged(null);
    if (!task || task.status === to) return;
    if (!transitionFor(task, to, ctx)) {
      onError(
        to === "paused"
          ? "Поставить на паузу можно только из карточки задачи — нужна причина"
          : `Нельзя перенести «${TASK_STATUS_META[task.status].label}» → «${TASK_STATUS_META[to].label}»`,
      );
      return;
    }
    moveMutation.mutate({ task, to });
  };

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
              width: 268,
              flexShrink: 0,
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
              <Typography variant="subtitle2" fontWeight={600} noWrap>
                {TASK_STATUS_META[status].label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {count}
              </Typography>
            </Stack>

            <Stack gap={1} sx={{ p: 1, overflowY: "auto", flex: 1, minHeight: 0 }}>
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
                    <Typography variant="caption" color="text.disabled" sx={{ px: 0.5 }}>
                      и ещё {count - tasks.length} — уточните фильтры
                    </Typography>
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
