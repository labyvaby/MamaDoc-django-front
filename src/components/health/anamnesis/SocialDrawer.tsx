import React from "react";
import { Alert, Box, ButtonBase, Stack, TextField, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import {
  updateLifeSocial,
  type FamilyClimate,
  type FamilyComposition,
  type FamilyMember,
  type HousingKind,
  type IncomeLevel,
  type LifeAnamnesisSocial,
  type LifeSocialUpdate,
  type PetKind,
  type SanitaryState,
  type SocialInformant,
} from "../../../api/health";
import { Section } from "../../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../../pages/patient-program/vision/visionUi";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice, CountInput, DateInput, ListWithNone, YesNo } from "./anamnesisControls";
import { intInRange, numText } from "./anamnesisForm";
import { CLIMATE, EDUCATION, EMPLOYMENT, FAMILY_COMPOSITION, HABITS, HOUSING, INCOME, PETS, SANITARY, SOCIAL_INFORMANTS } from "./anamnesisTypes";
import { fullYears, lowerFirst } from "./russian";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

type SocialForm = Required<Omit<LifeSocialUpdate, "rooms">> & { rooms: string };

function toForm(s: LifeAnamnesisSocial): SocialForm {
  return {
    familyComposition: s.familyComposition,
    housing: s.housing,
    rooms: numText(s.rooms),
    income: s.income,
    familyClimate: s.familyClimate,
    childWanted: s.childWanted,
    sanitary: s.sanitary,
    smokingAtHome: s.smokingAtHome,
    pets: s.pets,
    parentsConsanguineous: s.parentsConsanguineous,
    consanguinityNote: s.consanguinityNote,
    infantDeathInFamily: s.infantDeathInFamily,
    infantDeathNote: s.infantDeathNote,
    // Дата сбора сведений — сегодня, если ещё не собирали.
    assessedOn: s.assessedOn ?? dayjs().format("YYYY-MM-DD"),
    informant: s.informant,
  };
}

/** «Мама 32, высшее, в декрете, привычек нет». */
function parentSummary(member: FamilyMember): string {
  const age = fullYears(member.birthDate, dayjs().format("YYYY-MM-DD"));
  const education = EDUCATION.find((option) => option.value === member.education)?.label ?? "";
  const employment = EMPLOYMENT.find((option) => option.value === member.employment)?.label ?? "";
  const habits =
    member.habits == null
      ? ""
      : member.habits.length === 0
        ? "привычек нет"
        : member.habits.map((habit) => HABITS.find((option) => option.value === habit)?.label.toLowerCase()).join(", ");
  return [
    `${member.relation === "mother" ? "Мама" : "Папа"}${age != null ? ` ${age}` : ""}`,
    lowerFirst(education),
    lowerFirst(employment),
    member.hasOccupationalHazards ? "профвредности" : "",
    habits,
  ]
    .filter(Boolean)
    .join(", ");
}

interface SocialDrawerProps {
  open: boolean;
  patientId: number;
  social: LifeAnamnesisSocial;
  family: FamilyMember[];
  onClose: () => void;
  /** Правка строки паспорта: родители — в окне родственника. */
  onEditMember: (member: FamilyMember | null, relation: "mother" | "father") => void;
}

