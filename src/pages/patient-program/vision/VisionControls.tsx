import React from "react";
import { Box, Chip, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";

import { ACUITY_CHOICES } from "./visionCatalog";
import { parseNumber } from "./visionData";
import type { ChipTone } from "./visionUi";

interface ChipGroupProps<T extends string | number> {
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: ReadonlyArray<T>;
  onToggle: (value: T) => void;
  /** Цвет выбранной кнопки; по умолчанию — основной. */
  tone?: (value: T) => ChipTone;
  label?: string;
  children?: React.ReactNode;
}

/** Быстрые кнопки. Одна или несколько — решает вызывающий в `onToggle`. */
export function ChipGroup<T extends string | number>({ options, selected, onToggle, tone, label, children }: ChipGroupProps<T>) {
  return (
    <Stack direction="row" flexWrap="wrap" gap={0.75} role="group" aria-label={label}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <Chip
            key={String(option.value)}
            label={option.label}
            size="small"
            clickable
            color={active ? tone?.(option.value) ?? "primary" : "default"}
            variant={active ? "filled" : "outlined"}
            onClick={() => onToggle(option.value)}
            aria-pressed={active}
            sx={{ height: 30, borderRadius: "8px", fontWeight: active ? 600 : 400 }}
          />
        );
      })}
      {children}
    </Stack>
  );
}

/** Подпись блока формы и действие справа. */
export const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  action,
  children,
}) => (
  <Box>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 0.75, minHeight: 24 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {title}
      </Typography>
      {action}
    </Stack>
    {children}
  </Box>
);

/** Острота кнопками 0,1…2,0 и «н/о»; «другое…» — своё значение (0,05 и т. п.). */
export const AcuityPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
  tone: (value: string) => ChipTone;
  label: string;
}> = ({ value, onChange, tone, label }) => {
  const known = value === "" || ACUITY_CHOICES.some((choice) => choice.value === value);
  const [custom, setCustom] = React.useState(!known);
  React.useEffect(() => {
    if (!known) setCustom(true);
  }, [known]);
  return (
    <Stack gap={1}>
      <ChipGroup
        options={ACUITY_CHOICES}
        selected={[value]}
        tone={tone}
        label={label}
        onToggle={(next) => {
          setCustom(false);
          onChange(value === next ? "" : next);
        }}
      >
        {!custom && (
          <Chip
            size="small"
            label="другое…"
            variant="outlined"
            clickable
            onClick={() => setCustom(true)}
            sx={{ height: 30, borderRadius: "8px", borderStyle: "dashed" }}
          />
        )}
      </ChipGroup>
      {custom && (
        <TextField
          size="small"
          label="Своё значение"
          placeholder="0,05"
          value={known ? "" : value}
          onChange={(event) => onChange(event.target.value.replace(",", "."))}
          inputProps={{ inputMode: "decimal" }}
          sx={{ maxWidth: 200 }}
        />
      )}
    </Stack>
  );
};

/** Диоптрии: поле и кнопки ±0,25. */
export const DiopterField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({
  label,
  value,
  onChange,
}) => {
  const step = (delta: number) => {
    const next = Math.round(((parseNumber(value) ?? 0) + delta) * 100) / 100;
    onChange(next.toFixed(2));
  };
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputProps={{ inputMode: "decimal" }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <IconButton size="small" edge="start" aria-label={`${label}: минус 0,25`} onClick={() => step(-0.25)}>
              <RemoveOutlined fontSize="inherit" />
            </IconButton>
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" edge="end" aria-label={`${label}: плюс 0,25`} onClick={() => step(0.25)}>
              <AddOutlined fontSize="inherit" />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

/** «Без патологии» одним нажатием, иначе — описание. */
export const NormalOrText: React.FC<{
  title: string;
  normal: boolean;
  text: string;
  onNormal: (normal: boolean) => void;
  onText: (text: string) => void;
}> = ({ title, normal, text, onNormal, onText }) => (
  <Section title={title}>
    <Stack gap={1}>
      <ChipGroup
        options={[{ value: "normal", label: "Без патологии" }]}
        selected={normal ? ["normal"] : []}
        tone={() => "success"}
        onToggle={() => onNormal(!normal)}
      />
      {!normal && (
        <TextField
          size="small"
          label="Что найдено"
          value={text}
          onChange={(event) => onText(event.target.value)}
          multiline
          fullWidth
        />
      )}
    </Stack>
  </Section>
);
