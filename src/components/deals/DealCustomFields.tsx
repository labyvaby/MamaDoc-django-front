import React from "react";
import { Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../ui";
import type { DealCustomField, DealCustomValues } from "../../api/deals";
import { useT } from "../../i18n/VerticalProvider";

interface DealCustomFieldsProps {
  fields: DealCustomField[];
  values: DealCustomValues;
  disabled?: boolean;
  /** Частичное обновление: только изменённый код; null — очистить. */
  onChange: (patch: DealCustomValues) => void;
}

/**
 * Блок дополнительных полей карточки по схеме воронки.
 *
 * Текст и число сохраняются по уходу с поля, список/дата/флажок — сразу.
 * Значения приходят как хранятся (число — number, флажок — boolean), но
 * поле терпимо к строкам: схему могли поменять после ввода.
 */
const DealCustomFields: React.FC<DealCustomFieldsProps> = ({ fields, values, disabled = false, onChange }) => {
  const { t } = useT("deals");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  React.useEffect(() => setDrafts({}), [values]);

  if (fields.length === 0) return null;

  const textValue = (code: string) => drafts[code] ?? (values[code] == null ? "" : String(values[code]));
  const commitText = (field: DealCustomField) => {
    const raw = (drafts[field.code] ?? "").trim();
    const current = values[field.code] == null ? "" : String(values[field.code]);
    if (drafts[field.code] === undefined || raw === current) return;
    onChange({ [field.code]: raw === "" ? null : field.type === "number" ? Number(raw.replace(",", ".")) : raw });
  };

  return (
    <Stack gap={1.25}>
      <Typography variant="subtitle2">{t("detail.customFields")}</Typography>
      <Stack direction="row" gap={1.25} flexWrap="wrap">
        {fields.map((field) => {
          const label = field.required ? `${field.label} *` : field.label;
          const width = { flex: field.type === "checkbox" ? "0 0 auto" : "1 1 220px", minWidth: 0 };
          if (field.type === "select") {
            return (
              <TextField
                key={field.code}
                select
                size="small"
                label={label}
                value={values[field.code] == null ? "" : String(values[field.code])}
                onChange={(e) => onChange({ [field.code]: e.target.value === "" ? null : e.target.value })}
                disabled={disabled}
                sx={width}
              >
                <MenuItem value="">—</MenuItem>
                {field.options.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            );
          }
          if (field.type === "date") {
            const current = values[field.code] ? dayjs(String(values[field.code])) : null;
            return (
              <div key={field.code} style={width}>
                <CustomDatePicker
                  label={label}
                  value={current && current.isValid() ? current : null}
                  onChange={(value: Dayjs | null) => {
                    if (value == null) onChange({ [field.code]: null });
                    else if (value.isValid()) onChange({ [field.code]: value.format("YYYY-MM-DD") });
                  }}
                  disabled={disabled}
                />
              </div>
            );
          }
          if (field.type === "checkbox") {
            return (
              <FormControlLabel
                key={field.code}
                control={
                  <Checkbox
                    size="small"
                    checked={Boolean(values[field.code])}
                    onChange={(e) => onChange({ [field.code]: e.target.checked })}
                    disabled={disabled}
                  />
                }
                label={<Typography variant="body2">{label}</Typography>}
                sx={{ ...width, ml: 0, alignSelf: "center" }}
              />
            );
          }
          return (
            <TextField
              key={field.code}
              size="small"
              label={label}
              value={textValue(field.code)}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [field.code]: e.target.value }))}
              onBlur={() => commitText(field)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={disabled}
              inputProps={field.type === "number" ? { inputMode: "decimal" } : undefined}
              sx={width}
            />
          );
        })}
      </Stack>
    </Stack>
  );
};

export default DealCustomFields;
