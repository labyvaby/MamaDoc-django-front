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
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Grid,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Modal,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  upsertConclusion,
  updateConclusion,
  getDiagnoses,
  uploadConclusionPhoto,
  getConclusionTemplates,
  createConclusionTemplate,
  deleteConclusionTemplate,
  parseBackendError,
  type MedicalConclusion,
  type MedicalConclusionPayload,
  type ConclusionStatus,
  type CatalogDiagnosis,
  type ConclusionTemplate,
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
  /** Patient's complaints from the appointment (read-only context block). */
  patientComplaints?: string | null;
  /** Встроенный режим: рендер прямо в колонке (без Drawer-обёртки), как в
   *  оригинале — заключение видно сразу в третьей колонке. */
  inline?: boolean;
  /** Кнопка «Изменить заключение» в шапке (в inline-просмотре). */
  onStartEdit?: () => void;
  onSaved?: (saved: MedicalConclusion) => void;
};

// ── localStorage draft persistence ─────────────────────────────────────────────
// Черновик заключения хранится локально: 1 заключение (строка услуги) =
// 1 запись в localStorage. Восстанавливается при повторном открытии и
// удаляется после успешного сохранения на сервере.

const conclusionDraftKey = (serviceLineId: number) =>
  `conclusion_draft_${serviceLineId}`;

type ConclusionDraftBody = {
  complaints: string;
  anamnesis: string;
  objective: string;
  conclusionText: string;
  selectedDiagnoses: CatalogDiagnosis[];
  photoUrls: string[];
  weightKg: string;
  heightCm: string;
  temperature: string;
  internalComment: string;
  status: ConclusionStatus;
};

type ConclusionDraft = ConclusionDraftBody & { savedAt: string };

function readConclusionDraft(serviceLineId: number): ConclusionDraft | null {
  try {
    const raw = window.localStorage.getItem(conclusionDraftKey(serviceLineId));
    return raw ? (JSON.parse(raw) as ConclusionDraft) : null;
  } catch {
    return null;
  }
}

