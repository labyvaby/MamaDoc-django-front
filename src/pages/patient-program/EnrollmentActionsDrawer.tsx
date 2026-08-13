import React from "react";
import { Alert, Box, Divider, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PauseCircleOutlineOutlined from "@mui/icons-material/PauseCircleOutlineOutlined";
import PlayCircleOutlineOutlined from "@mui/icons-material/PlayCircleOutlineOutlined";
import { useMutation } from "@tanstack/react-query";

import {
  transitionProgramEnrollment,
  type ProgramEnrollment,
} from "../../api/programs";
import { AppButton } from "../../components/ui";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { subtleBg } from "../../theme/uiHelpers";

interface EnrollmentActionsDrawerProps {
  open: boolean;
  enrollment: ProgramEnrollment;
  scope: ActiveScope;
  onClose: () => void;
  onUpdated: (enrollment: ProgramEnrollment) => void;
}

export const EnrollmentActionsDrawer: React.FC<EnrollmentActionsDrawerProps> = ({
  open,
  enrollment,
  scope,
  onClose,
  onUpdated,
}) => {
  const [cancelArmed, setCancelArmed] = React.useState(false);
  React.useEffect(() => {
    if (open) setCancelArmed(false);
  }, [open]);
  const mutation = useMutation({
    mutationFn: (action: "pause" | "resume" | "cancel") => (
      transitionProgramEnrollment(scope, enrollment.id, action)
    ),
    onSuccess: onUpdated,
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
          <Typography variant="h6" fontWeight={600}>Управление подключением</Typography>
          <Typography variant="caption" color="text.secondary">{enrollment.program.name}</Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={1.5} sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <Box sx={(theme) => ({ p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: subtleBg(theme) })}>
          <Typography variant="body2" fontWeight={700}>Текущий статус</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {enrollment.status === "active" ? "Активно" : enrollment.status === "paused" ? "Приостановлено" : "Завершено"}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Приостановка временно скрывает доступные разделы, но сохраняет всю историю. Отмена завершает подключение и не удаляет данные.
        </Typography>
      </Stack>
      <Divider />
      <Stack gap={1} sx={{ px: 2.5, py: 1.5 }}>
        {cancelArmed && (
          <Alert severity="warning">
            Подтвердите отмену. История сохранится, но возобновить это подключение будет нельзя.
          </Alert>
        )}
        {enrollment.status === "active" && (
          <AppButton
            variant="outlined"
            startIcon={<PauseCircleOutlineOutlined />}
            loading={mutation.isPending && mutation.variables === "pause"}
            onClick={() => mutation.mutate("pause")}
          >
            Приостановить
          </AppButton>
        )}
        {enrollment.status === "paused" && (
          <AppButton
            variant="contained"
            startIcon={<PlayCircleOutlineOutlined />}
            loading={mutation.isPending && mutation.variables === "resume"}
            onClick={() => mutation.mutate("resume")}
          >
            Возобновить
          </AppButton>
        )}
        {(enrollment.status === "active" || enrollment.status === "paused") && (
          <AppButton
            color="error"
            startIcon={<CancelOutlined />}
            loading={mutation.isPending && mutation.variables === "cancel"}
            onClick={() => cancelArmed ? mutation.mutate("cancel") : setCancelArmed(true)}
          >
            {cancelArmed ? "Подтвердить отмену" : "Отменить подключение"}
          </AppButton>
        )}
        <AppButton onClick={onClose} disabled={mutation.isPending}>Закрыть</AppButton>
      </Stack>
    </Drawer>
  );
};
