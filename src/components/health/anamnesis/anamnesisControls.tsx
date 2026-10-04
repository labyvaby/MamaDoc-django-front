import React from "react";
import { Chip, IconButton, InputAdornment, TextField } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { ChipGroup } from "../../../pages/patient-program/vision/VisionControls";
import type { ChipTone } from "../../../pages/patient-program/vision/visionUi";
import { CustomDatePicker } from "../../ui";
import { parseNumberField } from "../healthForms";
import type { Option } from "./anamnesisTypes";

/**
 * Поля окон раздела «Анамнез жизни» (ТЗ §5): кнопки-варианты вместо
 * выпадающих списков, «Да / Нет / —» — три состояния, списки с отметкой «нет».
 */

type Tri = "yes" | "no" | "unknown";

/** «Да / Нет / —»: null — неизвестно. */
export const YesNo: React.FC<{
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  yes?: string;
  no?: string;
  label?: string;
  /** Цвет «Да»: по умолчанию — предупреждение (курение, реанимация). */
  yesTone?: ChipTone;
}> = ({ value, onChange, yes = "Да", no = "Нет", label, yesTone = "warning" }) => {
  const current: Tri = value === true ? "yes" : value === false ? "no" : "unknown";
  return (
    <ChipGroup<Tri>
      label={label}
      options={[
        { value: "yes", label: yes },
        { value: "no", label: no },
        { value: "unknown", label: "—" },
      ]}
      selected={[current]}
      tone={(option) => (option === "yes" ? yesTone : option === "no" ? "success" : "primary")}
      onToggle={(next) => onChange(next === "yes" ? true : next === "no" ? false : null)}
    />
  );
};

/** Один вариант из нескольких; повторное нажатие снимает выбор («» — не указано). */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  tone,
}: {
  options: ReadonlyArray<Option<T>>;
  value: T | "";
  onChange: (value: T | "") => void;
  label?: string;
  tone?: (value: T) => ChipTone;
}) {
  return (
    <ChipGroup<T>
      label={label}
      options={options}
      selected={value ? [value] : []}
      tone={tone}
      onToggle={(next) => onChange(value === next ? "" : next)}
    />
  );
}

/**
 * Список с отметкой «нет»: null — не спрашивали, [] — врач подтвердил «нет»,
 * элементы — есть. «Нет» очищает список.
 */
export function ListWithNone<T extends string>({
  options,
  value,
  onChange,
  noneLabel,
  label,
}: {
  options: ReadonlyArray<Option<T>>;
  value: T[] | null;
  onChange: (value: T[] | null) => void;
  noneLabel: string;
  label?: string;
}) {
  const list = value ?? [];
  return (
    <ChipGroup<T>
      label={label}
      options={options}
      selected={list}
      onToggle={(next) => onChange(list.includes(next) ? list.filter((item) => item !== next) : [...list, next])}
    >
      <Chip
        size="small"
        label={noneLabel}
        clickable
        color={value != null && value.length === 0 ? "success" : "default"}
        variant={value != null && value.length === 0 ? "filled" : "outlined"}
        onClick={() => onChange(value != null && value.length === 0 ? null : [])}
        aria-pressed={value != null && value.length === 0}
        sx={{ height: 30, borderRadius: "8px", fontWeight: value != null && value.length === 0 ? 600 : 400 }}
      />
    </ChipGroup>
  );
}

/** Число строкой: «3 350», «6,5»; ошибка ввода подсвечивается. */
export const NumberInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  helper?: React.ReactNode;
  fullWidth?: boolean;
}> = ({ label, value, onChange, suffix, helper, fullWidth = true }) => (
  <TextField
    size="small"
    label={label}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    inputProps={{ inputMode: "decimal" }}
    error={value !== "" && Number.isNaN(parseNumberField(value) ?? 0)}
    helperText={helper}
    InputProps={suffix ? { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> } : undefined}
    // С единицей справа подпись всегда сверху — иначе она наезжает на «мкмоль/л».
    InputLabelProps={suffix ? { shrink: true } : undefined}
    fullWidth={fullWidth}
  />
);

/** Число со стрелками: «какая беременность», «сколько плодов». */
export const CountInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  helper?: React.ReactNode;
}> = ({ label, value, onChange, min = 1, max = 20, helper }) => {
  const step = (delta: number) => {
    const current = parseNumberField(value);
    const base = current == null || Number.isNaN(current) ? min - delta : current;
    onChange(String(Math.min(max, Math.max(min, Math.round(base + delta)))));
  };
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
      inputProps={{ inputMode: "numeric" }}
      helperText={helper}
      fullWidth
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <IconButton size="small" edge="start" aria-label={`${label}: меньше`} onClick={() => step(-1)}>
              <RemoveOutlined fontSize="inherit" />
            </IconButton>
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" edge="end" aria-label={`${label}: больше`} onClick={() => step(1)}>
              <AddOutlined fontSize="inherit" />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

export const DateInput: React.FC<{
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  helper?: string;
}> = ({ label, value, onChange, helper }) => (
  <CustomDatePicker
    label={label}
    value={value ? dayjs(value) : null}
    onChange={(next) => {
      const date = next as Dayjs | null;
      onChange(date && date.isValid() ? date.format("YYYY-MM-DD") : null);
    }}
    slotProps={{ textField: { size: "small", fullWidth: true, helperText: helper } }}
  />
);
