import React from "react";
import { Box, ButtonBase, Stack, TextField, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import {
  updatePerinatal,
  type FirstCry,
  type HealthProfile,
  type JaundiceKind,
  type NeonatalScreening,
  type NeonatalTransfer,
  type PerinatalHistory,
  type PerinatalUpdate,
} from "../../../api/health";
import { ChipGroup, Section } from "../../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../../pages/patient-program/vision/visionUi";
import { AppButton } from "../../ui";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice, DateInput, NumberInput, YesNo } from "./anamnesisControls";
import { decimalInRange, intInRange, numText } from "./anamnesisForm";
import { FIRST_CRY, JAUNDICE, NEONATAL_TRANSFER } from "./anamnesisTypes";
import { screeningText } from "./anamnesisView";
import { decimal, ordinalDays, type ChildSex } from "./russian";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

interface NewbornForm {
  birthWeightG: string;
  birthLengthCm: string;
  birthHeadCircumferenceCm: string;
  birthChestCircumferenceCm: string;
  apgar1min: string;
  apgar5min: string;
  apgar10min: string;
  firstCry: FirstCry;
  resuscitation: boolean | null;
  resuscitationNote: string;
  firstLatchHours: string;
  jaundice: JaundiceKind;
  jaundiceFirstDay: boolean | null;
  jaundiceUntilDay: string;
  maxBilirubinUmol: string;
  phototherapy: boolean | null;
  maternityHospital: string;
  maternityDischargedOn: string | null;
  dischargeWeightG: string;
  neonatalTransfer: NeonatalTransfer;
  dischargeDiagnosis: string;
  perinatalNotes: string;
}

function toForm(p: PerinatalHistory, profile: HealthProfile): NewbornForm {
  return {
    birthWeightG: numText(profile.birthWeightG),
    birthLengthCm: numText(profile.birthLengthCm),
    birthHeadCircumferenceCm: numText(profile.birthHeadCircumferenceCm),
    birthChestCircumferenceCm: numText(p.birthChestCircumferenceCm),
    apgar1min: numText(profile.apgar1min),
    apgar5min: numText(profile.apgar5min),
    apgar10min: numText(p.apgar10min),
    firstCry: p.firstCry,
    resuscitation: p.resuscitation,
    resuscitationNote: p.resuscitationNote,
    firstLatchHours: numText(p.firstLatchHours),
    jaundice: p.jaundice,
    jaundiceFirstDay: p.jaundiceFirstDay,
    jaundiceUntilDay: numText(p.jaundiceUntilDay),
    maxBilirubinUmol: numText(p.maxBilirubinUmol),
    phototherapy: p.phototherapy,
    maternityHospital: profile.maternityHospital,
    maternityDischargedOn: profile.maternityDischargedOn,
    dischargeWeightG: numText(p.dischargeWeightG),
    neonatalTransfer: p.neonatalTransfer,
    dischargeDiagnosis: p.dischargeDiagnosis,
    perinatalNotes: profile.perinatalNotes,
  };
}

function build(form: NewbornForm): PerinatalUpdate | null {
  const details = form.jaundice === "physiological" || form.jaundice === "prolonged" || form.jaundice === "pathological";
  const apgar5 = intInRange(form.apgar5min, 0, 10);
  const payload: PerinatalUpdate = {
    birthWeightG: intInRange(form.birthWeightG, 300, 7000),
    birthLengthCm: decimalInRange(form.birthLengthCm, 20, 70),
    birthHeadCircumferenceCm: decimalInRange(form.birthHeadCircumferenceCm, 15, 50),
    birthChestCircumferenceCm: decimalInRange(form.birthChestCircumferenceCm, 20, 45),
    apgar1min: intInRange(form.apgar1min, 0, 10),
    apgar5min: apgar5,
    apgar10min: intInRange(form.apgar10min, 0, 10),
    firstCry: form.firstCry,
    resuscitation: form.firstCry === "after_resuscitation" ? true : form.resuscitation,
    resuscitationNote: form.resuscitation === true || form.firstCry === "after_resuscitation" ? form.resuscitationNote.trim() : "",
    firstLatchHours: decimalInRange(form.firstLatchHours, 0, 240),
    jaundice: form.jaundice,
    jaundiceFirstDay: details ? form.jaundiceFirstDay : null,
    jaundiceUntilDay: details ? intInRange(form.jaundiceUntilDay, 1, 120) : null,
    maxBilirubinUmol: details ? intInRange(form.maxBilirubinUmol, 0, 1000) : null,
    phototherapy: details ? form.phototherapy : null,
    maternityHospital: form.maternityHospital.trim(),
    maternityDischargedOn: form.maternityDischargedOn,
    dischargeWeightG: intInRange(form.dischargeWeightG, 300, 7000),
    neonatalTransfer: form.neonatalTransfer,
    dischargeDiagnosis: form.dischargeDiagnosis.trim(),
    perinatalNotes: form.perinatalNotes.trim(),
  };
  return Object.values(payload).some((value) => typeof value === "number" && Number.isNaN(value)) ? null : payload;
}

