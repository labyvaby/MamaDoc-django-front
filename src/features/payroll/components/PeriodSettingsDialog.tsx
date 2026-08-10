import React, { useEffect, useState } from 'react';
import {
  Drawer, Box, Stack, Typography, Switch,
  CircularProgress, Alert, IconButton, Button, Chip, alpha, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import TuneIcon from '@mui/icons-material/TuneOutlined';
import NightsStayIcon from '@mui/icons-material/NightsStayOutlined';
import PercentIcon from '@mui/icons-material/PercentOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAltOutlined';
import { subtleBg } from '../../../theme';
import type { PayrollMonthSettings } from '../types';
import { updatePeriodSettings } from '../../../api/payroll';
import { useT } from '../../../i18n/VerticalProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  month: string;
  monthLabel: string;
  initialSettings: PayrollMonthSettings;
  onSaved: (settings: PayrollMonthSettings) => void;
  organizationId?: number;
}

function settingsFromForm(
  mergeNight: boolean,
  disableDynamic: boolean,
  monthlyDistribution: boolean,
): PayrollMonthSettings {
  const s: PayrollMonthSettings = {};
  if (mergeNight)           s.merge_night_into_day = true;
  if (disableDynamic)       s.disable_dynamic_rules = true;
  if (monthlyDistribution)  s.distribution_model = 'monthly_hours';
  else                      s.distribution_model = 'daily_hours';
  return s;
}

interface SettingRowProps {
  icon: React.ReactNode;
  /** Цвет акцента как ТЕКСТ/иконка на поверхности (контраст-безопасный). */
  iconColor: string;
  /** Цвет акцента для заливок (main). */
  iconFill: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  activeLabel: string;
  inactiveLabel: string;
}

const SettingRow: React.FC<SettingRowProps> = ({
  icon, iconColor, iconFill, title, description,
  checked, onChange, disabled, activeLabel, inactiveLabel,
}) => (
  <Box
    sx={(t) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      p: 2,
      borderRadius: '10px',
      border: 1,
      borderColor: checked ? alpha(iconFill, 0.28) : 'divider',
      bgcolor: checked ? alpha(iconFill, 0.06) : subtleBg(t),
      transition: 'background-color .15s ease, border-color .15s ease',
      cursor: disabled ? 'default' : 'pointer',
      '&:hover': disabled ? undefined : { bgcolor: subtleBg(t, true), borderColor: alpha(iconFill, 0.28) },
    })}
    onClick={() => !disabled && onChange(!checked)}
  >
    <Box
      sx={{
        flexShrink: 0,
        width: 44,
        height: 44,
        borderRadius: '10px',
        bgcolor: checked ? alpha(iconFill, 0.14) : alpha(iconFill, 0.08),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: checked ? iconColor : 'text.disabled',
        transition: 'background-color .15s ease, color .15s ease',
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
            borderRadius: '7px',
            bgcolor: checked ? alpha(iconFill, 0.14) : (t: any) => alpha(t.palette.text.disabled, 0.1),
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
        '& .MuiSwitch-switchBase.Mui-checked': { color: iconFill },
        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: iconFill },
      }}
    />
  </Box>
);

export const PeriodSettingsDialog: React.FC<Props> = ({
  open, onClose, month, monthLabel, initialSettings, onSaved, organizationId,
}) => {
  const { t } = useT('salaryReports');
  const theme = useTheme();
  const [mergeNight,     setMergeNight]     = useState(false);
  const [disableDynamic, setDisableDynamic] = useState(false);
  const [monthlyDistribution, setMonthlyDistribution] = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
 
  useEffect(() => {
    if (!open) return;
    setMergeNight(!!initialSettings.merge_night_into_day);
    setDisableDynamic(!!initialSettings.disable_dynamic_rules);
    setMonthlyDistribution(initialSettings.distribution_model !== 'daily_hours');
    setError(null);
  }, [open, initialSettings]);
 
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const settings = settingsFromForm(mergeNight, disableDynamic, monthlyDistribution);
 
    try {
      const parts = month.split('-');
      const yr = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      await updatePeriodSettings(yr, m, settings, organizationId);
      onSaved(settings);
      setSaving(false);
      onClose();
    } catch (err: any) {
      setError(err.message || t('periodSettings.saveError'));
      setSaving(false);
    }
  };
 
  const activeCount = [mergeNight, disableDynamic, monthlyDistribution].filter(Boolean).length;

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
                  borderRadius: "14px",
                  bgcolor: t => alpha(t.palette.primary.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'primary.onSurface',
                }}
              >
                <TuneIcon fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                  {t('periodSettings.title')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('periodSettings.subtitle')}
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
                  label={t('periodSettings.activeCount', { count: activeCount })}
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
            <Alert severity="error" sx={{ fontSize: '0.8rem', borderRadius: "14px" }}>
              {error}
            </Alert>
          )}

          <Typography
            variant="caption"
            fontWeight={700}
            color="text.disabled"
            sx={{ letterSpacing: 0.8, fontSize: '0.62rem', px: 0.5 }}
          >
            {t('periodSettings.flagsSection')}
          </Typography>

          <SettingRow
            icon={<NightsStayIcon fontSize="small" />}
            iconColor={theme.palette.purple.onSurface}
            iconFill={theme.palette.purple.main}
            title={t('periodSettings.mergeNightTitle')}
            description={t('periodSettings.mergeNightDesc')}
            checked={mergeNight}
            onChange={v => setMergeNight(v)}
            disabled={saving}
            activeLabel={t('periodSettings.on')}
            inactiveLabel={t('periodSettings.off')}
          />

          <SettingRow
            icon={<PercentIcon fontSize="small" />}
            iconColor={theme.palette.success.onSurface}
            iconFill={theme.palette.success.main}
            title={t('periodSettings.percentTitle')}
            description={t('periodSettings.percentDesc')}
            checked={!disableDynamic}
            onChange={v => setDisableDynamic(!v)}
            disabled={saving}
            activeLabel={t('periodSettings.considered')}
            inactiveLabel={t('periodSettings.percentDisabled')}
          />

          <Typography
            variant="caption"
            fontWeight={700}
            color="text.disabled"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.62rem', px: 0.5, pt: 1 }}
          >
            {t('periodSettings.registratorSection')}
          </Typography>

          <SettingRow
            icon={<PeopleAltIcon fontSize="small" />}
            iconColor="#e07b39"
            iconFill="#e07b39"
            title={t('periodSettings.distributionTitle')}
            description={t('periodSettings.distributionDesc')}
            checked={monthlyDistribution}
            onChange={v => setMonthlyDistribution(v)}
            disabled={saving}
            activeLabel={t('periodSettings.newLogic')}
            inactiveLabel={t('periodSettings.oldLogic')}
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
            {t('periodSettings.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ fontWeight: 700, borderRadius: "14px", px: 3 }}
          >
            {t('periodSettings.save')}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};
