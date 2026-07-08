import React from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import PauseOutlined from "@mui/icons-material/PauseOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import ThumbUpOutlined from "@mui/icons-material/ThumbUpOutlined";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppButton, UserAvatar } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import {
  addTaskComment,
  approveTask,
  cancelTask,
  completeTask,
  getTask,
  pauseTask,
  rejectTask,
  takeTask,
  thankTask,
  type Task,
  type TaskDetail,
  type TaskStatus,
} from "../../api/tasks";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { TASK_SOURCE_META, TASK_STATUS_META } from "../../pages/tasks/meta";
import { TaskPriorityChip, TaskStatusChip } from "./TaskChips";

type ReasonAction = "pause" | "reject" | "cancel" | null;

const REASON_TITLES: Record<Exclude<ReasonAction, null>, string> = {
  pause: "Поставить на паузу",
  reject: "Вернуть в работу",
  cancel: "Отменить задачу",
};

/** Плитка-поле «иконка → лейбл → значение» по гайду стиля (§5.2). */
const FieldTile: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({
  icon,
  label,
  value,
}) => (
  <Box
    sx={(t) => ({
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: 1.75,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
    })}
  >
    <Box
      sx={(t) => ({
        width: 40,
        height: 40,
        borderRadius: "10px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "primary.onSurface",
        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
        "& .MuiSvgIcon-root": { fontSize: 20 },
      })}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} noWrap>
        {value || "—"}
      </Typography>
    </Box>
  </Box>
);

// ── Статус-трекер «как в доставке»: подана → взята → исполнена → подтверждена ──

type TrackerStep = {
  label: string;
  /** Кто выполнил шаг (если известно). */
  actor?: string | null;
  /** Когда (ISO; если известно). */
  time?: string | null;
  done: boolean;
};

/**
 * Шаги считаются по statusLog; если лог пуст (сиды моков, свежие задачи) —
 * пройденность выводится из текущего статуса без времени/актора.
 */
function buildTrackerSteps(task: TaskDetail): TrackerStep[] {
  const log = task.statusLog;
  const firstTake = log.find((l) => l.toStatus === "in_progress");
  const lastComplete = [...log].reverse().find((l) => l.toStatus === "awaiting_approval");
  const doneEntry = log.find((l) => l.toStatus === "done");
  const s = task.status;
  const taken =
    firstTake != null || s === "in_progress" || s === "paused" || s === "awaiting_approval" || s === "done";
  const completed = lastComplete != null || s === "awaiting_approval" || s === "done";
  const approved = s === "done";
  return [
    { label: "Подана", actor: task.authorName, time: task.createdAt, done: true },
    {
      label: "Взята",
      actor: firstTake?.actorName ?? (taken ? task.assigneeName : null),
      time: firstTake?.createdAt,
      done: taken,
    },
    {
      label: "Исполнена",
      actor: lastComplete?.actorName,
      // manage-исполнение минует awaiting_approval и уходит сразу в done.
      time: lastComplete?.createdAt ?? (approved ? doneEntry?.createdAt : undefined),
      done: completed,
    },
    {
      label: "Подтверждена",
      actor: task.approvedByName ?? doneEntry?.actorName,
      time: doneEntry?.createdAt,
      done: approved,
    },
  ];
}

