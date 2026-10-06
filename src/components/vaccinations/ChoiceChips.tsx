import { Chip, Stack } from "@mui/material";

import type { ChoiceOption } from "./reactionMeta";

interface ChoiceChipsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T | "" | null;
  onChange: (value: T | "") => void;
  /** Значение, которое подсказывает система: пунктирная рамка. */
  hint?: T | "";
  disabled?: boolean;
  ariaLabel?: string;
}

/** Выбор одного значения кнопками; повторный клик снимает выбор. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  hint,
  disabled,
  ariaLabel,
}: ChoiceChipsProps<T>) {
  return (
    <Stack direction="row" gap={0.75} flexWrap="wrap" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = value === option.value;
        const hinted = !selected && hint === option.value;
        const tone = option.tone && option.tone !== "default" ? option.tone : "primary";
        return (
          <Chip
            key={option.value}
            role="radio"
            aria-checked={selected}
            label={hinted ? `${option.label} · подсказка` : option.label}
            color={selected || hinted ? tone : "default"}
            variant={selected ? "filled" : "outlined"}
            disabled={disabled}
            onClick={() => onChange(selected ? "" : option.value)}
            sx={hinted ? { borderStyle: "dashed", borderWidth: 2 } : undefined}
          />
        );
      })}
    </Stack>
  );
}
