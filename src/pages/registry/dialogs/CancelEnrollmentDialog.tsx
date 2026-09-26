import React from "react";
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../../api/client";
import type { ProgramEnrollment } from "../../../api/programs";
import { cancelEnrollment, type CancelReason } from "../../../api/registry";
import { AppButton } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { useT } from "../../../i18n/VerticalProvider";
import { CANCEL_REASONS } from "../registryConstants";

interface CancelEnrollmentDialogProps {
  open: boolean;
  scope: ActiveScope;
  enrollmentId: number;
  patientName: string;
  /** Причина, выбранная при открытии; из вкладки «Не приходили» — «Не посещает». */
  defaultReason?: CancelReason;
  onClose: () => void;
  onDone: (enrollment: ProgramEnrollment) => void;
}

/** Снятие с учёта с причиной: «Другое» требует комментарий, «Выбыл» — можно указать адрес выбытия. */
export const CancelEnrollmentDialog: React.FC<CancelEnrollmentDialogProps> = ({
  open,
  scope,
  enrollmentId,
  patientName,
  defaultReason = "moved",
  onClose,
  onDone,
}) => {
  const { t } = useT("registry");
  const { enqueueSnackbar } = useSnackbar();
  const [reason, setReason] = React.useState<CancelReason>(defaultReason);
  const [comment, setComment] = React.useState("");
  const [movedToAddress, setMovedToAddress] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setReason(defaultReason);
    setComment("");
    setMovedToAddress("");
  }, [open, defaultReason]);

  const commentMissing = reason === "other" && !comment.trim();
  const mutation = useMutation({
    mutationFn: () =>
      cancelEnrollment(scope, enrollmentId, {
        reason,
        comment: comment.trim(),
        ...(reason === "moved" && movedToAddress.trim() ? { movedToAddress: movedToAddress.trim() } : {}),
      }),
    onSuccess: (enrollment) => {
      enqueueSnackbar(t("cancel.done"), { variant: "success" });
      onDone(enrollment);
    },
  });

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t("cancel.title")} — {patientName}
      </DialogTitle>
      <DialogContent>
        <Stack gap={1.5} sx={{ mt: 0.5 }}>
          <TextField
            select
            size="small"
            label={t("cancel.reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value as CancelReason)}
          >
            {CANCEL_REASONS.map((key) => (
              <MenuItem key={key} value={key}>
                {t(`cancelReasons.${key}`)}
              </MenuItem>
            ))}
          </TextField>
          {reason === "moved" && (
            <TextField
              size="small"
              label={t("cancel.movedToAddress")}
              value={movedToAddress}
              onChange={(e) => setMovedToAddress(e.target.value.slice(0, 255))}
              helperText={t("cancel.movedToAddressHint")}
            />
          )}
          <TextField
            size="small"
            label={t("cancel.comment")}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            multiline
            minRows={2}
            error={commentMissing}
            helperText={commentMissing ? t("cancel.commentRequired") : undefined}
          />
          {mutation.error && <Alert severity="error">{getErrorMessage(mutation.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="text" onClick={onClose} disabled={mutation.isPending}>
          {t("wizard.close")}
        </AppButton>
        <AppButton
          variant="contained"
          color="error"
          disabled={commentMissing || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t("cancel.submit")}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
