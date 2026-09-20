import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";
import {
  getChatwootLeadSettings,
  rotateChatwootLeadSecret,
  saveChatwootLeadSettings,
  suggestInboxRule,
  testChatwootLeadConnection,
  type ChatwootInbox,
  type ChatwootInboxChannel,
  type ChatwootInboxIdentity,
  type ChatwootInboxMap,
  type ChatwootLeadSettings,
} from "../../api/chatwootLeads";
import { getPipelines, getStages, type DealPipeline, type DealStage } from "../../api/deals";
import { getAllDjangoEmployees } from "../../api/staff";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Настройки → Chatwoot: «диалог Chatwoot → сделка в воронке».
 *
 * Четыре блока: тумблер, подключение («Проверить связь» тянет инбоксы из
 * Chatwoot), вебхук (готовая ссылка с секретом — копировать в Chatwoot) и
 * карта инбоксов (из какого инбокса заводить сделку, источник, как определять
 * клиента, канал) плюс воронка/этап переоткрытия/ответственный.
 *
 * Карта хранится по id инбокса: Chatwoot-типы каналов обманчивы (WhatsApp
 * через Evolution приходит как `Channel::Api`), поэтому решает пользователь,
 * а тип только подсказывает предзаполнение.
 */

type Form = {
  enabled: boolean;
  apiToken: string;
  apiTokenClear: boolean;
  pipelineCode: string;
  reopenStageCode: string;
  defaultAssigneeId: number | null;
  inboxMap: ChatwootInboxMap;
  inboxWhitelist: number[];
};

const IDENTITIES: ChatwootInboxIdentity[] = ["phone", "username"];
const CHANNELS: Exclude<ChatwootInboxChannel, "">[] = [
  "whatsapp",
  "instagram",
  "telegram",
  "web",
  "phone",
  "other",
];

/**
 * `code` воронки/этапа бэк отдаёт (stageCode/pipelineCode — контракт бота), но
 * в типах фронта на main его ещё нет; ветка воронки добавляет поле в test.
 * Локальное расширение вместо правки deals.ts — чтобы не конфликтовать.
 */
type Coded = { code?: string | null };

function codeOf(item: DealPipeline | DealStage): string {
  return (item as Coded).code ?? "";
}

