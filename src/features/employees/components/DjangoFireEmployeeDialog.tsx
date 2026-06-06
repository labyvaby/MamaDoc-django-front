import React from "react";
import {
  Alert,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import PersonRemoveOutlined from "@mui/icons-material/PersonRemoveOutlined";
import { useNotification } from "@refinedev/core";
import { AppButton } from "../../../components/ui";
import { fireEmployee } from "../../../api/staff";
import type { EmployesRow } from "../types";

export type DjangoFireEmployeeDialogProps = {
  record: EmployesRow | null;
  onClose: () => void;
  /** Called after successful fire. Receives the fired employee's id. */
  onFired: (id: string) => void;
};

const DjangoFireEmployeeDialog: React.FC<DjangoFireEmployeeDialogProps> = ({
  record,
  onClose,
  onFired,
}) => {
  const { open: notify } = useNotification();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (record) setError(null);
    if (!record) setBusy(false);
  }, [record]);

  const handleFire = async () => {
    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;

    setBusy(true);
    setError(null);
    try {
      await fireEmployee(empId);
      notify?.({
        type: "success",
        message: `Сотрудник ${record.full_name} уволен`,
      });
      onFired(record.id);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Не удалось уволить сотрудника";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(record)}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Уволить сотрудника</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            Действительно уволить сотрудника «{record?.full_name || record?.id}»?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Сотрудник будет переведён в статус «Уволен», его членство в
            организации будет деактивировано. История приёмов и медицинские
            записи сохранятся.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <Tooltip title="Уволить сотрудника">
          <IconButton
            onClick={handleFire}
            color="error"
            disabled={busy}
            sx={{
              border: "1px solid",
              borderColor: "error.main",
              "&:hover": {
                borderColor: "error.dark",
                backgroundColor: "rgba(211, 47, 47, 0.08)",
              },
              "&.Mui-disabled": {
                borderColor: "action.disabled",
                color: "action.disabled",
              },
            }}
          >
            {busy ? (
              <CircularProgress size={20} color="error" />
            ) : (
              <PersonRemoveOutlined fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};

export default DjangoFireEmployeeDialog;