const StatusTracker: React.FC<{ task: TaskDetail }> = ({ task }) => {
  const steps = buildTrackerSteps(task);
  const cancelled = task.status === "cancelled";
  return (
    <Box
      sx={(t) => ({
        p: 1.75,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: subtleBg(t),
        opacity: cancelled ? 0.6 : 1,
      })}
    >
      <Stack direction="row">
        {steps.map((step, i) => {
          const prevDone = i === 0 || steps[i - 1].done;
          const nextDone = steps[i + 1]?.done ?? false;
          const lineColor = (on: boolean) => (on ? "success.main" : "divider");
          return (
            <Stack key={step.label} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
              {/* линия — точка — линия */}
              <Stack direction="row" alignItems="center" sx={{ width: "100%" }}>
                <Box
                  sx={{
                    flex: 1,
                    height: "2px",
                    bgcolor: lineColor(step.done && prevDone),
                    visibility: i === 0 ? "hidden" : "visible",
                  }}
                />
                <Box
                  sx={(t) => ({
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    flexShrink: 0,
                    mx: 0.5,
                    bgcolor: step.done ? "success.main" : "transparent",
                    border: step.done ? "none" : `2px solid ${t.palette.divider}`,
                  })}
                />
                <Box
                  sx={{
                    flex: 1,
                    height: "2px",
                    bgcolor: lineColor(step.done && nextDone),
                    visibility: i === steps.length - 1 ? "hidden" : "visible",
                  }}
                />
              </Stack>
              <Typography
                variant="caption"
                sx={{
                  mt: 0.5,
                  fontWeight: step.done ? 600 : 400,
                  color: step.done ? "text.primary" : "text.disabled",
                  textAlign: "center",
                }}
              >
                {step.label}
              </Typography>
              {step.done && step.time && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
                  {dayjs(step.time).format("DD.MM HH:mm")}
                </Typography>
              )}
              {step.done && step.actor && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ fontSize: "0.68rem", maxWidth: "100%", px: 0.25 }}
                >
                  {step.actor}
                </Typography>
              )}
            </Stack>
          );
        })}
      </Stack>
      {cancelled && (
        <Typography variant="caption" color="error.main" sx={{ display: "block", textAlign: "center", mt: 0.75 }}>
          Задача отменена
        </Typography>
      )}
    </Box>
  );
};

type TaskDetailDrawerProps = {
  taskId: number | null;
  onClose: () => void;
  /** tasks.manage: подтверждение/возврат/отмена чужих, смена приоритета. */
  canManage: boolean;
  /** tasks.update: рабочие действия исполнителя. */
  canUpdate: boolean;
  /** id активного сотрудника — для «моя ли это задача». */
  meEmployeeId: number | null;
};

