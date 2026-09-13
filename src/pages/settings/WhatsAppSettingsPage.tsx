import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Link,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import SyncOutlined from "@mui/icons-material/SyncOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import { Link as RouterLink } from "react-router";
import dayjs from "dayjs";

import { ApiError } from "../../api/client";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";
import {
  bindWhatsAppConnection,
  getRavenConnections,
  getWhatsAppSettings,
  syncWhatsAppTemplates,
  type RavenConnection,
  type WhatsAppConnectionInfo,
  type WhatsAppConnectionStatus,
  type WhatsAppSettings,
  type WhatsAppTemplate,
} from "../../api/whatsapp";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { WhatsAppTemplateBody } from "../../components/whatsapp/WhatsAppTemplateBody";
import { WhatsAppTemplateStatusChip } from "../../components/whatsapp/WhatsAppTemplateStatusChip";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";
import { SETTINGS_TAB_PERMISSIONS } from "../../config/accessPermissions";
import { SettingsLayout } from "./SettingsLayout";

const formatAt = (value: string | null | undefined): string =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";

/**
 * «Настройки → WhatsApp»: подключение организации к Raven и каталог её
 * шаблонов.
 *
 * Здесь ничего не сочиняют: шаблоны создаются и проходят модерацию в
 * WhatsApp Manager, Raven импортирует их из Meta, CRM хранит зеркало. Экран
 * отвечает на три вопроса — с какого номера уходят сообщения, можно ли
 * вообще отправлять, и какие шаблоны доступны конструктору автоматизаций и
 * почему остальные — нет. Привязка к подключению — платформенная операция
 * и показывается только суперадмину: токена Meta у CRM нет.
 */
const WhatsAppSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("whatsapp.pageTitle"));
  const queryClient = useQueryClient();

  const canView = useCan(SETTINGS_TAB_PERMISSIONS.whatsapp);
  const { loading: permLoading, isSuperAdmin } = usePermissions();
  const isSuper = isSuperAdmin();
  const { organizationId, orgReady, isReady } = useActiveScope();
  const enabled = isReady && orgReady && canView;

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [syncError, setSyncError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.whatsapp.settings(organizationId ?? null),
    queryFn: ({ signal }) => getWhatsAppSettings({ organizationId }, signal),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 404, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  /** Ответ обновления/привязки — тот же экран целиком: кладём в кэш как есть. */
  const applySettings = (data: WhatsAppSettings) => {
    queryClient.setQueryData(djangoQueryKeys.whatsapp.settings(organizationId ?? null), data);
    // Конструктор автоматизаций читает то же зеркало через свой каталог.
    queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.automations.catalog(organizationId ?? null),
    });
  };

  const syncMutation = useMutation({
    mutationFn: () => syncWhatsAppTemplates({ organizationId }),
    onSuccess: (data) => {
      setSyncError(null);
      applySettings(data);
      setMessage({ type: "success", text: t("whatsapp.sync.success") });
    },
    onError: (err) => {
      // 502 RAVEN_UNAVAILABLE несёт причину Raven — она важнее общего тоста,
      // поэтому остаётся на экране, пока не пройдёт следующее обновление.
      const text = err instanceof Error ? err.message : t("whatsapp.sync.error");
      setSyncError(text);
      setMessage({ type: "error", text });
    },
  });

  const settings = settingsQuery.data;
  const templates = useMemo(() => settings?.templates ?? [], [settings]);
  const needsOrg = isReady && !orgReady;

  if (!permLoading && !canView) {
    return (
      <SettingsLayout>
        <AccessDenied />
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Box>
            <Typography variant="h5" fontWeight={700} gutterBottom>
              {t("whatsapp.pageTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("whatsapp.subtitle")}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={
              syncMutation.isPending ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <SyncOutlined />
              )
            }
            onClick={() => syncMutation.mutate()}
            disabled={!settings?.connection.configured || syncMutation.isPending}
            sx={{ flexShrink: 0 }}
          >
            {t("whatsapp.sync.button")}
          </Button>
        </Stack>

        {needsOrg ? (
          <Alert severity="info">{t("whatsapp.needsOrg")}</Alert>
        ) : settingsQuery.isError ? (
          <Alert severity="error">
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : t("whatsapp.loadError")}
          </Alert>
        ) : settingsQuery.isLoading || !settings ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <ConnectionCard
              connection={settings.connection}
              syncError={settings.syncError}
              isSuper={isSuper}
              organizationId={settings.organizationId}
              onBound={(data) => {
                applySettings(data);
                setMessage({
                  type: data.syncError ? "error" : "success",
                  text: data.syncError
                    ? t("whatsapp.bind.boundWithSyncError", { error: data.syncError })
                    : t("whatsapp.bind.success"),
                });
              }}
            />

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {t("whatsapp.templates.title")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settings.hint || t("whatsapp.templates.hint")}
                  </Typography>
                </Box>
                <Alert severity="info">{t("whatsapp.templates.supportNote")}</Alert>

                {syncError && <Alert severity="error">{syncError}</Alert>}
                {settings.syncResult && Object.keys(settings.syncResult).length > 0 && (
                  <Alert severity="success">
                    {t("whatsapp.sync.result", {
                      seen: settings.syncResult.templatesSeen ?? 0,
                      created: settings.syncResult.created ?? 0,
                      updated: settings.syncResult.updated ?? 0,
                      removed: settings.syncResult.removed ?? 0,
                    })}
                  </Alert>
                )}

                {!settings.connection.configured ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("whatsapp.templates.noConnection")}
                  </Typography>
                ) : templates.length === 0 ? (
                  <Paper variant="outlined" sx={{ borderRadius: 2, py: 6, textAlign: "center" }}>
                    <Stack alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
                      <WhatsApp fontSize="large" />
                      <Typography fontWeight={600}>{t("whatsapp.templates.empty")}</Typography>
                      <Typography variant="body2">{t("whatsapp.templates.emptyHint")}</Typography>
                    </Stack>
                  </Paper>
                ) : (
                  <TemplatesTable templates={templates} />
                )}

                <Typography variant="caption" color="text.secondary">
                  {t("whatsapp.templates.lastSync", {
                    when: formatAt(settings.connection.templatesSyncedAt),
                  })}
                  {" · "}
                  <Link component={RouterLink} to="/settings/automations">
                    {t("whatsapp.templates.automationsLink")}
                  </Link>
                </Typography>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>

      <Snackbar
        open={message != null}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={message?.type ?? "info"}
          sx={{ width: "100%" }}
        >
          {message?.text}
        </Alert>
      </Snackbar>
    </SettingsLayout>
  );
};

