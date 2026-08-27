import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useMutation, useQuery } from "@tanstack/react-query";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";

import {
  MAX_DELAY_MINUTES,
  createAutomation,
  testAutomation,
  updateAutomation,
  type Automation,
  type AutomationCatalog,
  type AutomationStatus,
  type AutomationTestResult,
} from "../../../api/automations";
import { getBranches } from "../../../api/organization";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { getErrorFields } from "../../../api/client";
import { ConfirmDialog } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import { ConditionBuilder } from "./ConditionBuilder";
import {
  automationToForm,
  defaultRecipientField,
  emptyForm,
  hasErrors,
  makeAction,
  retargetForm,
  samplePayload,
  supportsBranchFilter,
  toConditions,
  toSaveInput,
  validateForm,
  type ActionForm,
  type AutomationForm,
  type FormErrors,
} from "./automationForm";

const STATUSES: AutomationStatus[] = ["draft", "active", "paused"];

export interface AutomationEditorDialogProps {
  open: boolean;
  /** null — создание нового правила. */
  automation: Automation | null;
  catalog: AutomationCatalog;
  organizationId: number | undefined;
  onClose: () => void;
  onSaved: (automation: Automation) => void;
}

/**
 * Мастер правила: «Когда» → «Если» → «Тогда» → «Проверка».
 *
 * Сохранение всегда идёт полным `PUT`/`POST`: у бэка нет частичного
 * обновления, поэтому форма обязана держать всё состояние правила и
 * отправлять его целиком (docs/automations-api.md §8).
 */