const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  taskId,
  onClose,
  canManage,
  canUpdate,
  meEmployeeId,
}) => {
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const [commentText, setCommentText] = React.useState("");
  const [reasonAction, setReasonAction] = React.useState<ReasonAction>(null);
  const [reasonText, setReasonText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: djangoQueryKeys.tasks.detail(taskId ?? 0),
    queryFn: ({ signal }) => getTask(taskId!, orgId, signal),
    enabled: taskId != null,
  });

  const task = query.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tasks.all });
  };

  const actionMutation = useMutation({
    mutationFn: (fn: () => Promise<Task>) => fn(),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось выполнить действие"),
  });

  const commentMutation = useMutation({
    mutationFn: () => addTaskComment(taskId!, commentText.trim(), orgId),
    onSuccess: () => {
      setCommentText("");
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Не удалось добавить комментарий"),
  });

  const closeReasonDialog = () => {
    setReasonAction(null);
    setReasonText("");
  };

  const submitReason = () => {
    if (taskId == null || !reasonAction || !reasonText.trim()) return;
    const id = taskId;
    const payload = { reason: reasonText.trim() };
    const fn =
      reasonAction === "pause"
        ? () => pauseTask(id, payload, orgId)
        : reasonAction === "reject"
        ? () => rejectTask(id, payload, orgId)
        : () => cancelTask(id, payload, orgId);
    actionMutation.mutate(fn);
    closeReasonDialog();
  };

  // ── Доступные действия по статусу и правам ──────────────────────────────────
  const isMine = task != null && task.assigneeId != null && task.assigneeId === meEmployeeId;
  const isAuthor = task != null && task.authorId === meEmployeeId;
  const status: TaskStatus | undefined = task?.status;

  const actions: { key: string; label: string; icon: React.ReactNode; primary?: boolean; onClick: () => void }[] = [];
  if (task && taskId != null && status) {
    const id = taskId;
    const canWork = canUpdate || canManage;
    // Взять в работу: свободная задача — любой из группы; назначенная — только назначенный / manage.
    if ((status === "new" || status === "paused") && canWork && (task.assigneeId == null || isMine || canManage)) {
      actions.push({
        key: "take",
        label: status === "paused" ? "Возобновить" : "Взять в работу",
        icon: <PlayArrowOutlined />,
        primary: true,
        onClick: () => actionMutation.mutate(() => takeTask(id, orgId)),
      });
    }
    if (status === "in_progress" && (isMine || canManage)) {
      actions.push({
        key: "complete",
        label: "Исполнить",
        icon: <CheckOutlined />,
        primary: true,
        onClick: () => actionMutation.mutate(() => completeTask(id, orgId)),
      });
      actions.push({
        key: "pause",
        label: "Пауза",
        icon: <PauseOutlined />,
        onClick: () => setReasonAction("pause"),
      });
    }
    if (status === "awaiting_approval" && canManage) {
      actions.push({
        key: "approve",
        label: "Подтвердить",
        icon: <DoneAllOutlined />,
        primary: true,
        onClick: () => actionMutation.mutate(() => approveTask(id, orgId)),
      });
      actions.push({
        key: "reject",
        label: "Вернуть в работу",
        icon: <ReplayOutlined />,
        onClick: () => setReasonAction("reject"),
      });
    }
    if (status !== "done" && status !== "cancelled" && (isAuthor || canManage)) {
      actions.push({
        key: "cancel",
        label: "Отменить",
        icon: <CancelOutlined />,
        onClick: () => setReasonAction("cancel"),
      });
    }
    // «Спасибо» от автора исполнителю выполненной задачи (однократно, не себе).
    if (
      status === "done" &&
      isAuthor &&
      task.assigneeId != null &&
      task.assigneeId !== meEmployeeId &&
      !task.thankedByAuthor
    ) {
      actions.push({
        key: "thank",
        label: "Спасибо исполнителю",
        icon: <ThumbUpOutlined />,
        primary: true,
        onClick: () => actionMutation.mutate(() => thankTask(id, orgId)),
      });
    }
  }

  const handleClose = () => {
    setError(null);
    setCommentText("");
    closeReasonDialog();
    onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={taskId != null}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 480, md: 560 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* ── Шапка ── */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {query.isLoading ? (
            <Skeleton width="70%" height={28} />
          ) : (
            <Typography variant="h6" fontWeight={600} sx={{ letterSpacing: -0.15, lineHeight: 1.3 }}>
              {task?.title}
            </Typography>
          )}
          {task && (
            <Stack direction="row" gap={0.75} sx={{ mt: 1 }} flexWrap="wrap">
              <TaskStatusChip status={task.status} />
              <TaskPriorityChip priority={task.priority} />
              {task.thankedByAuthor && (
                <Chip
                  size="small"
                  icon={<ThumbUpOutlined sx={{ fontSize: 13 }} />}
                  label="Спасибо от автора"
                  sx={(t) => ({
                    height: 24,
                    borderRadius: "7px",
                    fontWeight: 500,
                    color: t.palette.mode === "dark" ? t.palette.success.light : t.palette.success.dark,
                    bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14),
                    "& .MuiChip-icon": { color: "inherit", ml: 0.75 },
                  })}
                />
              )}
            </Stack>
          )}
        </Box>
        <IconButton size="small" onClick={handleClose} aria-label="Закрыть">
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Контент ── */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {query.isLoading && (
          <Stack gap={1}>
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={64} />
          </Stack>
        )}

        {task && (
          <>
            <StatusTracker task={task} />

            {task.description && (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {task.description}
              </Typography>
            )}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.25 }}>
              <FieldTile icon={<CategoryOutlined />} label="Категория" value={task.categoryName} />
              <FieldTile icon={<PersonOutlined />} label="Исполнитель" value={task.assigneeName} />
              <FieldTile
                icon={<EventOutlined />}
                label="Срок"
                value={task.dueDate ? dayjs(task.dueDate).format("DD.MM.YYYY") : ""}
              />
              <FieldTile icon={<PersonOutlined />} label="Автор" value={task.authorName} />
            </Box>

            <Typography variant="caption" color="text.secondary">
              {TASK_SOURCE_META[task.source].label} · создана {dayjs(task.createdAt).format("DD.MM.YYYY HH:mm")}
            </Typography>

            {/* ── Фото ── */}
            {task.attachments.length > 0 && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {task.attachments.map((a) => (
                  <Box
                    key={a.id}
                    component="a"
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      width: 88,
                      height: 88,
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: 1,
                      borderColor: "divider",
                      display: "block",
                    }}
                  >
                    <Box
                      component="img"
                      src={a.fileUrl}
                      alt={a.fileName}
                      sx={{ width: 1, height: 1, objectFit: "cover", display: "block" }}
                    />
                  </Box>
                ))}
              </Box>
            )}

            <Divider />

            {/* ── Комментарии ── */}
            <Typography variant="subtitle2" fontWeight={600}>
              Комментарии
            </Typography>
            {task.comments.length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                Пока нет комментариев
              </Typography>
            ) : (
              <Stack gap={1.25}>
                {task.comments.map((c) => (
                  <Stack key={c.id} direction="row" gap={1.25} alignItems="flex-start">
                    <UserAvatar name={c.authorName} size={32} sx={{ borderRadius: "9px", flexShrink: 0 }} />
                    <Box
                      sx={(t) => ({
                        flex: 1,
                        minWidth: 0,
                        p: 1.25,
                        borderRadius: "10px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor: subtleBg(t),
                      })}
                    >
                      <Stack direction="row" justifyContent="space-between" gap={1}>
                        <Typography variant="caption" fontWeight={600}>
                          {c.authorName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {dayjs(c.createdAt).format("DD.MM HH:mm")}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
                        {c.text}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}

            <Stack direction="row" gap={1}>
              <TextField
                size="small"
                fullWidth
                placeholder="Комментарий..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                    e.preventDefault();
                    commentMutation.mutate();
                  }
                }}
              />
              <IconButton
                aria-label="Отправить"
                disabled={!commentText.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                sx={(t) => ({
                  width: 40,
                  height: 40,
                  borderRadius: "10px",
                  border: 1,
                  borderColor: "divider",
                  color: "text.secondary",
                  "&:hover": {
                    color: "text.primary",
                    bgcolor: subtleBg(t, true),
                    borderColor: alpha(t.palette.primary.main, 0.35),
                  },
                })}
              >
                <SendOutlined sx={{ fontSize: 19 }} />
              </IconButton>
            </Stack>

            {/* ── История статусов ── */}
            {task.statusLog.length > 0 && (
              <>
                <Divider />
                <Stack direction="row" alignItems="center" gap={0.75}>
                  <HistoryOutlined sx={{ fontSize: 17, color: "text.secondary" }} />
                  <Typography variant="subtitle2" fontWeight={600}>
                    История
                  </Typography>
                </Stack>
                <Stack gap={0.75}>
                  {[...task.statusLog].reverse().map((l) => (
                    <Typography key={l.id} variant="caption" color="text.secondary">
                      {dayjs(l.createdAt).format("DD.MM HH:mm")} · {l.actorName}:{" "}
                      {l.fromStatus ? `${TASK_STATUS_META[l.fromStatus].label} → ` : ""}
                      {TASK_STATUS_META[l.toStatus].label}
                      {l.reason ? ` («${l.reason}»)` : ""}
                    </Typography>
                  ))}
                </Stack>
              </>
            )}
          </>
        )}
      </Box>

      {/* ── Действия ── */}
      {actions.length > 0 && (
        <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, flexWrap: "wrap" }}>
          {actions.map((a) => (
            <AppButton
              key={a.key}
              variant={a.primary ? "contained" : "outlined"}
              startIcon={a.icon}
              disabled={actionMutation.isPending}
              onClick={a.onClick}
              sx={{ flex: "1 1 auto" }}
            >
              {a.label}
            </AppButton>
          ))}
        </Box>
      )}

      {/* ── Диалог причины ── */}
      <Dialog open={reasonAction != null} onClose={closeReasonDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{reasonAction ? REASON_TITLES[reasonAction] : ""}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Причина"
            required
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <AppButton variant="outlined" onClick={closeReasonDialog}>
            Отмена
          </AppButton>
          <AppButton variant="contained" disabled={!reasonText.trim()} onClick={submitReason}>
            Подтвердить
          </AppButton>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default TaskDetailDrawer;
