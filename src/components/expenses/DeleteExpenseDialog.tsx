import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  CircularProgress,
  IconButton,
  Tooltip,
} from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
// import { useDelete, useInvalidate } from "@refinedev/core";
import type { Expense } from "../../pages/expenses/types";
import { ExpensesService } from "../../services/expenses";
import { deleteExpensePhotoByUrl } from "../../services/storage";

type DeleteExpenseDialogProps = {
  open: boolean;
  onClose: () => void;
  record: Expense | null;
  onDeleted?: (id: number) => void;
};

export const DeleteExpenseDialog: React.FC<DeleteExpenseDialogProps> = ({
  open,
  onClose,
  record,
  onDeleted,
}) => {
  // Refine hooks removed
  // const { mutateAsync: deleteAsync } = useDelete();
  // const invalidate = useInvalidate();


  // Custom Service - Imported at top

  const [busy, setBusy] = React.useState(false);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const handleDelete = async () => {
    if (!record) return;
    try {
      setBusy(true);

      // Delete DB row via service
      await ExpensesService.delete(record.id);

      // Best-effort delete photo from storage (non-blocking for UX)
      if (record.photo) {
        try {
          await deleteExpensePhotoByUrl(record.photo);
        } catch {
          // ignore storage deletion errors
        }
      }

      if (onDeleted) onDeleted(record.id);
      onClose();
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.error("Delete expense failed:", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle>Удалить расход</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Действительно удалить расход{record ? ` “${record.name}”` : ""}? Это действие необратимо.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Отмена</Button>
        <Tooltip title="Удалить расход">
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
            {busy ? (
              <CircularProgress size={20} color="error" />
            ) : (
              <DeleteOutlined fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
};