// ── Подключение ──────────────────────────────────────────────────────────────

interface ConnectionCardProps {
  connection: WhatsAppConnectionInfo;
  /** Ошибка первого синка после привязки — приходит вместе с экраном. */
  syncError: string;
  isSuper: boolean;
  organizationId: number;
  onBound: (data: WhatsAppSettings) => void;
}

/**
 * Карточка подключения: номер отправителя, состояние и подробности из Raven.
 *
 * «Подключено» — только когда всё сходится: привязка включена, Raven отвечает
 * `active`, номер в Raven помечен этой же организацией. Любое расхождение
 * показывается фразой с бэка (`problemLabel`) — той же, что увидит
 * конструктор при попытке активировать правило.
 */
const ConnectionCard: React.FC<ConnectionCardProps> = ({
  connection,
  syncError,
  isSuper,
  organizationId,
  onBound,
}) => {
  const { t } = useT("settings");
  const [bindOpen, setBindOpen] = useState(false);

  const details: { label: string; value: React.ReactNode }[] = connection.configured
    ? [
        { label: t("whatsapp.connection.verifiedName"), value: connection.verifiedName || "—" },
        { label: t("whatsapp.connection.wabaId"), value: connection.wabaId || "—" },
        { label: t("whatsapp.connection.ravenStatus"), value: connection.ravenStatus || "—" },
        {
          label: t("whatsapp.connection.qualityRating"),
          value: connection.qualityRating || "—",
        },
        { label: t("whatsapp.connection.checkedAt"), value: formatAt(connection.ravenCheckedAt) },
        { label: t("whatsapp.connection.syncedAt"), value: formatAt(connection.syncedAt) },
        {
          label: t("whatsapp.connection.ravenConnectionId"),
          value: (
            <Typography component="span" variant="body2" sx={{ fontFamily: "monospace" }}>
              {connection.ravenConnectionId || "—"}
            </Typography>
          ),
        },
        {
          label: t("whatsapp.connection.localStatus"),
          value: t(`whatsapp.connection.status.${connection.status ?? "active"}`, {
            defaultValue: connection.status ?? "—",
          }),
        },
      ]
    : [];

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <WhatsApp color={connection.usable ? "success" : "disabled"} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
            {t("whatsapp.connection.title")}
          </Typography>
          {connection.configured ? (
            <Tooltip title={connection.problemLabel || t("whatsapp.connection.usableHint")}>
              <Chip
                size="small"
                label={
                  connection.usable
                    ? t("whatsapp.connection.usable")
                    : t("whatsapp.connection.notUsable")
                }
                color={connection.usable ? "success" : "warning"}
                sx={{ fontWeight: 600 }}
              />
            </Tooltip>
          ) : (
            <Chip
              size="small"
              label={t("whatsapp.connection.notConfigured")}
              color="default"
              sx={{ fontWeight: 600 }}
            />
          )}
        </Stack>

        {!connection.configured ? (
          <Alert severity="info">{t("whatsapp.connection.notConfiguredText")}</Alert>
        ) : (
          <>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("whatsapp.connection.senderPhone")}
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {connection.displayPhoneNumber || t("whatsapp.connection.phoneUnknown")}
              </Typography>
            </Box>

            {!connection.usable && connection.problemLabel && (
              <Alert severity="warning">{connection.problemLabel}</Alert>
            )}
            {connection.ravenLastError && (
              <Alert severity="warning">
                {t("whatsapp.connection.ravenLastError")}: {connection.ravenLastError}
              </Alert>
            )}
            {(syncError || connection.lastSyncError) && (
              <Alert severity="error">
                {t("whatsapp.connection.lastSyncError")}: {syncError || connection.lastSyncError}
              </Alert>
            )}

            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
              }}
            >
              {details.map((item) => (
                <Box key={item.label}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {item.label}
                  </Typography>
                  <Typography variant="body2">{item.value}</Typography>
                </Box>
              ))}
            </Box>
          </>
        )}

        {/* Привязка — только суперадмину: подключение заведено в Raven
            оператором платформы, и он же говорит, чьё оно. Администратор
            клиники видит номер и статус, но перевесить организацию на другой
            номер не может. */}
        {isSuper && (
          <Box>
            <Button
              size="small"
              startIcon={<LinkOutlined />}
              onClick={() => setBindOpen((open) => !open)}
            >
              {connection.configured
                ? t("whatsapp.bind.change")
                : t("whatsapp.bind.open")}
            </Button>
            <Collapse in={bindOpen} unmountOnExit>
              <BindSection
                connection={connection}
                organizationId={organizationId}
                onBound={(data) => {
                  setBindOpen(false);
                  onBound(data);
                }}
              />
            </Collapse>
          </Box>
        )}
      </Stack>
    </Paper>
  );
};

