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
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import { useSnackbar } from "notistack";

import { useCloseGuard } from "../../hooks/useCloseGuard";
import { CloseGuardDialog } from "../../components/common/CloseGuardDialog";
import { ApiError, extractErrorMessage as extractApiError } from "../../api/client";
import {
  createDiagnosis,
  updateDiagnosis,
  type CatalogDiagnosis,
} from "../../api/medical";

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return extractApiError(err.payload, err.status);
  if (err instanceof Error) return err.message;
  return "Неизвестная ошибка";
}

const CODE_MAX = 20;
const TITLE_MAX = 500;

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

  const open = target !== null;
  const editing: CatalogDiagnosis | null =
    target !== null && target !== "new" ? target : null;
  const isEdit = editing !== null;

  const [code, setCode] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Field-level validation, surfaced only after a submit attempt.
  const [touched, setTouched] = React.useState(false);

  const codeRef = React.useRef<HTMLInputElement>(null);

  // Reset whenever the drawer opens (or switches between create/edit targets).
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setTouched(false);
    if (editing) {
      setCode(editing.code);
      setTitle(editing.title);
      setIsActive(editing.isActive);
    } else {
      setCode("");
      setTitle("");
      setIsActive(true);
    }
    // Focus the first field shortly after the drawer transition starts.
    const t = setTimeout(() => codeRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, editing]);

  const trimmedCode = code.trim();
  const trimmedTitle = title.trim();

  // Dirty = differs from the original (or has any content when creating).
  const isDirty = isEdit
    ? trimmedCode !== editing!.code ||
      trimmedTitle !== editing!.title ||
      isActive !== editing!.isActive
    : Boolean(trimmedCode || trimmedTitle);

  const { guardedClose, confirmOpen, confirmClose, cancelClose } = useCloseGuard({
    isDirty,
    isOpen: open,
    onClose,
  });

  const codeError = touched && !trimmedCode ? "Укажите код МКБ-10" : "";
  const titleError = touched && !trimmedTitle ? "Укажите название диагноза" : "";
  const canSubmit = !busy && Boolean(trimmedCode) && Boolean(trimmedTitle);

  const handleSubmit = async () => {
    setTouched(true);
    if (!trimmedCode || !trimmedTitle) return;
    setError(null);
    setBusy(true);
    try {
      let saved: CatalogDiagnosis;
      if (editing) {
        saved = await updateDiagnosis(editing.id, {
          code: trimmedCode,
          title: trimmedTitle,
          isActive,
        });
      } else {
        saved = await createDiagnosis({
          code: trimmedCode,
          title: trimmedTitle,
          isActive,
        });
      }
      onSaved(saved);
      enqueueSnackbar(
        isEdit ? "Диагноз обновлён" : "Диагноз добавлен в справочник",
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
              {isEdit ? "Редактирование диагноза" : "Новый диагноз"}
            </Typography>
            {isEdit && (
              <Typography variant="caption" color="text.secondary">
                {editing!.code}
              </Typography>
            )}
          </Box>
        </Stack>
        <IconButton
          onClick={busy ? undefined : guardedClose}
          aria-label="Закрыть"
          edge="end"
        >
          <CloseOutlined />
        </IconButton>
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
            <FieldLabel counter={`${code.length}/${CODE_MAX}`}>Код МКБ-10 *</FieldLabel>
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
              placeholder="Например: A09"
              error={Boolean(codeError)}
              helperText={codeError || " "}
              inputProps={{ maxLength: CODE_MAX, autoCapitalize: "characters" }}
              sx={{ "& input": { fontFamily: "monospace", fontWeight: 600 } }}
            />
          </Stack>

          {/* Название */}
          <Stack spacing={0.5}>
            <FieldLabel counter={`${title.length}/${TITLE_MAX}`}>Название *</FieldLabel>
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
              placeholder="Например: Острый гастроэнтерит неуточнённый"
              error={Boolean(titleError)}
              helperText={titleError || " "}
              inputProps={{ maxLength: TITLE_MAX }}
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
                      Активен
                    </Typography>
                    <Chip
                      size="small"
                      label={isActive ? "Доступен" : "Скрыт"}
                      color={isActive ? "success" : "default"}
                      variant={isActive ? "filled" : "outlined"}
                      sx={{ height: 20 }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {isActive
                      ? "Диагноз отображается врачам при заполнении заключения."
                      : "Диагноз скрыт из выбора, но уже выданные заключения сохранят его."}
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
          <Button variant="outlined" onClick={guardedClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
          </Button>
        </Stack>
      </Box>
    </>
  );

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={busy ? undefined : guardedClose}
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

      <CloseGuardDialog
        open={confirmOpen}
        title={isEdit ? "редактирование диагноза" : "новый диагноз"}
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />
    </>
  );
};

export default DiagnosisFormDrawer;
