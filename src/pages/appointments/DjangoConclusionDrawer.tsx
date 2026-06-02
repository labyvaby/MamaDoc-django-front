/**
 * DjangoConclusionDrawer
 *
 * Drawer for creating, editing, or viewing a medical conclusion attached to
 * a specific AppointmentServiceLine.
 *
 * Behaviour:
 * - readOnly=true  → all fields disabled, no save button
 * - canEdit=true   → can save as draft or completed
 * - completed requires non-empty conclusion field
 * - Vitals validated: weight 1..999, height 1..999, temperature 34..42
 * - On save: calls onSaved() so parent can refresh slots
 */

import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  upsertConclusion,
  updateConclusion,
  parseBackendError,
  type MedicalConclusion,
  type MedicalConclusionPayload,
  type ConclusionStatus,
} from "../../api/medical";

// ── types ──────────────────────────────────────────────────────────────────────

export type DjangoConclusionDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** null = creating new via upsert */
  conclusion: MedicalConclusion | null;
  serviceLineId: number;
  serviceName: string;
  doctorName: string;
  canEdit: boolean;
  canPrint: boolean;
  onSaved?: (saved: MedicalConclusion) => void;
};

// ── vitals validation helpers ──────────────────────────────────────────────────

function validateVitals(
  weight: string,
  height: string,
  temp: string,
): string | null {
  if (weight.trim()) {
    const w = Number(weight);
    if (isNaN(w) || w < 1 || w > 999)
      return "Вес должен быть от 1 до 999 кг";
  }
  if (height.trim()) {
    const h = Number(height);
    if (isNaN(h) || h < 1 || h > 999)
      return "Рост должен быть от 1 до 999 см";
  }
  if (temp.trim()) {
    const t = Number(temp);
    if (isNaN(t) || t < 34 || t > 42)
      return "Температура должна быть от 34 до 42 °C";
  }
  return null;
}

// ── component ──────────────────────────────────────────────────────────────────

