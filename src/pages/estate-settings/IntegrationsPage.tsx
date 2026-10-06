import React from "react";
import { Alert, Box, Button, IconButton, Menu, MenuItem, Skeleton, Switch, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import relativeTime from "dayjs/plugin/relativeTime";
import AddOutlined from "@mui/icons-material/AddOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";

import {
  deleteWebhook,
  estateSettingsKeys,
  getConnectors,
  getIntegrationsSummary,
  getSyncQueue,
  getWebhooks,
  resolveQueueItem,
  retryAllQueue,
  retryQueueItem,
  rotateWebhookSecret,
  setConnectorEnabled,
  setWebhookActive,
  testConnector,
  testWebhook,
  type Connector,
  type QueueItem,
  type Webhook,
} from "../../api/estateSettings";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { errorMessage, useRefreshSettings, useSettingsCan } from "./hooks";
import { ConnectDrawer, DeliveriesDrawer, LogDrawer, SecretDialog, SyncDialog, WebhookDrawer } from "./IntegrationsForms";

type Tab = "connectors" | "queue" | "webhooks";
const TABS: Tab[] = ["connectors", "queue", "webhooks"];
const QUEUE_STATUSES = ["all", "pending", "error", "sent"] as const;
type QueueStatus = (typeof QUEUE_STATUSES)[number];

dayjs.extend(relativeTime);

const statusTone = (status: string) => (status === "ok" ? "success" : status === "warn" ? "warning" : null);
const when = (iso: string | null) => (iso ? dayjs(iso).format("DD.MM.YYYY HH:mm") : "—");

/**
 * «Интеграции и 1С» застройщика (AIVIO, гайд `frontend-settings.md` §4):
 * карточки коннекторов, очередь выгрузки в 1С, API и вебхуки. Чтение —
 * `integrations.view`, любая кнопка — `integrations.manage`. Внешних вызовов
 * у бэка нет (симуляция) — пишем об этом плашкой. «Маппинг», «Расписание»,
 * «API-ключи» макета API не имеют — не показываем.
 */
export default function EstateIntegrationsPage() {
  const { t } = useT("estateSettings");
  usePageTitle(t("integrations.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <IntegrationsScreen />
    </Box>
  );
}

function IntegrationsScreen() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "connectors";
  const [syncing, setSyncing] = React.useState<Connector | null>(null);
  const enabled = scope.orgReady !== false;
  const summary = useQuery({ queryKey: estateSettingsKeys.summary(scope), queryFn: ({ signal }) => getIntegrationsSummary(scope, signal), enabled, staleTime: 30_000 });
  const connectors = useQuery({ queryKey: estateSettingsKeys.connectors(scope), queryFn: ({ signal }) => getConnectors(scope, signal), enabled, staleTime: 30_000 });

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "connectors") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  if (summary.error) return <ScreenError error={summary.error} title={t("common.loadError")} onRetry={() => void summary.refetch()} />;
  const s = summary.data;
  const oneC = connectors.data?.find((c) => c.code === "1c") ?? null;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("integrations.subtitle")}</Typography>
        {perms.manage && oneC && oneC.status !== "off" && (
          <Button size="small" variant="contained" startIcon={<PlayArrowOutlined />} onClick={() => setSyncing(oneC)} sx={{ whiteSpace: "nowrap" }}>
            {t("integrations.sync.run1c")}
          </Button>
        )}
      </Box>
      <KpiCards
        items={
          s
            ? [
                { key: "connected", label: t("integrations.kpi.connected"), value: t("integrations.kpi.connectedValue", { count: s.connected, total: s.total }) },
                { key: "queue", label: t("integrations.kpi.queue"), value: String(s.queuePending), tone: s.queuePending > 0 ? "warning" : null },
                { key: "errors", label: t("integrations.kpi.errors"), value: String(s.queueErrors), tone: s.queueErrors > 0 ? "error" : null },
                { key: "lastSync", label: t("integrations.kpi.lastSync"), value: s.lastSync1C ? dayjs(s.lastSync1C).format("DD.MM HH:mm") : "—", hint: s.lastSync1C ? dayjs(s.lastSync1C).locale("ru").fromNow() : null },
              ]
            : null
        }
      />
      <Alert severity="info" sx={{ mb: 1.5 }}>
        {t("integrations.simulated")}
      </Alert>
      <Box sx={{ mb: 1.25 }}>
        <PillTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={TABS.map((key) => ({ key, label: t(`integrations.tabs.${key}`), count: key === "queue" ? (s ? s.queuePending + s.queueErrors : null) : key === "webhooks" ? (s?.webhooksActive ?? null) : null }))}
        />
      </Box>
      {tab === "connectors" ? (
        connectors.error ? (
          <ScreenError error={connectors.error} title={t("common.loadError")} onRetry={() => void connectors.refetch()} />
        ) : (
          <Connectors items={connectors.data ?? null} onSync={setSyncing} />
        )
      ) : tab === "queue" ? (
        <Queue errors={s?.queueErrors ?? 0} />
      ) : (
        <Webhooks />
      )}
      <SyncDialog connector={syncing} onClose={() => setSyncing(null)} />
    </>
  );
}