export const AutomationEditorDialog: React.FC<AutomationEditorDialogProps> = ({
  open,
  automation,
  catalog,
  organizationId,
  onClose,
  onSaved,
}) => {
  const { t } = useT("settings");
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  const [form, setForm] = useState<AutomationForm>(() =>
    automation ? automationToForm(automation) : emptyForm(catalog.events[0]),
  );
  const [errors, setErrors] = useState<FormErrors>({ conditions: {}, actionFields: {} });
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [eventChanged, setEventChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [testPayload, setTestPayload] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<AutomationTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  /** Куда вставлять переменную по клику — последнее сфокусированное поле текста. */
  const bodyRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});

  const event = useMemo(
    () => catalog.events.find((item) => item.code === form.eventCode),
    [catalog.events, form.eventCode],
  );

  // Открытие диалога — единственный момент, когда форма берётся из пропсов:
  // дальше правки живут в state, иначе рефетч списка затирал бы ввод.
  useEffect(() => {
    if (!open) return;
    const next = automation ? automationToForm(automation) : emptyForm(catalog.events[0]);
    setForm(next);
    setErrors({ conditions: {}, actionFields: {} });
    setSubmitted(false);
    setDirty(false);
    setEventChanged(false);
    setSaveError(null);
    setTestResult(null);
    setTestError(null);
    setTestPayload(
      samplePayload(catalog.events.find((item) => item.code === next.eventCode)),
    );
  }, [open, automation, catalog.events]);

  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, organizationId ?? null],
    queryFn: () => getBranches(organizationId ?? null),
    enabled: open && supportsBranchFilter(event),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const validationLabels = useMemo(
    () => ({
      nameRequired: t("automations.validation.nameRequired"),
      eventRequired: t("automations.validation.eventRequired"),
      actionsRequired: t("automations.action.required"),
      valueRequired: t("automations.conditions.valueRequired"),
      emptyGroup: t("automations.conditions.emptyGroup"),
      unknownField: (code: string) => t("automations.conditions.unknownField", { code }),
      bodyRequired: t("automations.action.bodyRequired"),
      delayRange: t("automations.action.delayRange", { max: MAX_DELAY_MINUTES }),
    }),
    [t],
  );

  // Пока форму не отправляли, ошибки не показываем: подсвечивать пустое
  // название в только что открытом «Создать» — шум.
  useEffect(() => {
    if (!submitted) return;
    setErrors(validateForm(form, event, validationLabels));
  }, [form, event, submitted, validationLabels]);

  const update = (patch: Partial<AutomationForm>) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const changeEvent = (code: string) => {
    const next = catalog.events.find((item) => item.code === code);
    setDirty(true);
    setForm((prev) => {
      const retargeted = retargetForm(prev, next);
      setEventChanged(retargeted.changed);
      // Событие без branch_id не поддерживает фильтр по филиалу — сбрасываем,
      // иначе сохранился бы филиал, который движок всё равно не проверит.
      return supportsBranchFilter(next)
        ? retargeted.form
        : { ...retargeted.form, branchId: null };
    });
    setTestPayload(samplePayload(next));
    setTestResult(null);
  };

  const updateAction = (key: string, patch: Partial<ActionForm>) => {
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.map((action) =>
        action.key === key ? { ...action, ...patch } : action,
      ),
    }));
  };

  const insertVariable = (action: ActionForm, variable: string) => {
    const input = bodyRefs.current[action.key];
    const token = `{{${variable}}}`;
    // Вставляем в позицию курсора, а не в конец: иначе переменную в середине
    // фразы пришлось бы дописывать руками.
    const start = input?.selectionStart ?? action.body.length;
    const end = input?.selectionEnd ?? action.body.length;
    const body = action.body.slice(0, start) + token + action.body.slice(end);
    updateAction(action.key, { body });
    window.requestAnimationFrame(() => {
      const el = bodyRefs.current[action.key];
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = toSaveInput(form, organizationId);
      return automation
        ? updateAutomation(automation.id, input)
        : createAutomation(input);
    },
    onSuccess: (saved) => {
      setDirty(false);
      onSaved(saved);
    },
    onError: (err) => {
      // Бэк отдаёт ошибки полей в details.fields — показываем их текстом:
      // пути вроде `actions[0].config.body` в форму не мапятся один в один.
      const fields = getErrorFields(err);
      const detail = fields
        ? Object.entries(fields)
            .map(([field, message]) => `${field}: ${message}`)
            .join("\n")
        : null;
      setSaveError(
        detail ?? (err instanceof Error ? err.message : t("automations.editor.saveError")),
      );
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      testAutomation({
        eventCode: form.eventCode,
        conditions: toConditions(form),
        actions: toSaveInput(form, organizationId).actions,
        eventPayload: testPayload,
        ...(organizationId != null ? { organizationId } : {}),
      }),
    onSuccess: (result) => {
      setTestError(null);
      setTestResult(result);
    },
    onError: (err) => {
      setTestResult(null);
      setTestError(err instanceof Error ? err.message : t("automations.test.error"));
    },
  });

  const submit = () => {
    setSubmitted(true);
    const nextErrors = validateForm(form, event, validationLabels);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      setSaveError(t("automations.validation.fixErrors"));
      return;
    }
    setSaveError(null);
    saveMutation.mutate();
  };

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const branchSupported = supportsBranchFilter(event);
  const busy = saveMutation.isPending;

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        fullScreen={fullScreen}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1 }}>
            {automation
              ? t("automations.editor.editTitle")
              : t("automations.editor.createTitle")}
          </Box>
          <IconButton onClick={requestClose} size="small" aria-label={t("automations.editor.cancel")}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <Divider />

        <DialogContent dividers sx={{ bgcolor: "background.default" }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                fullWidth
                size="small"
                label={t("automations.editor.nameLabel")}
                placeholder={t("automations.editor.namePlaceholder")}
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                error={Boolean(errors.name)}
                helperText={errors.name}
                disabled={busy}
              />
              <TextField
                select
                size="small"
                label={t("automations.editor.statusLabel")}
                value={form.status}
                onChange={(e) => update({ status: e.target.value as AutomationStatus })}
                disabled={busy}
                sx={{ minWidth: { xs: "100%", md: 200 } }}
                helperText={t(`automations.statusHint.${form.status}`)}
              >
                {STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {t(`automations.status.${status}`)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Section
              title={t("automations.steps.when")}
              hint={t("automations.steps.whenHint")}
            >
              <Stack spacing={1.5}>
                <TextField
                  select
                  size="small"
                  label={t("automations.event.label")}
                  value={form.eventCode}
                  onChange={(e) => changeEvent(e.target.value)}
                  error={Boolean(errors.eventCode)}
                  helperText={errors.eventCode}
                  disabled={busy}
                  sx={{ maxWidth: 420 }}
                >
                  {catalog.events.map((item) => (
                    <MenuItem key={item.code} value={item.code}>
                      {item.label}
                    </MenuItem>
                  ))}
                </TextField>

                {eventChanged && (
                  <Alert severity="warning" onClose={() => setEventChanged(false)}>
                    {t("automations.event.changed")}
                  </Alert>
                )}

                {branchSupported ? (
                  <TextField
                    select
                    size="small"
                    label={t("automations.editor.branchLabel")}
                    value={form.branchId == null ? "" : String(form.branchId)}
                    onChange={(e) =>
                      update({ branchId: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    disabled={busy}
                    sx={{ maxWidth: 420 }}
                  >
                    <MenuItem value="">{t("automations.editor.branchAll")}</MenuItem>
                    {(branchesQuery.data ?? [])
                      .filter((branch) => branch.isActive)
                      .map((branch) => (
                        <MenuItem key={branch.id} value={String(branch.id)}>
                          {branch.name}
                        </MenuItem>
                      ))}
                  </TextField>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {t("automations.editor.branchHint")}
                  </Typography>
                )}
              </Stack>
            </Section>

            <Section title={t("automations.steps.if")} hint={t("automations.steps.ifHint")}>
              <ConditionBuilder
                event={event}
                groupOperators={catalog.conditionGroupOperators}
                value={form.conditions}
                onChange={(conditions) => update({ conditions })}
                errors={errors.conditions}
                organizationId={organizationId}
                disabled={busy}
              />
            </Section>

            <Section title={t("automations.steps.then")} hint={t("automations.steps.thenHint")}>
              <Stack spacing={2}>
                {errors.actions && <Alert severity="error">{errors.actions}</Alert>}

                {form.actions.map((action, index) => (
                  <Paper key={action.key} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="subtitle2" sx={{ flex: 1 }}>
                          {t("automations.action.title", { index: index + 1 })}
                        </Typography>
                        <IconButton
                          size="small"
                          disabled={busy || form.actions.length === 1}
                          onClick={() =>
                            update({
                              actions: form.actions.filter((item) => item.key !== action.key),
                            })
                          }
                          aria-label={t("automations.action.remove")}
                        >
                          <DeleteOutlineOutlined fontSize="small" />
                        </IconButton>
                      </Stack>

                      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                        <TextField
                          select
                          size="small"
                          label={t("automations.action.channelLabel")}
                          value={action.channel}
                          onChange={(e) => updateAction(action.key, { channel: e.target.value })}
                          disabled={busy}
                          sx={{ minWidth: 160 }}
                        >
                          {channelOptions(catalog).map((channel) => (
                            <MenuItem key={channel} value={channel}>
                              {t(`automations.channels.${channel}`, { defaultValue: channel })}
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          size="small"
                          label={t("automations.action.delayLabel")}
                          value={action.delayMinutes}
                          onChange={(e) =>
                            updateAction(action.key, {
                              delayMinutes: e.target.value.replace(/[^\d]/g, ""),
                            })
                          }
                          disabled={busy}
                          inputProps={{ inputMode: "numeric" }}
                          error={Boolean(errors.actionFields[action.key]?.delayMinutes)}
                          helperText={
                            errors.actionFields[action.key]?.delayMinutes ??
                            t("automations.action.delayHint")
                          }
                          sx={{ minWidth: 200 }}
                        />

                        <TextField
                          select
                          size="small"
                          label={t("automations.action.recipientLabel")}
                          value={
                            (event?.variables ?? []).includes(action.recipientField)
                              ? action.recipientField
                              : defaultRecipientField(event)
                          }
                          onChange={(e) =>
                            updateAction(action.key, { recipientField: e.target.value })
                          }
                          disabled={busy}
                          helperText={t("automations.action.recipientHint")}
                          sx={{ minWidth: 220, flex: 1 }}
                        >
                          {(event?.variables ?? []).map((variable) => (
                            <MenuItem key={variable} value={variable}>
                              {variable}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>

                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        size="small"
                        label={t("automations.action.bodyLabel")}
                        value={action.body}
                        onChange={(e) => updateAction(action.key, { body: e.target.value })}
                        disabled={busy}
                        inputRef={(el) => {
                          bodyRefs.current[action.key] = el;
                        }}
                        error={Boolean(errors.actionFields[action.key]?.body)}
                        helperText={
                          errors.actionFields[action.key]?.body ??
                          t("automations.action.bodyHint")
                        }
                      />

                      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
                        <Typography variant="caption" color="text.secondary">
                          {t("automations.action.variablesLabel")}
                        </Typography>
                        {(event?.variables ?? []).map((variable) => (
                          <Chip
                            key={variable}
                            size="small"
                            variant="outlined"
                            label={`{{${variable}}}`}
                            onClick={() => insertVariable(action, variable)}
                            disabled={busy}
                            sx={{ fontFamily: "monospace", cursor: "pointer" }}
                          />
                        ))}
                      </Box>
                    </Stack>
                  </Paper>
                ))}

                <Box>
                  <Button
                    size="small"
                    startIcon={<AddOutlined />}
                    disabled={busy}
                    onClick={() =>
                      update({
                        actions: [...form.actions, makeAction(defaultRecipientField(event))],
                      })
                    }
                  >
                    {t("automations.action.add")}
                  </Button>
                </Box>
              </Stack>
            </Section>

            <Section title={t("automations.steps.check")} hint={t("automations.steps.checkHint")}>
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  {t("automations.test.hint")}
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gap: 1.5,
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  }}
                >
                  {Object.keys(testPayload).map((key) => (
                    <TextField
                      key={key}
                      size="small"
                      label={key}
                      value={testPayload[key]}
                      onChange={(e) =>
                        setTestPayload((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      disabled={testMutation.isPending}
                    />
                  ))}
                </Box>

                <Box>
                  <Button
                    variant="outlined"
                    startIcon={
                      testMutation.isPending ? (
                        <CircularProgress size={18} color="inherit" />
                      ) : (
                        <PlayArrowOutlined />
                      )
                    }
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending || !form.eventCode}
                  >
                    {t("automations.test.run")}
                  </Button>
                </Box>

                {testError && <Alert severity="error">{testError}</Alert>}

                {testResult && (
                  <Stack spacing={1}>
                    <Alert severity={testResult.matched ? "success" : "info"}>
                      {testResult.matched
                        ? t("automations.test.matched")
                        : t("automations.test.notMatched")}
                    </Alert>
                    {testResult.actions.map((preview, index) => (
                      <Paper key={index} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            {t("automations.test.resultRecipient")}:{" "}
                            {preview.recipient || "—"}
                            {" · "}
                            {t("automations.test.resultDelay", { count: preview.delayMinutes })}
                          </Typography>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {preview.renderedBody}
                          </Typography>
                          {!preview.recipient && (
                            <Typography variant="caption" color="error">
                              {t("automations.test.emptyRecipient")}
                            </Typography>
                          )}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Section>

            <Alert severity="info">{t("automations.editor.putWarning")}</Alert>
            {saveError && (
              <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
                {saveError}
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={requestClose} color="inherit" disabled={busy}>
            {t("automations.editor.cancel")}
          </Button>
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SaveOutlined />}
            onClick={submit}
            disabled={busy}
          >
            {t("automations.editor.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        title={t("automations.editor.closeConfirmTitle")}
        message={t("automations.editor.closeConfirmText")}
        variant="warning"
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
};

/** Каналы берём из configFields каталога, а не из своего списка. */
function channelOptions(catalog: AutomationCatalog): string[] {
  const action = catalog.actions.find((item) => item.code === "send_message");
  const channel = action?.configFields.find((field) => field.code === "channel");
  return channel?.options ?? ["sms", "whatsapp"];
}

const Section: React.FC<{
  title: string;
  hint: string;
  children: React.ReactNode;
}> = ({ title, hint, children }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      </Box>
      {children}
    </Stack>
  </Paper>
);

export default AutomationEditorDialog;
