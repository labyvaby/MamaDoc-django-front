import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Chip, IconButton, Tooltip,
  TextField, Button, Alert, CircularProgress,
  FormControlLabel, Checkbox,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import dayjs from 'dayjs';
import { supabase } from '../../../utility/supabaseClient';
import type { SalaryOverride } from '../types';

interface Props {
  employeeId: string;
}

export const SalaryOverridesPanel: React.FC<Props> = ({ employeeId }) => {
  const [overrides, setOverrides] = useState<SalaryOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New override form state
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [reason, setReason] = useState('');
  const [nightRate, setNightRate] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [disableNight, setDisableNight] = useState(false);
  const [disableDynamic, setDisableDynamic] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
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
  }, [employeeId]);

  const handleSave = async () => {
    if (!validFrom || !reason.trim()) return;
    setError(null);
    setSaving(true);

    // Build the overrides payload — only include fields that were set
    const overridesPayload: SalaryOverride['overrides'] = {};
    if (dayRate || nightRate) {
      overridesPayload.fixed_salary = {};
      if (dayRate)   overridesPayload.fixed_salary.day_hourly_rate   = Number(dayRate);
      if (nightRate) overridesPayload.fixed_salary.night_hourly_rate = Number(nightRate);
    }
    if (disableNight || disableDynamic) {
      overridesPayload.flags = {
        ...(disableNight   && { disable_night_hours:    true }),
        ...(disableDynamic && { disable_dynamic_rules:  true }),
      };
    }

    const { data, error: err } = await supabase
      .from('employee_salary_overrides')
      .insert({
        employee_id: employeeId,
        valid_from:  dayjs(validFrom).startOf('month').format('YYYY-MM-DD'),
        valid_until: validUntil
          ? dayjs(validUntil).startOf('month').add(1, 'month').format('YYYY-MM-DD')
          : null,
        overrides:   overridesPayload,
        reason:      reason.trim(),
      })
      .select()
      .single();

    if (err) {
      // Postgres EXCLUDE constraint gives a clear error message
      setError(err.message.includes('exclude')
        ? 'Период пересекается с существующим переопределением'
        : err.message);
    } else {
      setOverrides(prev => [data as SalaryOverride, ...prev]);
      setAdding(false);
      setValidFrom(''); setValidUntil(''); setReason('');
      setNightRate(''); setDayRate('');
      setDisableNight(false); setDisableDynamic(false);
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
    return `${from} — ${until}`;
  };

  const describeOverride = (o: SalaryOverride): string => {
    const parts: string[] = [];
    if (o.overrides.fixed_salary?.day_hourly_rate !== undefined)
      parts.push(`дневная ставка: ${o.overrides.fixed_salary.day_hourly_rate} с/ч`);
    if (o.overrides.fixed_salary?.night_hourly_rate !== undefined)
      parts.push(`ночная ставка: ${o.overrides.fixed_salary.night_hourly_rate} с/ч`);
    if (o.overrides.flags?.disable_night_hours)
      parts.push('ночные часы отключены');
    if (o.overrides.flags?.disable_dynamic_rules)
      parts.push('проценты отключены');
    if (o.overrides.dynamic_rules !== undefined)
      parts.push(`услуги: ${o.overrides.dynamic_rules.length} правил`);
    return parts.join(', ') || 'без изменений';
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="body2" fontWeight={700} color="text.secondary">
          Временные переопределения ставок
        </Typography>
        {!adding && (
          <Tooltip title="Добавить переопределение">
            <IconButton size="small" onClick={() => setAdding(true)}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {loading ? (
        <CircularProgress size={20} />
      ) : (
        <Stack spacing={1}>
          {overrides.length === 0 && !adding && (
            <Typography variant="caption" color="text.disabled">
              Нет активных переопределений
            </Typography>
          )}

          {overrides.map(o => (
            <Box
              key={o.id}
              sx={{
                p: 1.5, borderRadius: "10px", border: '1px solid',
                borderColor: 'divider', bgcolor: 'background.paper',
              }}
            >
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box flex={1}>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <Chip label={formatRange(o)} size="small" variant="outlined" color="info" sx={{ fontSize: '0.7rem' }} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {describeOverride(o)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {o.reason}
                  </Typography>
                </Box>
                <IconButton size="small" color="error" onClick={() => handleDelete(o.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>
          ))}

          {adding && (
            <Box sx={{ p: 1.5, borderRadius: "10px", border: '1px dashed', borderColor: 'primary.main', bgcolor: 'action.hover' }}>
              <Stack spacing={1.5}>
                {error && <Alert severity="error" sx={{ fontSize: '0.78rem', py: 0.5 }}>{error}</Alert>}

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

                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Дневная ставка (с/ч)"
                    type="number"
                    size="small"
                    value={dayRate}
                    onChange={e => setDayRate(e.target.value)}
                    sx={{ flex: 1 }}
                    placeholder="Без изменений"
                  />
                  <TextField
                    label="Ночная ставка (с/ч)"
                    type="number"
                    size="small"
                    value={nightRate}
                    onChange={e => setNightRate(e.target.value)}
                    sx={{ flex: 1 }}
                    placeholder="Без изменений"
                  />
                </Stack>

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
                    label={<Typography variant="caption">Отключить ночные часы</Typography>}
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
                    label={<Typography variant="caption">Отключить проценты за услуги</Typography>}
                  />
                </Stack>

                <TextField
                  label="Причина"
                  size="small"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  required
                  fullWidth
                  placeholder="Испытательный срок, отпуск, повышение..."
                />

                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => { setAdding(false); setError(null); }} disabled={saving}>
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
    </Box>
  );
};
