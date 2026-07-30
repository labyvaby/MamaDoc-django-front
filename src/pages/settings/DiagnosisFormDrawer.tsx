import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import RestoreOutlined from "@mui/icons-material/RestoreOutlined";
import { useSnackbar } from "notistack";

import { useFormValidation } from "../../hooks/useFormValidation";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import {
  createDiagnosis,
  updateDiagnosis,
  type CatalogDiagnosis,
} from "../../api/medical";
import { useT } from "../../i18n/VerticalProvider";
import { agree } from "../../i18n/formatters";
import { readFormDraft, writeFormDraft, clearFormDraft } from "../../utility/formDraft";

const CODE_MAX = 20;
const TITLE_MAX = 500;
const DISPLAY_NAME_MAX = 500;

// ── черновик формы (localStorage) ────────────────────────────────────────────
// Защита от случайной потери введённых данных при закрытии дровера (крестик,
// клик по фону, Esc). Создание — один глобальный ключ (поля стартуют пустыми);
// редактирование — ключ на конкретную запись, т.к. поля стартуют не пустыми,
// а из данных диагноза (черновик пишется, только если текущие значения
// отличаются от исходных — иначе «черновиком» считалась бы любая открытая
// карточка), а «Очистить» откатывает к исходным данным записи.

const DRAFT_ADD_KEY = "mamadoc:settings:diagnosis-add-draft";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // старше суток — считаем неактуальным

type DiagnosisDraft = {
  savedAt: number;
  code: string;
  title: string;
  displayName: string;
  isActive: boolean;
};

function draftEditKeyFor(id: number): string {
  return `mamadoc:settings:diagnosis-edit-draft:${id}`;
}

/** Target opening the drawer: a diagnosis to edit, or "new" to create one. */
export type DiagnosisFormTarget = CatalogDiagnosis | "new" | null;

export interface DiagnosisFormDrawerProps {
  target: DiagnosisFormTarget;
  onClose: () => void;
  /** Called after a successful create/update with the fresh record. */
  onSaved: (diagnosis: CatalogDiagnosis) => void;
}

// ── Field label helper (label + optional counter on the right) ────────────────