// ── Привязка (superadmin) ────────────────────────────────────────────────────

interface BindSectionProps {
  connection: WhatsAppConnectionInfo;
  organizationId: number;
  onBound: (data: WhatsAppSettings) => void;
}

const BindSection: React.FC<BindSectionProps> = ({ connection, organizationId, onBound }) => {
  const { t } = useT("settings");
  const [ravenConnectionId, setRavenConnectionId] = useState(connection.ravenConnectionId ?? "");
  const [status, setStatus] = useState<WhatsAppConnectionStatus>(
    connection.status === "disabled" ? "disabled" : "active",
  );
  const [error, setError] = useState<string | null>(null);

  const connectionsQuery = useQuery({
    queryKey: djangoQueryKeys.whatsapp.ravenConnections,
    queryFn: ({ signal }) => getRavenConnections(signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    retry: false,
  });

  const bindMutation = useMutation({
    mutationFn: () =>
      bindWhatsAppConnection({
        ravenConnectionId: ravenConnectionId.trim(),
        status,
        organizationId,
      }),
    onSuccess: (data) => {
      setError(null);
      onBound(data);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("whatsapp.bind.error"));
    },
  });

  const rows = connectionsQuery.data ?? [];
  const selected = rows.find((row) => row.id === ravenConnectionId);
  // Номер в Raven помечен другой организацией: привязать можно, но отправка
  // упадёт на ORGANIZATION_MISMATCH — предупреждаем до нажатия.
  const marksAnotherOrg =
    selected?.externalOrganizationId != null &&
    selected.externalOrganizationId !== "" &&
    selected.externalOrganizationId !== String(organizationId);

  const optionLabel = (row: RavenConnection): string =>
    [row.displayPhoneNumber, row.verifiedName || row.displayName]
      .filter(Boolean)
      .join(" · ") || row.id;

  return (
    <Stack spacing={1.5} sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
      <Typography variant="body2" color="text.secondary">
        {t("whatsapp.bind.hint", { organizationId })}
      </Typography>

      {connectionsQuery.isError && (
        <Alert severity="error">
          {connectionsQuery.error instanceof Error
            ? connectionsQuery.error.message
            : t("whatsapp.bind.listError")}
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
        <TextField
          select
          size="small"
          label={t("whatsapp.bind.connectionLabel")}
          value={rows.some((row) => row.id === ravenConnectionId) ? ravenConnectionId : ""}
          onChange={(e) => setRavenConnectionId(e.target.value)}
          disabled={connectionsQuery.isLoading || bindMutation.isPending}
          helperText={
            connectionsQuery.isLoading
              ? t("whatsapp.bind.loading")
              : rows.length === 0
                ? t("whatsapp.bind.noConnections")
                : undefined
          }
          sx={{ minWidth: 320, flex: 1 }}
        >
          {rows.map((row) => {
            const takenElsewhere =
              row.boundOrganizationId != null && row.boundOrganizationId !== organizationId;
            return (
              <MenuItem key={row.id} value={row.id} disabled={takenElsewhere}>
                <Stack spacing={0.25}>
                  <Typography variant="body2">{optionLabel(row)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.status ?? "—"}
                    {row.externalOrganizationId
                      ? ` · ${t("whatsapp.bind.markedFor", { id: row.externalOrganizationId })}`
                      : ` · ${t("whatsapp.bind.unmarked")}`}
                    {takenElsewhere
                      ? ` · ${t("whatsapp.bind.takenBy", { id: row.boundOrganizationId })}`
                      : ""}
                  </Typography>
                </Stack>
              </MenuItem>
            );
          })}
        </TextField>

        <TextField
          select
          size="small"
          label={t("whatsapp.bind.statusLabel")}
          value={status}
          onChange={(e) => setStatus(e.target.value as WhatsAppConnectionStatus)}
          disabled={bindMutation.isPending}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="active">{t("whatsapp.connection.status.active")}</MenuItem>
          <MenuItem value="disabled">{t("whatsapp.connection.status.disabled")}</MenuItem>
        </TextField>
      </Stack>

      {marksAnotherOrg && (
        <Alert severity="warning">
          {t("whatsapp.bind.mismatchWarning", {
            marked: selected?.externalOrganizationId ?? "",
            organizationId,
          })}
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      <Box>
        <Button
          variant="contained"
          size="small"
          startIcon={
            bindMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <LinkOutlined />
          }
          onClick={() => bindMutation.mutate()}
          disabled={!ravenConnectionId.trim() || bindMutation.isPending}
        >
          {t("whatsapp.bind.submit")}
        </Button>
      </Box>
    </Stack>
  );
};

// ── Каталог ──────────────────────────────────────────────────────────────────

const TemplatesTable: React.FC<{ templates: WhatsAppTemplate[] }> = ({ templates }) => {
  const { t } = useT("settings");
  // Отправляемые сверху, затем по имени: администратор ищет «что можно
  // использовать», а не листает алфавит.
  const rows = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.sendable !== b.sendable) return a.sendable ? -1 : 1;
        return a.name.localeCompare(b.name) || a.language.localeCompare(b.language);
      }),
    [templates],
  );

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
      <Table size="small">
        <TableHead sx={{ bgcolor: "action.hover" }}>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>{t("whatsapp.templates.columns.name")}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t("whatsapp.templates.columns.status")}</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t("whatsapp.templates.columns.body")}</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="center">
              {t("whatsapp.templates.columns.parameters")}
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }}>{t("whatsapp.templates.columns.syncedAt")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((template) => (
            <TableRow key={template.id} hover sx={{ opacity: template.available ? 1 : 0.6 }}>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Typography variant="body2" fontWeight={600}>
                  {template.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {template.language}
                  {template.category ? ` · ${template.category}` : ""}
                </Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top" }}>
                <Stack spacing={0.5} alignItems="flex-start">
                  <WhatsAppTemplateStatusChip template={template} />
                  {template.problemLabel && (
                    <Typography variant="caption" color="text.secondary">
                      {template.problemLabel}
                    </Typography>
                  )}
                  {/* Причина отказа Meta — как есть: её текст нужен, чтобы
                      поправить шаблон в WhatsApp Manager. */}
                  {template.rejectionReason && (
                    <Typography variant="caption" color="error">
                      {t("whatsapp.templates.rejectionReason")}: {template.rejectionReason}
                    </Typography>
                  )}
                </Stack>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top", maxWidth: 420 }}>
                <WhatsAppTemplateBody bodyText={template.bodyText} />
              </TableCell>
              <TableCell align="center" sx={{ verticalAlign: "top" }}>
                {template.parameterCount}
              </TableCell>
              <TableCell sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                {formatAt(template.syncedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default WhatsAppSettingsPage;