/** Окно «Семья и быт» (ТЗ §5.4): восемь параметров быта, сведения о семье, дата и источник. */
export const SocialDrawer: React.FC<SocialDrawerProps> = ({ open, patientId, social, family, onClose, onEditMember }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [form, setForm] = React.useState<SocialForm>(() => toForm(social));

  useFormReset(open, "social", () => setForm(toForm(social)));

  const patch = (next: Partial<SocialForm>) => setForm((current) => ({ ...current, ...next }));
  const rooms = intInRange(form.rooms, 1, 20);
  const valid = !(rooms != null && Number.isNaN(rooms));
  const payload: LifeSocialUpdate = {
    ...form,
    rooms,
    consanguinityNote: form.parentsConsanguineous === true ? form.consanguinityNote.trim() : "",
    infantDeathNote: form.infantDeathInFamily === true ? form.infantDeathNote.trim() : "",
  };
  const mutation = useMutation({
    mutationFn: () => updateLifeSocial(scope, patientId, payload),
    onSuccess: async (data) => {
      enqueueSnackbar("Сохранено", { variant: "success" });
      await apply(data);
      onClose();
    },
  });
  const parents = (["mother", "father"] as const).map((relation) => ({ relation, member: family.find((row) => row.relation === relation) ?? null }));

  return (
    <HealthDrawerShell
      open={open}
      title="Семья и быт"
      subtitle="Социальный анамнез: восемь параметров"
      pending={mutation.isPending}
      error={mutation.error}
      canSave={valid}
      saveLabel="Сохранить"
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      <Section title="Родители — из «Паспорта семьи»">
        <Stack gap={0.75}>
          {parents.map(({ relation, member }) => (
            <ButtonBase
              key={relation}
              onClick={() => onEditMember(member, relation)}
              sx={{ justifyContent: "space-between", gap: 1, textAlign: "left", border: 1, borderColor: "divider", borderRadius: "10px", px: 1.25, py: 1 }}
            >
              <Typography variant="body2" color={member ? "text.primary" : "text.secondary"}>
                {member ? parentSummary(member) : relation === "mother" ? "Мать не внесена" : "Отец не внесён"}
              </Typography>
              <Stack direction="row" gap={0.5} alignItems="center" sx={{ color: "primary.main", flexShrink: 0 }}>
                <EditOutlined sx={{ fontSize: 16 }} />
                <Typography variant="caption" fontWeight={600}>
                  {member ? "Изменить" : "Добавить"}
                </Typography>
              </Stack>
            </ButtonBase>
          ))}
        </Stack>
      </Section>
      <Section title="Состав семьи">
        <Choice<Exclude<FamilyComposition, "">> options={FAMILY_COMPOSITION} value={form.familyComposition} onChange={(value) => patch({ familyComposition: value })} />
      </Section>
      <Section title="Жильё">
        <Choice<Exclude<HousingKind, "">>
          options={HOUSING}
          value={form.housing}
          onChange={(value) => patch({ housing: value })}
          tone={(value) => (value === "room" || value === "dormitory" || value === "none" ? "warning" : "primary")}
        />
      </Section>
      <Box sx={pairGridSx}>
        <CountInput label="Комнат" value={form.rooms} onChange={(value) => patch({ rooms: value })} />
      </Box>
      <Section title="Материальная обеспеченность">
        <Choice<Exclude<IncomeLevel, "">> options={INCOME} value={form.income} onChange={(value) => patch({ income: value })} />
      </Section>
      <Section title="Климат в семье">
        <Choice<Exclude<FamilyClimate, "">>
          options={CLIMATE}
          value={form.familyClimate}
          onChange={(value) => patch({ familyClimate: value })}
          tone={(value) => (value === "favorable" ? "success" : "warning")}
        />
      </Section>
      <Section title="Ребёнок желанный">
        <YesNo value={form.childWanted} onChange={(value) => patch({ childWanted: value })} yesTone="success" />
      </Section>
      <Section title="Санитарно-гигиенические условия">
        <Choice<Exclude<SanitaryState, "">> options={SANITARY} value={form.sanitary} onChange={(value) => patch({ sanitary: value })} />
      </Section>
      <Section title="Курят ли дома">
        <YesNo value={form.smokingAtHome} onChange={(value) => patch({ smokingAtHome: value })} yes="Курят" no="Не курят" />
      </Section>
      <Section title="Животные дома">
        <ListWithNone<PetKind> options={PETS} value={form.pets} onChange={(value) => patch({ pets: value })} noneLabel="Нет" />
      </Section>
      <Section title="О семье">
        <Stack gap={1}>
          <Typography variant="body2">Родители — кровные родственники</Typography>
          <YesNo value={form.parentsConsanguineous} onChange={(value) => patch({ parentsConsanguineous: value })} />
          {form.parentsConsanguineous === true && (
            <TextField size="small" label="Степень родства" value={form.consanguinityNote} onChange={(event) => patch({ consanguinityNote: event.target.value })} fullWidth />
          )}
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Смерть ребёнка до года в семье
          </Typography>
          <YesNo value={form.infantDeathInFamily} onChange={(value) => patch({ infantDeathInFamily: value })} />
          {form.infantDeathInFamily === true && (
            <TextField size="small" label="Когда и от чего" value={form.infantDeathNote} onChange={(event) => patch({ infantDeathNote: event.target.value })} fullWidth />
          )}
        </Stack>
      </Section>
      <Box sx={pairGridSx}>
        <DateInput label="Сведения собраны" value={form.assessedOn} onChange={(value) => patch({ assessedOn: value })} />
      </Box>
      <Section title="Со слов кого">
        <Choice<Exclude<SocialInformant, "">> options={SOCIAL_INFORMANTS} value={form.informant} onChange={(value) => patch({ informant: value })} />
      </Section>
      {!valid && <Alert severity="warning">Комнат — от 1 до 20.</Alert>}
    </HealthDrawerShell>
  );
};
