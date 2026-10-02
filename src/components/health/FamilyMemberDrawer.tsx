import React from "react";
import { Box, Chip, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createFamilyMember,
  deleteFamilyMember,
  updateFamilyMember,
  type FamilyMember,
  type FamilyMemberInput,
  type FamilyRelation,
  type FamilySuggestion,
} from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../pages/patient-program/vision/visionUi";
import { AppButton, CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { toggleCondition } from "./healthForms";
import { FAMILY_CONDITION_PRESETS, FAMILY_RELATIONS, formatDate, optionLabel } from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

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

interface FamilyMemberDrawerProps {
  open: boolean;
  patientId: number;
  member: FamilyMember | null;
  /** Предложить готовую строку (представитель или ребёнок из той же семьи). */
  suggestion: FamilySuggestion | null;
  suggestions: ReadonlyArray<FamilySuggestion>;
  onClose: () => void;
}

/** Член семьи: кто, карточка или ФИО, заболевания, диспансеризация семьи. */
export const FamilyMemberDrawer: React.FC<FamilyMemberDrawerProps> = ({
  open,
  patientId,
  member,
  suggestion,
  suggestions,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<FamilyMemberInput>(EMPTY);
  const [linkedName, setLinkedName] = React.useState("");

  const applySuggestion = (item: FamilySuggestion, base: FamilyMemberInput) => {
    setForm({
      ...base,
      relation: item.relation,
      relativeId: item.relative.id,
      fullName: item.relative.fullName,
      birthDate: item.relative.birthDate,
    });
    setLinkedName(item.relative.fullName);
  };

  React.useEffect(() => {
    if (!open) return;
    if (member) {
      setForm(toInput(member));
      setLinkedName(member.relative?.fullName ?? "");
    } else if (suggestion) {
      setForm({
        ...EMPTY,
        relation: suggestion.relation,
        relativeId: suggestion.relative.id,
        fullName: suggestion.relative.fullName,
        birthDate: suggestion.relative.birthDate,
      });
      setLinkedName(suggestion.relative.fullName);
    } else {
      setForm(EMPTY);
      setLinkedName("");
    }
  }, [open, member, suggestion]);

  const patch = (next: Partial<FamilyMemberInput>) => setForm((current) => ({ ...current, ...next }));
  const canSave = form.relativeId != null || form.fullName.trim().length > 0;
  const showGynecologist = form.relation === "mother" || form.relation === "other";

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, fullName: form.fullName.trim(), conditions: form.conditions.trim(), notes: form.notes.trim() };
      return member ? updateFamilyMember(scope, patientId, member.id, payload) : createFamilyMember(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(member ? "Строка обновлена" : "Член семьи добавлен", { variant: "success" });
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

  return (
    <HealthDrawerShell
      open={open}
      title={member ? "Член семьи" : "Новый член семьи"}
      subtitle={[optionLabel(FAMILY_RELATIONS, form.relation), form.fullName].filter(Boolean).join(" · ")}
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
                label={`${optionLabel(FAMILY_RELATIONS, item.relation)}: ${item.relative.fullName}`}
                onClick={() => applySuggestion(item, form)}
              />
            ))}
          </Stack>
        </Section>
      )}
      <Section title="Кто">
        <ChipGroup<FamilyRelation> options={FAMILY_RELATIONS} selected={[form.relation]} onToggle={(value) => patch({ relation: value })} />
      </Section>
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
      <Section title="Хронические и перенесённые инфекционные заболевания">
        <ChipGroup<string>
          options={FAMILY_CONDITION_PRESETS.map((value) => ({ value, label: value }))}
          selected={FAMILY_CONDITION_PRESETS.filter((value) => form.conditions.toLowerCase().includes(value.toLowerCase()))}
          onToggle={(value) => patch({ conditions: toggleCondition(form.conditions, value) })}
        />
        <TextField
          size="small"
          value={form.conditions}
          onChange={(event) => patch({ conditions: event.target.value })}
          multiline
          minRows={2}
          fullWidth
          sx={{ mt: 1.25 }}
        />
      </Section>
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
