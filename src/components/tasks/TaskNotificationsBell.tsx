import React from "react";
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import AssignmentIndOutlined from "@mui/icons-material/AssignmentIndOutlined";
import FiberNewOutlined from "@mui/icons-material/FiberNewOutlined";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import VolunteerActivismOutlined from "@mui/icons-material/VolunteerActivismOutlined";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getTaskNotifications,
  markTaskNotificationsRead,
  type TaskNotification,
  type TaskNotificationEvent,
} from "../../api/tasks";
import { djangoQueryKeys } from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { useApiOrgId } from "../../hooks/useApiOrgId";

const EVENT_META: Record<
  TaskNotificationEvent,
  { label: string; icon: React.ElementType; tone?: "error" | "warning" | "success" }
> = {
  assigned: { label: "Вам назначена задача", icon: AssignmentIndOutlined },
  new_in_group: { label: "Новая заявка вашей группе", icon: FiberNewOutlined },
  awaiting_approval: { label: "Задача ждёт подтверждения", icon: DoneAllOutlined },
  done: { label: "Ваша заявка исполнена", icon: CheckCircleOutlined, tone: "success" },
  rejected: { label: "Задачу вернули в работу", icon: ReplayOutlined, tone: "warning" },
  thanked: { label: "Автор поблагодарил за задачу", icon: VolunteerActivismOutlined, tone: "success" },
  due_soon: { label: "Срок задачи приближается", icon: TimerOutlined, tone: "warning" },
  overdue: { label: "Задача просрочена", icon: WarningAmberOutlined, tone: "error" },
};

const timeLabel = (iso: string) => {
  const d = dayjs(iso);
  return d.isSame(dayjs(), "day") ? d.format("HH:mm") : d.format("DD.MM HH:mm");
};

export interface TaskNotificationsBellProps {
  /** Открыть карточку задачи (drawer на странице задач). */
  onOpenTask: (taskId: number) => void;
}

/**
 * Колокольчик непрочитанных уведомлений задач (ТЗ §5.8, бизнес-решение №5:
 * v1 — внутри системы). Клик по уведомлению помечает его прочитанным и
 * открывает задачу; «Прочитать все» — POST mark-read без ids.
 */
export const TaskNotificationsBell: React.FC<TaskNotificationsBellProps> = ({ onOpenTask }) => {
  const queryClient = useQueryClient();
  const orgId = useApiOrgId();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  const unreadQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.notifications,
    queryFn: ({ signal }) => getTaskNotifications({ unread: true, organizationId: orgId }, signal),
    // Внутрисистемные уведомления без realtime — мягкий поллинг раз в минуту.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.tasks.notifications });
  };

  const markRead = useMutation({
    mutationFn: (ids?: number[]) => markTaskNotificationsRead(ids, orgId),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const items = unreadQuery.data ?? [];
  const count = items.length;

  const handleItemClick = (n: TaskNotification) => {
    markRead.mutate([n.id]);
    setAnchor(null);
    onOpenTask(n.taskId);
  };

  return (
    <>
      <Tooltip title="Уведомления">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Уведомления задач"
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: "10px",
            bgcolor: "background.paper",
          }}
        >
          <Badge badgeContent={count} color="error" max={99}>
            <NotificationsNoneOutlined sx={{ fontSize: 22 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={anchor != null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: "calc(100vw - 32px)", borderRadius: "12px" } } }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: "divider" }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            Уведомления
          </Typography>
          {count > 0 && (
            <Button
              size="small"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
              sx={{ textTransform: "none" }}
            >
              Прочитать все
            </Button>
          )}
        </Stack>

        {unreadQuery.isLoading ? (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={22} />
          </Stack>
        ) : unreadQuery.isError ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: "center" }}>
            Не удалось загрузить уведомления
          </Typography>
        ) : count === 0 ? (
          <Stack alignItems="center" py={4} sx={{ opacity: 0.7 }}>
            <NotificationsNoneOutlined sx={{ fontSize: 36, color: "text.disabled", mb: 0.5 }} />
            <Typography variant="body2" color="text.secondary">
              Непрочитанных уведомлений нет
            </Typography>
          </Stack>
        ) : (
          <Stack sx={{ maxHeight: 420, overflowY: "auto", py: 0.5 }}>
            {items.map((n) => {
              const meta = EVENT_META[n.event] ?? {
                label: "Событие по задаче",
                icon: NotificationsNoneOutlined,
              };
              const Icon = meta.icon;
              return (
                <ButtonBase
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    textAlign: "left",
                    gap: 1.25,
                    px: 2,
                    py: 1.25,
                    "&:hover": { bgcolor: (t) => subtleBg(t, true) },
                  }}
                >
                  <Box
                    sx={(t) => {
                      const tone = meta.tone ? t.palette[meta.tone] : t.palette.primary;
                      return {
                        width: 34,
                        height: 34,
                        borderRadius: "9px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: t.palette.mode === "dark" ? tone.light : tone.dark,
                        bgcolor: alpha(tone.main, t.palette.mode === "dark" ? 0.16 : 0.1),
                        "& .MuiSvgIcon-root": { fontSize: 18 },
                      };
                    }}
                  >
                    <Icon />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                      {meta.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {n.taskTitle}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, mt: 0.25 }}>
                    {timeLabel(n.createdAt)}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Stack>
        )}
      </Popover>
    </>
  );
};

export default TaskNotificationsBell;
