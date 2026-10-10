import React from "react";
import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  ListSubheader,
  MenuItem,
  Radio,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createFamilyMember,
  deleteFamilyMember,
  updateFamilyMember,
  type FamilyDiseaseGroup,
  type FamilyLine,
  type FamilyMember,
  type FamilyMemberInput,
  type FamilyRelation,
  type FamilySuggestion,
  type ParentEducation,
  type ParentEmployment,
  type ParentHabit,
  type PersonSex,
  type RelativeHealth,
  type VitalStatus,
} from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../pages/patient-program/vision/visionUi";
import { AppButton, CustomDatePicker } from "../ui";
import { Choice, ListWithNone, YesNo } from "./anamnesis/anamnesisControls";
import { intInRange, numText } from "./anamnesis/anamnesisForm";
import {
  EDUCATION,
  EMPLOYMENT,
  HABITS,
  RELATION_CHOICES,
  RELATION_META,
  RELATIVE_HEALTH,
  VITAL_STATUS,
  relationChoice,
  relationTitle,
} from "./anamnesis/anamnesisTypes";
import { FAMILY_DISEASES, FAMILY_DISEASE_GROUPS, diseaseFromCatalog, isSensitiveDiseaseTitle } from "./anamnesis/familyDiseases";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { useFormReset } from "./anamnesis/useFormReset";
import { FAMILY_RELATIONS, formatDate, optionLabel } from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

/** Новый родственник с уже выбранным родством (из пустого места родословной). */
export interface RelativePreset {
  relation: FamilyRelation;
  line: FamilyLine;
  sex: PersonSex;
}

const EMPTY: FamilyMemberInput = {
  relation: "mother",
  relativeId: null,
  fullName: "",
  birthDate: null,
  conditions: "",
  therapistExamOn: null,
  gynecologistExamOn: null,
  fluorographyOn: null,
  notes: "",
  line: "",
  sex: "female",
  vitalStatus: "alive",
  deathYear: null,
  deathAge: null,
  healthStatus: "unknown",
  diseases: [],
  education: "",
  employment: "",
  occupation: "",
  hasOccupationalHazards: null,
  occupationalHazards: "",
  habits: null,
};

function toInput(member: FamilyMember): FamilyMemberInput {
  return {
    relation: member.relation,
    relativeId: member.relative?.id ?? null,
    fullName: member.fullName,
    birthDate: member.birthDate,
    conditions: member.conditions,
    therapistExamOn: member.therapistExamOn,
    gynecologistExamOn: member.gynecologistExamOn,
    fluorographyOn: member.fluorographyOn,
    notes: member.notes,
    line: member.line,
    sex: member.sex,
    vitalStatus: member.vitalStatus,
    deathYear: member.deathYear,
    deathAge: member.deathAge,
    healthStatus: member.healthStatus,
    diseases: member.diseases,
    education: member.education,
    employment: member.employment,
    occupation: member.occupation,
    hasOccupationalHazards: member.hasOccupationalHazards,
    occupationalHazards: member.occupationalHazards,
    habits: member.habits,
  };
}

const DateField: React.FC<{ label: string; value: string | null; onChange: (value: string | null) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <CustomDatePicker
    label={label}
    value={value ? dayjs(value) : null}
    onChange={(next) => {
      const date = next as Dayjs | null;
      onChange(date && date.isValid() ? date.format("YYYY-MM-DD") : null);
    }}
    slotProps={{ textField: { size: "small", fullWidth: true } }}
  />
);

/** Группы плоского списка родства. */
const RELATION_SECTIONS: ReadonlyArray<{ title: string; keys: ReadonlyArray<string> }> = [
  { title: "Родители", keys: ["mother", "father"] },
  { title: "Братья и сёстры", keys: ["brother", "sister", "half_sibling_maternal", "half_sibling_paternal"] },
  { title: "Бабушки и дедушки", keys: ["grandmother_maternal", "grandfather_maternal", "grandmother_paternal", "grandfather_paternal"] },
  { title: "Тёти и дяди", keys: ["aunt_maternal", "uncle_maternal", "aunt_paternal", "uncle_paternal"] },
  {
    title: "Двоюродные, прадеды",
    keys: ["cousin_maternal", "cousin_paternal", "great_grandparent_maternal", "great_grandparent_paternal"],
  },
  { title: "Не кровные", keys: ["stepfather", "stepmother", "guardian", "other"] },
];

