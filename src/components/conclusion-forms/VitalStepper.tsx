/**
 * Степпер показателя заключения (рост, вес, температура) с кнопками ±.
 * Вынесено из DjangoConclusionDrawer 28.09.2026 без изменений логики.
 */
import React from "react";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";

import { WEIGHT_DECIMALS } from "./conclusionVitals";

// ── vital stepper (как renderQuantityInput в оригинале) ─────────────────────────

const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
  "& input[type=number]::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

type VitalStepperProps = {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  // Сколько знаков после запятой хранит бэк для этого показателя.
  decimalPlaces?: number;
  disabled?: boolean;
};

/** Кнопки ± дотягивают до 44px по обеим осям — минимум для пальца. */
const TAP_TARGET_SX = {
  minWidth: { xs: 44, md: 32 },
  minHeight: { xs: 44, md: 34 },
  px: 0.5,
} as const;

export const VitalStepper: React.FC<VitalStepperProps> = ({
  label,
  suffix,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  decimalPlaces = WEIGHT_DECIMALS,
  disabled,
}) => {
  // Кнопки ± не должны ни плодить хвост вида 5.6000000000000005, ни выходить
  // за точность бэка — округляем до неё же.
  const k = 10 ** decimalPlaces;
  const fmt = (n: number) => String(Math.round(n * k) / k);
  const dec = () => {
    // Пустое поле — «не измеряли»: минус не должен подставлять туда минимум.
    if (value === "") return;
    const cur = parseFloat(value) || 0;
    onChange(fmt(Math.max(min, cur - step)));
  };
  const inc = () => {
    // Первый плюс на пустом поле ставит нижнюю границу (1 кг, 34 °C), а не шаг.
    if (value === "") {
      onChange(fmt(min));
      return;
    }
    const next = (parseFloat(value) || 0) + step;
    if (max !== undefined && next > max) return;
    onChange(fmt(next));
  };

  return (
    <Stack spacing={0.5} sx={{ minWidth: 100, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}, {suffix}
      </Typography>
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // 48px — чтобы кнопки ± дотягивали до 44px, минимума для пальца.
          height: { xs: 48, md: 40 },
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Button
          size="small"
          onClick={dec}
          disabled={disabled}
          sx={TAP_TARGET_SX}
        >
          −
        </Button>
        <TextField
          size="small"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          inputProps={{
            style: { textAlign: "center", padding: "8px 4px" },
            // Телефон открывает цифровую клавиатуру с разделителем: без этого
            // iOS даёт обычную буквенную раскладку под type="number".
            inputMode: "decimal",
            min,
            // HTML-step = минимальная единица хранения бэка (0.001 кг и т.п.):
            // любое допустимое для бэка значение — её кратное, поэтому ручной
            // ввод 5,5 кг / 57,5 см не даёт stepMismatch, как давал бы шаг
            // кнопок ±1; а 4-й знак после запятой браузер уже подсветит.
            step: String(10 ** -decimalPlaces),
            max,
          }}
          sx={{
            flex: 1,
            ...noSpinnersSx,
            "& .MuiOutlinedInput-root": { "& fieldset": { border: "none" } },
          }}
        />
        <Button
          size="small"
          onClick={inc}
          disabled={disabled}
          sx={TAP_TARGET_SX}
        >
          +
        </Button>
      </Box>
    </Stack>
  );
};
