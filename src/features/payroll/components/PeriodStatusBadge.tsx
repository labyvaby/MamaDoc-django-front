import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import LockIcon from '@mui/icons-material/LockOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import type { SalaryPeriod } from '../types';

interface Props {
  period: SalaryPeriod | null;
  loading?: boolean;
}

export const PeriodStatusBadge: React.FC<Props> = ({ period, loading }) => {
  if (loading || !period) return null;

  if (period.status === 'locked') {
    const lockedDate = period.locked_at
      ? new Date(period.locked_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    return (
      <Tooltip title={`Закрыт${lockedDate ? ` ${lockedDate}` : ''}${period.notes ? ` · ${period.notes}` : ''}`}>
        <Chip
          icon={<LockIcon sx={{ fontSize: '0.9rem !important' }} />}
          label="Закрыт"
          size="small"
          color="success"
          variant="outlined"
          sx={{ fontWeight: 700, fontSize: '0.72rem', height: 26 }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title="Период открыт — данные пересчитываются в реальном времени">
      <Chip
        icon={<EditIcon sx={{ fontSize: '0.9rem !important' }} />}
        label="Черновик"
        size="small"
        color="warning"
        variant="outlined"
        sx={{ fontWeight: 700, fontSize: '0.72rem', height: 26 }}
      />
    </Tooltip>
  );
};