/** «Жив(а)» → «Жива» по полу; пол не указан — как есть. */
function genderLabel(label: string, sex: PersonSex): string {
  const match = /^(.*)\((а|ла)\)$/.exec(label);
  if (!match || !sex) return label;
  return sex === "female" ? `${match[1]}${match[2]}` : match[1];
}

/** Образование, работа и привычки — у родителей, отчима, мачехи и опекуна. */
const PARENT_LIKE: ReadonlyArray<FamilyRelation> = ["mother", "father", "stepfather", "stepmother", "guardian"];

interface FamilyMemberDrawerProps {
  open: boolean;
  patientId: number;
  member: FamilyMember | null;
  /** Предложить готовую строку (представитель или ребёнок из той же семьи). */
  suggestion: FamilySuggestion | null;
  suggestions: ReadonlyArray<FamilySuggestion>;
  /** Новая строка с выбранным родством (из родословной). */
  preset?: RelativePreset | null;
  onClose: () => void;
}

/** Родственник (ТЗ «Анамнез жизни» §5.5): родство, жив ли, здоровье и болезни, у родителей — образование и работа. */
export const FamilyMemberDrawer: React.FC<FamilyMemberDrawerProps> = ({
  open,
  patientId,
  member,
  suggestion,
  suggestions,
  preset,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<FamilyMemberInput>(EMPTY);
  const [linkedName, setLinkedName] = React.useState("");
  const [otherTitle, setOtherTitle] = React.useState("");
  const [otherGroup, setOtherGroup] = React.useState<FamilyDiseaseGroup>("other");

  const applySuggestion = (item: FamilySuggestion, base: FamilyMemberInput) => {
    const meta = RELATION_META[item.relation];
    setForm({
      ...base,
      relation: item.relation,
      sex: meta.sex ?? base.sex,
      relativeId: item.relative.id,
      fullName: item.relative.fullName,
      birthDate: item.relative.birthDate,
    });
    setLinkedName(item.relative.fullName);
  };

  const resetKey = `${member?.id ?? ""}:${suggestion?.relative.id ?? ""}:${preset ? `${preset.relation}:${preset.line}` : ""}`;
  useFormReset(open, resetKey, () => {
    setOtherTitle("");
    setOtherGroup("other");
    if (member) {
      setForm(toInput(member));
      setLinkedName(member.relative?.fullName ?? "");
    } else if (suggestion) {
      setForm({
        ...EMPTY,
        relation: suggestion.relation,
        sex: RELATION_META[suggestion.relation].sex ?? "",
        relativeId: suggestion.relative.id,
        fullName: suggestion.relative.fullName,
        birthDate: suggestion.relative.birthDate,
      });
      setLinkedName(suggestion.relative.fullName);
    } else if (preset) {
      setForm({ ...EMPTY, relation: preset.relation, line: preset.line, sex: preset.sex || RELATION_META[preset.relation].sex || "" });
      setLinkedName("");
    } else {
      setForm(EMPTY);
      setLinkedName("");
    }
  });

  const patch = (next: Partial<FamilyMemberInput>) => setForm((current) => ({ ...current, ...next }));
  const meta = RELATION_META[form.relation];
  const sex = meta.sex ?? form.sex;
  const choice = relationChoice(form);
  const needsSex = meta.sex == null && form.relation !== "sibling";
  const parentLike = PARENT_LIKE.includes(form.relation);
  const deceased = form.vitalStatus === "deceased";
  const ill = form.healthStatus === "ill";
  const showGynecologist = form.relation === "mother" || form.sex === "female";
  const deathYear = intInRange(numText(form.deathYear), 1900, dayjs().year());
  const deathAge = intInRange(numText(form.deathAge), 0, 120);
  const canSave =
    (form.relativeId != null || form.fullName.trim().length > 0) &&
    (!meta.needsLine || Boolean(form.line)) &&
    !(deceased && ((deathYear != null && Number.isNaN(deathYear)) || (deathAge != null && Number.isNaN(deathAge))));

  const payload = (): FamilyMemberInput => ({
    ...form,
    fullName: form.fullName.trim(),
    conditions: form.conditions.trim(),
    notes: form.notes.trim(),
    line: meta.needsLine || form.relation === "other" ? form.line : "",
    sex: meta.sex ?? form.sex,
    deathYear: deceased ? form.deathYear : null,
    deathAge: deceased ? form.deathAge : null,
    diseases: ill ? form.diseases.map((disease) => ({ ...disease, causeOfDeath: deceased && disease.causeOfDeath })) : [],
    education: parentLike ? form.education : "",
    employment: parentLike ? form.employment : "",
    occupation: parentLike ? form.occupation.trim() : "",
    hasOccupationalHazards: parentLike ? form.hasOccupationalHazards : null,
    occupationalHazards: parentLike && form.hasOccupationalHazards ? form.occupationalHazards.trim() : "",
    habits: parentLike ? form.habits : null,
  });

  const save = useMutation({
    mutationFn: () => (member ? updateFamilyMember(scope, patientId, member.id, payload()) : createFamilyMember(scope, patientId, payload())),
    onSuccess: async () => {
      enqueueSnackbar(member ? "Строка обновлена" : "Родственник добавлен", { variant: "success" });
      await invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteFamilyMember(scope, patientId, (member as FamilyMember).id),
    onSuccess: async () => {
      enqueueSnackbar("Строка удалена", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  const toggleDisease = (code: string) => {
    const has = form.diseases.some((disease) => disease.code === code);
    if (has) patch({ diseases: form.diseases.filter((disease) => disease.code !== code) });
    else {
      const disease = diseaseFromCatalog(code);
      if (disease) patch({ diseases: [...form.diseases, disease], healthStatus: "ill" });
    }
  };
  const addOther = () => {
    const title = otherTitle.trim();
    if (!title) return;
    patch({ diseases: [...form.diseases, { code: "other", title, group: otherGroup, hereditary: false, causeOfDeath: false }], healthStatus: "ill" });
    setOtherTitle("");
  };
  const setDisease = (index: number, next: Partial<FamilyMemberInput["diseases"][number]>) =>
    patch({
      diseases: form.diseases.map((disease, position) => {
        if (position === index) return { ...disease, ...next };
        // Причина смерти — не больше одной.
        if (next.causeOfDeath) return { ...disease, causeOfDeath: false };
        return disease;
      }),
    });

  return (
    <HealthDrawerShell
      open={open}
      title={member ? "Родственник" : "Новый родственник"}
      subtitle={[relationTitle(form), form.fullName].filter(Boolean).join(" · ")}
      pending={save.isPending || remove.isPending}
      error={save.error ?? remove.error}
      canSave={canSave}
      saveLabel={member ? "Сохранить" : "Добавить"}
      onSave={() => save.mutate()}
      onClose={onClose}
      footerStart={
        member ? (
          <AppButton color="error" startIcon={<DeleteOutlineOutlined />} loading={remove.isPending} onClick={() => remove.mutate()}>
            Удалить
          </AppButton>
        ) : undefined
      }
    >
      {!member && suggestions.length > 0 && (
        <Section title="Из карточек">
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            {suggestions.map((item) => (
              <Chip
                key={item.relative.id}
                icon={<PersonOutlined />}
                clickable
                color={form.relativeId === item.relative.id ? "primary" : "default"}
                variant={form.relativeId === item.relative.id ? "filled" : "outlined"}
                label={`${optionLabel(FAMILY_RELATIONS, item.relation) || relationTitle({ relation: item.relation, line: "", sex: "" })}: ${item.relative.fullName}`}
                onClick={() => applySuggestion(item, form)}
              />
            ))}
          </Stack>
        </Section>
      )}
      <TextField
        select
        size="small"
        label="Родство"
        value={choice.key}
        onChange={(event) => {
          const next = RELATION_CHOICES.find((item) => item.key === event.target.value);
          if (!next) return;
          patch({ relation: next.relation, line: next.line, sex: next.sex || (RELATION_META[next.relation].sex ?? form.sex) });
        }}
        fullWidth
      >
        {RELATION_SECTIONS.flatMap((section) => [
          <ListSubheader key={`h-${section.title}`}>{section.title}</ListSubheader>,
          ...section.keys.map((key) => {
            const item = RELATION_CHOICES.find((entry) => entry.key === key);
            return item ? (
              <MenuItem key={key} value={key}>
                {item.label}
              </MenuItem>
            ) : null;
          }),
        ])}
      </TextField>
      {form.relation === "other" && (
        <Section title="Линия">
          <Choice<"maternal" | "paternal">
            options={[
              { value: "maternal", label: "По матери" },
              { value: "paternal", label: "По отцу" },
            ]}
            value={form.line}
            onChange={(value) => patch({ line: value })}
          />
        </Section>
      )}
      {needsSex && (
        <Section title="Пол">
          <Choice<"male" | "female">
            options={[
              { value: "male", label: "Мужской" },
              { value: "female", label: "Женский" },
            ]}
            value={form.sex}
            onChange={(value) => patch({ sex: value })}
          />
        </Section>
      )}
      {form.relativeId != null && (
        <Stack direction="row" alignItems="center" gap={1}>
          <Chip
            icon={<PersonOutlined />}
            color="primary"
            variant="outlined"
            label={`Карточка: ${linkedName || form.fullName}`}
            onDelete={() => patch({ relativeId: null })}
          />
          <Typography variant="caption" color="text.secondary">
            крестик — отвязать карточку
          </Typography>
        </Stack>
      )}
      <Box sx={pairGridSx}>
        <TextField
          size="small"
          label="ФИО"
          value={form.fullName}
          onChange={(event) => patch({ fullName: event.target.value })}
          required={form.relativeId == null}
          fullWidth
        />
        <DateField label="Дата рождения" value={form.birthDate} onChange={(value) => patch({ birthDate: value })} />
      </Box>
      <Section title="Жив или умер">
        <Choice<Exclude<VitalStatus, "">>
          options={VITAL_STATUS.map((option) => ({ ...option, label: genderLabel(option.label, sex) }))}
          value={form.vitalStatus}
          onChange={(value) => patch({ vitalStatus: value })}
        />
      </Section>
      {deceased && (
        <Box sx={pairGridSx}>
          <TextField
            size="small"
            label="Год смерти"
            value={numText(form.deathYear)}
            onChange={(event) => patch({ deathYear: event.target.value ? Number(event.target.value.replace(/[^\d]/g, "")) : null })}
            inputProps={{ inputMode: "numeric" }}
            error={deathYear != null && Number.isNaN(deathYear)}
            fullWidth
          />
          <TextField
            size="small"
            label="Возраст смерти, лет"
            value={numText(form.deathAge)}
            onChange={(event) => patch({ deathAge: event.target.value ? Number(event.target.value.replace(/[^\d]/g, "")) : null })}
            inputProps={{ inputMode: "numeric" }}
            error={deathAge != null && Number.isNaN(deathAge)}
            fullWidth
          />
        </Box>
      )}
      {meta.blood && (
        <Section title="Здоровье">
          <Choice<RelativeHealth>
            options={RELATIVE_HEALTH.map((option) => ({ ...option, label: genderLabel(option.label, sex) }))}
            value={form.healthStatus}
            onChange={(value) => patch({ healthStatus: value || "unknown" })}
            tone={(value) => (value === "healthy" ? "success" : value === "ill" ? "warning" : "primary")}
          />
          {form.healthStatus === "healthy" && form.diseases.length > 0 && (
            <Typography variant="caption" color="warning.main">
              «Здоров(а)» — список болезней при сохранении очистится
            </Typography>
          )}
        </Section>
      )}
      {meta.blood && ill && (
        <Section title="Болезни">
          <Stack gap={1.25}>
            {form.diseases.length === 0 && (
              <Typography variant="caption" color="warning.main">
                Укажите болезни: без списка родственник не входит в индекс отягощённости.
              </Typography>
            )}
            {form.diseases.map((disease, index) => (
              <Box key={`${disease.code}-${index}`} sx={{ border: 1, borderColor: "divider", borderRadius: "10px", px: 1.25, py: 0.75 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 0 }}>
                    {disease.title}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label={`Убрать: ${disease.title}`}
                    onClick={() => patch({ diseases: form.diseases.filter((_, position) => position !== index) })}
                  >
                    <CloseOutlined fontSize="small" />
                  </IconButton>
                </Stack>
                <Stack direction="row" gap={1.5} flexWrap="wrap">
                  <FormControlLabel
                    control={<Checkbox size="small" checked={disease.hereditary} onChange={(event) => setDisease(index, { hereditary: event.target.checked })} />}
                    label={<Typography variant="caption">наследственное</Typography>}
                  />
                  {deceased && (
                    <FormControlLabel
                      control={
                        <Radio
                          size="small"
                          checked={disease.causeOfDeath}
                          onClick={() => setDisease(index, { causeOfDeath: !disease.causeOfDeath })}
                        />
                      }
                      label={<Typography variant="caption">причина смерти</Typography>}
                    />
                  )}
                </Stack>
              </Box>
            ))}
            {FAMILY_DISEASE_GROUPS.filter((group) => group.value !== "other").map((group) => (
              <Box key={group.value}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {group.label}
                </Typography>
                <ChipGroup<string>
                  options={FAMILY_DISEASES.filter((item) => item.group === group.value).map((item) => ({ value: item.code, label: item.title }))}
                  selected={form.diseases.map((disease) => disease.code)}
                  tone={() => "warning"}
                  onToggle={toggleDisease}
                />
              </Box>
            ))}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 190px auto" }, gap: 1, alignItems: "start" }}>
              <TextField
                size="small"
                label="Другое — название"
                value={otherTitle}
                onChange={(event) => setOtherTitle(event.target.value)}
                helperText={isSensitiveDiseaseTitle(otherTitle) ? "Эти сведения — в закрытой карточке «Эпиданамнез»" : undefined}
                fullWidth
              />
              <TextField select size="small" label="Группа" value={otherGroup} onChange={(event) => setOtherGroup(event.target.value as FamilyDiseaseGroup)} fullWidth>
                {FAMILY_DISEASE_GROUPS.map((group) => (
                  <MenuItem key={group.value} value={group.value}>
                    {group.label}
                  </MenuItem>
                ))}
              </TextField>
              <AppButton variant="outlined" disabled={!otherTitle.trim()} onClick={addOther}>
                Добавить
              </AppButton>
            </Box>
          </Stack>
        </Section>
      )}
      {parentLike && (
        <>
          <Section title="Образование">
            <Choice<Exclude<ParentEducation, "">> options={EDUCATION} value={form.education} onChange={(value) => patch({ education: value })} />
          </Section>
          <Section title="Работа">
            <Choice<Exclude<ParentEmployment, "">> options={EMPLOYMENT} value={form.employment} onChange={(value) => patch({ employment: value })} />
          </Section>
          <TextField size="small" label="Место работы, должность" value={form.occupation} onChange={(event) => patch({ occupation: event.target.value })} fullWidth />
          <Section title="Профвредности">
            <YesNo value={form.hasOccupationalHazards} onChange={(value) => patch({ hasOccupationalHazards: value })} />
          </Section>
          {form.hasOccupationalHazards === true && (
            <TextField size="small" label="Какие" value={form.occupationalHazards} onChange={(event) => patch({ occupationalHazards: event.target.value })} fullWidth />
          )}
          <Section title="Вредные привычки">
            <ListWithNone<ParentHabit> options={HABITS} value={form.habits} onChange={(value) => patch({ habits: value })} noneLabel="Нет" />
          </Section>
        </>
      )}
      {form.conditions.trim() && (
        <TextField
          size="small"
          label="Записано текстом"
          value={form.conditions}
          onChange={(event) => patch({ conditions: event.target.value })}
          multiline
          minRows={2}
          fullWidth
          helperText="Прежняя запись: разнесите болезни списком выше — в индекс отягощённости текст не идёт"
        />
      )}
      <Section title="Диспансеризация семьи">
        <Box sx={pairGridSx}>
          <DateField label="Осмотр терапевтом" value={form.therapistExamOn} onChange={(value) => patch({ therapistExamOn: value })} />
          {showGynecologist && (
            <DateField label="Осмотр гинекологом" value={form.gynecologistExamOn} onChange={(value) => patch({ gynecologistExamOn: value })} />
          )}
          <DateField label="Флюорография" value={form.fluorographyOn} onChange={(value) => patch({ fluorographyOn: value })} />
        </Box>
        {member?.fluorographyOn && (
          <Typography variant="caption" color="text.secondary">
            Последняя флюорография {formatDate(member.fluorographyOn)}
          </Typography>
        )}
      </Section>
      <TextField
        size="small"
        label="Примечание"
        value={form.notes}
        onChange={(event) => patch({ notes: event.target.value })}
        multiline
        minRows={2}
        fullWidth
      />
    </HealthDrawerShell>
  );
};