function toForm(settings: ChatwootLeadSettings): Form {
  return {
    enabled: settings.enabled,
    apiToken: "",
    apiTokenClear: false,
    pipelineCode: settings.pipelineCode,
    reopenStageCode: settings.reopenStageCode,
    defaultAssigneeId: settings.defaultAssigneeId,
    inboxMap: { ...settings.inboxMap },
    inboxWhitelist: [...settings.inboxWhitelist],
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

export default function ChatwootLeadsSettingsPage() {
  const { t } = useT("settings");
  usePageTitle(t("chatwoot.title"));
  const {
    isSuperAdmin,
    activeOrganization,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const queryClient = useQueryClient();

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const [form, setForm] = React.useState<Form | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [snack, setSnack] = React.useState<string | null>(null);
  const [testState, setTestState] = React.useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "ok"; count: number } | { kind: "failed"; error: string }
  >({ kind: "idle" });

  const settingsKey = ["django", "chatwoot", "lead-integration", orgId ?? null] as const;
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => getChatwootLeadSettings(signal, { organizationId: orgId }),
    enabled: !permLoading && !needsOrg,
  });

  React.useEffect(() => {
    if (settingsQuery.data) setForm(toForm(settingsQuery.data));
  }, [settingsQuery.data]);

  const pipelinesQuery = useQuery({
    queryKey: ["django", "deals", "pipelines", orgId ?? null, "chatwoot-settings"] as const,
    queryFn: ({ signal }) => getPipelines(orgId, false, signal),
    enabled: !permLoading && !needsOrg,
  });
  const pipelines: DealPipeline[] = pipelinesQuery.data ?? [];
  const selectedPipeline =
    pipelines.find((p) => codeOf(p) === form?.pipelineCode && form?.pipelineCode) ??
    pipelines.find((p) => p.isDefault) ??
    pipelines[0];

  const stagesQuery = useQuery({
    queryKey: ["django", "deals", "stages", selectedPipeline?.id ?? null, orgId ?? null] as const,
    queryFn: ({ signal }) => getStages(selectedPipeline?.id, orgId, false, signal),
    enabled: !!selectedPipeline,
  });
  const openStages: DealStage[] = (stagesQuery.data ?? []).filter((s) => s.kind === "open");

  // Инбоксы тянем сами при открытии — иначе сохранённая карта показывает голые
  // «#61» без названий, пока не нажали «Проверить связь». Читается стороной
  // Chatwoot с сохранённым/минтимым токеном; токен из формы сюда не идёт.
  const inboxesQuery = useQuery({
    queryKey: ["django", "chatwoot", "lead-integration", "inboxes", orgId ?? null] as const,
    queryFn: () => testChatwootLeadConnection({ organizationId: orgId }),
    enabled: !!settingsQuery.data && settingsQuery.data.accountId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const inboxes: ChatwootInbox[] | null = inboxesQuery.data?.ok ? inboxesQuery.data.inboxes : null;

  const employeesQuery = useQuery({
    queryKey: ["django", "employees", "all", orgId ?? null, "chatwoot-settings"] as const,
    queryFn: ({ signal }) => getAllDjangoEmployees({ status: "active", organizationId: orgId }, signal),
    enabled: !permLoading && !needsOrg,
  });
  const employees = employeesQuery.data ?? [];

  const patch = (changes: Partial<Form>) =>
    setForm((prev) => (prev ? { ...prev, ...changes } : prev));

  const setRule = (inboxId: number, changes: Partial<ChatwootInboxMap[string]>) =>
    setForm((prev) => {
      if (!prev) return prev;
      const key = String(inboxId);
      const current = prev.inboxMap[key] ?? { source: "", identity: "phone" as const, channel: "" as const };
      return { ...prev, inboxMap: { ...prev.inboxMap, [key]: { ...current, ...changes } } };
    });

  const toggleInbox = (inbox: ChatwootInbox, on: boolean) =>
    setForm((prev) => {
      if (!prev) return prev;
      const key = String(inbox.id);
      const inboxMap = { ...prev.inboxMap };
      let inboxWhitelist = prev.inboxWhitelist.filter((id) => id !== inbox.id);
      if (on) {
        if (!inboxMap[key]) inboxMap[key] = suggestInboxRule(inbox);
        inboxWhitelist = [...inboxWhitelist, inbox.id];
      }
      return { ...prev, inboxMap, inboxWhitelist };
    });

  const runTest = async () => {
    setTestState({ kind: "busy" });
    try {
      const result = await testChatwootLeadConnection({
        chatwootApiToken: form?.apiToken || undefined,
        organizationId: orgId,
      });
      if (result.ok) {
        queryClient.setQueryData(
          ["django", "chatwoot", "lead-integration", "inboxes", orgId ?? null],
          result,
        );
        setTestState({ kind: "ok", count: result.inboxes.length });
      } else {
        setTestState({ kind: "failed", error: result.error ?? "" });
      }
    } catch (error) {
      setTestState({ kind: "failed", error: errorMessage(error, "") });
    }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setSaveError(null);
    try {
      const saved = await saveChatwootLeadSettings({
        enabled: form.enabled,
        chatwootApiToken: form.apiToken,
        chatwootApiTokenClear: form.apiTokenClear,
        pipelineCode: form.pipelineCode,
        reopenStageCode: form.reopenStageCode,
        defaultAssigneeId: form.defaultAssigneeId,
        inboxMap: form.inboxMap,
        inboxWhitelist: form.inboxWhitelist,
        organizationId: orgId,
      });
      queryClient.setQueryData(settingsKey, saved);
      setForm(toForm(saved));
      setSnack(t("chatwoot.savedSnack"));
    } catch (error) {
      setSaveError(errorMessage(error, t("chatwoot.saveButton")));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!window.confirm(t("chatwoot.webhook.rotateConfirm"))) return;
    setBusy(true);
    try {
      const result = await rotateChatwootLeadSecret({ organizationId: orgId });
      queryClient.setQueryData(settingsKey, (prev: ChatwootLeadSettings | undefined) =>
        prev ? { ...prev, webhookUrl: result.webhookUrl } : prev,
      );
      setSnack(t("chatwoot.webhook.rotated"));
    } catch (error) {
      setSaveError(errorMessage(error, t("chatwoot.webhook.rotate")));
    } finally {
      setBusy(false);
    }
  };

  const copyWebhook = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setSnack(t("chatwoot.webhook.copied"));
    } catch {
      window.prompt(t("chatwoot.webhook.copy"), url);
    }
  };

  const settings = settingsQuery.data;
  const accountMissing = settings != null && settings.accountId == null;

  // Строки таблицы: инбоксы из Chatwoot (если тянули) + уже сохранённые в карте,
  // даже если связь не проверяли — чтобы карта была видна и без сети.
  const rows: ChatwootInbox[] = React.useMemo(() => {
    const byId = new Map<number, ChatwootInbox>();
    for (const inbox of inboxes ?? []) byId.set(inbox.id, inbox);
    for (const key of Object.keys(form?.inboxMap ?? {})) {
      const id = Number(key);
      if (!byId.has(id)) byId.set(id, { id, name: `#${id}`, channelType: "", phoneNumber: null });
    }
    return [...byId.values()].sort((a, b) => a.id - b.id);
  }, [inboxes, form?.inboxMap]);

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            {t("chatwoot.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("chatwoot.description")}
          </Typography>
        </Box>

        {needsOrg && <Alert severity="info">{t("chatwoot.needsOrg")}</Alert>}

        {settingsQuery.error && !needsOrg && (
          <Alert severity="error">{errorMessage(settingsQuery.error, t("chatwoot.title"))}</Alert>
        )}

        {settingsQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {form && settings && (
          <>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.enabled}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                    disabled={busy}
                  />
                }
                label={t("chatwoot.enabled.label")}
              />
              <FormHelperText>{t("chatwoot.enabled.helper")}</FormHelperText>
            </Box>

            {/* Подключение */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t("chatwoot.connection.title")}
                </Typography>
                {accountMissing ? (
                  <Alert severity="warning">{t("chatwoot.connection.accountMissing")}</Alert>
                ) : (
                  <Typography variant="body2">
                    {t("chatwoot.connection.account", { id: settings.accountId })}
                  </Typography>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
                  <TextField
                    label={t("chatwoot.connection.tokenLabel")}
                    value={form.apiToken}
                    onChange={(e) => patch({ apiToken: e.target.value, apiTokenClear: false })}
                    type="password"
                    autoComplete="off"
                    size="small"
                    fullWidth
                    disabled={busy}
                    helperText={t("chatwoot.connection.tokenHelper")}
                  />
                  <Stack spacing={1} sx={{ minWidth: 220 }}>
                    <Button
                      variant="outlined"
                      onClick={runTest}
                      disabled={busy || testState.kind === "busy" || accountMissing}
                    >
                      {testState.kind === "busy" ? (
                        <CircularProgress size={18} />
                      ) : (
                        t("chatwoot.connection.testButton")
                      )}
                    </Button>
                    {settings.apiTokenConfigured && (
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={form.apiTokenClear}
                            onChange={(e) => patch({ apiTokenClear: e.target.checked, apiToken: "" })}
                            disabled={busy}
                          />
                        }
                        label={
                          <Typography variant="body2">{t("chatwoot.connection.tokenClear")}</Typography>
                        }
                      />
                    )}
                  </Stack>
                </Stack>
                {settings.apiTokenConfigured && !form.apiTokenClear && (
                  <Chip size="small" color="success" variant="outlined" label={t("chatwoot.connection.tokenConfigured")} />
                )}
                {testState.kind === "ok" && (
                  <Alert severity="success">
                    {t("chatwoot.connection.testOk", { count: testState.count })}
                  </Alert>
                )}
                {testState.kind === "failed" && (
                  <Alert severity="error">
                    {t("chatwoot.connection.testFailed", { error: testState.error })}
                  </Alert>
                )}
              </Stack>
            </Paper>

            {/* Вебхук */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t("chatwoot.webhook.title")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("chatwoot.webhook.description")}
                </Typography>
                {settings.webhookUrl ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      value={settings.webhookUrl}
                      size="small"
                      fullWidth
                      slotProps={{ input: { readOnly: true } }}
                      inputProps={{ "aria-label": t("chatwoot.webhook.title") }}
                    />
                    <Tooltip title={t("chatwoot.webhook.copy")}>
                      <IconButton onClick={() => copyWebhook(settings.webhookUrl)} aria-label={t("chatwoot.webhook.copy")}>
                        <ContentCopyOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Button size="small" color="warning" onClick={rotate} disabled={busy}>
                      {t("chatwoot.webhook.rotate")}
                    </Button>
                  </Stack>
                ) : (
                  <Alert severity="info">{t("chatwoot.webhook.notYet")}</Alert>
                )}
              </Stack>
            </Paper>

            {/* Инбоксы */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t("chatwoot.inboxes.title")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("chatwoot.inboxes.description")}
                </Typography>
                {inboxesQuery.isLoading && rows.length === 0 ? (
                  <Stack alignItems="center" py={2}>
                    <CircularProgress size={20} />
                  </Stack>
                ) : rows.length === 0 ? (
                  <Alert severity="info">
                    {inboxes === null ? t("chatwoot.inboxes.loadHint") : t("chatwoot.inboxes.empty")}
                  </Alert>
                ) : (
                  <Box sx={{ overflowX: "auto" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox">{t("chatwoot.inboxes.colEnabled")}</TableCell>
                          <TableCell>{t("chatwoot.inboxes.colInbox")}</TableCell>
                          <TableCell>{t("chatwoot.inboxes.colSource")}</TableCell>
                          <TableCell>{t("chatwoot.inboxes.colIdentity")}</TableCell>
                          <TableCell>{t("chatwoot.inboxes.colChannel")}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((inbox) => {
                          const rule = form.inboxMap[String(inbox.id)];
                          const on = form.inboxWhitelist.includes(inbox.id);
                          return (
                            <TableRow key={inbox.id} hover>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={on}
                                  onChange={(e) => toggleInbox(inbox, e.target.checked)}
                                  disabled={busy}
                                  inputProps={{ "aria-label": inbox.name }}
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">{inbox.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  #{inbox.id}
                                  {inbox.channelType ? ` · ${inbox.channelType.replace("Channel::", "")}` : ""}
                                  {inbox.phoneNumber ? ` · ${inbox.phoneNumber}` : ""}
                                </Typography>
                              </TableCell>
                              {rule ? (
                                <>
                                  <TableCell>
                                    <TextField
                                      size="small"
                                      value={rule.source}
                                      onChange={(e) => setRule(inbox.id, { source: e.target.value })}
                                      disabled={busy}
                                      sx={{ minWidth: 140 }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      size="small"
                                      value={rule.identity}
                                      onChange={(e) =>
                                        setRule(inbox.id, { identity: e.target.value as ChatwootInboxIdentity })
                                      }
                                      disabled={busy}
                                      sx={{ minWidth: 150 }}
                                    >
                                      {IDENTITIES.map((identity) => (
                                        <MenuItem key={identity} value={identity}>
                                          {t(`chatwoot.inboxes.identity.${identity}`)}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      size="small"
                                      value={rule.channel || "other"}
                                      onChange={(e) =>
                                        setRule(inbox.id, { channel: e.target.value as ChatwootInboxChannel })
                                      }
                                      disabled={busy}
                                      sx={{ minWidth: 130 }}
                                    >
                                      {CHANNELS.map((channel) => (
                                        <MenuItem key={channel} value={channel}>
                                          {t(`chatwoot.inboxes.channel.${channel}`)}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell colSpan={3}>
                                  <Typography variant="body2" color="text.secondary">
                                    {t("chatwoot.inboxes.unmapped")}
                                  </Typography>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                )}
                <FormHelperText>{t("chatwoot.inboxes.whitelistHint")}</FormHelperText>
              </Stack>
            </Paper>

            {/* Воронка */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t("chatwoot.funnel.title")}
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="cw-pipeline">{t("chatwoot.funnel.pipeline")}</InputLabel>
                    <Select
                      labelId="cw-pipeline"
                      label={t("chatwoot.funnel.pipeline")}
                      value={form.pipelineCode}
                      onChange={(e) => patch({ pipelineCode: String(e.target.value), reopenStageCode: "" })}
                      disabled={busy}
                    >
                      <MenuItem value="">{t("chatwoot.funnel.pipelineDefault")}</MenuItem>
                      {pipelines.filter((p) => codeOf(p)).map((p) => (
                        <MenuItem key={p.id} value={codeOf(p)}>
                          {p.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="cw-reopen">{t("chatwoot.funnel.reopenStage")}</InputLabel>
                    <Select
                      labelId="cw-reopen"
                      label={t("chatwoot.funnel.reopenStage")}
                      value={form.reopenStageCode}
                      onChange={(e) => patch({ reopenStageCode: String(e.target.value) })}
                      disabled={busy}
                    >
                      <MenuItem value="">{t("chatwoot.funnel.reopenDefault")}</MenuItem>
                      {openStages.filter((s) => codeOf(s)).map((s) => (
                        <MenuItem key={s.id} value={codeOf(s)}>
                          {s.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="cw-assignee">{t("chatwoot.funnel.assignee")}</InputLabel>
                    <Select
                      labelId="cw-assignee"
                      label={t("chatwoot.funnel.assignee")}
                      value={form.defaultAssigneeId ?? ""}
                      onChange={(e) =>
                        patch({ defaultAssigneeId: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      disabled={busy}
                    >
                      <MenuItem value="">{t("chatwoot.funnel.assigneeNone")}</MenuItem>
                      {employees.map((emp) => (
                        <MenuItem key={emp.id} value={emp.id}>
                          {emp.fullName}
                        </MenuItem>
                      ))}
                    </Select>
                    <FormHelperText>{t("chatwoot.funnel.assigneeHelper")}</FormHelperText>
                  </FormControl>
                </Stack>
              </Stack>
            </Paper>

            {saveError && (
              <Alert severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}

            <Box>
              <Button variant="contained" onClick={save} disabled={busy}>
                {t("chatwoot.saveButton")}
              </Button>
            </Box>
          </>
        )}
      </Stack>

      <Snackbar
        open={snack !== null}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </SettingsLayout>
  );
}
