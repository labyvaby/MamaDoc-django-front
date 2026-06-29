import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Typography, Stack, Alert, CircularProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import { AppButton } from '../../../components/ui/AppButton';

interface Props {
  open: boolean;
  month: string;
  recalculating: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export const RecalculateDialog: React.FC<Props> = ({
  open, month, recalculating, onConfirm, onClose,
}) => {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  };

  const handleClose = () => {
    if (recalculating) return;
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Пересчитать {month}?
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="info" sx={{ fontSize: '0.82rem' }}>
            Старый расчёт сохранится в истории ревизий и не будет удалён.
            Новые цифры заменят текущий снимок.
          </Alert>

          <TextField
            label="Причина пересчёта"
            placeholder="Например: исправлена ставка врача Иванова"
            value={reason}
            onChange={e => setReason(e.target.value)}
            multiline
            rows={2}
            size="small"
            fullWidth
            required
            error={reason.trim() === ''}
            helperText={reason.trim() === '' ? 'Обязательное поле' : ''}
            disabled={recalculating}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <AppButton variant="outlined" onClick={handleClose} disabled={recalculating}>
          Отмена
        </AppButton>
        <AppButton
          variant="contained"
          color="warning"
          startIcon={recalculating ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
          onClick={handleConfirm}
          disabled={recalculating || !reason.trim()}
        >
          {recalculating ? 'Пересчитываю...' : 'Пересчитать'}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};