function Connectors({ items, onSync }: { items: Connector[] | null; onSync: (c: Connector) => void }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = React.useState<{ connector: Connector; mode: "connect" | "edit" } | null>(null);
  const [logFor, setLogFor] = React.useState<Connector | null>(null);
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; connector: Connector } | null>(null);
  const onError = (error: unknown) => enqueueSnackbar(errorMessage(error, t("common.failed")), { variant: "error" });
  const test = useMutation({
    mutationFn: (c: Connector) => testConnector(c.id, scope),
    onSuccess: (res) => {
      refresh();
      enqueueSnackbar(t(res.ok ? "integrations.card.testOk" : "integrations.card.testFail", { message: res.message }), { variant: res.ok ? "success" : "warning" });
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: ({ c, enabled }: { c: Connector; enabled: boolean }) => setConnectorEnabled(c.id, enabled, scope),
    onSuccess: (_, { enabled }) => {
      refresh();
      enqueueSnackbar(enabled ? t("integrations.card.enabled") : t("integrations.card.disabled"), { variant: "success" });
    },
    onError,
  });

  if (!items)
    return (
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={190} sx={{ borderRadius: "14px" }} />
        ))}
      </Box>
    );
  if (items.length === 0) return <EmptyNote text={t("common.empty")} />;

  return (
    <>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
        {items.map((c) => {
          const off = c.status === "off";
          return (
            <Box key={c.id} sx={{ ...cardSx, p: 2, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ mt: "7px", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: c.status === "ok" ? "success.main" : c.status === "warn" ? "warning.main" : "text.disabled" }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>{c.name}</Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{[c.typeLabel, c.schedule].filter(Boolean).join(" · ")}</Typography>
                </Box>
                <StatusPill label={t(`integrations.status.${c.status}`, { defaultValue: c.statusLabel || c.status })} tone={statusTone(c.status)} />
              </Box>
              {c.description && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{c.description}</Typography>}
              <Box sx={{ mt: "auto", display: "grid", gap: 0.25, fontSize: "0.8125rem" }}>
                <Typography sx={{ fontSize: "0.8125rem" }}>
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {t("integrations.card.lastSync")}:
                  </Box>{" "}
                  {when(c.lastSync)}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.8125rem" }}>
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {t("integrations.card.endpoint")}:
                  </Box>{" "}
                  {c.endpoint || t("integrations.card.notConfigured")}
                </Typography>
                {c.queuePending + c.queueErrors > 0 && (
                  <Typography sx={{ fontSize: "0.8125rem", color: c.queueErrors > 0 ? "error.main" : "warning.main" }}>{t("integrations.card.queue", { count: c.queuePending + c.queueErrors })}</Typography>
                )}
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", pt: 0.5 }}>
                {perms.manage && off ? (
                  <Button size="small" variant="contained" onClick={() => setForm({ connector: c, mode: "connect" })}>
                    {t("integrations.card.connect")}
                  </Button>
                ) : (
                  <>
                    {perms.manage && (
                      <Button size="small" variant="outlined" startIcon={<PlayArrowOutlined />} onClick={() => onSync(c)}>
                        {t("integrations.card.sync")}
                      </Button>
                    )}
                    <Button size="small" onClick={() => setLogFor(c)}>
                      {t("integrations.card.log")}
                    </Button>
                  </>
                )}
                {perms.manage && (
                  <IconButton size="small" aria-label={t("integrations.card.more")} onClick={(e) => setMenu({ anchor: e.currentTarget, connector: c })} sx={{ ml: "auto" }}>
                    <MoreVertOutlined fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Menu anchorEl={menu?.anchor} open={menu != null} onClose={() => setMenu(null)}>
        <MenuItem
          disabled={test.isPending}
          onClick={() => {
            if (menu) test.mutate(menu.connector);
            setMenu(null);
          }}
        >
          {t("integrations.card.test")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setForm({ connector: menu.connector, mode: "edit" });
            setMenu(null);
          }}
        >
          {t("integrations.card.settings")}
        </MenuItem>
        {menu?.connector.status === "off" && (
          <MenuItem
            onClick={() => {
              setLogFor(menu.connector);
              setMenu(null);
            }}
          >
            {t("integrations.card.log")}
          </MenuItem>
        )}
        <MenuItem
          disabled={toggle.isPending}
          onClick={() => {
            if (menu) toggle.mutate({ c: menu.connector, enabled: !menu.connector.enabled });
            setMenu(null);
          }}
        >
          {menu?.connector.enabled ? t("integrations.card.disable") : t("integrations.card.enable")}
        </MenuItem>
      </Menu>
      <ConnectDrawer connector={form?.connector ?? null} mode={form?.mode ?? "connect"} onClose={() => setForm(null)} />
      <LogDrawer connector={logFor} onClose={() => setLogFor(null)} />
    </>
  );
}

function Queue({ errors }: { errors: number }) {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [status, setStatus] = React.useState<QueueStatus>("all");
  const [search, setSearch] = React.useState("");
  const debounced = useDebouncedValue(search);
  const [resolving, setResolving] = React.useState<QueueItem | null>(null);
  const [note, setNote] = React.useState("");
  const params = React.useMemo(() => ({ status, search: debounced }), [status, debounced]);
  const queue = useQuery({ queryKey: estateSettingsKeys.queue(scope, params), queryFn: ({ signal }) => getSyncQueue(params, scope, signal), enabled: scope.orgReady !== false, staleTime: 15_000, placeholderData: keepPreviousData });
  const onError = (error: unknown) => enqueueSnackbar(errorMessage(error, t("common.failed")), { variant: "error" });
  const retryAll = useMutation({
    mutationFn: () => retryAllQueue(scope),
    onSuccess: (count) => {
      refresh();
      enqueueSnackbar(t("integrations.queue.retryAllDone", { count }), { variant: "success" });
    },
    onError,
  });
  const retry = useMutation({
    mutationFn: (item: QueueItem) => retryQueueItem(item.id, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("integrations.queue.retried"), { variant: "success" });
    },
    onError,
  });
  const resolve = useMutation({
    mutationFn: () => resolveQueueItem((resolving as QueueItem).id, note.trim() || t("integrations.queue.resolveNoteDefault"), scope),
    onSuccess: () => {
      setResolving(null);
      refresh();
      enqueueSnackbar(t("integrations.queue.resolved"), { variant: "success" });
    },
  });

  const rows = queue.data ?? [];
  const columns: GridColDef<QueueItem>[] = [
    { field: "ref", headerName: t("integrations.queue.object"), flex: 1.6, minWidth: 240, renderCell: ({ row }) => <TwoLines strong top={row.ref || row.number} bottom={row.number} /> },
    { field: "typeLabel", headerName: t("integrations.queue.type"), width: 140 },
    { field: "at", headerName: t("integrations.queue.created"), width: 150, valueFormatter: (value: string) => when(value || null) },
    {
      field: "status",
      headerName: t("integrations.queue.status"),
      flex: 1,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.75, minWidth: 0 }}>
          <StatusPill label={row.statusLabel} tone={row.status === "error" ? "error" : row.status === "sent" ? "success" : "warning"} />
          {row.status === "error" && row.error && <Typography sx={{ mt: 0.4, fontSize: "0.72rem", color: "error.main", whiteSpace: "normal" }}>{row.error}</Typography>}
          {row.attempts > 0 && <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{t("integrations.queue.attempts", { count: row.attempts })}</Typography>}
        </Box>
      ),
    },
    ...(perms.manage
      ? [
          {
            field: "actions",
            headerName: "",
            width: 220,
            sortable: false,
            renderCell: ({ row }: { row: QueueItem }) =>
              row.status === "error" ? (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", py: 0.5 }}>
                  <Button size="small" onClick={() => retry.mutate(row)} disabled={retry.isPending}>
                    {t("integrations.queue.retry")}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setNote(t("integrations.queue.resolveNoteDefault"));
                      resolve.reset();
                      setResolving(row);
                    }}
                  >
                    {t("integrations.queue.resolve")}
                  </Button>
                </Box>
              ) : null,
          } as GridColDef<QueueItem>,
        ]
      : []),
  ];

  return (
    <>
      <Box sx={{ mb: 1.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {QUEUE_STATUSES.map((key) => (
            <SubPill key={key} active={status === key} onClick={() => setStatus(key)} label={t(`integrations.queue.status_${key}`)} />
          ))}
        </Box>
        <Box sx={{ ml: { md: "auto" }, display: "flex", gap: 1, alignItems: "center", flex: { xs: "1 1 100%", md: "0 1 auto" }, flexWrap: { xs: "wrap", md: "nowrap" } }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t("integrations.queue.search")} />
          {perms.manage && errors > 0 && (
            <Button size="small" variant="outlined" startIcon={<ReplayOutlined />} disabled={retryAll.isPending} onClick={() => retryAll.mutate()} sx={{ whiteSpace: "nowrap" }}>
              {t("integrations.queue.retryAll")}
            </Button>
          )}
        </Box>
      </Box>
      {queue.error ? (
        <ScreenError error={queue.error} title={t("common.loadError")} onRetry={() => void queue.refetch()} />
      ) : (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          <DataGrid<QueueItem>
            rows={rows}
            columns={columns}
            loading={queue.isFetching && !queue.data}
            localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: status === "all" && !debounced ? t("common.empty") : t("common.emptyFiltered") }}
            getRowHeight={() => "auto"}
            disableRowSelectionOnClick
            disableColumnMenu
            autoHeight
            initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
            pageSizeOptions={[25, 50, 100]}
            sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
          />
        </Box>
      )}
      <ConfirmDialog
        open={resolving != null}
        title={t("integrations.queue.resolveTitle")}
        text={resolving ? [resolving.ref, resolving.error].filter(Boolean).join(" · ") : undefined}
        confirmLabel={t("integrations.queue.resolve")}
        busy={resolve.isPending}
        error={resolve.error}
        onConfirm={() => resolve.mutate()}
        onClose={() => setResolving(null)}
      >
        <TextField size="small" label={t("integrations.queue.resolveNote")} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    </>
  );
}

