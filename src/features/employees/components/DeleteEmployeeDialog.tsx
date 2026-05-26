import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Typography, IconButton, Tooltip } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type { EmployesRow } from "../types";
import { AppButton } from "../../../components/ui";
import { supabase } from "../../../utility/supabaseClient";
import { EMPLOYEES_WRITE } from "../api";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../../hooks/usePermissions";

export type DeleteEmployeeDialogProps = {
  record: EmployesRow | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

const DeleteEmployeeDialog: React.FC<DeleteEmployeeDialogProps> = ({ record, onClose, onDeleted }) => {
  const open = Boolean(record);
  const [busy, setBusy] = React.useState(false);
  const { open: notify } = useNotification();
  const { isAdmin } = usePermissions();

  React.useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const handleDelete = async () => {
    if (!record || !isAdmin()) return;
    try {
      setBusy(true);
      const { error } = await supabase.from(EMPLOYEES_WRITE).delete().eq("id", record.id);
      if (error) throw error;
      notify?.({ type: "success", message: "Сотрудник удалён" });
      onDeleted(record.id);
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Delete employee failed:", e);
      notify?.({ type: "error", message: "Не удалось удалить сотрудника" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Удалить сотрудника</DialogTitle>
      <DialogContent>
        <Typography variant="body2">Действительно удалить сотрудника "{record?.full_name || record?.id}"?</Typography>
      </DialogContent>
      <DialogActions>
        <AppButton onClick={onClose} disabled={busy}>Отмена</AppButton>
        <Tooltip title="Удалить сотрудника">
          <IconButton
            onClick={handleDelete}
            color="error"
            disabled={busy}
            sx={{
              border: '1px solid',
              borderColor: 'error.main',
              '&:hover': {
                borderColor: 'error.dark',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
              },
              '&.Mui-disabled': {
                borderColor: 'action.disabled',
                color: 'action.disabled',
              }
            }}
          >
            {busy ? <CircularProgress size={20} color="error" /> : <DeleteOutlined fontSize="small" />}
          </IconButton>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteEmployeeDialog;
