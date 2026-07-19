import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import LayersOutlined from "@mui/icons-material/LayersOutlined";
import dayjs from "dayjs";

import { AppButton } from "../../../components/ui/AppButton";
import type { AppointmentOverlapConflict } from "../../../api/appointments";

/** "10:00–10:30" (same day) or "1 сен 10:00 – 2 сен 09:30" (spanning days). */
function formatInterval(startsAt: string, endsAt: string): string {
  const start = dayjs(startsAt);
  const end = dayjs(endsAt);
  if (start.isSame(end, "day")) {
    return `${start.format("HH:mm")}–${end.format("HH:mm")}`;
  }
  return `${start.format("D MMM HH:mm")} – ${end.format("D MMM HH:mm")}`;
}

export interface OverlapConfirmDialogProps {
  /** Non-null opens the dialog; the parsed 409 body from the backend. */
  conflict: AppointmentOverlapConflict | null;
  /** True while the confirming request is in flight (locks both buttons). */
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation for the org "warn" overlap mode: the backend answered the save
 * with a 409 listing the appointments the new slot runs into. Confirming
 * re-sends the same request with `allowOverlap: true`. Cancelling leaves the
 * form untouched so the user can adjust the time or performer.
 */
const OverlapConfirmDialog: React.FC<OverlapConfirmDialogProps> = ({
  conflict,
  saving,
  onCancel,
  onConfirm,
}) => {
  const requested = conflict?.requestedSlot;
  return (
    <Dialog
      open={conflict !== null}
      onClose={saving ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" gap={1}>
          <LayersOutlined color="warning" fontSize="small" />
          Время приёма пересекается
        </Stack>
      </DialogTitle>
      <DialogContent>
        {requested && (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Новый приём:{" "}
            <strong>
              {formatInterval(requested.startsAt, requested.endsAt)}
            </strong>
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Пересекается с приёмами:
        </Typography>
        <Stack spacing={1} sx={{ mt: 0.75 }}>
          {(conflict?.overlaps ?? []).map((o) => (
            <Box
              key={o.appointmentId}
              sx={{
                borderLeft: "3px solid",
                borderColor: "warning.main",
                pl: 1.25,
                py: 0.25,
              }}
            >
              <Typography variant="body2" fontWeight={600}>
                {formatInterval(o.startsAt, o.endsAt)}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                Сотрудник: {o.employeeName || "—"}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                Пациент: {o.patientName || "—"}
              </Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={saving}>
          Нет, вернуться
        </Button>
        <AppButton
          color="warning"
          variant="contained"
          onClick={onConfirm}
          loading={saving}
          disabled={saving}
        >
          Да, сохранить
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default OverlapConfirmDialog;
