import React from "react";
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import CallOutlined from "@mui/icons-material/CallOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createPatientInteraction,
  getPatientInteractions,
  updatePatientInteraction,
  type InteractionChannel,
  type InteractionOutcome,
  type PatientInteraction,
} from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import CreateTaskDrawer from "../../components/tasks/CreateTaskDrawer";
import { AppButton, AppCard, CustomDateTimePicker, ListEmptyState } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { subtleBg } from "../../theme/uiHelpers";

const CHANNELS: Array<{ value: InteractionChannel; label: string }> = [
  { value: "call", label: "Звонок" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "in_person", label: "Лично" },
  { value: "note", label: "Заметка" },
];

const OUTCOMES: Array<{ value: InteractionOutcome; label: string; color: "default" | "success" | "warning" | "info" }> = [
  { value: "answered", label: "Связались", color: "success" },
  { value: "no_answer", label: "Не ответил", color: "warning" },
  { value: "callback", label: "Перезвонить", color: "warning" },
  { value: "scheduled", label: "Записан", color: "success" },
  { value: "informed", label: "Проинформирован", color: "info" },
];

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

interface InteractionDrawerProps {
  open: boolean;
  enrollmentId: number;
  scope: ActiveScope;
  canCreateTask: boolean;
  onClose: () => void;
  onCreated: (interaction: PatientInteraction, createTask: boolean) => void;
}

