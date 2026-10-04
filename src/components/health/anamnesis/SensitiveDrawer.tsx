import React from "react";
import { Alert, Box, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import {
  updateSensitiveHistory,
  type HouseholdInfection,
  type MarkerResult,
  type SensitiveHistory,
  type SensitiveUpdate,
  type TbContact,
  type TbContactPlace,
} from "../../../api/health";
import { Section } from "../../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../../pages/patient-program/vision/visionUi";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice, DateInput, ListWithNone, YesNo } from "./anamnesisControls";
import { emptySensitiveHistory } from "./anamnesisForm";
import { HOUSEHOLD_INFECTIONS, MARKER_RESULTS, TB_CONTACT, TB_PLACES } from "./anamnesisTypes";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

const MARKERS: ReadonlyArray<{ key: "motherHbsag" | "motherHcv" | "motherHiv" | "motherSyphilis"; label: string }> = [
  { key: "motherHbsag", label: "HBsAg" },
  { key: "motherHcv", label: "Анти-HCV" },
  { key: "motherHiv", label: "ВИЧ" },
  { key: "motherSyphilis", label: "Сифилис" },
];

interface SensitiveDrawerProps {
  open: boolean;
  patientId: number;
  sensitive: SensitiveHistory | null;
  onClose: () => void;
}

/**
 * Закрытые сведения (ТЗ §5.6): маркёры у матери, туберкулёзный контакт,
 * инфекции в окружении, асоциальное поведение. Видно только при праве
 * `medical.health.sensitive.view` — без него окно не открывается.
 */
export const SensitiveDrawer: React.FC<SensitiveDrawerProps> = ({ open, patientId, sensitive, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [form, setForm] = React.useState<SensitiveHistory>(() => sensitive ?? emptySensitiveHistory());

  useFormReset(open, "sensitive", () => setForm(sensitive ?? emptySensitiveHistory()));

  const patch = (next: Partial<SensitiveHistory>) => setForm((current) => ({ ...current, ...next }));
  const contact = form.tbContact === "yes";
  const payload: SensitiveUpdate = {
    motherHbsag: form.motherHbsag,
    motherHcv: form.motherHcv,
    motherHiv: form.motherHiv,
    motherSyphilis: form.motherSyphilis,
    tbContact: form.tbContact,
    tbContactPlace: contact ? form.tbContactPlace : "",
    tbContactFrom: contact ? form.tbContactFrom : null,
    tbContactTo: contact ? form.tbContactTo : null,
    tbSourceBacillary: contact ? form.tbSourceBacillary : null,
    tbPreventiveTherapy: contact ? form.tbPreventiveTherapy : null,
    tbPreventiveFrom: contact && form.tbPreventiveTherapy ? form.tbPreventiveFrom : null,
    tbPreventiveTo: contact && form.tbPreventiveTherapy ? form.tbPreventiveTo : null,
    householdInfections: form.householdInfections,
    asocialFamily: form.asocialFamily,
    asocialNote: form.asocialFamily === true ? form.asocialNote.trim() : "",
    notes: form.notes.trim(),
  };
  const mutation = useMutation({
    mutationFn: () => updateSensitiveHistory(scope, patientId, payload),
    onSuccess: async (data) => {
      enqueueSnackbar("Сохранено", { variant: "success" });
      await apply(data);
      onClose();
    },
  });

  return (
    <HealthDrawerShell
      open={open}
      title="Закрытые сведения"
      subtitle="Эпиданамнез и сведения о семье"
      pending={mutation.isPending}
      error={mutation.error}
      canSave
      saveLabel="Сохранить"
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      <Alert severity="info" variant="outlined">
        Эти сведения видят только сотрудники с правом «Закрытые сведения медкарты». В абзац заключения попадает только туберкулёзный
        контакт.
      </Alert>
      <Section title="Маркёры у матери">
        <Box sx={{ display: "grid", gap: 1.25 }}>
          {MARKERS.map((marker) => (
            <Box key={marker.key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "96px minmax(0, 1fr)" }, gap: 0.75, alignItems: "center" }}>
              <Box sx={{ fontSize: 13, fontWeight: 600 }}>{marker.label}</Box>
              <Choice<Exclude<MarkerResult, "">>
                options={MARKER_RESULTS}
                value={form[marker.key]}
                onChange={(value) => patch({ [marker.key]: value } as Partial<SensitiveHistory>)}
                tone={(value) => (value === "negative" ? "success" : "error")}
              />
            </Box>
          ))}
        </Box>
      </Section>
      <Section title="Туберкулёзный контакт">
        <Choice<Exclude<TbContact, "">> options={TB_CONTACT} value={form.tbContact} onChange={(value) => patch({ tbContact: value })} tone={(value) => (value === "no" ? "success" : "error")} />
      </Section>
      {contact && (
        <>
          <Section title="Где">
            <Choice<Exclude<TbContactPlace, "">> options={TB_PLACES} value={form.tbContactPlace} onChange={(value) => patch({ tbContactPlace: value })} />
          </Section>
          <Box sx={pairGridSx}>
            <DateInput label="Контакт с" value={form.tbContactFrom} onChange={(value) => patch({ tbContactFrom: value })} />
            <DateInput label="по" value={form.tbContactTo} onChange={(value) => patch({ tbContactTo: value })} />
          </Box>
          <Section title="Источник — бактериовыделитель">
            <YesNo value={form.tbSourceBacillary} onChange={(value) => patch({ tbSourceBacillary: value })} yesTone="error" />
          </Section>
          <Section title="Превентивное лечение">
            <YesNo value={form.tbPreventiveTherapy} onChange={(value) => patch({ tbPreventiveTherapy: value })} yesTone="success" />
          </Section>
          {form.tbPreventiveTherapy === true && (
            <Box sx={pairGridSx}>
              <DateInput label="Лечение с" value={form.tbPreventiveFrom} onChange={(value) => patch({ tbPreventiveFrom: value })} />
              <DateInput label="по" value={form.tbPreventiveTo} onChange={(value) => patch({ tbPreventiveTo: value })} />
            </Box>
          )}
        </>
      )}
      <Section title="Инфекции в окружении ребёнка">
        <ListWithNone<HouseholdInfection>
          options={HOUSEHOLD_INFECTIONS}
          value={form.householdInfections}
          onChange={(value) => patch({ householdInfections: value })}
          noneLabel="Нет"
        />
      </Section>
      <Section title="Асоциальное поведение в семье">
        <YesNo value={form.asocialFamily} onChange={(value) => patch({ asocialFamily: value })} yesTone="error" />
      </Section>
      {form.asocialFamily === true && (
        <TextField size="small" label="Что именно" value={form.asocialNote} onChange={(event) => patch({ asocialNote: event.target.value })} fullWidth />
      )}
      <TextField size="small" label="Заметка" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} multiline minRows={2} fullWidth />
    </HealthDrawerShell>
  );
};
