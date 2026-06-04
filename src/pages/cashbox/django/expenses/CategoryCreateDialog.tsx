import React from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createExpenseCategory, parseBackendError } from "../../../../api/expenses";
import { djangoQueryKeys } from "../../../../api/queryKeys";

type Props = {
  open: boolean;
  organizationId?: number;
  onClose: () => void;
  onCreated: (id: number, name: string) => void;
};

const CategoryCreateDialog: React.FC<Props> = ({ open, organizationId, onClose, onCreated }) => {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createExpenseCategory({ name: name.trim(), organizationId, isActive: true }),
    onSuccess: (cat) => {
      queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.expenses.categories(organizationId),
      });
      onCreated(cat.id, cat.name);
      setName("");
      setError(null);
    },
    onError: (err) => {
      setError(parseBackendError(err));
    },
  });

  const handleClose = () => {
    if (mutation.isPending) return;
    setName("");
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (name.trim().length < 2) {
      setError("Название должно содержать минимум 2 символа");
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Новая категория</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Название"
          size="small"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          error={!!error}
          helperText={error ?? " "}
          disabled={mutation.isPending}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={mutation.isPending} size="small">
          Отмена
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={handleSubmit}
          disabled={mutation.isPending || name.trim().length === 0}
          startIcon={mutation.isPending ? <CircularProgress size={14} /> : undefined}
        >
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategoryCreateDialog;
