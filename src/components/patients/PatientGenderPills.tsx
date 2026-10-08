/**
 * PatientGenderPills.tsx
 * Выбор пола пилюлями ♂/♀ — ширина по содержимому, чтобы встать в одну строку
 * с датой рождения. Повторный клик по выбранной снимает выбор («не указан»):
 * пол бывает неизвестен, и вернуть его в это состояние должно быть можно.
 */
import React from "react";
import { ButtonBase, Stack } from "@mui/material";
import MaleOutlined from "@mui/icons-material/MaleOutlined";
import FemaleOutlined from "@mui/icons-material/FemaleOutlined";
import type { PatientGender } from "../../api/patients";
import { useT } from "../../i18n/VerticalProvider";

type Props = {
  value: PatientGender;
  onChange: (gender: PatientGender) => void;
  disabled?: boolean;
};

const OPTIONS = [
  { value: "male" as const, Icon: MaleOutlined, labelKey: "form.genderMale" },
  { value: "female" as const, Icon: FemaleOutlined, labelKey: "form.genderFemale" },
];

const PatientGenderPills: React.FC<Props> = ({ value, onChange, disabled }) => {
  const { t } = useT("patients");

  return (
    <Stack direction="row" gap={0.75} role="group" aria-label={t("form.gender")}>
      {OPTIONS.map(({ value: option, Icon, labelKey }) => {
        const active = value === option;
        return (
          <ButtonBase
            key={option}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(active ? "unknown" : option)}
            sx={(theme) => ({
              height: theme.appLayout.controls.inputHeight,
              pl: 1.25,
              pr: 1.75,
              gap: 0.75,
              borderRadius: 999,
              border: 1,
              borderColor: active ? "primary.main" : "divider",
              bgcolor: active ? "primary.lighter" : "transparent",
              color: active ? "primary.onSurface" : "text.primary",
              fontSize: "0.875rem",
              fontWeight: active ? 600 : 500,
              whiteSpace: "nowrap",
              transition: "border-color .15s ease, background-color .15s ease, color .15s ease",
              "& svg": { fontSize: 18, color: active ? "inherit" : "text.secondary" },
              "&:hover": { borderColor: "primary.main" },
              "&.Mui-focusVisible": {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
              "&.Mui-disabled": { opacity: 0.6 },
            })}
          >
            <Icon />
            {t(labelKey)}
          </ButtonBase>
        );
      })}
    </Stack>
  );
};

export default PatientGenderPills;
