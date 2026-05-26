import React, { useEffect, useState } from 'react';
import {
  Drawer, Box, Stack, Typography, Chip, IconButton, Tooltip,
  TextField, Button, Alert, CircularProgress,
  FormControlLabel, Checkbox, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import dayjs from 'dayjs';
import { supabase } from '../../../utility/supabaseClient';
import type { SalaryOverride } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  // Текущий выбранный месяц на странице — подставляется по умолчанию в форму
  defaultMonth: string; // 'YYYY-MM'
}

export const SalaryOverridesDrawer: React.FC<Props> = ({
  open, onClose, employeeId, employeeName, defaultMonth,
}) => {
  const [overrides, setOverrides] = useState<SalaryOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [reason, setReason] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [nightRate, setNightRate] = useState('');
  const [apptRate, setApptRate] = useState('');
  const [disableNight, setDisableNight] = useState(false);
  const [disableDynamic, setDisableDynamic] = useState(false);

  useEffect(() => {
    if (!open || !employeeId) return;
    setLoading(true);
    supabase
      .from('employee_salary_overrides')
      .select('*')
      .eq('employee_id', employeeId)
      .order('valid_from', { ascending: false })
      .then(({ data, error: err }) => {
        if (!err) setOverrides((data ?? []) as SalaryOverride[]);
        setLoading(false);
      });
  }, [open, employeeId]);

  const openAddForm = () => {
    // Pre-fill with current month
    setValidFrom(defaultMonth);
    setValidUntil(defaultMonth);
    setAdding(true);
  };

  const resetForm = () => {
    setValidFrom(''); setValidUntil(''); setReason('');
    setDayRate(''); setNightRate(''); setApptRate('');
    setDisableNight(false); setDisableDynamic(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!validFrom || !reason.trim()) return;
    setError(null);
    setSaving(true);

    const overridesPayload: SalaryOverride['overrides'] = {};

    if (dayRate || nightRate || apptRate) {
      overridesPayload.fixed_salary = {
        ...(dayRate   && { day_hourly_rate:   Number(dayRate)   }),
        ...(nightRate && { night_hourly_rate: Number(nightRate) }),
        ...(apptRate  && { appointment_rate:  Number(apptRate)  }),
      };
    }

    if (disableNight || disableDynamic) {
      overridesPayload.flags = {
        ...(disableNight   && { disable_night_hours:   true }),
        ...(disableDynamic && { disable_dynamic_rules: true }),
      };
    }

    const { data, error: err } = await supabase
      .from('employee_salary_overrides')
      .insert({
        employee_id: employeeId,
        valid_from:  dayjs(validFrom).startOf('month').format('YYYY-MM-DD'),
        // valid_until = first day of NEXT month after validUntil (exclusive boundary)
        valid_until: validUntil
          ? dayjs(validUntil).startOf('month').add(1, 'month').format('YYYY-MM-DD')
          : null,
        overrides:   overridesPayload,
        reason:      reason.trim(),
      })
      .select()
      .single();

    if (err) {
      setError(
        err.message.toLowerCase().includes('exclude') || err.message.toLowerCase().includes('conflict')
          ? 'Этот период пересекается с существующим переопределением'
          : err.message
      );
    } else {
      setOverrides(prev => [data as SalaryOverride, ...prev]);
      setAdding(false);
      resetForm();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('employee_salary_overrides').delete().eq('id', id);
    setOverrides(prev => prev.filter(o => o.id !== id));
  };

  const formatRange = (o: SalaryOverride) => {
    const from = dayjs(o.valid_from).format('MMM YYYY');
    if (!o.valid_until) return `с ${from}`;
    const until = dayjs(o.valid_until).subtract(1, 'day').format('MMM YYYY');
    return from === until ? from : `${from} — ${until}`;
  };

  const describeOverride = (o: SalaryOverride): string => {
    const parts: string[] = [];
    if (o.overrides.fixed_salary?.day_hourly_rate !== undefined)
      parts.push(`дневная: ${o.overrides.fixed_salary.day_hourly_rate} с/ч`);
    if (o.overrides.fixed_salary?.night_hourly_rate !== undefined)
      parts.push(`ночная: ${o.overrides.fixed_salary.night_hourly_rate} с/ч`);
    if (o.overrides.fixed_salary?.appointment_rate !== undefined)
      parts.push(`за приём: ${o.overrides.fixed_salary.appointment_rate} с`);
    if (o.overrides.flags?.disable_night_hours)
      parts.push('ночные отключены');
    if (o.overrides.flags?.disable_dynamic_rules)
      parts.push('проценты отключены');
    if (o.overrides.dynamic_rules !== undefined)
      parts.push(`${o.overrides.dynamic_rules.length} правил услуг`);
    return parts.join(' · ') || '—';
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 440 }, p: 0 } }}
    >
      {/* Header */}
      <Box sx={{ px: 3, pt: 3, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack spacing={0.25}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TuneIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>
                Переопределения ставок
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {employeeName}
            </Typography>
          </Stack>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ px: 3, py: 2, flex: 1, overflowY: 'auto' }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Активные переопределения
            </Typography>
            {!adding && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={openAddForm}
              >
                Добавить
              </Button>
            )}
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {overrides.length === 0 && !adding && (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.disabled">
                    Нет переопределений
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Базовые ставки из настроек сотрудника
                  </Typography>
                </Box>
              )}

              {overrides.map(o => (
                <Box
                  key={o.id}
                  sx={{
                    p: 1.5, borderRadius: 2, border: '1px solid',
                    borderColor: 'divider', bgcolor: 'background.paper',
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                    <Box flex={1}>
                      <Chip
                        label={formatRange(o)}
                        size="small"
                        color="info"
                        variant="outlined"
                        sx={{ fontSize: '0.72rem', mb: 0.5 }}
                      />
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {describeOverride(o)}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {o.reason}
                      </Typography>
                    </Box>
                    <Tooltip title="Удалить">
                      <IconButton size="small" color="error" onClick={() => handleDelete(o.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))}

              {/* Add form */}
              {adding && (
                <Box sx={{
                  p: 2, borderRadius: 2,
                  border: '1px dashed', borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                }}>
                  <Stack spacing={1.5}>
                    <Typography variant="body2" fontWeight={700}>Новое переопределение</Typography>

                    {error && (
                      <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.5 }}>
                        {error}
                      </Alert>
                    )}

                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="С месяца"
                        type="month"
                        size="small"
                        value={validFrom}
                        onChange={e => setValidFrom(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                        required
                      />
                      <TextField
                        label="По месяц (вкл.)"
                        type="month"
                        size="small"
                        value={validUntil}
                        onChange={e => setValidUntil(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                        helperText="Пусто = бессрочно"
                      />
                    </Stack>

                    <Divider>
                      <Typography variant="caption" color="text.disabled">Ставки</Typography>
                    </Divider>

                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Дневная (с/ч)"
                        type="number"
                        size="small"
                        value={dayRate}
                        onChange={e => setDayRate(e.target.value)}
                        sx={{ flex: 1 }}
                        placeholder="—"
                      />
                      <TextField
                        label="Ночная (с/ч)"
                        type="number"
                        size="small"
                        value={nightRate}
                        onChange={e => setNightRate(e.target.value)}
                        sx={{ flex: 1 }}
                        placeholder="—"
                      />
                      <TextField
                        label="За приём (с)"
                        type="number"
                        size="small"
                        value={apptRate}
                        onChange={e => setApptRate(e.target.value)}
                        sx={{ flex: 1 }}
                        placeholder="—"
                      />
                    </Stack>

                    <Divider>
                      <Typography variant="caption" color="text.disabled">Флаги</Typography>
                    </Divider>

                    <Stack>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={disableNight}
                            onChange={e => setDisableNight(e.target.checked)}
                            disabled={saving}
                          />
                        }
                        label={<Typography variant="body2">Отключить ночные часы</Typography>}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={disableDynamic}
                            onChange={e => setDisableDynamic(e.target.checked)}
                            disabled={saving}
                          />
                        }
                        label={<Typography variant="body2">Отключить проценты за услуги</Typography>}
                      />
                    </Stack>

                    <TextField
                      label="Причина *"
                      size="small"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      fullWidth
                      placeholder="Испытательный срок, отпуск..."
                      required
                    />

                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        onClick={() => { setAdding(false); resetForm(); }}
                        disabled={saving}
                      >
                        Отмена
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving || !validFrom || !reason.trim()}
                        startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                      >
                        Сохранить
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
};
