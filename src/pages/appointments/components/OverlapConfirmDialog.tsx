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
import { useT } from "../../../i18n/VerticalProvider";

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
  /**
   * «Время занято — поставить в лист ожидания». Показывается только когда у
   * пользователя есть право на очередь: пересечение чаще всего значит, что
   * свободного времени нет, и человека логичнее поставить в очередь, чем
   * записывать вторым на тот же слот.
   */
  onWaitlist?: () => void;
  waitlistLabel?: string;
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
  onWaitlist,
  waitlistLabel,
}) => {
  const { t } = useT("appointments");
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
          {t("overlapDialog.title")}
        </Stack>
      </DialogTitle>
      <DialogContent>
        {requested && (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {t("overlapDialog.newVisit")}{" "}
            <strong>
              {formatInterval(requested.startsAt, requested.endsAt)}
            </strong>
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {t("overlapDialog.text")}
        </Typography>
        <Stack spacing={1} sx={{ mt: 0.75 }}>
          {(conflict?.overlaps ?? []).map((o, i) => (
            <Box
              // appointmentId у чужого филиала null и одинаков у всех таких
              // строк — ключом он больше не годится.
              key={o.appointmentId ?? `other-${i}`}
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
                {t("overlapDialog.employee", { name: o.employeeName || "—" })}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                {o.otherBranch
                  ? t("overlapDialog.otherBranch")
                  : t("overlapDialog.patient", { name: o.patientName || "—" })}
              </Typography>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        {onWaitlist && (
          <Button onClick={onWaitlist} disabled={saving} sx={{ mr: "auto" }}>
            {waitlistLabel}
          </Button>
        )}
        <Button onClick={onCancel} disabled={saving}>
          {t("overlapDialog.cancel")}
        </Button>
        <AppButton
          color="warning"
          variant="contained"
          onClick={onConfirm}
          loading={saving}
          disabled={saving}
        >
          {t("overlapDialog.confirm")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default OverlapConfirmDialog;
