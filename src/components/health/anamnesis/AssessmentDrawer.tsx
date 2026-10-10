import React from "react";
import { Alert, TextField, Typography } from "@mui/material";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { updateLifeAssessment, type LifeAssessmentUpdate } from "../../../api/health";
import { Section } from "../../../pages/patient-program/vision/VisionControls";
import { AppButton } from "../../ui";
import { HealthDrawerShell } from "../HealthDrawerShell";
import { useHealthScope } from "../useHealth";
import { Choice } from "./anamnesisControls";
import { SCALE_LEVELS, levelTitle, levelTone, type AssessmentKind, type AssessmentLevel } from "./anamnesisTypes";
import { useApplyLifeAnamnesis } from "./useAnamnesis";
import { useFormReset } from "./useFormReset";

const TITLES: Record<AssessmentKind, string> = {
  genealogical: "Генеалогический анамнез",
  biological: "Биологический анамнез",
  social: "Социальный анамнез",
};

export interface AssessmentRequest {
  kind: AssessmentKind;
  scale: string;
  /** Текущая ручная оценка. */
  manual: { level: AssessmentLevel; reason: string } | null;
  /** Расчёт — для подсказки «система считает». */
  computed: AssessmentLevel | null;
  /** Предзаполнение (фактор максимальной силы): уровень и причина. */
  preset?: { level: AssessmentLevel; reason: string };
}

interface AssessmentDrawerProps {
  open: boolean;
  patientId: number;
  request: AssessmentRequest | null;
  onClose: () => void;
}

/** Ручная оценка (ТЗ §5.8): уровень по текущей шкале и причина; «Вернуть расчёт» очищает. */
export const AssessmentDrawer: React.FC<AssessmentDrawerProps> = ({ open, patientId, request, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const apply = useApplyLifeAnamnesis(patientId);
  const [level, setLevel] = React.useState<AssessmentLevel | "">("");
  const [reason, setReason] = React.useState("");

  useFormReset(open, request ? `${request.kind}:${request.preset ? "preset" : ""}` : "", () => {
    if (!request) return;
    setLevel(request.preset?.level ?? request.manual?.level ?? "");
    setReason(request.preset?.reason ?? request.manual?.reason ?? "");
  });

  const mutation = useMutation({
    mutationFn: (body: LifeAssessmentUpdate) => updateLifeAssessment(scope, patientId, body),
    onSuccess: async (data, body) => {
      const reset = Object.values(body).every((value) => value === "");
      enqueueSnackbar(reset ? "Вернули расчёт системы" : "Оценка врача сохранена", { variant: "success" });
      await apply(data);
      onClose();
    },
  });
  if (!request) return null;
  const kind = request.kind;
  const levels = SCALE_LEVELS[kind][request.scale] ?? SCALE_LEVELS[kind].kildiyarova;
  const body = (nextLevel: string, nextReason: string): LifeAssessmentUpdate => ({
    [`${kind}Level`]: nextLevel,
    [`${kind}Reason`]: nextReason,
  });

  return (
    <HealthDrawerShell
      open={open}
      title={TITLES[kind]}
      subtitle="Оценка врача вместо расчёта системы"
      pending={mutation.isPending}
      error={mutation.error}
      canSave={Boolean(level) && reason.trim().length > 0}
      saveLabel="Сохранить оценку"
      onSave={() => mutation.mutate(body(level, reason.trim()))}
      onClose={onClose}
      footerStart={
        request.manual ? (
          <AppButton startIcon={<RestartAltOutlined />} onClick={() => mutation.mutate(body("", ""))}>
            Вернуть расчёт
          </AppButton>
        ) : undefined
      }
    >
      <Typography variant="body2" color="text.secondary">
        Система считает: {request.computed ? levelTitle(kind, request.computed).toLowerCase() : "мало сведений для расчёта"}.
      </Typography>
      <Section title="Уровень">
        <Choice<AssessmentLevel>
          options={levels.map((value) => ({ value, label: levelTitle(kind, value) }))}
          value={level}
          onChange={setLevel}
          tone={(value) => {
            const tone = levelTone(value);
            return tone === "ok" ? "success" : tone === "warn" ? "warning" : "error";
          }}
        />
      </Section>
      <TextField
        size="small"
        label="Причина"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        multiline
        minRows={2}
        fullWidth
        helperText="Обязательно: видна в подсказке у оценки"
      />
      {request.preset && (
        <Alert severity="warning" variant="outlined">
          Система предлагает «высокую» из-за фактора максимальной силы — подтвердите или измените.
        </Alert>
      )}
    </HealthDrawerShell>
  );
};
