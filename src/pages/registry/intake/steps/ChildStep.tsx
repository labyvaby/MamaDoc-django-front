import React from "react";
import { FormHelperText, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import dayjs from "dayjs";

import { CustomDatePicker } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { useT } from "../../../../i18n/VerticalProvider";
import type { ChildState, StepErrors } from "../intakeState";
import { PersonSearch } from "../PersonSearch";

interface ChildStepProps {
  scope: ActiveScope;
  value: ChildState;
  errors: StepErrors;
  onChange: (next: ChildState) => void;
}

export const ChildStep: React.FC<ChildStepProps> = ({ scope, value, errors, onChange }) => {
  const { t } = useT("registry");
  const error = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  return (
    <Stack gap={2}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value.mode}
        onChange={(_, mode: ChildState["mode"] | null) => mode && onChange({ ...value, mode })}
      >
        <ToggleButton value="new">{t("wizard.child.new")}</ToggleButton>
        <ToggleButton value="existing">{t("wizard.child.existing")}</ToggleButton>
      </ToggleButtonGroup>

      {value.mode === "existing" ? (
        <PersonSearch
          scope={scope}
          label={t("wizard.child.search")}
          value={value.existing}
          error={error("existing")}
          onChange={(person) =>
            onChange({
              ...value,
              existing: person,
              fullName: person?.fullName ?? "",
              phone: person?.phone ?? "",
              birthDate: person?.birthDate ?? value.birthDate,
              gender: person && person.gender !== "unknown" ? person.gender : value.gender,
            })
          }
        />
      ) : (
        <>
          <TextField
            size="small"
            label={t("wizard.child.fullName")}
            value={value.fullName}
            onChange={(e) => onChange({ ...value, fullName: e.target.value })}
            error={Boolean(errors.fullName)}
            helperText={error("fullName")}
            autoFocus
          />
          <TextField
            size="small"
            label={t("wizard.child.phone")}
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            helperText={t("wizard.child.phoneHint")}
            inputProps={{ inputMode: "tel" }}
          />
        </>
      )}

      {(value.mode === "new" || value.existing) && (
        <>
          <CustomDatePicker
            label={t("wizard.child.birthDate")}
            value={value.birthDate ? dayjs(value.birthDate) : null}
            onChange={(date) => onChange({ ...value, birthDate: date && date.isValid() ? date.format("YYYY-MM-DD") : "" })}
            disableFuture
            slotProps={{
              textField: { size: "small", error: Boolean(errors.birthDate), helperText: error("birthDate") },
            }}
          />
          <Stack gap={0.5}>
            <Typography variant="caption" color="text.secondary">
              {t("wizard.child.gender")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={value.gender === "unknown" ? null : value.gender}
              onChange={(_, gender: "male" | "female" | null) => gender && onChange({ ...value, gender })}
            >
              <ToggleButton value="male">{t("wizard.child.male")}</ToggleButton>
              <ToggleButton value="female">{t("wizard.child.female")}</ToggleButton>
            </ToggleButtonGroup>
            {errors.gender && <FormHelperText error>{error("gender")}</FormHelperText>}
          </Stack>
        </>
      )}
    </Stack>
  );
};
