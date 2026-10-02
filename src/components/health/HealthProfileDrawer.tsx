import React from "react";
import { Box, InputAdornment, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { updateHealthProfile, type HealthProfile, type HealthProfileUpdate, type RiskGroup } from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../pages/patient-program/vision/visionUi";
import { CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { buildProfilePatch, parseNumberField, toProfileForm, type ProfileForm, type ProfilePart } from "./healthForms";
import {
  BLOOD_GROUPS,
  DELIVERY_TYPES,
  HEALTH_GROUPS,
  PE_GROUPS,
  RH_FACTORS,
  RISK_GROUPS,
  ageLabel,
  dayOfLife,
} from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const DateField: React.FC<{ label: string; value: string | null; onChange: (value: string | null) => void; helper?: string }> = ({
  label,
  value,
  onChange,
  helper,
}) => (
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

const NumberField: React.FC<{ label: string; value: string; suffix?: string; onChange: (value: string) => void }> = ({
  label,
  value,
  suffix,
  onChange,
}) => (
  <TextField
    size="small"
    label={label}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    inputProps={{ inputMode: "decimal" }}
    error={value !== "" && Number.isNaN(parseNumberField(value) ?? 0)}
    InputProps={suffix ? { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> } : undefined}
    fullWidth
  />
);

const APGAR = Array.from({ length: 11 }, (_, score) => ({ value: String(score), label: String(score) }));

interface HealthProfileDrawerProps {
  open: boolean;
  patientId: number;
  birthDate: string | null;
  profile: HealthProfile;
  /** Какие части формы показать. */
  parts: ReadonlyArray<ProfilePart>;
  title: string;
  onClose: () => void;
}

/** Профиль здоровья по частям: рождение, роддом, группы, кровь. */
export const HealthProfileDrawer: React.FC<HealthProfileDrawerProps> = ({
  open,
  patientId,
  birthDate,
  profile,
  parts,
  title,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<ProfileForm>(() => toProfileForm(profile));

  React.useEffect(() => {
    if (open) setForm(toProfileForm(profile));
  }, [open, profile]);

  const patch = (next: Partial<ProfileForm>) => setForm((current) => ({ ...current, ...next }));
  const payload = buildProfilePatch(form, parts);
  const has = (part: ProfilePart) => parts.includes(part);

  const mutation = useMutation({
    mutationFn: () => updateHealthProfile(scope, patientId, payload as HealthProfileUpdate),
    onSuccess: async () => {
      enqueueSnackbar("Сохранено", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  const discharge = dayOfLife(birthDate, form.maternityDischargedOn);
  const notice = dayOfLife(birthDate, form.birthNoticeReceivedOn);
  const feedingAge = ageLabel(birthDate, form.complementaryFeedingOn);

  return (
    <HealthDrawerShell
      open={open}
      title={title}
      pending={mutation.isPending}
      error={mutation.error}
      canSave={payload != null}
      saveLabel="Сохранить"
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      {has("birth") && (
        <>
          <Section title="Срок гестации">
            <Box sx={pairGridSx}>
              <NumberField label="Недель" value={form.gestationalAgeWeeks} onChange={(value) => patch({ gestationalAgeWeeks: value })} />
              <NumberField label="Дней" value={form.gestationalAgeDays} onChange={(value) => patch({ gestationalAgeDays: value })} />
            </Box>
          </Section>
          <Section title="При рождении">
            <Box sx={pairGridSx}>
              <NumberField label="Вес" suffix="г" value={form.birthWeightG} onChange={(value) => patch({ birthWeightG: value })} />
              <NumberField label="Длина" suffix="см" value={form.birthLengthCm} onChange={(value) => patch({ birthLengthCm: value })} />
              <NumberField
                label="Окружность головы"
                suffix="см"
                value={form.birthHeadCircumferenceCm}
                onChange={(value) => patch({ birthHeadCircumferenceCm: value })}
              />
            </Box>
          </Section>
          <Section title="Апгар, 1-я минута">
            <ChipGroup options={APGAR} selected={[form.apgar1min]} onToggle={(value) => patch({ apgar1min: form.apgar1min === value ? "" : value })} />
          </Section>
          <Section title="Апгар, 5-я минута">
            <ChipGroup options={APGAR} selected={[form.apgar5min]} onToggle={(value) => patch({ apgar5min: form.apgar5min === value ? "" : value })} />
          </Section>
          <Section title="Роды">
            <ChipGroup
              options={DELIVERY_TYPES}
              selected={form.deliveryType ? [form.deliveryType] : []}
              onToggle={(value) => patch({ deliveryType: form.deliveryType === value ? "" : value })}
            />
          </Section>
          <TextField
            size="small"
            label="Особенности периода новорождённости"
            value={form.perinatalNotes}
            onChange={(event) => patch({ perinatalNotes: event.target.value })}
            multiline
            minRows={2}
            fullWidth
          />
        </>
      )}
      {has("maternity") && (
        <>
          <TextField
            size="small"
            label="Роддом"
            placeholder="Роддом №2"
            value={form.maternityHospital}
            onChange={(event) => patch({ maternityHospital: event.target.value })}
            fullWidth
          />
          <DateField
            label="Выписан из роддома"
            value={form.maternityDischargedOn}
            onChange={(value) => patch({ maternityDischargedOn: value })}
            helper={discharge ? `${discharge}-й день жизни` : undefined}
          />
          <DateField
            label="Получено извещение о новорождённом"
            value={form.birthNoticeReceivedOn}
            onChange={(value) => patch({ birthNoticeReceivedOn: value })}
            helper={notice ? `${notice}-й день жизни` : undefined}
          />
          <DateField
            label="Первый прикорм"
            value={form.complementaryFeedingOn}
            onChange={(value) => patch({ complementaryFeedingOn: value })}
            helper={feedingAge ? `в возрасте ${feedingAge}` : undefined}
          />
        </>
      )}
      {has("groups") && (
        <>
          <Section title="Группа здоровья">
            <ChipGroup
              options={HEALTH_GROUPS}
              selected={form.healthGroup ? [form.healthGroup] : []}
              onToggle={(value) =>
                patch({ healthGroup: form.healthGroup === value ? "" : value, healthGroupSetOn: dayjs().format("YYYY-MM-DD") })
              }
            />
          </Section>
          {form.healthGroup && (
            <DateField label="Группа установлена" value={form.healthGroupSetOn} onChange={(value) => patch({ healthGroupSetOn: value })} />
          )}
          <Section title="Группа по физкультуре">
            <ChipGroup
              options={PE_GROUPS}
              selected={form.peGroup ? [form.peGroup] : []}
              onToggle={(value) => patch({ peGroup: form.peGroup === value ? "" : value })}
            />
          </Section>
          <Section title="Группы риска">
            <ChipGroup<RiskGroup>
              options={RISK_GROUPS}
              selected={form.riskGroups}
              tone={() => "warning"}
              onToggle={(value) =>
                patch({
                  riskGroups: form.riskGroups.includes(value)
                    ? form.riskGroups.filter((group) => group !== value)
                    : [...form.riskGroups, value],
                })
              }
            />
          </Section>
        </>
      )}
      {has("blood") && (
        <>
          <Section title="Группа крови">
            <ChipGroup
              options={BLOOD_GROUPS}
              selected={form.bloodGroup ? [form.bloodGroup] : []}
              onToggle={(value) => patch({ bloodGroup: form.bloodGroup === value ? "" : value })}
            />
          </Section>
          <Section title="Резус-фактор">
            <ChipGroup
              options={RH_FACTORS}
              selected={form.rhFactor ? [form.rhFactor] : []}
              onToggle={(value) => patch({ rhFactor: form.rhFactor === value ? "" : value })}
            />
          </Section>
        </>
      )}
    </HealthDrawerShell>
  );
};
