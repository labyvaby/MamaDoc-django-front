import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  LinearProgress,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import RadioButtonUncheckedOutlined from "@mui/icons-material/RadioButtonUncheckedOutlined";

import {
  connectConnector,
  createWebhook,
  estateSettingsKeys,
  getConnectorLog,
  getWebhookDeliveries,
  getWebhookEvents,
  splitEvents,
  syncConnector,
  updateConnector,
  type Connector,
  type Webhook,
} from "../../api/estateSettings";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { EmptyNote, FormDrawer } from "../realty-finance/shared";
import { useRefreshSettings } from "./hooks";

const URL_RE = /^https?:\/\/\S+$/i;

/** «Подключить» (`/connect/`) или «Настройки» (`PATCH`, токен — в `secrets`, пустой — не меняем). */
export function ConnectDrawer({ connector, mode, onClose }: { connector: Connector | null; mode: "connect" | "edit"; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [endpoint, setEndpoint] = React.useState("");
  const [login, setLogin] = React.useState("");
  const [token, setToken] = React.useState("");
  const [schedule, setSchedule] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const open = connector != null;
  const edit = mode === "edit";
  const secretKey = connector?.secretFields[0] ?? "token";
  const save = useMutation({
    mutationFn: () => {
      const c = connector as Connector;
      if (!edit) return connectConnector(c.id, { endpoint, login, token }, scope);
      const body: { endpoint?: string; login?: string; schedule?: string; secrets?: Record<string, string> } = { endpoint: endpoint.trim(), login: login.trim(), schedule: schedule.trim() };
      if (token) body.secrets = { [secretKey]: token };
      return updateConnector(c.id, body, scope);
    },
    onSuccess: () => {
      refresh();
      enqueueSnackbar(edit ? t("integrations.connect.saved") : t("integrations.connect.done"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!connector) return;
    setEndpoint(connector.endpoint);
    setLogin(connector.login);
    setSchedule(connector.schedule);
    setToken("");
    setTouched(false);
    save.reset();
  }, [connector?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps -- значения берём при открытии
  const needToken = !edit && !connector?.hasSecrets;
  return (
    <FormDrawer
      open={open}
      title={t(edit ? "integrations.connect.editTitle" : "integrations.connect.title", { name: connector?.name ?? "" })}
      submitLabel={edit ? t("integrations.connect.saveEdit") : t("integrations.connect.save")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!endpoint.trim() || (needToken && !token)) return;
        save.mutate();
      }}
    >
      {connector?.description && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{connector.description}</Typography>}
      <TextField size="small" label={t("integrations.connect.endpoint")} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} error={touched && !endpoint.trim()} helperText={touched && !endpoint.trim() ? t("common.required") : undefined} />
      <TextField size="small" label={t("integrations.connect.login")} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
      <TextField
        size="small"
        type="password"
        label={t("integrations.connect.token")}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        autoComplete="new-password"
        error={touched && needToken && !token}
        helperText={touched && needToken && !token ? t("common.required") : connector?.hasSecrets ? t("integrations.connect.tokenKeep") : undefined}
      />
      {edit && <TextField size="small" label={t("integrations.connect.schedule")} value={schedule} onChange={(e) => setSchedule(e.target.value)} />}
    </FormDrawer>
  );
}

const SYNC_STEPS = ["prepare", "send", "docs", "finish"] as const;

/**
 * «▶ Обмен»: шаги рисует фронт (гайд §4.2), пока идёт `POST /sync/`; по ответу —
 * тост с числом выгруженного и закрытие.
 */
export function SyncDialog({ connector, onClose }: { connector: Connector | null; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [step, setStep] = React.useState(0);
  const sync = useMutation({
    mutationFn: (id: number) => syncConnector(id, scope),
    onSuccess: (res) => {
      setStep(SYNC_STEPS.length);
      refresh();
      enqueueSnackbar(t("integrations.sync.done", { count: res.exported, docs: res.documentsExported }), { variant: "success" });
      onClose();
    },
  });
  const { mutate, reset } = sync;
  // Обмен — мутация на бэке: запускаем ровно один раз на открытие, даже если объект коннектора пересоздастся при перезапросе.
  const startedFor = React.useRef<number | null>(null);
  const id = connector?.id ?? null;
  React.useEffect(() => {
    if (id == null) {
      startedFor.current = null;
      return;
    }
    if (startedFor.current === id) return;
    startedFor.current = id;
    setStep(0);
    reset();
    mutate(id);
  }, [id, mutate, reset]);
  React.useEffect(() => {
    if (!sync.isPending) return;
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, SYNC_STEPS.length - 1)), 700);
    return () => window.clearInterval(timer);
  }, [sync.isPending]);
  return (
    <Dialog open={connector != null} onClose={sync.isPending ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 420 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("integrations.sync.title", { name: connector?.name ?? "" })}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1 }}>
        {sync.isPending && <LinearProgress />}
        {SYNC_STEPS.map((key, i) => (
          <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 1, color: i <= step ? "text.primary" : "text.disabled" }}>
            {i < step || step === SYNC_STEPS.length ? <CheckCircleOutlined sx={{ fontSize: 18, color: "success.main" }} /> : <RadioButtonUncheckedOutlined sx={{ fontSize: 18 }} />}
            <Typography sx={{ fontSize: "0.875rem" }}>{t(`integrations.sync.steps.${key}`)}</Typography>
          </Box>
        ))}
        {sync.error && <Alert severity="error">{sync.error instanceof Error ? sync.error.message : t("common.failed")}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={sync.isPending}>
          {t("common.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SideDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useT("estateSettings");
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 440 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
          {title}
        </Typography>
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", alignContent: "start" }}>{children}</Box>
    </Drawer>
  );
}

/** «Журнал» коннектора: таймлайн, `ok: false` — красная точка. */
export function LogDrawer({ connector, onClose }: { connector: Connector | null; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const id = connector?.id ?? 0;
  const log = useQuery({ queryKey: estateSettingsKeys.connectorLog(scope, id), queryFn: ({ signal }) => getConnectorLog(id, scope, signal), enabled: connector != null, staleTime: 15_000 });
  return (
    <SideDrawer open={connector != null} title={t("integrations.log.title", { name: connector?.name ?? "" })} onClose={onClose}>
      {log.error ? (
        <Alert severity="error" sx={{ m: 2 }}>
          {log.error instanceof Error ? log.error.message : t("common.loadError")}
        </Alert>
      ) : !log.data ? (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={200} />
        </Box>
      ) : log.data.length === 0 ? (
        <EmptyNote text={t("integrations.log.empty")} />
      ) : (
        log.data.map((e) => (
          <Box key={e.id} sx={{ px: 2.5, py: 1.25, display: "flex", gap: 1.25, borderBottom: 1, borderColor: "divider" }}>
            <Box sx={{ mt: "6px", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: e.ok ? "success.main" : "error.main" }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{e.title || e.kindLabel}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {[e.at && dayjs(e.at).format("DD.MM.YYYY HH:mm"), e.kindLabel, e.userName].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
          </Box>
        ))
      )}
    </SideDrawer>
  );
}

/** «＋ Вебхук»: события — из `/webhooks/events/`, иначе свободным текстом через запятую. Ответ несёт секрет — показать один раз. */
export function WebhookDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (hook: Webhook) => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const refresh = useRefreshSettings();
  const events = useQuery({ queryKey: estateSettingsKeys.webhookEvents(scope), queryFn: ({ signal }) => getWebhookEvents(scope, signal), enabled: open, staleTime: 10 * 60_000, retry: false });
  const [url, setUrl] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [eventsText, setEventsText] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const options = events.data ?? [];
  const freeText = events.isError || (events.data != null && options.length === 0);
  const chosen = freeText ? splitEvents(eventsText) : picked;
  const save = useMutation({
    mutationFn: () => createWebhook({ url: url.trim(), events: chosen, ...(description.trim() ? { description: description.trim() } : {}) }, scope),
    onSuccess: (hook) => {
      refresh();
      onClose();
      onCreated(hook);
    },
  });
  React.useEffect(() => {
    if (!open) return;
    setUrl("");
    setPicked([]);
    setEventsText("");
    setDescription("");
    setTouched(false);
    save.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const badUrl = !URL_RE.test(url.trim());
  const labelOf = (code: string) => options.find((o) => o.code === code)?.label ?? code;
  return (
    <FormDrawer
      open={open}
      title={t("integrations.webhooks.newTitle")}
      submitLabel={t("integrations.webhooks.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (badUrl || chosen.length === 0) return;
        save.mutate();
      }}
    >
      <TextField
        size="small"
        label={t("integrations.webhooks.url")}
        placeholder={t("integrations.webhooks.urlHint")}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        error={touched && badUrl}
        helperText={touched && badUrl ? t("integrations.webhooks.badUrl") : undefined}
      />
      {freeText ? (
        <TextField
          size="small"
          label={t("integrations.webhooks.events")}
          value={eventsText}
          onChange={(e) => setEventsText(e.target.value)}
          error={touched && chosen.length === 0}
          helperText={touched && chosen.length === 0 ? t("integrations.webhooks.eventsRequired") : t("integrations.webhooks.eventsHint")}
        />
      ) : (
        <Autocomplete
          multiple
          openOnFocus
          size="small"
          loading={events.isLoading}
          options={options.map((o) => o.code)}
          value={picked}
          onChange={(_, value) => setPicked(value)}
          getOptionLabel={(code) => (labelOf(code) === code ? code : `${labelOf(code)} · ${code}`)}
          renderTags={(value, getTagProps) => value.map((code, index) => <Chip {...getTagProps({ index })} key={code} size="small" label={labelOf(code)} />)}
          renderInput={(params) => (
            <TextField {...params} label={t("integrations.webhooks.events")} error={touched && chosen.length === 0} helperText={touched && chosen.length === 0 ? t("integrations.webhooks.eventsRequired") : undefined} />
          )}
        />
      )}
      <TextField size="small" label={t("integrations.webhooks.description")} value={description} onChange={(e) => setDescription(e.target.value)} />
    </FormDrawer>
  );
}

/** Секрет вебхука — один раз, с копированием. */
export function SecretDialog({ secret, onClose }: { secret: string | null | undefined; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const { enqueueSnackbar } = useSnackbar();
  return (
    <Dialog open={secret !== undefined} onClose={onClose} fullWidth PaperProps={{ sx: { maxWidth: 460 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("integrations.webhooks.secretTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5 }}>
        <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t("integrations.webhooks.secretText")}</Typography>
        {secret ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.25, border: 1, borderColor: "divider", borderRadius: "8px" }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: "0.8125rem", wordBreak: "break-all" }}>{secret}</Typography>
            <IconButton
              aria-label={t("common.copy")}
              onClick={() =>
                void navigator.clipboard
                  .writeText(secret)
                  .then(() => enqueueSnackbar(t("common.copied"), { variant: "success" }))
                  .catch(() => enqueueSnackbar(t("common.failed"), { variant: "error" }))
              }
            >
              <ContentCopyOutlined fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Alert severity="warning">{t("integrations.webhooks.secretNone")}</Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose}>
          {t("common.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Журнал доставок вебхука. */
export function DeliveriesDrawer({ hook, onClose }: { hook: Webhook | null; onClose: () => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const id = hook?.id ?? 0;
  const deliveries = useQuery({ queryKey: estateSettingsKeys.deliveries(scope, id), queryFn: ({ signal }) => getWebhookDeliveries(id, scope, signal), enabled: hook != null, staleTime: 15_000 });
  return (
    <SideDrawer open={hook != null} title={t("integrations.webhooks.deliveriesTitle", { number: hook?.number ?? "" })} onClose={onClose}>
      {deliveries.error ? (
        <Alert severity="error" sx={{ m: 2 }}>
          {deliveries.error instanceof Error ? deliveries.error.message : t("common.loadError")}
        </Alert>
      ) : !deliveries.data ? (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={200} />
        </Box>
      ) : deliveries.data.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        deliveries.data.map((d) => (
          <Box key={d.id} sx={{ px: 2.5, py: 1.25, display: "flex", alignItems: "center", gap: 1.25, borderBottom: 1, borderColor: "divider" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{d.event || "—"}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {[d.at && dayjs(d.at).format("DD.MM.YYYY HH:mm"), d.responseCode != null ? `HTTP ${d.responseCode}` : null, d.simulated ? t("integrations.webhooks.simulated") : null].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            <StatusPill label={d.status ? t(`integrations.webhooks.delivery_${d.status}`, { defaultValue: d.status }) : "—"} tone={d.status === "delivered" ? "success" : d.status === "failed" || d.status === "error" ? "error" : "warning"} />
          </Box>
        ))
      )}
    </SideDrawer>
  );
}
