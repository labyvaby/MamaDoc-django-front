import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Typography, Stack, Alert, CircularProgress,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { AppButton } from '../../../components/ui/AppButton';

interface Props {
  open: boolean;
  month: string;       // 'YYYY-MM' for display
  totalSalary: number;
  employeeCount: number;
  locking: boolean;
  onConfirm: (notes: string) => void;
  onClose: () => void;
}

export const LockPeriodDialog: React.FC<Props> = ({
  open, month, totalSalary, employeeCount, locking, onConfirm, onClose,
}) => {
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    onConfirm(notes.trim());
    setNotes('');
  };

  const handleClose = () => {
    if (locking) return;
    setNotes('');
    onClose();
  };

  const formatted = new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'KGS', maximumFractionDigits: 0,
  }).format(totalSalary);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        Закрыть период {month}?
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning" sx={{ fontSize: '0.82rem' }}>
            После закрытия отчёт будет заморожен. Изменения в ставках и приёмах
            не повлияют на исторические данные. Пересчёт возможен только вручную
            с указанием причины.
          </Alert>

          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">Итого к выплате</Typography>
            <Typography variant="h5" fontWeight={800} color="primary.main">{formatted}</Typography>
            <Typography variant="caption" color="text.secondary">{employeeCount} сотрудников</Typography>
          </Stack>

          <TextField
            label="Комментарий (необязательно)"
            placeholder="Например: февраль 2026, все данные проверены"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            multiline
            rows={2}
            size="small"
            fullWidth
            disabled={locking}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <AppButton variant="outlined" onClick={handleClose} disabled={locking}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          color="primary"
          startIcon={locking ? <CircularProgress size={16} color="inherit" /> : <LockIcon />}
          onClick={handleConfirm}
          disabled={locking}
        >
          {locking ? 'Закрываю...' : 'Закрыть период'}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
