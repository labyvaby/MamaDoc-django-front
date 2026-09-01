import React from "react";
import {
  Alert,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { MAX_INTERVAL_DAYS } from "../../../api/automations";
import { useT } from "../../../i18n/VerticalProvider";
import type { ScheduleForm } from "./automationForm";

export interface ScheduleEditorProps {
  value: ScheduleForm;
  onChange: (schedule: ScheduleForm) => void;
  error?: string;
  disabled?: boolean;
}

/** Понедельник первый: 0 = Пн, как в `date.weekday()` на бэке. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Периодичность правила по расписанию.
 *
 * Два вида повторения вместо одного поля с cron-строкой: «каждый понедельник»
 * и «каждые 2 дня» — это всё, что просят, а cron пришлось бы объяснять.
 */
export const ScheduleEditor: React.FC<ScheduleEditorProps> = ({
  value,
  onChange,
  error,
  disabled = false,
}) => {
  const { t } = useT("settings");

  const toggleWeekday = (day: number) => {
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((item) => item !== day)
      : [...value.weekdays, day].sort((a, b) => a - b);
    onChange({ ...value, weekdays });
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <TextField
          select
          size="small"
          label={t("automations.schedule.kindLabel")}
          value={value.kind}
          onChange={(e) =>
            onChange({ ...value, kind: e.target.value as ScheduleForm["kind"] })
          }
          disabled={disabled}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="weekly">{t("automations.schedule.kind.weekly")}</MenuItem>
          <MenuItem value="interval_days">
            {t("automations.schedule.kind.interval_days")}
          </MenuItem>
        </TextField>

        {value.kind === "interval_days" && (
          <TextField
            size="small"
            label={t("automations.schedule.intervalLabel")}
            value={value.intervalDays}
            onChange={(e) =>
              onChange({
                ...value,
                intervalDays: e.target.value.replace(/[^\d]/g, ""),
              })
            }
            disabled={disabled}
            inputProps={{ inputMode: "numeric" }}
            helperText={t("automations.schedule.intervalHint", {
              max: MAX_INTERVAL_DAYS,
            })}
            sx={{ minWidth: 200 }}
          />
        )}

        <TextField
          size="small"
          type="time"
          label={t("automations.schedule.timeLabel")}
          value={value.time}
          onChange={(e) => onChange({ ...value, time: e.target.value })}
          disabled={disabled}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 160 }}
        />
      </Stack>

      {value.kind === "weekly" && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {WEEKDAYS.map((day) => (
            <Chip
              key={day}
              size="small"
              label={t(`automations.schedule.weekday.${day}`)}
              color={value.weekdays.includes(day) ? "primary" : "default"}
              variant={value.weekdays.includes(day) ? "filled" : "outlined"}
              onClick={disabled ? undefined : () => toggleWeekday(day)}
              disabled={disabled}
              sx={{ cursor: disabled ? "default" : "pointer" }}
            />
          ))}
        </Stack>
      )}

      {error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        // Часовой пояс берётся от филиала правила — без этой строки «10:00»
        // у мультифилиальной клиники читается как «10:00 непонятно где».
        <Typography variant="caption" color="text.secondary">
          {t("automations.schedule.timezoneHint")}
        </Typography>
      )}
    </Stack>
  );
};

export default ScheduleEditor;
