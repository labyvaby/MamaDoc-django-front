import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useFormValidation } from "../../hooks/useFormValidation";
import { getErrorMessage } from "../../api/client";
import { rejectCleaningRecord, type CleaningRecord } from "../../api/cleaning";

interface RejectDialogProps {
  /** null — диалог закрыт. */
  record: CleaningRecord | null;
  onClose: () => void;
  /** Успешное отклонение — родитель инвалидирует списки. */
  onSuccess: () => void;
}

/** Диалог отклонения уборки с обязательной причиной. */
const RejectDialog: React.FC<RejectDialogProps> = ({ record, onClose, onSuccess }) => {
  const { open: notify } = useNotification();
  const orgId = useApiOrgId();

  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const v = useFormValidation({
    reason: reason.trim() ? null : "Укажите причину отклонения",
  });

  // Сброс формы при каждом открытии.
  React.useEffect(() => {
    if (record !== null) {
      setReason("");
      v.reset();
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  const handleSubmit = async () => {
    if (!record) return;
    if (!v.validate()) return;
    setBusy(true);
    setError(null);
    try {
      await rejectCleaningRecord(record.id, reason.trim(), orgId);
      notify?.({ type: "success", message: "Уборка отклонена" });
      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={record !== null}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Отклонить уборку?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {record?.typeName} ·{" "}
            {record ? dayjs(record.createdAt).format("DD.MM.YYYY HH:mm") : ""} ·{" "}
            {record?.employeeName}
          </Typography>
          <TextField
            label="Причина"
            size="small"
            fullWidth
            autoFocus
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            {...v.field("reason", "Причина обязательна — сотрудник увидит её у записи")}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {busy ? "Отклонение…" : "Отклонить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RejectDialog;
