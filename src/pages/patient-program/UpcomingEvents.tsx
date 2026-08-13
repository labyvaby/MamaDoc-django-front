import React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  cancelProgramNotification,
  createProgramNotification,
  getProgramNotifications,
  getUpcomingProgramRecords,
  type ProgramModuleRecord,
  type ProgramNotificationChannel,
  type ProgramNotificationList,
  type ProgramNotificationStatus,
} from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AppButton, AppCard, CustomDateTimePicker, ListEmptyState } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { subtleBg } from "../../theme/uiHelpers";

const STATUS_LABELS: Record<ProgramNotificationStatus, string> = {
  draft: "Черновик",
  pending: "Запланировано",
  queued: "В очереди",
  sent: "Отправлено",
  delivered: "Доставлено",
  failed: "Ошибка",
  cancelled: "Отменено",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

interface ReminderDrawerProps {
  open: boolean;
  event: ProgramModuleRecord | null;
  patientName: string;
  enrollmentId: number;
  scope: ActiveScope;
  onClose: () => void;
  onCreated: () => void;
}

const ReminderDrawer: React.FC<ReminderDrawerProps> = ({
  open,
  event,
  patientName,
  enrollmentId,
  scope,
  onClose,
  onCreated,
}) => {
  const [channel, setChannel] = React.useState<ProgramNotificationChannel>("sms");
  const [scheduledFor, setScheduledFor] = React.useState<Dayjs | null>(dayjs());
  const [body, setBody] = React.useState("");

  React.useEffect(() => {
    if (!open || !event) return;
    const eventDate = dayjs(event.occurredAt);
    const suggested = eventDate.subtract(1, "day").hour(10).minute(0).second(0);
    setChannel("sms");
    setScheduledFor(suggested.isAfter(dayjs()) ? suggested : dayjs());
    setBody(
      `Здравствуйте, ${patientName}. Напоминаем: ${event.title} — ${formatDateTime(event.occurredAt)}.`,
    );
  }, [event, open, patientName]);

  const mutation = useMutation({
    mutationFn: () => createProgramNotification(scope, enrollmentId, {
      moduleRecordId: event!.id,
      channel,
      body: body.trim(),
      scheduledFor: scheduledFor!.toISOString(),
    }),
    onSuccess: onCreated,
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 480 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box>
          <Typography variant="h6" fontWeight={600}>Уведомить клиента</Typography>
          <Typography variant="caption" color="text.secondary">
            Сообщение будет отправлено в выбранное время
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      <Stack gap={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        {event && (
          <Box sx={(theme) => ({ p: 1.5, borderRadius: "12px", bgcolor: subtleBg(theme), border: 1, borderColor: "divider" })}>
            <Typography variant="body2" fontWeight={700}>{event.title}</Typography>
            <Typography variant="caption" color="text.secondary">{formatDateTime(event.occurredAt)}</Typography>
          </Box>
        )}
        <TextField
          select
          label="Канал"
          value={channel}
          onChange={(event) => setChannel(event.target.value as ProgramNotificationChannel)}
          fullWidth
        >
          <MenuItem value="sms">SMS</MenuItem>
          <MenuItem value="whatsapp">WhatsApp</MenuItem>
        </TextField>
        <CustomDateTimePicker
          label="Дата и время отправки"
          value={scheduledFor}
          onChange={setScheduledFor}
          slotProps={{ textField: { fullWidth: true } }}
        />
        <TextField
          label="Текст сообщения"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          multiline
          minRows={5}
          required
          fullWidth
          helperText={`${body.length} символов`}
        />
      </Stack>

      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={mutation.isPending}>Отмена</AppButton>
        <AppButton
          variant="contained"
          startIcon={<NotificationsActiveOutlined />}
          loading={mutation.isPending}
          disabled={!event || !body.trim() || !scheduledFor?.isValid()}
          onClick={() => mutation.mutate()}
        >
          Запланировать
        </AppButton>
      </Stack>
    </Drawer>
  );
};

interface UpcomingEventsProps {
  enrollmentId: number;
  patientName: string;
  scope: ActiveScope;
  canNotify: boolean;
}

export const UpcomingEvents: React.FC<UpcomingEventsProps> = ({
  enrollmentId,
  patientName,
  scope,
  canNotify,
}) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [selectedEvent, setSelectedEvent] = React.useState<ProgramModuleRecord | null>(null);
  const upcomingKey = djangoQueryKeys.programs.upcoming(enrollmentId, scope);
  const notificationsKey = djangoQueryKeys.programs.notifications(enrollmentId, scope);
  const upcomingQuery = useQuery({
    queryKey: upcomingKey,
    queryFn: ({ signal }) => getUpcomingProgramRecords(scope, enrollmentId, signal),
  });
  const notificationsQuery = useQuery({
    queryKey: notificationsKey,
    queryFn: ({ signal }) => getProgramNotifications(scope, enrollmentId, signal),
    enabled: canNotify,
  });
  const cancelMutation = useMutation({
    mutationFn: (notificationId: number) => cancelProgramNotification(
      scope,
      enrollmentId,
      notificationId,
    ),
    onSuccess: (updated) => {
      queryClient.setQueryData<ProgramNotificationList>(notificationsKey, (current) => (
        current
          ? {
              ...current,
              results: current.results.map((item) => (
                item.id === updated.id ? updated : item
              )),
            }
          : current
      ));
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
      enqueueSnackbar("Уведомление отменено", { variant: "success" });
    },
  });

  const notificationsByRecord = React.useMemo(() => {
    const result = new Map<number, NonNullable<typeof notificationsQuery.data>["results"][number]>();
    for (const notification of notificationsQuery.data?.results ?? []) {
      if (notification.moduleRecordId != null && !result.has(notification.moduleRecordId)) {
        result.set(notification.moduleRecordId, notification);
      }
    }
    return result;
  }, [notificationsQuery.data]);

  const events = upcomingQuery.data?.results ?? [];
  return (
    <>
      <AppCard variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Предстоящие события</Typography>
            <Typography variant="body2" color="text.secondary">
              Осмотры, вакцинации и другие запланированные действия
            </Typography>
          </Box>
          {events.length > 0 && <Chip size="small" variant="outlined" label={`${events.length} запланировано`} />}
        </Stack>
        {upcomingQuery.error && <Alert severity="error">{upcomingQuery.error.message}</Alert>}
        {!upcomingQuery.isLoading && events.length === 0 ? (
          <ListEmptyState
            icon={<CalendarMonthOutlined />}
            title="Нет запланированных событий"
            description="События со статусом «Запланировано» появятся здесь автоматически."
          />
        ) : (
          <Stack gap={1}>
            {events.map((event) => {
              const notification = notificationsByRecord.get(event.id);
              const canCancel = notification?.status === "pending";
              return (
                <Box
                  key={event.id}
                  sx={(theme) => ({ p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: subtleBg(theme) })}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.25}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
                        <CalendarMonthOutlined color="primary" fontSize="small" />
                        <Typography variant="body2" fontWeight={700}>{event.title}</Typography>
                        {notification && (
                          <Chip
                            size="small"
                            color={notification.status === "failed" ? "error" : notification.status === "cancelled" ? "default" : "info"}
                            label={STATUS_LABELS[notification.status]}
                          />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        {formatDateTime(event.occurredAt)}
                      </Typography>
                      {event.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{event.notes}</Typography>}
                    </Box>
                    {canNotify && (
                      <Stack direction="row" gap={0.75} flexShrink={0}>
                        {canCancel && (
                          <AppButton size="small" onClick={() => cancelMutation.mutate(notification.id)}>
                            Отменить
                          </AppButton>
                        )}
                        {(!notification || notification.status === "cancelled" || notification.status === "failed") && (
                          <AppButton
                            size="small"
                            variant="contained"
                            startIcon={<NotificationsActiveOutlined />}
                            onClick={() => setSelectedEvent(event)}
                          >
                            Напомнить
                          </AppButton>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </AppCard>

      {canNotify && (
        <ReminderDrawer
          open={selectedEvent !== null}
          event={selectedEvent}
          patientName={patientName}
          enrollmentId={enrollmentId}
          scope={scope}
          onClose={() => setSelectedEvent(null)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: notificationsKey });
            setSelectedEvent(null);
            enqueueSnackbar("Уведомление запланировано", { variant: "success" });
          }}
        />
      )}
    </>
  );
};