const DjangoConclusionDrawer: React.FC<DjangoConclusionDrawerProps> = ({
  open,
  onClose,
  conclusion,
  serviceLineId,
  serviceName,
  doctorName,
  canEdit,
  canPrint,
  onSaved,
}) => {
  const { open: notify } = useNotification();

  // ── form state ────────────────────────────────────────────────────────────
  const [complaints, setComplaints] = React.useState("");
  const [anamnesis, setAnamnesis] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [conclusionText, setConclusionText] = React.useState("");
  const [diagnosisText, setDiagnosisText] = React.useState("");
  const [weightKg, setWeightKg] = React.useState("");
  const [heightCm, setHeightCm] = React.useState("");
  const [temperature, setTemperature] = React.useState("");
  const [internalComment, setInternalComment] = React.useState("");
  const [status, setStatus] = React.useState<ConclusionStatus>("draft");

  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const readOnly = !canEdit;

  // ── populate from existing conclusion ────────────────────────────────────
  React.useEffect(() => {
    if (!open) {
      setComplaints("");
      setAnamnesis("");
      setObjective("");
      setConclusionText("");
      setDiagnosisText("");
      setWeightKg("");
      setHeightCm("");
      setTemperature("");
      setInternalComment("");
      setStatus("draft");
      setTouched(false);
      setSaving(false);
      setSaveError(null);
      return;
    }

    if (!conclusion) return;

    setComplaints(conclusion.complaints ?? "");
    setAnamnesis(conclusion.anamnesis ?? "");
    setObjective(conclusion.objective ?? "");
    setConclusionText(conclusion.conclusion ?? "");
    setDiagnosisText(
      conclusion.diagnosisData?.length
        ? conclusion.diagnosisData
            .map((d) => [d.diagnosisCode, d.title].filter(Boolean).join(" — "))
            .join("\n")
        : "",
    );
    setWeightKg(conclusion.weightKg ?? "");
    setHeightCm(conclusion.heightCm ?? "");
    setTemperature(conclusion.temperature ?? "");
    setInternalComment(conclusion.internalComment ?? "");
    setStatus(conclusion.status ?? "draft");
  }, [open, conclusion]);

  // ── validation ────────────────────────────────────────────────────────────
  const vitalsError = touched ? validateVitals(weightKg, heightCm, temperature) : null;
  const completedWithoutText =
    touched && status === "completed" && !conclusionText.trim();

  const isValid =
    !vitalsError && !completedWithoutText;

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSave = async (targetStatus: ConclusionStatus) => {
    setTouched(true);
    const vErr = validateVitals(weightKg, heightCm, temperature);
    if (vErr) { setSaveError(vErr); return; }
    if (targetStatus === "completed" && !conclusionText.trim()) {
      setSaveError("Заполните поле «Заключение» перед завершением");
      return;
    }

    setSaveError(null);
    setSaving(true);

    const payload: MedicalConclusionPayload = {
      complaints: complaints.trim() || null,
      anamnesis: anamnesis.trim() || null,
      objective: objective.trim() || null,
      conclusion: conclusionText.trim() || null,
      diagnosisData: diagnosisText.trim()
        ? diagnosisText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              // Preserve "CODE — description" format produced on read
              const sepIdx = line.indexOf(" — ");
              if (sepIdx > 0) {
                return { diagnosisCode: line.slice(0, sepIdx), title: line.slice(sepIdx + 3) };
              }
              return { title: line };
            })
        : [],
      weightKg: weightKg.trim() || null,
      heightCm: heightCm.trim() || null,
      temperature: temperature.trim() || null,
      internalComment: internalComment.trim() || null,
      status: targetStatus,
    };

    try {
      let saved: MedicalConclusion;
      if (conclusion?.id) {
        saved = await updateConclusion(conclusion.id, payload);
      } else {
        saved = await upsertConclusion(serviceLineId, payload);
      }
      notify?.({
        type: "success",
        message:
          targetStatus === "completed"
            ? "Заключение завершено"
            : "Черновик сохранён",
      });
      onSaved?.(saved);
      onClose();
    } catch (err: unknown) {
      setSaveError(parseBackendError(err));
    } finally {
      setSaving(false);
    }
  };

  // ── derived display ───────────────────────────────────────────────────────
  const lastUpdated = conclusion?.updatedAt
    ? dayjs(conclusion.updatedAt).format("DD.MM.YYYY HH:mm")
    : null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={saving ? undefined : onClose}
      PaperProps={{
        sx: {
          width: { xs: "100vw", sm: 520, md: 560 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {/* ── header ── */}
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        px={2}
        py={1.5}
        sx={{ flexShrink: 0 }}
      >
        <Stack spacing={0.25}>
          <Typography variant="h6" lineHeight={1.3}>
            {readOnly ? "Заключение (просмотр)" : conclusion ? "Редактировать заключение" : "Новое заключение"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {serviceName} — {doctorName}
          </Typography>
          {lastUpdated && (
            <Typography variant="caption" color="text.disabled">
              Последнее изменение: {lastUpdated}
            </Typography>
          )}
        </Stack>
        <IconButton onClick={saving ? undefined : onClose} size="small" sx={{ mt: 0.25 }}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />

      {/* ── body ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          minHeight: 0,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
          {/* error */}
          {(saveError) && (
            <Alert severity="error" onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}

          {/* read-only empty state */}
          {readOnly && !conclusion && (
            <Alert severity="info">
              Этот врач ещё не создал заключение
            </Alert>
          )}

          {/* ── vitals ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Витальные показатели
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Вес"
                size="small"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                disabled={readOnly}
                type="number"
                inputProps={{ min: 1, max: 999, step: 0.1 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">кг</InputAdornment>,
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Рост"
                size="small"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                disabled={readOnly}
                type="number"
                inputProps={{ min: 1, max: 999, step: 0.5 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">см</InputAdornment>,
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Температура"
                size="small"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={readOnly}
                type="number"
                inputProps={{ min: 34, max: 42, step: 0.1 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">°C</InputAdornment>,
                }}
                sx={{ flex: 1 }}
              />
            </Stack>
            {vitalsError && (
              <Alert severity="error" sx={{ py: 0 }}>
                {vitalsError}
              </Alert>
            )}
          </Stack>

          {/* ── complaints ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Жалобы
            </Typography>
            <TextField
              value={complaints}
              onChange={(e) => setComplaints(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : "Необязательно"}
            />
          </Stack>

          {/* ── anamnesis ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Анамнез
            </Typography>
            <TextField
              value={anamnesis}
              onChange={(e) => setAnamnesis(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={3}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : "Необязательно"}
            />
          </Stack>

          {/* ── objective ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Объективно
            </Typography>
            <TextField
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={3}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : "Необязательно"}
            />
          </Stack>

          {/* ── diagnosis ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Диагноз
            </Typography>
            <TextField
              value={diagnosisText}
              onChange={(e) => setDiagnosisText(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : "Код МКБ или описание"}
            />
          </Stack>

          {/* ── conclusion (main) ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Заключение {!readOnly && "*"}
            </Typography>
            <TextField
              value={conclusionText}
              onChange={(e) => setConclusionText(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={4}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : "Текст заключения"}
              error={!!completedWithoutText}
              helperText={
                completedWithoutText
                  ? "Заполните заключение для завершения"
                  : ""
              }
            />
          </Stack>

          {/* ── internal comment ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Внутренний комментарий
            </Typography>
            <TextField
              value={internalComment}
              onChange={(e) => setInternalComment(e.target.value)}
              disabled={readOnly}
              multiline
              minRows={2}
              fullWidth
              size="small"
              placeholder={readOnly ? "—" : "Не виден пациенту"}
            />
          </Stack>

          {/* ── status select (only when editing) ── */}
          {!readOnly && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Статус
              </Typography>
              <TextField
                select
                value={status}
                onChange={(e) => setStatus(e.target.value as ConclusionStatus)}
                size="small"
                fullWidth
              >
                <MenuItem value="draft">Черновик</MenuItem>
                <MenuItem value="completed">Завершено</MenuItem>
              </TextField>
            </Stack>
          )}

          {/* ── print placeholder ── */}
          {canPrint && conclusion && (
            <Alert severity="info" icon={false}>
              PDF-печать будет доступна в следующей версии.
            </Alert>
          )}
        </Stack>
      </Box>

      {/* ── footer ── */}
      <Divider />
      <Box sx={{ p: 2, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={saving ? undefined : onClose} disabled={saving}>
            {readOnly ? "Закрыть" : "Отмена"}
          </Button>
          {!readOnly && (
            <>
              <Button
                variant="outlined"
                disabled={saving || !isValid}
                onClick={() => handleSave("draft")}
                startIcon={
                  saving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : undefined
                }
              >
                Сохранить черновик
              </Button>
              <Button
                variant="contained"
                color="success"
                disabled={saving || !conclusionText.trim()}
                onClick={() => handleSave("completed")}
                startIcon={
                  saving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <SaveOutlined />
                  )
                }
              >
                Завершить
              </Button>
            </>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
};

export default DjangoConclusionDrawer;
