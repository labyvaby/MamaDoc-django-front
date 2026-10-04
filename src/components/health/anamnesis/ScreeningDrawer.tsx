import React from "react";
import { Box, TextField } from "@mui/material";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import {
  createScreening,
  deleteScreening,
  updateScreening,
  type EarResult,
  type HearingMethod,
  type HearingStage,
  type NeonatalScreening,
  type ScreeningInput,
  type ScreeningKind,
  type ScreeningResult,
} from "../../../api/health";
import { Section } from "../../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../../pages/patient-program/vision/visionUi";
import { AppButton } from "../../ui";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice, DateInput } from "./anamnesisControls";
import {
  DEFAULT_NEONATAL_PROGRAM,
  EAR_RESULTS,
  HEARING_METHODS,
  HEARING_STAGES,
  SCREENING_KINDS,
  SCREENING_RESULTS,
} from "./anamnesisTypes";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

function emptyInput(kind: ScreeningKind): ScreeningInput {
  return {
    kind,
    performedOn: null,
    result: "",
    program: kind === "neonatal" ? DEFAULT_NEONATAL_PROGRAM : "",
    stage: "",
    method: "",
    rightEar: "",
    leftEar: "",
    reason: "",
    notes: "",
  };
}

function toInput(row: NeonatalScreening): ScreeningInput {
  return {
    kind: row.kind,
    performedOn: row.performedOn,
    result: row.result,
    program: row.program,
    stage: row.stage,
    method: row.method,
    rightEar: row.rightEar,
    leftEar: row.leftEar,
    reason: row.reason,
    notes: row.notes,
  };
}

interface ScreeningDrawerProps {
  open: boolean;
  patientId: number;
  birthDate: string | null;
  screening: NeonatalScreening | null;
  /** Вид новой строки по умолчанию. */
  initialKind: ScreeningKind;
  onClose: () => void;
  onNext?: () => void;
}

/** Окно «Скрининг» (ТЗ §5.3): неонатальный или слух; ошибочную строку можно удалить. */
export const ScreeningDrawer: React.FC<ScreeningDrawerProps> = ({ open, patientId, birthDate, screening, initialKind, onClose, onNext }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [form, setForm] = React.useState<ScreeningInput>(() => (screening ? toInput(screening) : emptyInput(initialKind)));
  const nextRef = React.useRef(false);

  useFormReset(open, `${screening?.id ?? "new"}:${initialKind}`, () => setForm(screening ? toInput(screening) : emptyInput(initialKind)));

  const patch = (next: Partial<ScreeningInput>) => setForm((current) => ({ ...current, ...next }));
  const neonatal = form.kind === "neonatal";
  const valid = neonatal ? Boolean(form.result) : Boolean(form.rightEar || form.leftEar);
  const payload: ScreeningInput = neonatal
    ? { ...form, stage: "", method: "", rightEar: "", leftEar: "", program: form.program.trim(), reason: form.reason.trim(), notes: form.notes.trim() }
    : { ...form, result: "", program: "", reason: form.reason.trim(), notes: form.notes.trim() };

  const save = useMutation({
    mutationFn: () => (screening ? updateScreening(scope, patientId, screening.id, payload) : createScreening(scope, patientId, payload)),
    onSuccess: async (data) => {
      enqueueSnackbar(screening ? "Скрининг обновлён" : "Скрининг добавлен", { variant: "success" });
      await apply(data);
      onClose();
      if (nextRef.current) onNext?.();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteScreening(scope, patientId, (screening as NeonatalScreening).id),
    onSuccess: async (data) => {
      enqueueSnackbar("Строка скрининга удалена", { variant: "success" });
      await apply(data);
      onClose();
    },
  });
  const run = (next: boolean) => {
    nextRef.current = next;
    save.mutate();
  };

  return (
    <HealthDrawerShell
      open={open}
      title={screening ? "Скрининг" : "Новый скрининг"}
      subtitle={neonatal ? "Кровь из пятки" : "Аудиологический скрининг"}
      pending={save.isPending || remove.isPending}
      error={save.error ?? remove.error}
      canSave={valid}
      saveLabel={screening ? "Сохранить" : "Добавить"}
      onSave={() => run(false)}
      onClose={onClose}
      saveNextLabel={onNext ? "Сохранить и далее" : undefined}
      onSaveNext={onNext ? () => run(true) : undefined}
      footerStart={
        screening ? (
          <AppButton color="error" startIcon={<DeleteOutlineOutlined />} loading={remove.isPending} onClick={() => remove.mutate()}>
            Удалить
          </AppButton>
        ) : undefined
      }
    >
      <Section title="Вид">
        <Choice<ScreeningKind>
          options={SCREENING_KINDS}
          value={form.kind}
          onChange={(value) => {
            if (!value || value === form.kind) return;
            setForm({ ...emptyInput(value), performedOn: form.performedOn, reason: form.reason, notes: form.notes });
          }}
        />
      </Section>
      <DateInput label="Дата" value={form.performedOn} onChange={(value) => patch({ performedOn: value })} helper={birthDate ? "Пусто, если не проведён или отказ" : undefined} />
      {neonatal ? (
        <>
          <Section title="Результат">
            <Choice<Exclude<ScreeningResult, "">>
              options={SCREENING_RESULTS}
              value={form.result}
              onChange={(value) => patch({ result: value })}
              tone={(value) => (value === "normal" ? "success" : value === "positive" ? "error" : "warning")}
            />
          </Section>
          <TextField size="small" label="Что смотрели" value={form.program} onChange={(event) => patch({ program: event.target.value })} fullWidth />
        </>
      ) : (
        <>
          <Section title="Этап">
            <Choice<Exclude<HearingStage, "">> options={HEARING_STAGES} value={form.stage} onChange={(value) => patch({ stage: value })} />
          </Section>
          <Section title="Метод">
            <Choice<Exclude<HearingMethod, "">> options={HEARING_METHODS} value={form.method} onChange={(value) => patch({ method: value })} />
          </Section>
          <Box sx={pairGridSx}>
            <Section title="Справа">
              <Choice<Exclude<EarResult, "">>
                options={EAR_RESULTS}
                value={form.rightEar}
                onChange={(value) => patch({ rightEar: value })}
                tone={(value) => (value === "pass" ? "success" : value === "refer" ? "error" : "warning")}
              />
            </Section>
            <Section title="Слева">
              <Choice<Exclude<EarResult, "">>
                options={EAR_RESULTS}
                value={form.leftEar}
                onChange={(value) => patch({ leftEar: value })}
                tone={(value) => (value === "pass" ? "success" : value === "refer" ? "error" : "warning")}
              />
            </Section>
          </Box>
        </>
      )}
      <TextField size="small" label="Причина, если не проведён" value={form.reason} onChange={(event) => patch({ reason: event.target.value })} fullWidth />
      <TextField size="small" label="Заметка" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} multiline minRows={2} fullWidth />
    </HealthDrawerShell>
  );
};
