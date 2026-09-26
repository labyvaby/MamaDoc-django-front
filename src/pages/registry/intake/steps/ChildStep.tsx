import React from "react";
import { Button, FormHelperText, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import dayjs from "dayjs";

import type { DjangoPatient } from "../../../../api/patients";
import DjangoAddPatientDrawer from "../../../../components/patients/DjangoAddPatientDrawer";
import { CustomDatePicker } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { useCanChecker } from "../../../../hooks/useCan";
import { useT } from "../../../../i18n/VerticalProvider";
import { toExistingPerson } from "../../registryConstants";
import type { ChildState, ExistingPerson, StepErrors } from "../intakeState";
import { PersonSearch } from "../PersonSearch";

interface ChildStepProps {
  scope: ActiveScope;
  value: ChildState;
  errors: StepErrors;
  onChange: (next: ChildState) => void;
}

/**
 * Как в окне приёма: сначала поиск по базе, новую карточку заводит обычная
 * форма пациента и сразу выбирает её. Дата рождения, пол и свидетельство —
 * дозаполняются у выбранной карточки.
 */
export const ChildStep: React.FC<ChildStepProps> = ({ scope, value, errors, onChange }) => {
  const { t } = useT("registry");
  const { can } = useCanChecker();
  const [addOpen, setAddOpen] = React.useState(false);
  const error = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  const pick = (person: ExistingPerson | null) =>
    onChange({
      ...value,
      mode: "existing",
      existing: person,
      fullName: person?.fullName ?? "",
      phone: person?.phone ?? "",
      birthDate: person?.birthDate ?? value.birthDate,
      gender: person && person.gender !== "unknown" ? person.gender : value.gender,
      birthCertificateNumber: person?.birthCertificateNumber ?? "",
      birthCertificateIssuedOn: person?.birthCertificateIssuedOn ?? "",
    });

  return (
    <Stack gap={2}>
      <Stack gap={0.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {t("wizard.child.label")}
          </Typography>
          {can("patients.create") && (
            <Button size="small" onClick={() => setAddOpen(true)}>
              {t("wizard.child.add")}
            </Button>
          )}
        </Stack>
        <PersonSearch
          scope={scope}
          label={t("wizard.child.search")}
          value={value.existing}
          error={error("existing")}
          onChange={pick}
        />
      </Stack>

      {value.existing && (
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
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <TextField
              size="small"
              label={t("wizard.child.birthCertificateNumber")}
              value={value.birthCertificateNumber}
              onChange={(e) => onChange({ ...value, birthCertificateNumber: e.target.value.slice(0, 32) })}
              sx={{ flex: 1 }}
            />
            <CustomDatePicker
              label={t("wizard.child.birthCertificateIssuedOn")}
              value={value.birthCertificateIssuedOn ? dayjs(value.birthCertificateIssuedOn) : null}
              onChange={(date) =>
                onChange({
                  ...value,
                  birthCertificateIssuedOn: date && date.isValid() ? date.format("YYYY-MM-DD") : "",
                })
              }
              disableFuture
              slotProps={{ textField: { size: "small" } }}
            />
          </Stack>
        </>
      )}

      <DjangoAddPatientDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(patient: DjangoPatient) => {
          pick(toExistingPerson(patient));
          setAddOpen(false);
        }}
      />
    </Stack>
  );
};
