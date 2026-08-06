import React from "react";
import {
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
import type { Dayjs } from "dayjs";

export interface SchedulePointEditValues {
  startTime: string;
  endTime: string;
  comment: string;
}

export interface SchedulePointEditDialogProps {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  date: Dayjs | null;
  initialStartTime: string;
  initialEndTime: string;
  initialComment?: string;
  existing: boolean;
  onSave: (values: SchedulePointEditValues) => Promise<void>;
}

const SchedulePointEditDialog: React.FC<SchedulePointEditDialogProps> = ({
  open,
  onClose,
  employeeName,
  date,
  initialStartTime,
  initialEndTime,
  initialComment = "",
  existing,
  onSave,
}) => {
  const [startTime, setStartTime] = React.useState(initialStartTime);
  const [endTime, setEndTime] = React.useState(initialEndTime);
  const [comment, setComment] = React.useState(initialComment);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStartTime(initialStartTime);
    setEndTime(initialEndTime);
    setComment(initialComment);
    setError(null);
    setBusy(false);
  }, [open, initialComment, initialEndTime, initialStartTime]);

  const handleSave = async () => {
    if (!startTime || !endTime || startTime >= endTime) {
      setError("Начало смены должно быть раньше конца");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ startTime, endTime, comment: comment.trim() });
      onClose();
    } catch {
      setError("Не удалось сохранить точечное расписание");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{existing ? "Изменить смену" : "Изменить только этот день"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {employeeName} · {date?.format("DD.MM.YYYY")}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              label="Начало"
              type="time"
              size="small"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={busy}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Typography color="text.secondary">—</Typography>
            <TextField
              label="Конец"
              type="time"
              size="small"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              disabled={busy}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <TextField
            label="Комментарий"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={busy}
            fullWidth
            multiline
            minRows={2}
          />
          {error && <Typography color="error" variant="body2">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Отмена</Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SchedulePointEditDialog;
