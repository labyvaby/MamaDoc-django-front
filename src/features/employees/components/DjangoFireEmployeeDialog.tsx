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
import { fireEmployee, type DjangoEmployee } from "../../../api/staff";
import type { EmployesRow } from "../types";

export type DjangoFireEmployeeDialogProps = {
  record: EmployesRow | null;
  onClose: () => void;
  /** Called after successful fire with the fresh card from the backend. */
  onFired: (employee: DjangoEmployee) => void;
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
      const fired = await fireEmployee(empId);
      notify?.({
        type: "success",
        message: `Сотрудник ${record.full_name} уволен`,
      });
      onFired(fired);
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
            записи сохранятся. Если это ошибка, сотрудника можно вернуть
            кнопкой «Восстановить» в его строке.
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
                backgroundColor: "error.lighter",
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
