import React, { useEffect, useState } from 'react';
import {
  Drawer, Box, Stack, Typography, Switch,
  CircularProgress, Alert, IconButton, Button, Chip, alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TuneIcon from '@mui/icons-material/Tune';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import PercentIcon from '@mui/icons-material/Percent';
import { supabase } from '../../../utility/supabaseClient';
import type { PayrollMonthSettings } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  month: string;
  monthLabel: string;
  initialSettings: PayrollMonthSettings;
  onSaved: (settings: PayrollMonthSettings) => void;
}

function settingsFromForm(
  mergeNight: boolean,
  disableDynamic: boolean,
): PayrollMonthSettings {
  const s: PayrollMonthSettings = {};
  if (mergeNight)     s.merge_night_into_day = true;
  if (disableDynamic) s.disable_dynamic_rules = true;
  return s;
}

interface SettingRowProps {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  activeLabel: string;
  inactiveLabel: string;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon, iconColor, iconBg, title, description,
  checked, onChange, disabled, activeLabel, inactiveLabel,
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      p: 2,
      borderRadius: 3,
      border: '1.5px solid',
      borderColor: checked ? iconColor : 'divider',
      bgcolor: checked ? alpha(iconColor, 0.04) : 'background.paper',
      transition: 'all 0.2s ease',
      cursor: disabled ? 'default' : 'pointer',
    }}
    onClick={() => !disabled && onChange(!checked)}
  >
    <Box
      sx={{
        flexShrink: 0,
        width: 44,
        height: 44,
        borderRadius: 2.5,
        bgcolor: checked ? alpha(iconColor, 0.14) : iconBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: checked ? iconColor : 'text.disabled',
        transition: 'all 0.2s ease',
      }}
    >
      {icon}
    </Box>

    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
        <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Chip
          label={checked ? activeLabel : inactiveLabel}
          size="small"
          sx={{
            height: 18,
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: 0.3,
            bgcolor: checked ? alpha(iconColor, 0.14) : (t: any) => alpha(t.palette.text.disabled, 0.1),
            color: checked ? iconColor : 'text.disabled',
            border: 'none',
          }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {description}
      </Typography>
    </Box>

    <Switch
      checked={checked}
      onChange={e => { e.stopPropagation(); onChange(e.target.checked); }}
      disabled={disabled}
      size="small"
      onClick={e => e.stopPropagation()}
      sx={{
        flexShrink: 0,
        '& .MuiSwitch-switchBase.Mui-checked': { color: iconColor },
        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: iconColor },
      }}
    />
  </Box>
);

export const PeriodSettingsDialog: React.FC<Props> = ({
  open, onClose, month, monthLabel, initialSettings, onSaved,
}) => {
  const [mergeNight,     setMergeNight]     = useState(false);
  const [disableDynamic, setDisableDynamic] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMergeNight(!!initialSettings.merge_night_into_day);
    setDisableDynamic(!!initialSettings.disable_dynamic_rules);
    setError(null);
  }, [open, initialSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const settings = settingsFromForm(mergeNight, disableDynamic);
    const { error: rpcError } = await supabase.rpc('update_period_settings', {
      p_month:    month,
      p_settings: settings,
    });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }
    onSaved(settings);
    setSaving(false);
    onClose();
  };

  const activeCount = [mergeNight, disableDynamic].filter(Boolean).length;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 420 },
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          pt: 3,
          pb: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Stack spacing={1}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: t => alpha(t.palette.primary.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'primary.main',
                }}
              >
                <TuneIcon fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.2 }}>
                  Настройки месяца
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Модификаторы расчёта зарплаты
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Chip
                label={monthLabel}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontSize: '0.72rem', fontWeight: 700 }}
              />
              {activeCount > 0 && (
                <Chip
                  label={`${activeCount} активн${activeCount === 1 ? 'о' : 'о'}`}
                  size="small"
                  color="warning"
                  sx={{ fontSize: '0.72rem', fontWeight: 700 }}
                />
              )}
            </Stack>
          </Stack>

          <IconButton size="small" onClick={onClose} sx={{ mt: -0.5, color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 3 }}>
        <Stack spacing={1.5}>
          {error && (
            <Alert severity="error" sx={{ fontSize: '0.8rem', borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Typography
            variant="caption"
            fontWeight={700}
            color="text.disabled"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.62rem', px: 0.5 }}
          >
            Флаги расчёта
          </Typography>

          <SettingRow
            icon={<NightsStayIcon fontSize="small" />}
            iconColor="#7c6af7"
            iconBg={alpha('#7c6af7', 0.07)}
            title="Объединить ночные часы с дневными"
            description="Все часы (дневные + ночные) оплачиваются по дневной ставке. Ночная надбавка не применяется."
            checked={mergeNight}
            onChange={v => setMergeNight(v)}
            disabled={saving}
            activeLabel="Включено"
            inactiveLabel="Выключено"
          />

          <SettingRow
            icon={<PercentIcon fontSize="small" />}
            iconColor="#22a56b"
            iconBg={alpha('#22a56b', 0.07)}
            title="Процент за услуги"
            description="dynamic_rules — процент от стоимости приёмов и услуг"
            checked={!disableDynamic}
            onChange={v => setDisableDynamic(!v)}
            disabled={saving}
            activeLabel="Учитывается"
            inactiveLabel="Отключён"
          />
        </Stack>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button
            onClick={onClose}
            disabled={saving}
            sx={{ fontWeight: 600, color: 'text.secondary' }}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ fontWeight: 700, borderRadius: 2, px: 3 }}
          >
            Сохранить
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};