const FieldLabel: React.FC<{ children: React.ReactNode; counter?: string }> = ({
  children,
  counter,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
    <Typography variant="body2" color="text.secondary" fontWeight={600}>
      {children}
    </Typography>
    {counter && (
      <Typography variant="caption" color="text.disabled">
        {counter}
      </Typography>
    )}
  </Stack>
);

export const DiagnosisFormDrawer: React.FC<DiagnosisFormDrawerProps> = ({
  target,
  onClose,
  onSaved,
}) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const { t, term } = useT("settings");

  function extractErrorMessage(err: unknown): string {
    if (err instanceof ApiError) return extractApiError(err.payload, err.status);
    if (err instanceof Error) return err.message;
    return t("diagnosisForm.unknownError");
  }

  const open = target !== null;
  const editing: CatalogDiagnosis | null =
    target !== null && target !== "new" ? target : null;
  const isEdit = editing !== null;

  const [code, setCode] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);

  const codeRef = React.useRef<HTMLInputElement>(null);
  const baselineRef = React.useRef<{
    code: string;
    title: string;
    displayName: string;
    isActive: boolean;
  } | null>(null);

  // Reset whenever the drawer opens (or switches between create/edit targets),
  // then restore a pending localStorage draft on top of the baseline if present.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    form.reset();

    const baseline = editing
      ? {
          code: editing.code,
          title: editing.title,
          displayName: editing.displayName ?? "",
          isActive: editing.isActive,
        }
      : { code: "", title: "", displayName: "", isActive: true };
    baselineRef.current = baseline;

    const draftKey = editing ? draftEditKeyFor(editing.id) : DRAFT_ADD_KEY;
    const draft = readFormDraft<DiagnosisDraft>(draftKey, DRAFT_TTL_MS);
    const next = draft ?? baseline;

    setCode(next.code);
    setTitle(next.title);
    setDisplayName(next.displayName);
    setIsActive(next.isActive);
    setDraftRestored(Boolean(draft));

    // Focus the first field shortly after the drawer transition starts.
    const t = setTimeout(() => codeRef.current?.focus(), 120);
    return () => clearTimeout(t);
    // form.reset стабилен — эффект перезапускается только на открытии/смене цели.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const trimmedCode = code.trim();
  const trimmedTitle = title.trim();
  // Defensive: older backend deploys may omit displayName entirely (field
  // rollout in progress), so the raw string can transiently be undefined.
  const trimmedDisplayName = (displayName ?? "").trim();

  // Dirty = differs from the original (or has any content when creating).
  const isDirty = isEdit
    ? trimmedCode !== editing!.code ||
      trimmedTitle !== editing!.title ||
      trimmedDisplayName !== (editing!.displayName ?? "") ||
      isActive !== editing!.isActive
    : Boolean(trimmedCode || trimmedTitle || trimmedDisplayName);

  // ── сохранение черновика в localStorage (защита от случайного закрытия) ────
  // flushDraftRef всегда указывает на актуальный снэпшот полей — нужен, чтобы
  // при закрытии до истечения debounce (быстрый ввод + сразу закрыть) успеть
  // синхронно записать черновик, а не потерять его вместе с отменённым таймером.
  // isDirty — уже готовый компаратор «текущее отличается от исходного/непусто»,
  // переиспользуем его как условие записи/очистки черновика.
  const flushDraftRef = React.useRef<() => void>(() => {});
  flushDraftRef.current = () => {
    const draftKey = editing ? draftEditKeyFor(editing.id) : DRAFT_ADD_KEY;
    if (isDirty) {
      writeFormDraft(draftKey, { code, title, displayName, isActive });
    } else {
      clearFormDraft(draftKey);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => flushDraftRef.current(), 400);
    return () => clearTimeout(id);
  }, [open, code, title, displayName, isActive]);

  const handleClose = () => {
    flushDraftRef.current();
    onClose();
  };

  const handleDiscardDraft = () => {
    const draftKey = editing ? draftEditKeyFor(editing.id) : DRAFT_ADD_KEY;
    clearFormDraft(draftKey);
    const baseline = baselineRef.current;
    if (baseline) {
      setCode(baseline.code);
      setTitle(baseline.title);
      setDisplayName(baseline.displayName);
      setIsActive(baseline.isActive);
    }
    setDraftRestored(false);
  };

  // Порядок ключей = порядок полей: в первое незаполненное уйдёт фокус.
  const form = useFormValidation({
    code: trimmedCode ? null : t("diagnosisForm.codeRequired"),
    title: trimmedTitle ? null : t("diagnosisForm.titleRequired"),
  });

  const handleSubmit = async () => {
    if (busy) return;
    if (!form.validate()) return;
    setError(null);
    setBusy(true);
    try {
      let saved: CatalogDiagnosis;
      if (editing) {
        saved = await updateDiagnosis(editing.id, {
          code: trimmedCode,
          title: trimmedTitle,
          displayName: trimmedDisplayName,
          isActive,
        });
      } else {
        saved = await createDiagnosis({
          code: trimmedCode,
          title: trimmedTitle,
          displayName: trimmedDisplayName,
          isActive,
        });
      }
      clearFormDraft(editing ? draftEditKeyFor(editing.id) : DRAFT_ADD_KEY);
      onSaved(saved);
      enqueueSnackbar(
        isEdit ? t("diagnosisForm.updated") : t("diagnosisForm.created"),
        { variant: "success" },
      );
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Enter in a single-line field submits; the title is multiline so it is
  // excluded (Enter inserts a newline there as expected).
  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const content = (
    <>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: "primary.main",
            }}
          >
            <LocalHospitalOutlined fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={600} lineHeight={1.2}>
              {isEdit ? t("diagnosisForm.editTitle") : t("diagnosisForm.createTitle")}
            </Typography>
            {isEdit && (
              <Typography variant="caption" color="text.secondary">
                {editing!.code}
              </Typography>
            )}
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          {draftRestored && (
            <Tooltip
              title={`${t("diagnosisForm.draftRestored")} — ${t(
                "diagnosisForm.draftDiscard",
              ).toLowerCase()}?`}
            >
              <IconButton onClick={handleDiscardDraft} aria-label={t("diagnosisForm.draftDiscard")}>
                <RestoreOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton
            onClick={busy ? undefined : handleClose}
            aria-label={t("common:actions.close")}
            edge="end"
          >
            <CloseOutlined />
          </IconButton>
        </Stack>
      </Box>
      <Divider />

      {/* Body */}
      <Box
        sx={{
          p: 2.5,
          flex: 1,
          overflowY: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <Stack spacing={2.5}>
          {/* Код МКБ-10 */}
          <Stack spacing={0.5}>
            <FieldLabel counter={`${code.length}/${CODE_MAX}`}>{t("diagnosisForm.codeLabel")}</FieldLabel>
            <TextField
              inputRef={codeRef}
              size="small"
              fullWidth
              value={code}
              // Коды МКБ-10 принято писать заглавными (A09, J06.9) — нормализуем.
              onChange={(e) => {
                setError(null);
                setCode(e.target.value.toUpperCase());
              }}
              onKeyDown={handleCodeKeyDown}
              disabled={busy}
              placeholder={t("diagnosisForm.codePlaceholder")}
              {...form.field("code", " ")}
              inputProps={{ maxLength: CODE_MAX, autoCapitalize: "characters" }}
              sx={{ "& input": { fontFamily: "monospace", fontWeight: 600 } }}
            />
          </Stack>

          {/* Название */}
          <Stack spacing={0.5}>
            <FieldLabel counter={`${title.length}/${TITLE_MAX}`}>{t("diagnosisForm.titleLabel")}</FieldLabel>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              value={title}
              onChange={(e) => {
                setError(null);
                setTitle(e.target.value);
              }}
              disabled={busy}
              placeholder={t("diagnosisForm.titlePlaceholder")}
              {...form.field("title", " ")}
              inputProps={{ maxLength: TITLE_MAX }}
            />
          </Stack>

          {/* Название для печати */}
          <Stack spacing={0.5}>
            <FieldLabel counter={`${displayName.length}/${DISPLAY_NAME_MAX}`}>
              {t("diagnosisForm.displayNameLabel")}
            </FieldLabel>
            <TextField
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
              placeholder={t("diagnosisForm.displayNamePlaceholder")}
              helperText={t("diagnosisForm.displayNameHelper")}
              inputProps={{ maxLength: DISPLAY_NAME_MAX }}
            />
          </Stack>

          {/* Активность */}
          <Box
            sx={{
              p: 1.75,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: alpha(theme.palette.primary.main, 0.03),
            }}
          >
            <FormControlLabel
              sx={{ m: 0, alignItems: "flex-start", gap: 1 }}
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={busy}
                />
              }
              label={
                <Box>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={600}>
                      {t("diagnosisForm.activeToggleLabel")}
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        isActive
                          ? agree(term.diagnosis.gender, ["Доступен", "Доступна", "Доступно"])
                          : agree(term.diagnosis.gender, ["Скрыт", "Скрыта", "Скрыто"])
                      }
                      color={isActive ? "success" : "default"}
                      variant={isActive ? "filled" : "outlined"}
                      sx={{ height: 20 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {isActive
                      ? t("diagnosisForm.captionActive")
                      : t("diagnosisForm.captionHidden")}
                  </Typography>
                </Box>
              }
            />
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </Box>

      {/* Footer */}
      <Divider />
      <Box sx={{ px: 2.5, py: 1.5, flexShrink: 0 }}>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={handleClose} disabled={busy}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? t("common:state.saving") : isEdit ? t("common:actions.save") : t("common:actions.create")}
          </Button>
        </Stack>
      </Box>
    </>
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={busy ? undefined : handleClose}
      PaperProps={{
        sx: {
          width: { xs: 320, sm: 440 },
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {content}
    </Drawer>
  );
};

export default DiagnosisFormDrawer;
