import React from "react";
import { Box, Chip, Stack, Typography, alpha, useTheme } from "@mui/material";
import dayjs from "dayjs";

import { ChipGroup } from "../vision/VisionControls";
import type { Option } from "./neuroCatalog";
import { LEVEL_WORD, type NeuroLevel } from "./neuroNorms";
import { LEVEL_TONE, levelColor, levelTextColor } from "./neuroUi";

export { ChipGroup, Section } from "../vision/VisionControls";
export { NumberField } from "../ortho/OrthoControls";

/** Точка цвета уровня. */
export const LevelDot: React.FC<{ level: NeuroLevel; size?: number }> = ({ level, size = 8 }) => {
  const theme = useTheme();
  return <Box component="span" sx={{ width: size, height: size, borderRadius: "50%", bgcolor: levelColor(theme, level), flexShrink: 0, display: "inline-block" }} />;
};

/** Метка с точкой; «срочно» — красная с пометкой; дата — мелко, если метка не из последнего осмотра. */
export const LevelChip: React.FC<{ level: NeuroLevel; label: string; date?: string | null; title?: string }> = ({ level, label, date, title }) => {
  const theme = useTheme();
  const color = levelColor(theme, level);
  return (
    <Chip
      size="small"
      title={title}
      icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, ml: "8px !important" }} />}
      label={
        <Box component="span" sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.75, minWidth: 0 }}>
          {level === "urgent" && (
            <Box component="span" sx={{ fontWeight: 700, textTransform: "uppercase", fontSize: "0.66rem", letterSpacing: "0.04em" }}>
              срочно
            </Box>
          )}
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </Box>
          {date && (
            <Box component="span" sx={{ fontSize: "0.7rem", opacity: 0.72, fontWeight: 400 }}>
              {dayjs(date).format("DD.MM.YYYY")}
            </Box>
          )}
        </Box>
      }
      sx={{
        height: "auto",
        minHeight: 26,
        py: 0.25,
        borderRadius: "999px",
        fontWeight: 500,
        maxWidth: "100%",
        bgcolor: level === "unknown" ? alpha(theme.palette.text.primary, 0.05) : alpha(color, level === "warn" ? 0.16 : 0.12),
        color: level === "unknown" ? theme.palette.text.secondary : levelTextColor(theme, level),
        "& .MuiChip-label": { whiteSpace: "normal" },
      }}
    />
  );
};

/** Заголовок блока окна с цветной точкой: цвет — худший из находок блока. */
export const BlockTitle: React.FC<{ title: string; level?: NeuroLevel; note?: React.ReactNode }> = ({ title, level = "unknown", note }) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }} flexWrap="wrap">
    <LevelDot level={level} size={9} />
    <Typography variant="subtitle2" fontWeight={700}>
      {title}
    </Typography>
    {level !== "unknown" && (
      <Typography variant="caption" sx={(theme) => ({ color: levelTextColor(theme, level), fontWeight: 600 })}>
        {LEVEL_WORD[level]}
      </Typography>
    )}
    {note && (
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    )}
  </Stack>
);

/** Блок окна в рамке. */
export const Block: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ border: 1, borderColor: "divider", borderRadius: "14px", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25, minWidth: 0 }}>{children}</Box>
);

interface RowProps<T extends string | number> {
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  /** Цвет выбранной кнопки — по уровню находки. */
  level?: (value: T) => NeuroLevel;
  hint?: React.ReactNode;
}

/** Одна находка: подпись слева (на телефоне — сверху) и кнопки; повторное нажатие снимает выбор. */
export function Row<T extends string | number>({ label, options, value, onChange, level, hint }: RowProps<T>) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: 0.5, md: 1.5 }} alignItems={{ md: "flex-start" }}>
      <Typography variant="body2" sx={{ minWidth: { md: 180 }, maxWidth: { md: 180 }, pt: { md: 0.6 } }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ChipGroup
          label={label}
          options={options}
          selected={value != null ? [value] : []}
          tone={level ? (option) => LEVEL_TONE[level(option)] : undefined}
          onToggle={(option) => onChange(option === value ? null : option)}
        />
        {hint && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {hint}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

const YES_NO: ReadonlyArray<Option<"yes" | "no">> = [
  { value: "no", label: "нет" },
  { value: "yes", label: "да" },
];

/** Да / нет / не отмечено. `yesLevel` — цвет «да». */
export const YesNoRow: React.FC<{
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  yesLevel?: NeuroLevel;
  noLevel?: NeuroLevel;
  hint?: React.ReactNode;
}> = ({ label, value, onChange, yesLevel = "unknown", noLevel = "unknown", hint }) => (
  <Row
    label={label}
    options={YES_NO}
    value={value == null ? null : value ? "yes" : "no"}
    onChange={(next) => onChange(next == null ? null : next === "yes")}
    level={(option) => (option === "yes" ? yesLevel : noLevel)}
    hint={hint}
  />
);

/** Несколько отметок в строке. */
export function MultiRow({
  label,
  options,
  value,
  onChange,
  level,
}: {
  label: string;
  options: ReadonlyArray<Option>;
  value: ReadonlyArray<string>;
  onChange: (value: string[]) => void;
  level?: (value: string) => NeuroLevel;
}) {
  return (
    <Stack direction={{ xs: "column", md: "row" }} gap={{ xs: 0.5, md: 1.5 }} alignItems={{ md: "flex-start" }}>
      <Typography variant="body2" sx={{ minWidth: { md: 180 }, maxWidth: { md: 180 }, pt: { md: 0.6 } }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ChipGroup
          label={label}
          options={options}
          selected={value}
          tone={level ? (option) => LEVEL_TONE[level(option)] : undefined}
          onToggle={(option) => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])}
        />
      </Box>
    </Stack>
  );
}