const InteractionDrawer: React.FC<InteractionDrawerProps> = ({
  open,
  enrollmentId,
  scope,
  canCreateTask,
  onClose,
  onCreated,
}) => {
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [channel, setChannel] = React.useState<InteractionChannel>("call");
  const [outcome, setOutcome] = React.useState<InteractionOutcome>("answered");
  const [subject, setSubject] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [createFollowUp, setCreateFollowUp] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setOccurredAt(dayjs());
    setChannel("call");
    setOutcome("answered");
    setSubject("");
    setNotes("");
    setCreateFollowUp(false);
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => createPatientInteraction(scope, enrollmentId, {
      occurredAt: occurredAt!.toISOString(),
      channel,
      outcome,
      subject: subject.trim(),
      notes: notes.trim(),
    }),
    onSuccess: (interaction) => onCreated(interaction, createFollowUp),
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 480 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box>
          <Typography variant="h6" fontWeight={600}>Новое взаимодействие</Typography>
          <Typography variant="caption" color="text.secondary">Звонок, сообщение или личный контакт</Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      <Stack gap={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <CustomDateTimePicker
          label="Дата и время"
          value={occurredAt}
          onChange={setOccurredAt}
          slotProps={{ textField: { fullWidth: true } }}
        />
        <TextField select label="Канал" value={channel} onChange={(event) => setChannel(event.target.value as InteractionChannel)} fullWidth>
          {CHANNELS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField
          select
          label="Результат"
          value={outcome}
          onChange={(event) => {
            const next = event.target.value as InteractionOutcome;
            setOutcome(next);
            if (canCreateTask && (next === "no_answer" || next === "callback")) setCreateFollowUp(true);
          }}
          fullWidth
        >
          {OUTCOMES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField label="Тема" value={subject} onChange={(event) => setSubject(event.target.value)} required fullWidth />
        <TextField label="Заметка" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={4} fullWidth />
        {canCreateTask && (
          <FormControlLabel
            control={<Switch checked={createFollowUp} onChange={(event) => setCreateFollowUp(event.target.checked)} />}
            label="После сохранения поставить задачу"
          />
        )}
      </Stack>

      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={mutation.isPending}>Отмена</AppButton>
        <AppButton
          variant="contained"
          startIcon={<AddOutlined />}
          loading={mutation.isPending}
          disabled={!occurredAt?.isValid() || !subject.trim()}
          onClick={() => mutation.mutate()}
        >
          Сохранить
        </AppButton>
      </Stack>
    </Drawer>
  );
};

interface InteractionHistoryProps {
  enrollmentId: number;
  patientName: string;
  patientPhone: string;
  scope: ActiveScope;
  canManage: boolean;
  canCreateTask: boolean;
  canManageTasks: boolean;
}

export const InteractionHistory: React.FC<InteractionHistoryProps> = ({
  enrollmentId,
  patientName,
  patientPhone,
  scope,
  canManage,
  canCreateTask,
  canManageTasks,
}) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [pendingInteraction, setPendingInteraction] = React.useState<PatientInteraction | null>(null);

  const queryKey = djangoQueryKeys.programs.interactions(enrollmentId, scope);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getPatientInteractions(scope, enrollmentId, signal),
  });
  const interactions = query.data?.results ?? [];

  const taskInitialValues = React.useMemo(() => pendingInteraction ? ({
    title: `Перезвонить: ${patientName}`,
    description: [
      `Клиент: ${patientName}`,
      patientPhone ? `Телефон: ${patientPhone}` : "",
      `Причина: ${pendingInteraction.subject}`,
      pendingInteraction.notes ? `Заметка: ${pendingInteraction.notes}` : "",
    ].filter(Boolean).join("\n"),
    due: { date: dayjs().add(1, "day").startOf("day"), time: dayjs().add(1, "day").hour(9).minute(0) },
  }) : undefined, [patientName, patientPhone, pendingInteraction]);

  return (
    <>
      <AppCard
        variant="outlined"
      >
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1} sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Активность и взаимодействия</Typography>
            <Typography variant="body2" color="text.secondary">Единая история контактов с клиентом</Typography>
          </Box>
          {canManage && (
            <AppButton variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setDrawerOpen(true)}>
              Добавить
            </AppButton>
          )}
        </Stack>
        {query.error && <Alert severity="error" sx={{ mb: 1.5 }}>{query.error.message}</Alert>}
        {!query.isLoading && interactions.length === 0 ? (
          <ListEmptyState
            icon={<ForumOutlined />}
            title="История пока пуста"
            description="Добавьте звонок, сообщение или заметку о контакте с клиентом."
          />
        ) : (
          <Stack gap={1}>
            {interactions.map((interaction) => {
              const outcome = OUTCOMES.find((item) => item.value === interaction.outcome);
              const channel = CHANNELS.find((item) => item.value === interaction.channel);
              return (
                <Box
                  key={interaction.id}
                  sx={(theme) => ({ p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: subtleBg(theme) })}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
                        {interaction.channel === "call" ? <CallOutlined color="primary" fontSize="small" /> : <ForumOutlined color="primary" fontSize="small" />}
                        <Typography variant="body2" fontWeight={700}>{interaction.subject}</Typography>
                        <Chip size="small" label={outcome?.label ?? interaction.outcome} color={outcome?.color ?? "default"} />
                      </Stack>
                      {interaction.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>{interaction.notes}</Typography>}
                      <Stack direction="row" gap={1.25} flexWrap="wrap" sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">{channel?.label} · {formatDateTime(interaction.occurredAt)}</Typography>
                        {interaction.createdByName && (
                          <Stack direction="row" gap={0.35} alignItems="center">
                            <PersonOutlineOutlined sx={{ fontSize: 15, color: "text.secondary" }} />
                            <Typography variant="caption" color="text.secondary">{interaction.createdByName}</Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                    {interaction.followUpTaskId && (
                      <Chip size="small" variant="outlined" icon={<AssignmentOutlined />} label={`Задача #${interaction.followUpTaskId}`} />
                    )}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </AppCard>

      <InteractionDrawer
        open={drawerOpen}
        enrollmentId={enrollmentId}
        scope={scope}
        canCreateTask={canCreateTask}
        onClose={() => setDrawerOpen(false)}
        onCreated={(interaction, createTask) => {
          void queryClient.invalidateQueries({ queryKey });
          setDrawerOpen(false);
          enqueueSnackbar("Взаимодействие сохранено", { variant: "success" });
          if (createTask) {
            setPendingInteraction(interaction);
            setTaskOpen(true);
          }
        }}
      />

      {canCreateTask && (
        <CreateTaskDrawer
          open={taskOpen}
          onClose={() => { setTaskOpen(false); setPendingInteraction(null); }}
          canManage={canManageTasks}
          initialValues={taskInitialValues}
          onCreated={(task) => {
            if (!pendingInteraction) return;
            void updatePatientInteraction(scope, enrollmentId, pendingInteraction.id, { followUpTaskId: task.id })
              .then(() => {
                void queryClient.invalidateQueries({ queryKey });
                enqueueSnackbar("Задача создана и связана с клиентом", { variant: "success" });
              })
              .catch((error: Error) => enqueueSnackbar(error.message, { variant: "error" }));
          }}
        />
      )}
    </>
  );
};
