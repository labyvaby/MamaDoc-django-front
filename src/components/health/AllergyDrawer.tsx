import React from "react";
import { Chip, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createAllergy,
  updateAllergy,
  type Allergy,
  type AllergyCategory,
  type AllergyInput,
  type AllergySeverity,
} from "../../api/health";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import type { ChipTone } from "../../pages/patient-program/vision/visionUi";
import { CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { toggleReaction } from "./healthForms";
import {
  ALLERGEN_PRESETS,
  ALLERGY_CATEGORIES,
  ALLERGY_SEVERITIES,
  ALLERGY_STATUSES,
  REACTION_PRESETS,
} from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const EMPTY: AllergyInput = {
  allergen: "",
  category: "drug",
  reaction: "",
  severity: "unknown",
  status: "active",
  isConfirmed: false,
  notedOn: null,
  notes: "",
};

function toInput(allergy: Allergy): AllergyInput {
  const { allergen, category, reaction, severity, status, isConfirmed, notedOn, notes } = allergy;
  return { allergen, category, reaction, severity, status, isConfirmed, notedOn, notes };
}

const severityChipTone = (value: AllergySeverity): ChipTone =>
  value === "anaphylaxis" || value === "severe" ? "error" : value === "moderate" ? "warning" : "primary";

interface AllergyDrawerProps {
  open: boolean;
  patientId: number;
  /** Аллергия для правки; null — новая. */
  allergy: Allergy | null;
  onClose: () => void;
}

/** Аллергия: вид, аллерген и реакция кнопками, тяжесть цветом, статус при правке. */
export const AllergyDrawer: React.FC<AllergyDrawerProps> = ({ open, patientId, allergy, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<AllergyInput>(EMPTY);

  React.useEffect(() => {
    if (open) setForm(allergy ? toInput(allergy) : EMPTY);
  }, [open, allergy]);

  const patch = (next: Partial<AllergyInput>) => setForm((current) => ({ ...current, ...next }));
  const presets = ALLERGEN_PRESETS[form.category];
  const reactions = form.reaction.toLowerCase();

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, allergen: form.allergen.trim(), reaction: form.reaction.trim(), notes: form.notes.trim() };
      return allergy ? updateAllergy(scope, patientId, allergy.id, payload) : createAllergy(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(allergy ? "Аллергия обновлена" : "Аллергия добавлена", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  return (
    <HealthDrawerShell
      open={open}
      title={allergy ? "Аллергия" : "Новая аллергия"}
      subtitle={form.allergen || "Выберите аллерген"}
      pending={mutation.isPending}
      error={mutation.error}
      canSave={form.allergen.trim().length > 0}
      saveLabel={allergy ? "Сохранить" : "Добавить"}
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      <Section title="Вид">
        <ChipGroup<AllergyCategory>
          options={ALLERGY_CATEGORIES}
          selected={[form.category]}
          onToggle={(value) => patch({ category: value })}
        />
      </Section>
      <Section title="Аллерген">
        {presets.length > 0 && (
          <ChipGroup<string>
            options={presets.map((value) => ({ value, label: value }))}
            selected={[form.allergen]}
            onToggle={(value) => patch({ allergen: form.allergen === value ? "" : value })}
          />
        )}
        <TextField
          size="small"
          label="Аллерген"
          placeholder="Например, амоксициллин"
          value={form.allergen}
          onChange={(event) => patch({ allergen: event.target.value })}
          required
          fullWidth
          sx={{ mt: presets.length ? 1.25 : 0 }}
        />
      </Section>
      <Section title="Реакция">
        <ChipGroup<string>
          options={REACTION_PRESETS.map((value) => ({ value, label: value }))}
          selected={REACTION_PRESETS.filter((value) => reactions.includes(value.toLowerCase()))}
          onToggle={(value) => patch({ reaction: toggleReaction(form.reaction, value) })}
        />
        <TextField
          size="small"
          label="Как проявляется"
          value={form.reaction}
          onChange={(event) => patch({ reaction: event.target.value })}
          fullWidth
          sx={{ mt: 1.25 }}
        />
      </Section>
      <Section title="Тяжесть">
        <ChipGroup<AllergySeverity>
          options={ALLERGY_SEVERITIES}
          selected={[form.severity]}
          tone={severityChipTone}
          onToggle={(value) => patch({ severity: value })}
        />
      </Section>
      <CustomDatePicker
        label="Выявлена"
        value={form.notedOn ? dayjs(form.notedOn) : null}
        onChange={(value) => {
          const date = value as Dayjs | null;
          patch({ notedOn: date && date.isValid() ? date.format("YYYY-MM-DD") : null });
        }}
        slotProps={{ textField: { size: "small", fullWidth: true } }}
      />
      <FormControlLabel
        sx={{ m: 0 }}
        control={<Switch checked={form.isConfirmed} onChange={(event) => patch({ isConfirmed: event.target.checked })} />}
        label={<Typography variant="body2">Подтверждена: обследование или повторная реакция</Typography>}
      />
      {allergy && (
        <Section title="Статус">
          <ChipGroup
            options={ALLERGY_STATUSES}
            selected={[form.status]}
            tone={(value) => (value === "active" ? "error" : value === "resolved" ? "success" : "warning")}
            onToggle={(value) => patch({ status: value })}
          />
          {form.status === "refuted" && (
            <Chip size="small" variant="outlined" label="Запись останется в истории, в алерт не попадёт" sx={{ mt: 1 }} />
          )}
        </Section>
      )}
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
