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
import HowToRegOutlined from "@mui/icons-material/HowToRegOutlined";
import { useNotification } from "@refinedev/core";
import { AppButton } from "../../../components/ui";
import { restoreEmployee, type DjangoEmployee } from "../../../api/staff";
import type { EmployesRow } from "../types";
import { restoreOutcomeMessage } from "../employment";

export type DjangoRestoreEmployeeDialogProps = {
  record: EmployesRow | null;
  onClose: () => void;
  /** Called after a successful restore with the fresh card from the backend. */
  onRestored: (employee: DjangoEmployee) => void;
};

/**
 * Возврат уволенного в штат — зеркало диалога увольнения.
 *
 * Отдельное действие, а не переключатель статуса в форме: вместе со статусом
 * бэк включает обратно членство в организации и те услуги, что выключило
 * увольнение. Правка одного поля вернула бы надпись «Активный», оставив
 * человека без доступа в систему.
 */
const DjangoRestoreEmployeeDialog: React.FC<DjangoRestoreEmployeeDialogProps> = ({
  record,
  onClose,
  onRestored,
}) => {
  const { open: notify } = useNotification();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (record) setError(null);
    if (!record) setBusy(false);
  }, [record]);

  const handleRestore = async () => {
    if (!record) return;
    const empId = Number(record.id);
    if (isNaN(empId) || empId <= 0) return;

    setBusy(true);
    setError(null);
    try {
      const result = await restoreEmployee(empId);
      notify?.(restoreOutcomeMessage(result, record.full_name ?? ""));
      onRestored(result.employee);
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Не удалось восстановить сотрудника";
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
      <DialogTitle>Восстановить сотрудника</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            Вернуть сотрудника «{record?.full_name || record?.id}» в штат?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Вернётся статус, который был до увольнения, а также доступ в
            систему и услуги, снятые при увольнении. Если сотрудника уволили
            до появления журнала увольнений, система не знает, что именно
            выключалось, — тогда доступ и услуги нужно будет выдать вручную.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton onClick={onClose} disabled={busy}>
          Отмена
        </AppButton>
        <Tooltip title="Восстановить сотрудника">
          <IconButton
            onClick={handleRestore}
            color="success"
            disabled={busy}
            data-testid="restore-employee-confirm"
            sx={{
              border: "1px solid",
              borderColor: "success.main",
              "&:hover": {
                borderColor: "success.dark",
                backgroundColor: "success.lighter",
              },
              "&.Mui-disabled": {
                borderColor: "action.disabled",
                color: "action.disabled",
              },
            }}
          >
            {busy ? (
              <CircularProgress size={20} color="success" />
            ) : (
              <HowToRegOutlined fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};

export default DjangoRestoreEmployeeDialog;
