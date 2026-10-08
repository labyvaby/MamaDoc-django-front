/**
 * PatientBlacklistField.tsx
 * Строка «В чёрном списке» с переключателем; включённая подсвечивается цветом
 * ошибки и раскрывает обязательное поле причины.
 */
import React from "react";
import { Box, Collapse, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { ValidationFieldProps } from "../../hooks/useFormValidation";
import { useT } from "../../i18n/VerticalProvider";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  placeholder: string;
  disabled?: boolean;
  /** `v.field("blacklistReason")` — ошибка и якорь валидации. */
  reasonFieldProps?: ValidationFieldProps;
};

const PatientBlacklistField: React.FC<Props> = ({
  checked,
  onCheckedChange,
  reason,
  onReasonChange,
  placeholder,
  disabled,
  reasonFieldProps,
}) => {
  const { t } = useT("patients");

  return (
    <Box
      sx={(theme) => ({
        border: 1,
        borderColor: checked ? "error.main" : "divider",
        // Лёгкий тон, а не error.lighter: в тёмной теме тот заливает блок
        // вместе с полем причины слишком густо.
        bgcolor: checked
          ? alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.08 : 0.05)
          : "transparent",
        borderRadius: 1,
        px: 1.5,
        transition: "border-color .15s ease, background-color .15s ease",
      })}
    >
      <FormControlLabel
        labelPlacement="start"
        control={
          <Switch
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            disabled={disabled}
            color="error"
          />
        }
        label={
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: checked ? "error.main" : "text.primary" }}
          >
            {t("form.blacklisted")}
          </Typography>
        }
        sx={{ m: 0, py: 0.5, width: 1, justifyContent: "space-between" }}
      />
      <Collapse in={checked}>
        <TextField
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          placeholder={placeholder}
          disabled={disabled}
          required={checked}
          {...reasonFieldProps}
          sx={{ pb: 1.5 }}
        />
      </Collapse>
    </Box>
  );
};

export default PatientBlacklistField;