function writeConclusionDraft(serviceLineId: number, body: ConclusionDraftBody) {
  try {
    window.localStorage.setItem(
      conclusionDraftKey(serviceLineId),
      JSON.stringify({ ...body, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* localStorage переполнен или недоступен — работаем без черновика */
  }
}

function clearConclusionDraft(serviceLineId: number) {
  try {
    window.localStorage.removeItem(conclusionDraftKey(serviceLineId));
  } catch {
    /* ignore */
  }
}

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

// ── vital stepper (как renderQuantityInput в оригинале) ─────────────────────────

const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input[type=number]::-webkit-outer-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
  "& input[type=number]::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

type VitalStepperProps = {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
};

const VitalStepper: React.FC<VitalStepperProps> = ({
  label,
  suffix,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  disabled,
}) => {
  const fmt = (n: number) => (step < 1 ? n.toFixed(1) : String(n));
  const dec = () => {
    const cur = value === "" ? min : parseFloat(value) || 0;
    onChange(fmt(Math.max(min, cur - step)));
  };
  const inc = () => {
    const cur = value === "" ? min : parseFloat(value) || 0;
    const next = cur + step;
    if (max !== undefined && next > max) return;
    onChange(fmt(next));
  };

  return (
    <Stack spacing={0.5} sx={{ minWidth: 100, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}, {suffix}
      </Typography>
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 40,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Button
          size="small"
          onClick={dec}
          disabled={disabled}
          sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
        >
          −
        </Button>
        <TextField
          size="small"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          inputProps={{
            style: { textAlign: "center", padding: "8px 4px" },
            min,
            step,
            max,
          }}
          sx={{
            flex: 1,
            ...noSpinnersSx,
            "& .MuiOutlinedInput-root": { "& fieldset": { border: "none" } },
          }}
        />
        <Button
          size="small"
          onClick={inc}
          disabled={disabled}
          sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
        >
          +
        </Button>
      </Box>
    </Stack>
  );
};

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
  patientComplaints,
  inline = false,
  onStartEdit,
  onSaved,
}) => {
  const { open: notify } = useNotification();

  // ── form state ────────────────────────────────────────────────────────────
  const [complaints, setComplaints] = React.useState("");
  const [anamnesis, setAnamnesis] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [conclusionText, setConclusionText] = React.useState("");
  const [selectedDiagnoses, setSelectedDiagnoses] = React.useState<
    CatalogDiagnosis[]
  >([]);
  const [catalog, setCatalog] = React.useState<CatalogDiagnosis[]>([]);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [catalogError, setCatalogError] = React.useState(false);
  const [photoUrls, setPhotoUrls] = React.useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [previewPhoto, setPreviewPhoto] = React.useState<string | null>(null);
  // Templates
  const [templates, setTemplates] = React.useState<ConclusionTemplate[]>([]);
  const [tplAnchor, setTplAnchor] = React.useState<null | HTMLElement>(null);
  const [saveTplOpen, setSaveTplOpen] = React.useState(false);
  const [tplName, setTplName] = React.useState("");
  const [tplBusy, setTplBusy] = React.useState(false);
  const [weightKg, setWeightKg] = React.useState("");
  const [heightCm, setHeightCm] = React.useState("");
  const [temperature, setTemperature] = React.useState("");
  const [internalComment, setInternalComment] = React.useState("");
  const [status, setStatus] = React.useState<ConclusionStatus>("draft");

  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const readOnly = !canEdit;

  // Локальный черновик: hydratedRef — форма заполнена (можно писать черновик),
  // baselineRef — снимок формы на момент открытия (не пишем, пока нет правок),
  // draftNotifiedRef — уведомление о восстановлении показываем один раз.
  const hydratedRef = React.useRef(false);
  const baselineRef = React.useRef("");
  const draftNotifiedRef = React.useRef(false);
  // Последние правки, ещё не записанные отложенным таймером, — дописываются
  // при закрытии/размонтировании, чтобы не потерять хвост ввода.
  const pendingDraftRef = React.useRef<ConclusionDraftBody | null>(null);

  const applyDraftBody = (body: ConclusionDraftBody) => {
    setComplaints(body.complaints ?? "");
    setAnamnesis(body.anamnesis ?? "");
    setObjective(body.objective ?? "");
    setConclusionText(body.conclusionText ?? "");
    setSelectedDiagnoses(body.selectedDiagnoses ?? []);
    setPhotoUrls(body.photoUrls ?? []);
    setWeightKg(body.weightKg ?? "");
    setHeightCm(body.heightCm ?? "");
    setTemperature(body.temperature ?? "");
    setInternalComment(body.internalComment ?? "");
    setStatus(body.status ?? "draft");
  };

  // ── populate from existing conclusion / local draft ───────────────────────
  React.useEffect(() => {
    if (!open) {
      // Закрыли до срабатывания отложенной записи — дописываем черновик.
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(serviceLineId, pendingDraftRef.current);
      }
      pendingDraftRef.current = null;
      applyDraftBody({
        complaints: "",
        anamnesis: "",
        objective: "",
        conclusionText: "",
        selectedDiagnoses: [],
        photoUrls: [],
        weightKg: "",
        heightCm: "",
        temperature: "",
        internalComment: "",
        status: "draft",
      });
      setTouched(false);
      setSaving(false);
      setSaveError(null);
      hydratedRef.current = false;
      draftNotifiedRef.current = false;
      return;
    }

    // Несохранённый черновик из localStorage приоритетнее серверных данных,
    // если он свежее последнего сохранения на сервере.
    const draft = readOnly ? null : readConclusionDraft(serviceLineId);
    const draftIsFresh =
      !!draft &&
      (!conclusion?.updatedAt ||
        !draft.savedAt ||
        dayjs(draft.savedAt).isAfter(dayjs(conclusion.updatedAt)));
    if (draft && !draftIsFresh) clearConclusionDraft(serviceLineId);

    if (draft && draftIsFresh) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { savedAt: _savedAt, ...body } = draft;
      applyDraftBody(body);
      baselineRef.current = JSON.stringify(body);
      hydratedRef.current = true;
      if (!draftNotifiedRef.current) {
        draftNotifiedRef.current = true;
        notify?.({
          type: "success",
          message: "Восстановлен несохранённый черновик заключения",
        });
      }
      return;
    }

    // Restore selected diagnoses from saved diagnosisData (match against
    // catalog by code when possible; keep a synthetic item otherwise).
    const body: ConclusionDraftBody = conclusion
      ? {
          complaints: conclusion.complaints ?? "",
          anamnesis: conclusion.anamnesis ?? "",
          objective: conclusion.objective ?? "",
          conclusionText: conclusion.conclusion ?? "",
          selectedDiagnoses: (conclusion.diagnosisData ?? []).map((d) => {
            const fromCatalog = catalog.find((c) => c.code === d.diagnosisCode);
            return (
              fromCatalog ?? {
                id: d.id ? Number(d.id) : -1,
                code: d.diagnosisCode ?? "",
                title: d.title ?? "",
                isActive: true,
                sortOrder: 0,
              }
            );
          }),
          photoUrls: conclusion.photoUrls ?? [],
          weightKg: conclusion.weightKg ?? "",
          heightCm: conclusion.heightCm ?? "",
          temperature: conclusion.temperature ?? "",
          internalComment: conclusion.internalComment ?? "",
          status: conclusion.status ?? "draft",
        }
      : {
          complaints: "",
          anamnesis: "",
          objective: "",
          conclusionText: "",
          selectedDiagnoses: [],
          photoUrls: [],
          weightKg: "",
          heightCm: "",
          temperature: "",
          internalComment: "",
          status: "draft",
        };
    applyDraftBody(body);
    baselineRef.current = JSON.stringify(body);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, readOnly, conclusion, catalog, serviceLineId]);

  // ── autosave draft to localStorage (1 заключение = 1 запись) ──────────────
  React.useEffect(() => {
    if (!open || readOnly || !hydratedRef.current) return;
    const body: ConclusionDraftBody = {
      complaints,
      anamnesis,
      objective,
      conclusionText,
      selectedDiagnoses,
      photoUrls,
      weightKg,
      heightCm,
      temperature,
      internalComment,
      status,
    };
    // Пока пользователь ничего не менял — фантомный черновик не создаём.
    if (JSON.stringify(body) === baselineRef.current) {
      pendingDraftRef.current = null;
      return;
    }
    pendingDraftRef.current = body;
    const timer = window.setTimeout(() => {
      // hydratedRef сбрасывается после сохранения на сервер — отложенная
      // запись не должна воскресить уже удалённый черновик.
      if (hydratedRef.current) {
        writeConclusionDraft(serviceLineId, body);
        pendingDraftRef.current = null;
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    open,
    readOnly,
    serviceLineId,
    complaints,
    anamnesis,
    objective,
    conclusionText,
    selectedDiagnoses,
    photoUrls,
    weightKg,
    heightCm,
    temperature,
    internalComment,
    status,
  ]);

  // Размонтирование (дровер удаляют из дерева, уход со страницы) — дописываем
  // незаписанный хвост черновика.
  React.useEffect(() => {
    return () => {
      if (hydratedRef.current && pendingDraftRef.current) {
        writeConclusionDraft(serviceLineId, pendingDraftRef.current);
        pendingDraftRef.current = null;
      }
    };
  }, [serviceLineId]);

  // ── load diagnosis catalog when drawer opens ──────────────────────────────
  React.useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setCatalogLoading(true);
    setCatalogError(false);
    getDiagnoses(undefined, ctrl.signal)
      .then((items) => setCatalog(items))
      .catch(() => {
        // Каталог недоступен — поле остаётся рабочим, но молчать нельзя:
        // пустой список выглядит как «поиск не работает».
        if (!ctrl.signal.aborted) setCatalogError(true);
      })
      .finally(() => setCatalogLoading(false));
    return () => ctrl.abort();
  }, [open]);

  // ── load conclusion templates when drawer opens ───────────────────────────
  React.useEffect(() => {
    if (!open || readOnly) return;
    const ctrl = new AbortController();
    getConclusionTemplates(ctrl.signal)
      .then(setTemplates)
      .catch(() => {
        /* шаблоны недоступны — кнопка просто покажет пустой список */
      });
    return () => ctrl.abort();
  }, [open, readOnly]);

  // ── template handlers ─────────────────────────────────────────────────────
  const applyTemplate = (tpl: ConclusionTemplate) => {
    if (tpl.conclusion) setConclusionText(tpl.conclusion);
    if (tpl.anamnesis) setAnamnesis(tpl.anamnesis);
    if (tpl.objective) setObjective(tpl.objective);
    setTplAnchor(null);
    notify?.({ type: "success", message: "Шаблон применён" });
  };

  const handleSaveTemplate = async () => {
    const name = tplName.trim();
    if (!name) return;
    setTplBusy(true);
    try {
      const created = await createConclusionTemplate({
        name,
        conclusion: conclusionText.trim(),
        anamnesis: anamnesis.trim(),
        objective: objective.trim(),
      });
      setTemplates((prev) => [...prev, created]);
      setSaveTplOpen(false);
      setTplName("");
      notify?.({ type: "success", message: "Шаблон сохранён" });
    } catch (err: unknown) {
      notify?.({ type: "error", message: parseBackendError(err) });
    } finally {
      setTplBusy(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      await deleteConclusionTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      /* ignore */
    }
  };

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
      diagnosisData: selectedDiagnoses.map((d) => ({
        id: d.id > 0 ? String(d.id) : undefined,
        diagnosisCode: d.code,
        title: d.title,
      })),
      photoUrls,
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
      // Заключение на сервере — локальный черновик больше не нужен.
      clearConclusionDraft(serviceLineId);
      hydratedRef.current = false;
      pendingDraftRef.current = null;
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

  // ── photo upload ──────────────────────────────────────────────────────────
  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    setSaveError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const { url } = await uploadConclusionPhoto(file);
        uploaded.push(url);
      }
      setPhotoUrls((prev) => [...prev, ...uploaded]);
    } catch (err: unknown) {
      setSaveError(parseBackendError(err));
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const removePhoto = (url: string) =>
    setPhotoUrls((prev) => prev.filter((u) => u !== url));

  // ── derived display ───────────────────────────────────────────────────────
  const lastUpdated = conclusion?.updatedAt
    ? dayjs(conclusion.updatedAt).format("DD.MM.YYYY HH:mm")
    : null;

  const content = (
    <>
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
            {readOnly ? "Заключение" : conclusion ? "Редактировать заключение" : "Новое заключение"}
          </Typography>
          {/* Услуга/врач и время правки — только в дровере-редакторе, не в
              inline-просмотре (там шапка чистая, как в оригинале). */}
          {!inline && (
            <>
              <Typography variant="body2" color="text.secondary">
                {serviceName} — {doctorName}
              </Typography>
              {lastUpdated && (
                <Typography variant="caption" color="text.disabled">
                  Последнее изменение: {lastUpdated}
                </Typography>
              )}
            </>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {!readOnly && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ContentCopyOutlined />}
                onClick={(e) => setTplAnchor(e.currentTarget)}
              >
                Шаблоны
              </Button>
              <IconButton
                size="small"
                color="primary"
                title="Сохранить как шаблон"
                onClick={() => {
                  setTplName("");
                  setSaveTplOpen(true);
                }}
              >
                <StarBorderOutlined fontSize="small" />
              </IconButton>
            </>
          )}
          <IconButton onClick={saving ? undefined : onClose} size="small">
            <CloseOutlined />
          </IconButton>
        </Stack>
      </Stack>
      <Divider />

      {/* ── inline-просмотр: тулбар действий под шапкой (единая высота) ── */}
      {inline && readOnly && (onStartEdit || (canPrint && conclusion)) && (
        <>
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            sx={{ px: 2, py: 1, gap: 1, flexShrink: 0 }}
          >
            {onStartEdit && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditOutlined />}
                onClick={onStartEdit}
                sx={{ whiteSpace: "nowrap" }}
              >
                Изменить заключение
              </Button>
            )}
            {canPrint && conclusion && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintOutlined />}
                  onClick={() =>
                    window.open(
                      `/print/conclusion/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                      "_blank",
                      "noopener",
                    )
                  }
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Печать
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArticleOutlined />}
                  onClick={() =>
                    window.open(
                      `/print/certificate/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                      "_blank",
                      "noopener",
                    )
                  }
                  sx={{ whiteSpace: "nowrap" }}
                >
                  Справка
                </Button>
              </>
            )}
          </Stack>
          <Divider />
        </>
      )}

      {/* ── templates menu ── */}
      <Menu
        anchorEl={tplAnchor}
        open={!!tplAnchor}
        onClose={() => setTplAnchor(null)}
        slotProps={{ paper: { sx: { maxWidth: 360 } } }}
      >
        {templates.length === 0 && (
          <MenuItem disabled>Нет сохранённых шаблонов</MenuItem>
        )}
        {templates.map((tpl) => (
          <MenuItem
            key={tpl.id}
            onClick={() => applyTemplate(tpl)}
            sx={{ pr: 1 }}
          >
            <ListItemText
              primary={tpl.name}
              primaryTypographyProps={{ noWrap: true }}
            />
            <IconButton
              size="small"
              edge="end"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTemplate(tpl.id);
              }}
            >
              <DeleteOutline fontSize="small" color="error" />
            </IconButton>
          </MenuItem>
        ))}
      </Menu>

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

          {/* ════════ READ-ONLY ПРОСМОТР (как в оригинале, фото 2) ════════ */}
          {readOnly && conclusion && (
            <Stack spacing={3}>
              {/* Витальные — карточки с разделителями */}
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
                <Stack direction="row" spacing={3} justifyContent="space-around">
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Вес</Typography>
                    <Typography variant="h6">{weightKg ? `${weightKg} кг` : "—"}</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Рост</Typography>
                    <Typography variant="h6">{heightCm ? `${heightCm} см` : "—"}</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box textAlign="center">
                    <Typography variant="caption" color="text.secondary">Температура</Typography>
                    <Typography
                      variant="h6"
                      color={parseFloat(temperature) > 37 ? "error.main" : "text.primary"}
                    >
                      {temperature ? `${temperature} °C` : "—"}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              {/* Жалобы пациента (контекст) */}
              {(patientComplaints ?? "").trim() && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Жалобы пациента
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                    {patientComplaints}
                  </Typography>
                </Box>
              )}

              {/* Диагноз — чипы */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Диагноз (МКБ-10)
                </Typography>
                {selectedDiagnoses.length > 0 ? (
                  <Box display="flex" gap={1} flexWrap="wrap">
                    {selectedDiagnoses.map((d, i) => (
                      <Chip
                        key={i}
                        label={d.code ? `${d.code} - ${d.title}` : d.title}
                        size="small"
                      />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.disabled">Не указан</Typography>
                )}
              </Box>

              <Divider />

              {complaints.trim() && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Жалобы (врач)
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{complaints}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Анамнез</Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{anamnesis || "—"}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Объективно</Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{objective || "—"}</Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Заключение</Typography>
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: "pre-wrap",
                    fontWeight: 500,
                    color: conclusionText ? "text.primary" : "text.disabled",
                    fontStyle: conclusionText ? "normal" : "italic",
                  }}
                >
                  {conclusionText || "Заключение не заполнено"}
                </Typography>
              </Box>

              {internalComment.trim() && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Внутренний комментарий
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{internalComment}</Typography>
                </Box>
              )}

              {/* Фотографии */}
              {photoUrls.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Фотографии
                  </Typography>
                  <Grid container spacing={1}>
                    {photoUrls.map((url) => (
                      <Grid item key={url}>
                        <Box
                          component="img"
                          src={url}
                          alt="Фото заключения"
                          onClick={() => setPreviewPhoto(url)}
                          sx={{
                            width: 72,
                            height: 72,
                            borderRadius: 1,
                            objectFit: "cover",
                            border: "1px solid",
                            borderColor: "divider",
                            cursor: "pointer",
                          }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </Stack>
          )}

          {/* ════════ ФОРМА РЕДАКТИРОВАНИЯ (только при !readOnly) ════════ */}
          {!readOnly && (
          <>
          {/* ── vitals (степперы как в оригинале) ── */}
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1.5}>
              <VitalStepper
                label="Рост"
                suffix="см"
                value={heightCm}
                onChange={setHeightCm}
                step={1}
                min={0}
                max={999}
                disabled={readOnly}
              />
              <VitalStepper
                label="Вес"
                suffix="кг"
                value={weightKg}
                onChange={setWeightKg}
                step={1}
                min={0}
                max={999}
                disabled={readOnly}
              />
              <VitalStepper
                label="Температура"
                suffix="°C"
                value={temperature}
                onChange={setTemperature}
                step={0.1}
                min={34}
                max={42}
                disabled={readOnly}
              />
            </Stack>
            {vitalsError && (
              <Alert severity="error" sx={{ py: 0, mt: 1 }}>
                {vitalsError}
              </Alert>
            )}
          </Paper>

          {/* ── patient complaints (read-only context) ── */}
          {(patientComplaints ?? "").trim() && (
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                Жалобы пациента
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {patientComplaints}
                </Typography>
              </Paper>
            </Stack>
          )}

          {/* ── doctor complaints ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Жалобы (врач)
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

          {/* ── diagnosis (catalog multi-select + free text) ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Диагноз (МКБ-10)
            </Typography>
            <Autocomplete
              multiple
              freeSolo
              disableCloseOnSelect
              options={catalog}
              value={selectedDiagnoses}
              loading={catalogLoading}
              disabled={readOnly}
              getOptionLabel={(o) =>
                typeof o === "string" ? o : [o.code, o.title].filter(Boolean).join(" — ")
              }
              isOptionEqualToValue={(o, v) =>
                o.id === v.id || (o.code === v.code && o.code !== "")
              }
              onChange={(_, value) =>
                setSelectedDiagnoses(
                  value.map((item) =>
                    typeof item === "string"
                      ? { id: -1, code: "", title: item.trim(), isActive: true, sortOrder: 0 }
                      : item,
                  ).filter((item) => item.title !== ""),
                )
              }
              filterSelectedOptions
              size="small"
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={
                    readOnly
                      ? "—"
                      : "Выберите из каталога или впишите диагноз и нажмите Enter…"
                  }
                />
              )}
            />
            {catalogError && (
              <Alert severity="warning" sx={{ py: 0 }}>
                Не удалось загрузить каталог диагнозов — поиск по нему не
                будет работать. Закройте и откройте форму, чтобы повторить.
              </Alert>
            )}
            {/* сводка выбранных диагнозов (как в оригинале) */}
            <Paper
              variant="outlined"
              sx={{ p: 1.5, mt: 0.5, minHeight: 44, bgcolor: "background.default" }}
            >
              <Typography
                variant="body2"
                color={selectedDiagnoses.length ? "text.primary" : "text.disabled"}
              >
                {selectedDiagnoses.length
                  ? selectedDiagnoses
                      .map((d) => [d.code, d.title].filter(Boolean).join(" "))
                      .join(". ")
                  : "Диагноз не выбран"}
              </Typography>
            </Paper>
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

          {/* ── photos ── */}
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              Фотографии
            </Typography>
            <Grid container spacing={1}>
              {photoUrls.map((url) => (
                <Grid item key={url}>
                  <Box
                    sx={{
                      position: "relative",
                      width: 72,
                      height: 72,
                      borderRadius: 1,
                      overflow: "hidden",
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box
                      component="img"
                      src={url}
                      alt="Фото заключения"
                      onClick={() => setPreviewPhoto(url)}
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        cursor: "pointer",
                      }}
                    />
                    {!readOnly && (
                      <IconButton
                        size="small"
                        onClick={() => removePhoto(url)}
                        sx={{
                          position: "absolute",
                          top: 0,
                          right: 0,
                          bgcolor: "rgba(255,255,255,0.8)",
                          p: 0.25,
                          "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                        }}
                      >
                        <DeleteOutline sx={{ fontSize: 14 }} color="error" />
                      </IconButton>
                    )}
                  </Box>
                </Grid>
              ))}
              {!readOnly && (
                <Grid item>
                  <Button
                    component="label"
                    variant="outlined"
                    disabled={uploadingPhoto}
                    sx={{
                      width: 72,
                      height: 72,
                      minWidth: 0,
                      p: 0,
                      borderStyle: "dashed",
                    }}
                  >
                    {uploadingPhoto ? (
                      <CircularProgress size={20} />
                    ) : (
                      <AddPhotoAlternateOutlined fontSize="small" />
                    )}
                    <input
                      type="file"
                      hidden
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                    />
                  </Button>
                </Grid>
              )}
            </Grid>
          </Stack>
          </>
          )}

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

          {/* ── print (в inline-режиме кнопки уже в шапке) ── */}
          {!inline && canPrint && conclusion && (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  window.open(
                    `/print/conclusion/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                Печать заключения
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  window.open(
                    `/print/certificate/${conclusion.appointmentId}?lineId=${serviceLineId}`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                Справка
              </Button>
            </Stack>
          )}
        </Stack>
      </Box>

      {/* ── footer ── (в inline-просмотре скрыт: закрытие — крестиком в шапке) */}
      {!(inline && readOnly) && (
      <>
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
      </>
      )}

      {/* ── save-as-template dialog ── */}
      <Dialog
        open={saveTplOpen}
        onClose={() => !tplBusy && setSaveTplOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Сохранить как шаблон</DialogTitle>
        <DialogContent>
          <TextField
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            fullWidth
            autoFocus
            placeholder="Название шаблона"
            disabled={tplBusy}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveTplOpen(false)} disabled={tplBusy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveTemplate}
            disabled={tplBusy || !tplName.trim()}
            startIcon={
              tplBusy ? <CircularProgress size={16} color="inherit" /> : undefined
            }
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── photo preview modal ── */}
      <Modal open={!!previewPhoto} onClose={() => setPreviewPhoto(null)}>
        <Box
          onClick={() => setPreviewPhoto(null)}
          sx={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0,0,0,0.85)",
          }}
        >
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              setPreviewPhoto(null);
            }}
            sx={{
              position: "absolute",
              top: 20,
              right: 20,
              color: "white",
              bgcolor: "rgba(255,255,255,0.1)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
            }}
          >
            <CloseOutlined />
          </IconButton>
          {previewPhoto && (
            <Box
              component="img"
              src={previewPhoto}
              onClick={(e) => e.stopPropagation()}
              sx={{
                maxWidth: "90vw",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: 1,
              }}
            />
          )}
        </Box>
      </Modal>
    </>
  );

  // Встроенный режим — рендер в колонке (без Drawer), как в оригинале.
  if (inline) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {content}
      </Box>
    );
  }

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
      {content}
    </Drawer>
  );
};

export default DjangoConclusionDrawer;
