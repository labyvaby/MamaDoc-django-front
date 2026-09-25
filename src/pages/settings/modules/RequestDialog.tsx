import React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { RequestTarget } from "../../../config/moduleStorefrontModel";

export interface RequestContact {
  name: string;
  phone: string;
  comment: string;
}

interface Props {
  target: RequestTarget | null;
  open: boolean;
  defaultName: string;
  defaultPhone: string;
  submitting: boolean;
  onSubmit: (contact: RequestContact) => void;
  onClose: () => void;
  /** Окно закрылось до конца — страница забывает цель (без мигания текста). */
  onExited: () => void;
}

export const RequestDialog: React.FC<Props> = ({
  target,
  open,
  defaultName,
  defaultPhone,
  submitting,
  onSubmit,
  onClose,
  onExited,
}) => {
  const [name, setName] = React.useState(defaultName);
  const [phone, setPhone] = React.useState(defaultPhone);
  const [comment, setComment] = React.useState("");
  const [phoneError, setPhoneError] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setPhone(defaultPhone);
    setComment("");
    setPhoneError(false);
  }, [open, defaultName, defaultPhone]);

  const submit = () => {
    if (!phone.trim()) {
      setPhoneError(true);
      return;
    }
    onSubmit({ name: name.trim(), phone: phone.trim(), comment: comment.trim() });
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      fullWidth
      maxWidth="xs"
      slotProps={{ transition: { onExited } }}
    >
      <DialogTitle>Подключить «{target?.title ?? ""}»?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Менеджер ErkinAI свяжется с вами, ответит на вопросы и включит модуль.
          </Typography>
          {target && target.extraRequirementNames.length > 0 && (
            <Alert severity="info" variant="outlined">
              Также понадобится: {target.extraRequirementNames.map((n) => `«${n}»`).join(", ")}.
            </Alert>
          )}
          <TextField label="Имя" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField
            label="Телефон"
            type="tel"
            required
            value={phone}
            error={phoneError}
            helperText={phoneError ? "Укажите телефон для связи" : undefined}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError(false);
            }}
            fullWidth
          />
          <TextField
            label="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Например: какие мессенджеры подключить"
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Отмена
        </Button>
        <Button variant="contained" onClick={submit} disabled={submitting}>
          Отправить заявку
        </Button>
      </DialogActions>
    </Dialog>
  );
};
