import React from "react";
import { Box, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";

export type DiscountType = "currency" | "percent";

export type DiscountInputProps = {
  /** Базовая стоимость, от которой считается процент (в сомах). */
  total: number;
  /** Текущая скидка в сомах (контролируемое значение). */
  amount: number;
  /** Вызывается с чистой скидкой в сомах — независимо от режима ввода. */
  onAmountChange: (amount: number) => void;
  /** Стартовый режим. По умолчанию «сомы». */
  defaultType?: DiscountType;
  size?: "small" | "medium";
  disabled?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  sx?: SxProps<Theme>;
};

// Скрываем спиннеры у type=number — единый стиль с остальными полями оплаты.
const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Поле скидки с компактным переключателем режима «% / с» внутри инпута.
 *
 * Наружу компонент всегда отдаёт **сумму в сомах** (`onAmountChange`), даже
 * когда администратор вводит проценты — пересчёт `% → сомы` происходит «на
 * лету» от `total`. Это сознательно: бэкенд принимает фиксированный
 * `discount_amount`, и вся арифметика процентов живёт на фронте.
 */
export const DiscountInput: React.FC<DiscountInputProps> = ({
  total,
  amount,
  onAmountChange,
  defaultType = "currency",
  size = "small",
  disabled,
  error,
  helperText,
  sx,
}) => {
  const [type, setType] = React.useState<DiscountType>(defaultType);
  // «Сырое» значение поля в процентном режиме (своё, чтобы поле можно было
  // очистить и не округлять на каждый ввод). В режиме сомов поле берёт `amount`.
  const [percentStr, setPercentStr] = React.useState<string>("");

  // Если defaultType изменился до взаимодействия (напр. подгрузилась настройка
  // организации) — синхронизируем режим.
  const touchedRef = React.useRef(false);
  React.useEffect(() => {
    if (!touchedRef.current) setType(defaultType);
  }, [defaultType]);

  // amount, который мы сами передали наружу через onAmountChange — если пришедший
  // проп совпадает с ним, значит проп обновился «эхом» нашего же ввода и percentStr
  // трогать не нужно (иначе обрежется недопечатанное значение вида "12."). Если не
  // совпадает — значит проп изменился извне (восстановление черновика, загрузка
  // существующей скидки при открытии формы) и отображаемый процент нужно пересчитать.
  const lastEmittedAmountRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (amount === lastEmittedAmountRef.current) return;
    const pct = total > 0 ? round2((amount / total) * 100) : 0;
    setPercentStr(pct > 0 ? String(pct) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const currencyStr = amount > 0 ? String(round2(amount)) : "";

  const handleTypeChange = (next: DiscountType | null) => {
    if (!next || next === type) return;
    touchedRef.current = true;
    if (next === "percent") {
      // currency → percent: вычисляем процент от текущей суммы скидки.
      const pct = total > 0 ? round2((amount / total) * 100) : 0;
      setPercentStr(pct > 0 ? String(pct) : "");
    }
    // percent → currency: amount уже актуален (пересчитан при вводе процентов).
    setType(next);
  };

  const handleChange = (raw: string) => {
    touchedRef.current = true;
    if (type === "percent") {
      setPercentStr(raw);
      const pct = Math.max(0, Number(raw) || 0);
      const computed = round2((total * pct) / 100);
      lastEmittedAmountRef.current = computed;
      onAmountChange(computed);
    } else {
      const next = round2(Math.max(0, Number(raw) || 0));
      lastEmittedAmountRef.current = next;
      onAmountChange(next);
    }
  };

  const value = type === "percent" ? percentStr : currencyStr;

  return (
    // Поле ввода + переключатель «% / с» рядом (не внутри инпута): так число
    // получает всю ширину поля и не обрезается на узких/мобильных экранах.
    <Box
      sx={[
        { display: "flex", alignItems: "stretch", gap: 0.75, minWidth: 0 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ] as SxProps<Theme>}
    >
      <TextField
        type="number"
        size={size}
        fullWidth
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        error={error}
        helperText={helperText}
        placeholder="0"
        inputProps={{
          min: 0,
          ...(type === "percent" ? { max: 100 } : {}),
        }}
        sx={[noSpinnersSx, { flex: 1, minWidth: 0 }] as SxProps<Theme>}
      />
      <ToggleButtonGroup
        exclusive
        size="small"
        value={type}
        onChange={(_, v) => handleTypeChange(v as DiscountType | null)}
        disabled={disabled}
        sx={{
          flexShrink: 0,
          alignSelf: "flex-start",
          "& .MuiToggleButton-root": {
            px: 1,
            py: 0,
            minWidth: 30,
            height: size === "small" ? 40 : 56,
            fontSize: "0.8125rem",
            fontWeight: 700,
          },
        }}
      >
        <ToggleButton value="percent" aria-label="Скидка в процентах">
          %
        </ToggleButton>
        <ToggleButton value="currency" aria-label="Скидка в сомах">
          с
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

export default DiscountInput;
