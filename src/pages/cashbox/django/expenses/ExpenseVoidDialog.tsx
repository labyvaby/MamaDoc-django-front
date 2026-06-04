import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { voidExpense, parseBackendError } from "../../../../api/expenses";
import { djangoQueryKeys } from "../../../../api/queryKeys";
import type { Expense } from "../../../../api/expenses";

type Props = {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onVoided: () => void;
};

const ExpenseVoidDialog: React.FC<Props> = ({ open, expense, onClose, onVoided }) => {
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => voidExpense(expense!.id, { reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: ["django", "cashbox", "summary"] });
      queryClient.invalidateQueries({
        queryKey: ["django", "cashbox", "entries", "expense"],
      });
      onVoided();
      handleClose();
    },
    onError: (err) => {
      setServerError(parseBackendError(err));
    },
  });

  const handleClose = () => {
    if (mutation.isPending) return;
    setReason("");
    setReasonError(null);
    setServerError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (reason.trim().length < 3) {
      setReasonError("Причина минимум 3 символа");
      return;
    }
    setReasonError(null);
    setServerError(null);
    mutation.mutate();
  };

  if (!expense) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Аннулировать расход</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1.5 }}>
          Расход{" "}
          <Typography component="span" fontWeight={600}>
            {expense.amount} с
          </Typography>{" "}
          — {expense.categoryName ?? "без категории"} ({expense.expenseDate}) будет аннулирован.
          Это действие нельзя отменить.
        </DialogContentText>

        {serverError && (
          <Alert severity="error" sx={{ py: 0.5, mb: 1.5 }}>
            {serverError}
          </Alert>
        )}

        <TextField
          autoFocus
          fullWidth
          size="small"
          label="Причина *"
          multiline
          minRows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
          error={!!reasonError}
          helperText={reasonError ?? "Минимум 3 символа"}
          disabled={mutation.isPending}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={mutation.isPending} size="small">
          Отмена
        </Button>
        <Button
          variant="contained"
          color="error"
          size="small"
          onClick={handleSubmit}
          disabled={mutation.isPending || reason.trim().length === 0}
          startIcon={mutation.isPending ? <CircularProgress size={14} /> : undefined}
        >
          Аннулировать
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExpenseVoidDialog;
