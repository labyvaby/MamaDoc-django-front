import React from "react";
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker, CustomTimePicker } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { TASKS_DUE_TIME_ENABLED } from "../../pages/tasks/meta";

export type DueValue = { date: Dayjs | null; time: Dayjs | null };

type DueDateFieldProps = {
  value: DueValue;
  onChange: (v: DueValue) => void;
  label?: string;
  /** Показывать чипы быстрого выбора («Сегодня», «Через 2 ч», ...). */
  showPresets?: boolean;
};

/** Пресеты со временем — доступны только когда бэк принимает datetime. */
const TIME_PRESETS: { label: string; get: () => DueValue }[] = [
  {
    label: "Через 2 ч",
    get: () => {
      const t = dayjs().add(2, "hour").startOf("hour");
      return { date: t.startOf("day"), time: t };
    },
  },
  {
    label: "Сегодня к 18:00",
    get: () => ({ date: dayjs().startOf("day"), time: dayjs().hour(18).minute(0) }),
  },
  {
    label: "Завтра к 9:00",
    get: () => ({ date: dayjs().add(1, "day").startOf("day"), time: dayjs().add(1, "day").hour(9).minute(0) }),
  },
];

const DAY_PRESETS: { label: string; get: () => DueValue }[] = [
  { label: "Сегодня", get: () => ({ date: dayjs().startOf("day"), time: null }) },
  { label: "Завтра", get: () => ({ date: dayjs().add(1, "day").startOf("day"), time: null }) },
  {
    label: "Конец недели",
    get: () => ({ date: dayjs().locale("ru").endOf("week").startOf("day"), time: null }),
  },
];

/**
 * Срок задачи: дата обязательна, время — опционально (кнопка «Указать время»).
 * Разделение осознанное: заявка «купить бумагу до пятницы» не должна получать
 * фиктивные 00:00, а «перезвонить до 15:00» — теряет смысл без часов.
 */
const DueDateField: React.FC<DueDateFieldProps> = ({
  value,
  onChange,
  label = "Срок",
  showPresets = true,
}) => {
  const { date, time } = value;
  const presets = TASKS_DUE_TIME_ENABLED ? [...TIME_PRESETS, ...DAY_PRESETS.slice(2)] : DAY_PRESETS;

  const setDate = (d: Dayjs | null) => onChange({ date: d ? d.startOf("day") : null, time: d ? time : null });
  const setTime = (t: Dayjs | null) => onChange({ date: date ?? dayjs().startOf("day"), time: t });

  return (
    <Box>
      <Stack direction="row" gap={1} alignItems="flex-start">
        <CustomDatePicker
          label={label}
          value={date}
          onChange={setDate}
          minDate={dayjs().startOf("day")}
          slotProps={{ textField: { fullWidth: true } }}
        />

        {!TASKS_DUE_TIME_ENABLED ? null : time ? (
          <Stack direction="row" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }}>
            <CustomTimePicker
              label="Время"
              value={time}
              onChange={setTime}
              minutesStep={5}
              slotProps={{ textField: { sx: { width: 128 } } }}
            />
            <Tooltip title="Убрать время">
              <IconButton size="small" aria-label="Убрать время" onClick={() => onChange({ date, time: null })}>
                <CloseOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : (
          <Tooltip title="Указать время срока">
            <Box>
              <Chip
                icon={<ScheduleOutlined sx={{ fontSize: 16 }} />}
                label="Время"
                clickable
                onClick={() => setTime(dayjs().add(1, "hour").startOf("hour"))}
                sx={(t) => ({
                  height: 40,
                  borderRadius: "10px",
                  px: 0.5,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: "transparent",
                  color: "text.secondary",
                  "&:hover": {
                    bgcolor: subtleBg(t, true),
                    borderColor: alpha(t.palette.primary.main, 0.35),
                    color: "text.primary",
                  },
                })}
              />
            </Box>
          </Tooltip>
        )}
      </Stack>

      {showPresets && (
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
          {presets.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              size="small"
              clickable
              onClick={() => onChange(p.get())}
              sx={(t) => ({
                height: 26,
                borderRadius: "8px",
                border: 1,
                borderColor: "divider",
                bgcolor: "transparent",
                color: "text.secondary",
                "&:hover": {
                  bgcolor: subtleBg(t, true),
                  borderColor: alpha(t.palette.primary.main, 0.35),
                  color: "text.primary",
                },
              })}
            />
          ))}
          {date && (
            <Chip
              label="Без срока"
              size="small"
              clickable
              onClick={() => onChange({ date: null, time: null })}
              sx={{ height: 26, borderRadius: "8px", bgcolor: "transparent", color: "text.disabled" }}
            />
          )}
        </Stack>
      )}

      {date && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
          {time
            ? `Срок: ${date.format("DD.MM.YYYY")} до ${time.format("HH:mm")}`
            : `Срок: ${date.format("DD.MM.YYYY")}`}
        </Typography>
      )}
    </Box>
  );
};

export default DueDateField;
