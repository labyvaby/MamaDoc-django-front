import React from "react";
import { Box, Chip, MenuItem, TextField } from "@mui/material";

import type { AutomationCatalogField } from "../../../api/automations";
import { useT } from "../../../i18n/VerticalProvider";
import { fieldOptions, type ConditionReferences } from "./useConditionReferences";

export interface FieldValueInputProps {
  spec: AutomationCatalogField | undefined;
  /** Значение — массив (операторы `in` / `not_in`). */
  isList?: boolean;
  label: string;
  value: string;
  values?: string[];
  references: ConditionReferences;
  disabled?: boolean;
  onValue: (value: string) => void;
  onValues?: (values: string[]) => void;
  fullWidth?: boolean;
  helperText?: string;
  required?: boolean;
}

/**
 * Ввод значения поля события по его типу из каталога.
 *
 * Один компонент на условия и на пробный прогон: и там и там пользователь
 * указывает значение того же поля, и в обоих местах он должен выбирать
 * «Центральный филиал», а не помнить, что это `branch_id = 3`.
 */
export const FieldValueInput: React.FC<FieldValueInputProps> = ({
  spec,
  isList = false,
  label,
  value,
  values = [],
  references,
  disabled = false,
  onValue,
  onValues,
  fullWidth = false,
  helperText,
  required = false,
}) => {
  const { t } = useT("settings");
  const options = fieldOptions(spec, references);
  const numeric = spec?.fieldType === "decimal" || spec?.fieldType === "integer";
  const width = fullWidth ? {} : { minWidth: isList ? 240 : 220, flex: 1 };
  const loadingText = references.isLoading
    ? t("automations.conditions.loadingReference")
    : undefined;

  if (options) {
    if (isList) {
      return (
        <TextField
          required={required}
          select
          size="small"
          label={label}
          value={values}
          onChange={(e) => {
            const next = e.target.value;
            onValues?.(
              typeof next === "string" ? next.split(",") : (next as unknown as string[]),
            );
          }}
          disabled={disabled}
          fullWidth={fullWidth}
          sx={width}
          SelectProps={{
            multiple: true,
            renderValue: (selected) => (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {(selected as string[]).map((item) => (
                  <Chip
                    key={item}
                    size="small"
                    label={options.find((option) => option.value === item)?.label ?? item}
                  />
                ))}
              </Box>
            ),
          }}
          helperText={helperText ?? loadingText}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }
    return (
      <TextField
        required={required}
        select
        size="small"
        label={label}
        // Значение вне справочника показываем как «не выбрано»: показывать
        // сырой ID пользователю нечего, он всё равно ничего ему не скажет.
        value={options.some((option) => option.value === value) ? value : ""}
        onChange={(e) => onValue(e.target.value)}
        disabled={disabled}
        fullWidth={fullWidth}
        sx={width}
        helperText={helperText ?? loadingText}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (isList) {
    return (
      <TextField
        required={required}
        size="small"
        label={label}
        // Список произвольных значений вводится через запятую; бэк ждёт массив,
        // разбор делаем здесь, чтобы форма хранила уже готовые элементы.
        value={values.join(", ")}
        onChange={(e) =>
          onValues?.(
            e.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        disabled={disabled}
        fullWidth={fullWidth}
        sx={width}
        helperText={helperText}
      />
    );
  }

  return (
    <TextField
      required={required}
      size="small"
      label={label}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      disabled={disabled}
      fullWidth={fullWidth}
      // Деньги уходят на бэк decimal-строкой, поэтому type остаётся text:
      // number-инпут в разных локалях подставляет запятую и ломает разбор.
      inputProps={numeric ? { inputMode: "decimal" } : undefined}
      helperText={helperText ?? (numeric ? t("automations.conditions.numericHint") : undefined)}
      sx={width}
    />
  );
};

export default FieldValueInput;