function Webhooks() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const perms = useSettingsCan();
  const refresh = useRefreshSettings();
  const { enqueueSnackbar } = useSnackbar();
  const [createOpen, setCreateOpen] = React.useState(false);
  // undefined — диалог закрыт; null — бэк секрет не вернул.
  const [secret, setSecret] = React.useState<string | null | undefined>(undefined);
  const [confirm, setConfirm] = React.useState<{ kind: "rotate" | "delete"; hook: Webhook } | null>(null);
  const [deliveriesFor, setDeliveriesFor] = React.useState<Webhook | null>(null);
  const hooks = useQuery({ queryKey: estateSettingsKeys.webhooks(scope), queryFn: ({ signal }) => getWebhooks(scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000 });
  const onError = (error: unknown) => enqueueSnackbar(errorMessage(error, t("common.failed")), { variant: "error" });
  const toggle = useMutation({
    mutationFn: (hook: Webhook) => setWebhookActive(hook.id, !hook.active, scope),
    onSuccess: (hook) => {
      refresh();
      enqueueSnackbar(hook.active ? t("integrations.webhooks.toggledOn") : t("integrations.webhooks.toggledOff"), { variant: "success" });
    },
    onError,
  });
  const test = useMutation({
    mutationFn: (hook: Webhook) => testWebhook(hook.id, scope),
    onSuccess: (delivery) => {
      refresh();
      enqueueSnackbar(t("integrations.webhooks.tested", { status: [t(`integrations.webhooks.delivery_${delivery.status}`, { defaultValue: delivery.status }), delivery.simulated ? t("integrations.webhooks.simulated") : null].filter(Boolean).join(", ") }), { variant: "success" });
    },
    onError,
  });
  const confirmAction = useMutation({
    mutationFn: async ({ kind, hook }: { kind: "rotate" | "delete"; hook: Webhook }) => (kind === "rotate" ? rotateWebhookSecret(hook.id, scope) : deleteWebhook(hook.id, scope).then(() => undefined)),
    onSuccess: (result, { kind }) => {
      setConfirm(null);
      refresh();
      if (kind === "rotate") setSecret(result ?? null);
      else enqueueSnackbar(t("integrations.webhooks.deleted"), { variant: "success" });
    },
  });

  return (
    <>
      {perms.manage && (
        <Box sx={{ mb: 1.25, display: "flex", justifyContent: "flex-end" }}>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)}>
            {t("integrations.webhooks.new")}
          </Button>
        </Box>
      )}
      {hooks.error ? (
        <ScreenError error={hooks.error} title={t("common.loadError")} onRetry={() => void hooks.refetch()} />
      ) : (
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          {!hooks.data ? (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="rounded" height={160} />
            </Box>
          ) : hooks.data.length === 0 ? (
            <EmptyNote text={t("integrations.webhooks.empty")} />
          ) : (
            hooks.data.map((h) => (
              <Box key={h.id} sx={{ px: 2.25, py: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                <Box sx={{ flex: "1 1 280px", minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, wordBreak: "break-all" }}>
                    <Box component="span" sx={{ color: "text.secondary", fontWeight: 600, mr: 1 }}>
                      {h.number}
                    </Box>
                    {h.url}
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                    {[h.events.join(", "), h.description, h.lastDeliveryAt ? `${t("integrations.webhooks.lastDelivery")}: ${when(h.lastDeliveryAt)}${h.lastDeliveryStatus ? ` · ${t(`integrations.webhooks.delivery_${h.lastDeliveryStatus}`, { defaultValue: h.lastDeliveryStatus })}` : ""}` : null].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  <Switch size="small" checked={h.active} disabled={!perms.manage || toggle.isPending} onChange={() => toggle.mutate(h)} inputProps={{ "aria-label": t("integrations.webhooks.active") }} />
                  <Button size="small" onClick={() => setDeliveriesFor(h)}>
                    {t("integrations.webhooks.deliveries")}
                  </Button>
                  {perms.manage && (
                    <>
                      <Button size="small" onClick={() => test.mutate(h)} disabled={test.isPending}>
                        {t("integrations.webhooks.test")}
                      </Button>
                      <Button size="small" onClick={() => setConfirm({ kind: "rotate", hook: h })}>
                        {t("integrations.webhooks.rotate")}
                      </Button>
                      <Button size="small" color="error" onClick={() => setConfirm({ kind: "delete", hook: h })}>
                        {t("integrations.webhooks.delete")}
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            ))
          )}
        </Box>
      )}
      <WebhookDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(hook) => {
          enqueueSnackbar(t("integrations.webhooks.created"), { variant: "success" });
          setSecret(hook.secret);
        }}
      />
      <SecretDialog secret={secret} onClose={() => setSecret(undefined)} />
      <DeliveriesDrawer hook={deliveriesFor} onClose={() => setDeliveriesFor(null)} />
      <ConfirmDialog
        open={confirm != null}
        title={confirm?.kind === "delete" ? t("integrations.webhooks.deleteTitle", { number: confirm.hook.number }) : t("integrations.webhooks.rotateTitle")}
        text={confirm?.kind === "delete" ? t("integrations.webhooks.deleteText", { url: confirm.hook.url }) : t("integrations.webhooks.rotateText")}
        confirmLabel={confirm?.kind === "delete" ? t("integrations.webhooks.delete") : t("integrations.webhooks.rotate")}
        danger={confirm?.kind === "delete"}
        busy={confirmAction.isPending}
        error={confirmAction.error}
        onConfirm={() => confirm && confirmAction.mutate(confirm)}
        onClose={() => {
          setConfirm(null);
          confirmAction.reset();
        }}
      />
    </>
  );
}