const APGAR = Array.from({ length: 11 }, (_, score) => ({ value: String(score), label: String(score) }));

const ApgarPicker: React.FC<{ title: string; value: string; onChange: (value: string) => void }> = ({ title, value, onChange }) => (
  <Section title={title}>
    <ChipGroup
      options={APGAR}
      selected={[value]}
      tone={(score) => (Number(score) <= 3 ? "error" : Number(score) <= 7 ? "warning" : "success")}
      onToggle={(score) => onChange(value === score ? "" : score)}
    />
  </Section>
);

interface NewbornDrawerProps {
  open: boolean;
  patientId: number;
  birthDate: string | null;
  sex?: ChildSex;
  perinatal: PerinatalHistory;
  profile: HealthProfile;
  screenings: NeonatalScreening[];
  onClose: () => void;
  onScreening: (screening: NeonatalScreening | null) => void;
  onNext?: () => void;
}

/** Окно «Новорождённый» (ТЗ §5.2): числа рождения, первые дни, выписка; ниже — скрининги. */
export const NewbornDrawer: React.FC<NewbornDrawerProps> = ({ open, patientId, birthDate, sex = "", perinatal, profile, screenings, onClose, onScreening, onNext }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [form, setForm] = React.useState<NewbornForm>(() => toForm(perinatal, profile));
  const nextRef = React.useRef(false);

  useFormReset(open, "newborn", () => setForm(toForm(perinatal, profile)));

  const patch = (next: Partial<NewbornForm>) => setForm((current) => ({ ...current, ...next }));
  const payload = build(form);
  const mutation = useMutation({
    mutationFn: () => updatePerinatal(scope, patientId, payload as PerinatalUpdate),
    onSuccess: async (data) => {
      enqueueSnackbar("Сохранено", { variant: "success" });
      await apply(data);
      onClose();
      if (nextRef.current) onNext?.();
    },
  });
  const save = (next: boolean) => {
    nextRef.current = next;
    mutation.mutate();
  };

  const dischargeDay = form.maternityDischargedOn && birthDate ? dayjs(form.maternityDischargedOn).diff(dayjs(birthDate), "day") + 1 : null;
  const weight = intInRange(form.birthWeightG, 300, 7000);
  const dischargeWeight = intInRange(form.dischargeWeightG, 300, 7000);
  const loss =
    weight != null && dischargeWeight != null && !Number.isNaN(weight) && !Number.isNaN(dischargeWeight) && weight > 0
      ? ((weight - dischargeWeight) / weight) * 100
      : null;
  const jaundiceDetails = form.jaundice === "physiological" || form.jaundice === "prolonged" || form.jaundice === "pathological";
  const apgar5 = intInRange(form.apgar5min, 0, 10);

  return (
    <HealthDrawerShell
      open={open}
      title="Новорождённый"
      subtitle="Рождение, первые дни, выписка из роддома"
      pending={mutation.isPending}
      error={mutation.error}
      canSave={payload != null}
      saveLabel="Сохранить"
      onSave={() => save(false)}
      onClose={onClose}
      saveNextLabel={onNext ? "Сохранить и далее" : undefined}
      onSaveNext={onNext ? () => save(true) : undefined}
      width={600}
    >
      <Section title="При рождении">
        <Box sx={pairGridSx}>
          <NumberInput label="Масса" suffix="г" value={form.birthWeightG} onChange={(value) => patch({ birthWeightG: value })} />
          <NumberInput label="Длина" suffix="см" value={form.birthLengthCm} onChange={(value) => patch({ birthLengthCm: value })} />
          <NumberInput label="Окружность головы" suffix="см" value={form.birthHeadCircumferenceCm} onChange={(value) => patch({ birthHeadCircumferenceCm: value })} />
          <NumberInput label="Окружность груди" suffix="см" value={form.birthChestCircumferenceCm} onChange={(value) => patch({ birthChestCircumferenceCm: value })} />
        </Box>
      </Section>
      <ApgarPicker title="Апгар, 1-я минута" value={form.apgar1min} onChange={(value) => patch({ apgar1min: value })} />
      <ApgarPicker title="Апгар, 5-я минута" value={form.apgar5min} onChange={(value) => patch({ apgar5min: value })} />
      {((apgar5 != null && !Number.isNaN(apgar5) && apgar5 < 7) || form.apgar10min !== "") && (
        <ApgarPicker title="Апгар, 10-я минута" value={form.apgar10min} onChange={(value) => patch({ apgar10min: value })} />
      )}
      <Section title="Закричал(а)">
        <Choice<Exclude<FirstCry, "">>
          options={FIRST_CRY}
          value={form.firstCry}
          onChange={(value) => patch({ firstCry: value, resuscitation: value === "after_resuscitation" ? true : form.resuscitation })}
          tone={(value) => (value === "immediately" ? "success" : value === "after_stimulation" ? "warning" : "error")}
        />
      </Section>
      <Section title="Реанимация">
        <YesNo value={form.firstCry === "after_resuscitation" ? true : form.resuscitation} onChange={(value) => patch({ resuscitation: value })} yesTone="error" />
      </Section>
      {(form.resuscitation === true || form.firstCry === "after_resuscitation") && (
        <TextField size="small" label="Что проводилось" value={form.resuscitationNote} onChange={(event) => patch({ resuscitationNote: event.target.value })} fullWidth />
      )}
      <NumberInput
        label="Приложен(а) к груди через"
        suffix="ч"
        value={form.firstLatchHours}
        onChange={(value) => patch({ firstLatchHours: value })}
        helper="0 — сразу после рождения"
      />
      <Section title="Желтуха">
        <Choice<Exclude<JaundiceKind, "">>
          options={JAUNDICE}
          value={form.jaundice}
          onChange={(value) => patch({ jaundice: value })}
          tone={(value) => (value === "none" || value === "physiological" ? "success" : value === "prolonged" ? "warning" : "error")}
        />
      </Section>
      {jaundiceDetails && (
        <>
          <Section title="С первых суток">
            <YesNo value={form.jaundiceFirstDay} onChange={(value) => patch({ jaundiceFirstDay: value })} />
          </Section>
          <Box sx={pairGridSx}>
            <NumberInput label="До каких суток" value={form.jaundiceUntilDay} onChange={(value) => patch({ jaundiceUntilDay: value })} />
            <NumberInput label="Наибольший билирубин" suffix="мкмоль/л" value={form.maxBilirubinUmol} onChange={(value) => patch({ maxBilirubinUmol: value })} />
          </Box>
          <Section title="Фототерапия">
            <YesNo value={form.phototherapy} onChange={(value) => patch({ phototherapy: value })} />
          </Section>
        </>
      )}
      <TextField size="small" label="Роддом" placeholder="Роддом № 4, Бишкек" value={form.maternityHospital} onChange={(event) => patch({ maternityHospital: event.target.value })} fullWidth />
      <Box sx={pairGridSx}>
        <DateInput
          label="Выписан(а) из роддома"
          value={form.maternityDischargedOn}
          onChange={(value) => patch({ maternityDischargedOn: value })}
          helper={dischargeDay && dischargeDay > 0 ? `на ${ordinalDays(dischargeDay)} сутки` : undefined}
        />
        <NumberInput
          label="Масса при выписке"
          suffix="г"
          value={form.dischargeWeightG}
          onChange={(value) => patch({ dischargeWeightG: value })}
          helper={loss != null ? `убыль ${decimal(loss)} %${loss > 8 ? " — больше 8 %" : ""}` : undefined}
        />
      </Box>
      <Section title="Перевод">
        <Choice<Exclude<NeonatalTransfer, "">> options={NEONATAL_TRANSFER} value={form.neonatalTransfer} onChange={(value) => patch({ neonatalTransfer: value })} />
      </Section>
      <TextField size="small" label="Диагноз при выписке" value={form.dischargeDiagnosis} onChange={(event) => patch({ dischargeDiagnosis: event.target.value })} fullWidth />
      <TextField
        size="small"
        label="Особенности периода новорождённости"
        value={form.perinatalNotes}
        onChange={(event) => patch({ perinatalNotes: event.target.value })}
        multiline
        minRows={2}
        fullWidth
      />
      <Section
        title="Скрининги"
        action={
          <AppButton size="small" startIcon={<AddOutlined />} onClick={() => onScreening(null)}>
            Скрининг
          </AppButton>
        }
      >
        {screenings.length ? (
          <Stack gap={0.75}>
            {screenings.map((row) => (
              <ButtonBase
                key={row.id}
                onClick={() => onScreening(row)}
                sx={{ justifyContent: "flex-start", textAlign: "left", border: 1, borderColor: "divider", borderRadius: "10px", px: 1.25, py: 1 }}
              >
                <Typography variant="body2">{screeningText(row, sex)}</Typography>
              </ButtonBase>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Скринингов нет — неонатальный и аудиологический вносятся отдельными строками.
          </Typography>
        )}
      </Section>
    </HealthDrawerShell>
  );
};
