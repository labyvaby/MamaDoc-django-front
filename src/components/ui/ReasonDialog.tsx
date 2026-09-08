import React from "react";
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";

import { AppButton } from "./AppButton";
import { useFormValidation } from "../../hooks/useFormValidation";

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  /** Строка над полем: зачем нужна причина и куда она попадёт. */
  description?: string;
  label?: string;
  confirmText?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Диалог действия, которое бэк не выполнит без причины: пауза задачи, возврат
 * из приёмки, отмена. Причина обязательна — она уходит в историю и объясняет
 * коллегам, что произошло.
 */
export const ReasonDialog: React.FC<ReasonDialogProps> = ({
  open,
  title,
  description,
  label = "Причина",
  confirmText = "Подтвердить",
  loading,
  onCancel,
  onConfirm,
}) => {
  const [reason, setReason] = React.useState("");
  const validation = useFormValidation({
    reason: reason.trim() ? null : "Укажите причину",
  });

  // Диалог переиспользуется для разных действий: при каждом открытии поле
  // должно быть чистым, иначе в историю уедет причина от прошлого раза.
  React.useEffect(() => {
    if (open) {
      setReason("");
      validation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (!validation.validate()) return;
    onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {description}
          </Typography>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label={label}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          // Enter отправляет, Shift+Enter — перенос строки: причина обычно в одну строку.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          sx={{ mt: 1 }}
          {...validation.field("reason")}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <AppButton variant="outlined" onClick={onCancel} disabled={loading}>
          Отмена
        </AppButton>
        <AppButton variant="contained" onClick={submit} loading={loading}>
          {confirmText}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default ReasonDialog;
