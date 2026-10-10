import React from "react";
import { Box, Chip, IconButton, InputAdornment, Stack, TextField, Typography, alpha, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";

import { ChipGroup } from "../vision/VisionControls";
import { SIDES, type Side } from "./orthoCatalog";
import type { Finding } from "./orthoData";
import type { OrthoStatus } from "./orthoNorms";
import { orthoColor } from "./orthoUi";

export { ChipGroup, Section } from "../vision/VisionControls";

const toText = (value: number | null): string => (value == null ? "" : String(value).replace(".", ","));

function parse(raw: string): number | null {
  const cleaned = raw.trim().replace("−", "-").replace(",", ".");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min: number;
  max: number;
  unit?: string;
  /** Подпись под полем цветом нормы: «норма», «пограничное»… */
  status?: OrthoStatus;
  hint?: string;
}

/**
 * Число «− значение +»: кнопки шагают от пустого к `min` (или к 0, если он в
 * пределах), значение зажимается в пределы. Набор с клавиатуры — запятая или
 * точка; мусор не сохраняется.
 */
export const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange, step, min, max, unit, status, hint }) => {
  const theme = useTheme();
  const [text, setText] = React.useState(toText(value));
  React.useEffect(() => {
    if (parse(text) !== value) setText(toText(value));
    // Текст подстраиваем только когда значение пришло извне.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  const stepBy = (delta: number) => {
    const base = value ?? (min <= 0 && max >= 0 ? 0 : min);
    const next = value == null ? clamp(base) : clamp(base + delta);
    setText(toText(next));
    onChange(next);
  };
  const color = status ? orthoColor(theme, status) : theme.palette.text.secondary;
  return (
    <Box sx={{ minWidth: 0 }}>
      <TextField
        size="small"
        fullWidth
        label={unit ? `${label}, ${unit}` : label}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parse(event.target.value);
          onChange(parsed == null ? null : clamp(parsed));
        }}
        inputProps={{ inputMode: "decimal", style: { textAlign: "center", fontWeight: 600 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <IconButton size="small" edge="start" aria-label={`${label}: минус`} onClick={() => stepBy(-step)}>
                <RemoveOutlined fontSize="inherit" />
              </IconButton>
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" edge="end" aria-label={`${label}: плюс`} onClick={() => stepBy(step)}>
                <AddOutlined fontSize="inherit" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      {hint && (
        <Typography variant="caption" display="block" sx={{ mt: 0.25, textAlign: "center", color, fontWeight: status && status !== "unknown" ? 600 : 400 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
};

/** Признак со стороной: «нет» или слева / справа / с двух сторон. */
export const SidePicker: React.FC<{ label: string; value: Side | null; onChange: (value: Side | null) => void; tone?: OrthoStatus }> = ({
  label,
  value,
  onChange,
  tone = "bad",
}) => (
  <Stack direction={{ xs: "column", sm: "row" }} gap={{ xs: 0.5, sm: 1.5 }} alignItems={{ sm: "center" }}>
    <Typography variant="body2" sx={{ minWidth: { sm: 190 } }}>
      {label}
    </Typography>
    <ChipGroup
      label={label}
      options={[{ value: "none", label: "Нет" }, ...SIDES]}
      selected={[value ?? "none"]}
      tone={(option) => (option === "none" ? "success" : tone === "warn" ? "warning" : "error")}
      onToggle={(option) => onChange(option === "none" ? null : (option as Side))}
    />
  </Stack>
);

/**
 * Находки со стороной: нажатие на находку добавляет её «с двух сторон»,
 * у отмеченной появляются кнопки стороны, повторное нажатие снимает.
 */
export const FindingsPicker: React.FC<{
  options: ReadonlyArray<{ value: string; label: string }>;
  value: ReadonlyArray<Finding>;
  onChange: (value: Finding[]) => void;
  label: string;
}> = ({ options, value, onChange, label }) => {
  const theme = useTheme();
  return (
    <Stack gap={1}>
      <ChipGroup
        label={label}
        options={options}
        selected={value.map((item) => item.code)}
        tone={() => "warning"}
        onToggle={(code) =>
          onChange(value.some((item) => item.code === code) ? value.filter((item) => item.code !== code) : [...value, { code, side: "both" }])
        }
      />
      {value.map((item) => (
        <Stack
          key={item.code}
          direction="row"
          gap={1}
          alignItems="center"
          flexWrap="wrap"
          sx={{ pl: 1, borderLeft: `2px solid ${alpha(theme.palette.warning.main, 0.5)}` }}
        >
          <Typography variant="caption" fontWeight={600} sx={{ minWidth: 150 }}>
            {options.find((option) => option.value === item.code)?.label}
          </Typography>
          {SIDES.map((side) => (
            <Chip
              key={side.value}
              size="small"
              clickable
              label={side.label}
              color={item.side === side.value ? "warning" : "default"}
              variant={item.side === side.value ? "filled" : "outlined"}
              onClick={() => onChange(value.map((entry) => (entry.code === item.code ? { ...entry, side: side.value } : entry)))}
              sx={{ height: 26, borderRadius: "7px" }}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
};

/** Заголовок блока осмотра с цветной точкой статуса. */
export const BlockTitle: React.FC<{ title: string; status: OrthoStatus; note?: string }> = ({ title, status, note }) => {
  const theme = useTheme();
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: orthoColor(theme, status), flexShrink: 0 }} />
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      {note && (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      )}
    </Stack>
  );
};
