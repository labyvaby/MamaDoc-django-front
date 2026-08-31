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
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useMutation } from "@tanstack/react-query";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";

import {
  MAX_DELAY_MINUTES,
  createAutomation,
  testAutomation,
  updateAutomation,
  variableLabel,
  type Automation,
  type AutomationCatalog,
  type AutomationCatalogEvent,
  type AutomationStatus,
  type AutomationTestResult,
} from "../../../api/automations";
import { getErrorFields } from "../../../api/client";
import { ConfirmDialog } from "../../../components/ui";
import { useT } from "../../../i18n/VerticalProvider";
import { ConditionBuilder } from "./ConditionBuilder";
import { FieldValueInput } from "./FieldValueInput";
import { PhonePayloadInput } from "./PhonePayloadInput";
import {
  automationToForm,
  defaultRecipientField,
  emptyForm,
  hasErrors,
  makeAction,
  supportsTitle,
  relevantPayloadFields,
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
import { useConditionReferences } from "./useConditionReferences";

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
  const [showAllPayload, setShowAllPayload] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  /** Куда вставлять переменную по клику — последнее сфокусированное поле текста. */
  const bodyRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});

  const event = useMemo(
    () => catalog.events.find((item) => item.code === form.eventCode),
    [catalog.events, form.eventCode],
  );

  /**
   * Форма берётся из пропсов ровно один раз — при открытии диалога.
   *
   * Раньше в зависимостях эффекта лежал `catalog.events`, и любой рефетч
   * каталога с изменившимся ответом пересобирал форму заново прямо поверх
   * несохранённых правок: пользователь редактировал правило, возвращался в
   * окно, TanStack Query обновлял каталог — и введённое молча заменялось
   * исходными значениями. Со стороны это выглядело как «редактирование не
   * сохраняется»: сохранялось то, что было до правок.
   *
   * Поэтому сбрасываем только на смену «что именно открыто», а каталог
   * читаем через ref — он нужен лишь для черновика нового правила.
   */
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const openedForRef = useRef<string | null>(null);
  const openedFor = open ? `${automation?.id ?? "new"}` : null;

  useEffect(() => {
    if (openedFor === null || openedFor === openedForRef.current) return;
    openedForRef.current = openedFor;
    const next = automation
      ? automationToForm(automation)
      : emptyForm(catalogRef.current.events[0]);
    setForm(next);
    setErrors({ conditions: {}, actionFields: {} });
    setSubmitted(false);
    setDirty(false);
    setEventChanged(false);
    setSaveError(null);
    setTestResult(null);
    setTestError(null);
    setShowAllPayload(false);
    setTestPayload(
      samplePayload(
        catalogRef.current.events.find((item) => item.code === next.eventCode),
        next,
      ),
    );
    // Намеренно без catalog в зависимостях — см. комментарий выше.
  }, [openedFor, automation]);

  // Справочники для полей прогона. Ключи запросов те же, что использует
  // ConditionBuilder, поэтому лишних обращений к сети не будет — ответ
  // приходит из кэша TanStack Query.
  const references = useConditionReferences(organizationId, {
    branch: Boolean(event?.fields.some((f) => f.fieldType === "branch")),
    service: Boolean(event?.fields.some((f) => f.fieldType === "service")),
    employee: Boolean(event?.fields.some((f) => f.fieldType === "employee")),
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
    setSaveError(null);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const changeEvent = (code: string) => {
    const next = catalog.events.find((item) => item.code === code);
    const retargeted = retargetForm(form, next);
    // Событие без branch_id не поддерживает фильтр по филиалу — сбрасываем,
    // иначе сохранился бы филиал, который движок всё равно не проверит.
    const nextForm = supportsBranchFilter(next)
      ? retargeted.form
      : { ...retargeted.form, branchId: null };

    setDirty(true);
    setSaveError(null);
    setEventChanged(retargeted.changed);
    setForm(nextForm);
    // Payload считаем от уже перенацеленной формы: условия к этому моменту
    // очищены от полей, которых у нового события нет.
    setTestPayload(samplePayload(next, nextForm));
    setTestResult(null);
  };

  const updateAction = (key: string, patch: Partial<ActionForm>) => {
    setDirty(true);
    setSaveError(null);
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

  /**
   * Прогон гоняем только по валидной форме: иначе `/test/` отвечает
   * «Текст сообщения обязателен» общим красным блоком внизу, а поле, из-за
   * которого это случилось, остаётся неподсвеченным где-то выше.
   */
  const runTest = () => {
    setSubmitted(true);
    const nextErrors = validateForm(form, event, validationLabels);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      setTestResult(null);
      setTestError(t("automations.validation.fixErrors"));
      return;
    }
    setTestError(null);
    testMutation.mutate();
  };

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

  // Поля прогона: по умолчанию только те, что влияют на результат этого
  // правила; остальные — по явному запросу.
  const payloadRoles = useMemo(() => relevantPayloadFields(form), [form]);
  const relevantKeys = useMemo(
    () => Object.keys(testPayload).filter((key) => payloadRoles.has(key)),
    [testPayload, payloadRoles],
  );
  const visiblePayloadKeys = showAllPayload ? Object.keys(testPayload) : relevantKeys;
  const payloadHelper = (key: string) =>
    payloadRoles
      .get(key)
      ?.map((role) => t(`automations.test.role.${role}`))
      .join(" · ") || key;

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
                required
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
                  required
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
                    {references.branch.map((branch) => (
                      <MenuItem key={branch.value} value={branch.value}>
                        {branch.label}
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
                        <SendOutlined fontSize="small" color="action" />
                        <Typography variant="subtitle2" sx={{ flex: 1 }}>
                          {/* Название действия берём из каталога («Отправить
                              сообщение»), а не нумеруем безымянно: порядковый
                              номер нужен, только когда действий несколько. */}
                          {actionLabel(catalog, action.actionType)}
                          {form.actions.length > 1
                            ? ` · ${t("automations.action.ordinal", { index: index + 1 })}`
                            : ""}
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

                        {/* Выбор получателя показываем, только когда выбирать
                            действительно есть из чего. У всех текущих событий
                            телефон ровно один — спрашивать «откуда взять
                            номер» бессмысленно, достаточно назвать источник. */}
                        {recipientChoices(event, action.recipientField).length > 1 && (
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
                            error={!action.recipientField.includes("phone")}
                            helperText={
                              action.recipientField.includes("phone")
                                ? undefined
                                : t("automations.action.recipientNotPhone")
                            }
                            sx={{ minWidth: 220, flex: 1 }}
                          >
                            {recipientChoices(event, action.recipientField).map((variable) => (
                              <MenuItem key={variable} value={variable}>
                                {variableLabel(event, variable)}
                              </MenuItem>
                            ))}
                          </TextField>
                        )}
                      </Stack>

                      {recipientChoices(event, action.recipientField).length <= 1 && (
                        <Typography variant="caption" color="text.secondary">
                          {t("automations.action.recipientFixed", {
                            name: variableLabel(event, action.recipientField),
                          })}
                        </Typography>
                      )}

                      {/* Заголовок есть только у push: в шторке телефона он
                          отдельная строка. У SMS и WhatsApp такой строки нет,
                          и поле там только сбивало бы с толку. */}
                      {supportsTitle(action.channel) && (
                        <TextField
                          fullWidth
                          size="small"
                          label={t("automations.action.titleLabel")}
                          value={action.title}
                          onChange={(e) => updateAction(action.key, { title: e.target.value })}
                          disabled={busy}
                          helperText={t("automations.action.titleHint", {
                            name: form.name.trim() || t("automations.action.titleFallback"),
                          })}
                        />
                      )}

                      <TextField
                        required
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
                          // Показываем подпись, вставляем код: пользователю
                          // «Телефон клиента» понятнее, чем {{client_phone}},
                          // а в тексте шаблона движку нужен именно код.
                          <Tooltip key={variable} title={`{{${variable}}}`}>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={variableLabel(event, variable)}
                              onClick={() => insertVariable(action, variable)}
                              disabled={busy}
                              sx={{ cursor: "pointer" }}
                            />
                          </Tooltip>
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

                {visiblePayloadKeys.length === 0 ? (
                  <Alert severity="info">{t("automations.test.nothingToFill")}</Alert>
                ) : (
                  <Box
                    sx={{
                      display: "grid",
                      gap: 1.5,
                      gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    }}
                  >
                    {visiblePayloadKeys.map((key) =>
                      // Телефон вводится тем же полем, что и в карточке
                      // пациента: код страны, маска, проверка длины.
                      key.includes("phone") ? (
                        <PhonePayloadInput
                          key={key}
                          label={payloadFieldLabel(event, key)}
                          helperText={payloadHelper(key)}
                          value={testPayload[key] ?? ""}
                          onChange={(next) =>
                            setTestPayload((prev) => ({ ...prev, [key]: next }))
                          }
                          disabled={testMutation.isPending}
                        />
                      ) : (
                      // Тот же подбор значения, что и в условиях: поля-ссылки
                      // выбираются названием, а не вводом branch_id = 3.
                      <FieldValueInput
                        key={key}
                        spec={event?.fields.find((field) => field.code === key)}
                        label={payloadFieldLabel(event, key)}
                        value={testPayload[key] ?? ""}
                        references={references}
                        // Подпись объясняет, зачем поле нужно именно в этом
                        // правиле: без этого форма выглядит как список из
                        // полутора десятков непонятно чего.
                        helperText={payloadHelper(key)}
                        onValue={(next) =>
                          setTestPayload((prev) => ({ ...prev, [key]: next }))
                        }
                        disabled={testMutation.isPending}
                        fullWidth
                      />
                      ),
                    )}
                  </Box>
                )}

                {Object.keys(testPayload).length > relevantKeys.length && (
                  <Box>
                    <Button size="small" color="inherit" onClick={() => setShowAllPayload((v) => !v)}>
                      {showAllPayload
                        ? t("automations.test.showRelevant")
                        : t("automations.test.showAll", {
                            count: Object.keys(testPayload).length - relevantKeys.length,
                          })}
                    </Button>
                  </Box>
                )}

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
                    onClick={runTest}
                    disabled={testMutation.isPending || !form.eventCode}
                  >
                    {t("automations.test.run")}
                  </Button>
                </Box>

                {testError && <Alert severity="error">{testError}</Alert>}

                {testResult && (
                  <Stack spacing={1}>
                    <Alert
                      severity={
                        !testResult.matched
                          ? "info"
                          : // Совпало, но отправлять некуда — это провал, а не
                            // успех: показывать зелёное «сообщения будут
                            // отправлены» рядом с пустым получателем нельзя.
                            testResult.actions.some((preview) => !preview.recipient)
                            ? "warning"
                            : "success"
                      }
                    >
                      {!testResult.matched
                        ? t("automations.test.notMatched")
                        : testResult.actions.some((preview) => !preview.recipient)
                          ? t("automations.test.matchedNoRecipient")
                          : t("automations.test.matched")}
                    </Alert>
                    {testResult.actions.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {t("automations.test.previewCaption")}
                      </Typography>
                    )}
                    {testResult.actions.map((preview, index) => (
                      <Paper key={index} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            {t(`automations.channels.${preview.channel}`, {
                              defaultValue: preview.channel,
                            })}
                            {" · "}
                            {t("automations.test.resultRecipient")}:{" "}
                            {preview.recipient || t("automations.test.recipientMissing")}
                            {" · "}
                            {t("automations.test.resultDelay", { count: preview.delayMinutes })}
                          </Typography>
                          {/* Заголовок показываем отдельной строкой ровно
                              так, как его увидят в шторке телефона. */}
                          {supportsTitle(preview.channel) && (
                            <Typography variant="subtitle2">
                              {preview.renderedTitle || form.name.trim()}
                            </Typography>
                          )}
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {preview.renderedBody}
                          </Typography>
                          {!preview.recipient ? (
                            <Typography variant="caption" color="error">
                              {t("automations.test.emptyRecipient")}
                            </Typography>
                          ) : (
                            // Получатель, не похожий на телефон, провайдер не
                            // примет. Ловим здесь: в самой отправке это
                            // всплыло бы через сутки ошибкой в истории.
                            !looksLikePhone(preview.recipient) && (
                              <Typography variant="caption" color="warning.main">
                                {t("automations.test.recipientNotPhone")}
                              </Typography>
                            )
                          )}
                          {/* У push своё условие доставки, которого нет у SMS:
                              номер должен принадлежать аккаунту ProfiChat. */}
                          {supportsTitle(preview.channel) && (
                            <Typography variant="caption" color="text.secondary">
                              {t("automations.test.pushNotInApp")}
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

/**
 * Переменные, которые имеет смысл предлагать как получателя.
 *
 * Бэк разрешает любую переменную события, но в списке «кому отправить» ФИО
 * или дата — мусор: адресат SMS и WhatsApp это всегда телефон. Оставляем
 * телефонные переменные плюс уже сохранённое значение (иначе редактирование
 * старого правила молча подменило бы получателя). Если телефонных переменных
 * у события нет вовсе, показываем полный список — выбрать всё равно надо.
 */
function recipientChoices(
  event: AutomationCatalogEvent | undefined,
  current: string,
): string[] {
  const variables = event?.variables ?? [];
  const phones = variables.filter((variable) => variable.includes("phone"));
  if (phones.length === 0) return variables;
  return phones.includes(current) ? phones : [...phones, current].filter(Boolean);
}

/**
 * Похоже ли значение на телефон: плюс и не меньше девяти цифр.
 *
 * Провайдер принимает только номер, поэтому получатель вроде «123123» —
 * гарантированная ошибка отправки. Проверка нарочно грубая: строгий разбор
 * номера здесь не нужен, задача — отличить телефон от названия услуги.
 */
function looksLikePhone(value: string): boolean {
  return /^\+?\d[\d\s()-]{8,}$/.test(value.trim());
}

/** Название действия из каталога — «Отправить сообщение», а не код. */
function actionLabel(catalog: AutomationCatalog, actionType: string): string {
  return catalog.actions.find((item) => item.code === actionType)?.label ?? actionType;
}

/**
 * Подпись поля в пробном прогоне: payload собирается и из переменных
 * шаблона, и из полей условий — берём подпись из того каталога, где код есть.
 */
function payloadFieldLabel(
  event: AutomationCatalogEvent | undefined,
  code: string,
): string {
  const field = event?.fields.find((item) => item.code === code);
  if (field) return field.label;
  return variableLabel(event, code);
}

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
