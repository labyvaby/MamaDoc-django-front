import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Pagination,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { PageHeader } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import {
  getNotificationHistory,
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationRule,
  type NotificationSettings,
} from "../../../api/notifications";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { useT } from "../../../i18n/VerticalProvider";

const STATUS_COLOR: Record<string, "default" | "info" | "success" | "error" | "warning"> = {
  pending: "default",
  queued: "info",
  sent: "success",
  delivered: "success",
  failed: "error",
};

const PAGE_SIZE = 50;

const DjangoNotificationSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("notifications.pageTitle"));
  const queryClient = useQueryClient();

  const CHANNEL_LABEL: Record<string, string> = {
    sms: t("notifications.channels.sms"),
    whatsapp: t("notifications.channels.whatsapp"),
  };
  // Подпись поля смещения зависит от типа правила: «через» у уведомлений о
  // событии и «за» у напоминаний. Сам список правил и их названия приходят с
  // бэка (typeLabel) — новые типы (booking_*, контракт от 05.08.2026)
  // появляются на странице сами, здесь только уточнение подписи.
  const TIMING_LABEL: Record<string, string> = {
    created_10m: t("notifications.timing.created_10m"),
    reminder_2h: t("notifications.timing.reminder_2h"),
    rescheduled_10m: t("notifications.timing.rescheduled_10m"),
    appointment_change: t("notifications.timing.appointment_change"),
    appointment_cancel: t("notifications.timing.appointment_cancel"),
    booking_created: t("notifications.timing.booking_created"),
    booking_confirmed: t("notifications.timing.booking_confirmed"),
    booking_cancelled: t("notifications.timing.booking_cancelled"),
    booking_reminder: t("notifications.timing.booking_reminder"),
  };

  const canView = useCan("notifications.manage");
  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  const needsBranch = !activeBranch;
  const orgId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const branchId = activeBranch?.id;
  const enabledFetch = !permLoading && canView && !needsOrg && !needsBranch;

  const [activeTab, setActiveTab] = useState(0);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.notifications.settings(orgId ?? null, branchId),
    queryFn: ({ signal }) => getNotificationSettings({ organizationId: orgId, branchId }, signal),
    enabled: enabledFetch,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(structuredClone(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveNotificationSettings({
        enabled: draft!.enabled,
        branchEnabled: draft!.branchEnabled,
        organizationId: orgId,
        branchId: branchId!,
        rules: draft!.rules.map((r) => ({
          notificationType: r.notificationType,
          enabled: r.enabled,
          channel: r.channel,
          body: r.body,
          offsetMinutes: r.offsetMinutes,
        })),
      }),
    onSuccess: (data) => {
      setDraft(structuredClone(data));
      queryClient.setQueryData(djangoQueryKeys.notifications.settings(orgId ?? null, branchId), data);
      setMessage({ type: "success", text: t("notifications.saveSuccess") });
    },
    onError: (err) => {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t("notifications.saveError"),
      });
    },
  });

  const updateRule = (index: number, patch: Partial<NotificationRule>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const rules = prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return { ...prev, rules };
    });
  };

  const appendVariable = (index: number, variable: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const rules = prev.rules.map((r, i) =>
        i === index ? { ...r, body: `${r.body}{{${variable}}}` } : r,
      );
      return { ...prev, rules };
    });
  };

  if (!permLoading && !canView) return <AccessDenied />;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: "auto", height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title={t("notifications.pageTitle")} showSearch={false} />

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
      >
        <Tab icon={<SettingsOutlined fontSize="small" />} iconPosition="start" label={t("notifications.tabs.settings")} />
        <Tab icon={<HistoryOutlined fontSize="small" />} iconPosition="start" label={t("notifications.tabs.history")} />
      </Tabs>

      {needsOrg ? (
        <Alert severity="info">{t("notifications.needsOrg")}</Alert>
      ) : needsBranch ? (
        <Alert severity="info">{t("notifications.needsBranch")}</Alert>
      ) : (
        <Box sx={{ flex: 1, overflowY: "auto", pb: 6 }}>
          {activeTab === 0 && (
            settingsQuery.isError ? (
              <Alert severity="error">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : t("notifications.loadError")}
              </Alert>
            ) : settingsQuery.isLoading || !draft ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Stack spacing={3}>
                <Alert severity="info" icon={<InfoOutlined />}>
                  {t("notifications.infoBanner")}
                </Alert>

                <Card variant="outlined">
                  <CardHeader title={t("notifications.globalCard.title")} subheader={t("notifications.globalCard.subheader")} />
                  <Divider />
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={draft.enabled}
                          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                          color="primary"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body1" fontWeight={600}>{t("notifications.globalCard.switchLabel")}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t("notifications.globalCard.switchCaption")}
                          </Typography>
                        </Box>
                      }
                    />
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardHeader
                    title={t("notifications.branchCard.title", { branch: activeBranch?.name ?? "" })}
                    subheader={t("notifications.branchCard.subheader")}
                  />
                  <Divider />
                  <CardContent>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={draft.branchEnabled}
                          onChange={(e) => setDraft({ ...draft, branchEnabled: e.target.checked })}
                          color="primary"
                        />
                      }
                      label={t("notifications.branchCard.switchLabel")}
                    />
                  </CardContent>
                </Card>

                {draft.rules.map((rule, index) => (
                  <Card key={rule.notificationType} variant="outlined">
                    <CardHeader
                      title={rule.typeLabel}
                      action={
                        <Switch
                          checked={rule.enabled}
                          onChange={(e) => updateRule(index, { enabled: e.target.checked })}
                          color="primary"
                        />
                      }
                    />
                    <Divider />
                    <CardContent>
                      <Stack spacing={2}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                          <TextField
                            select
                            size="small"
                            label={t("notifications.channelLabel")}
                            value={rule.channel}
                            onChange={(e) => updateRule(index, { channel: e.target.value })}
                            sx={{ width: { xs: "100%", md: 180 } }}
                          >
                            {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                              <MenuItem key={value} value={value}>{label}</MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            size="small"
                            type="number"
                            label={TIMING_LABEL[rule.notificationType] ?? t("notifications.timing.default")}
                            value={rule.offsetMinutes}
                            onChange={(e) =>
                              updateRule(index, { offsetMinutes: Math.max(0, Number(e.target.value) || 0) })
                            }
                            sx={{ width: { xs: "100%", md: 200 } }}
                          />
                        </Stack>

                        <TextField
                          fullWidth
                          multiline
                          rows={3}
                          label={t("notifications.messageTextLabel")}
                          // Не через t(): пример буквально показывает синтаксис шаблона
                          // {{var}}, который движок сообщений подставляет в тексте — если
                          // положить эту строку в JSON, i18next попытается интерполировать
                          // patient_name/appointment_date как свои переменные.
                          placeholder="Здравствуйте, {{patient_name}}! Вы записаны на {{appointment_date}}."
                          value={rule.body}
                          onChange={(e) => updateRule(index, { body: e.target.value })}
                          disabled={rule.channel === "whatsapp"}
                          helperText={rule.channel === "whatsapp"
                            ? t("notifications.whatsappTemplateHelper")
                            : t("notifications.messageTextHelper")}
                        />

                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                          <Typography variant="caption" color="text.secondary">{t("notifications.variablesLabel")}</Typography>
                          {(draft.variables ?? []).map((variable) => (
                            <Chip
                              key={variable}
                              label={`{{${variable}}}`}
                              size="small"
                              variant="outlined"
                              onClick={() => appendVariable(index, variable)}
                              sx={{ fontFamily: "monospace", cursor: "pointer" }}
                            />
                          ))}
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}

                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    size="large"
                    variant="contained"
                    startIcon={saveMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <SaveOutlined />}
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? t("common:state.saving") : t("notifications.saveButton")}
                  </Button>
                </Box>
              </Stack>
            )
          )}

          {activeTab === 1 && (
            <NotificationHistoryTab orgId={orgId} branchId={branchId} enabled={enabledFetch} />
          )}
        </Box>
      )}

      <Snackbar
        open={!!message}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setMessage(null)} severity={message?.type || "info"} sx={{ width: "100%" }}>
          {message?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
};

const NotificationHistoryTab: React.FC<{
  orgId?: number;
  branchId?: number;
  enabled: boolean;
}> = ({ orgId, branchId, enabled }) => {
  const { t } = useT("settings");
  const STATUS_LABEL: Record<string, string> = {
    pending: t("notifications.status.pending"),
    queued: t("notifications.status.queued"),
    sent: t("notifications.status.sent"),
    delivered: t("notifications.status.delivered"),
    failed: t("notifications.status.failed"),
    cancelled: t("notifications.status.cancelled"),
  };
  const [page, setPage] = useState(1);
  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.notifications.history({ page, orgId: orgId ?? null, branchId: branchId ?? null }),
    queryFn: ({ signal }) => getNotificationHistory({ page, organizationId: orgId, branchId }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  if (historyQuery.isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}><CircularProgress /></Box>;
  }

  const data = historyQuery.data;
  const rows = data?.results ?? [];
  const pageCount = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <Stack spacing={2}>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: "action.hover" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>{t("notifications.columns.sentAt")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("notifications.columns.patient")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("notifications.columns.type")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("notifications.columns.status")}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t("notifications.columns.visit")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                  <Stack alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
                    <InfoOutlined />
                    <Typography>{t("notifications.historyEmpty")}</Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{item.sentAt ? dayjs(item.sentAt).format("DD.MM.YYYY HH:mm") : "—"}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{item.patientName || "—"}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.recipient || "—"}</Typography>
                  </TableCell>
                  <TableCell>{item.typeLabel}</TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABEL[item.status] ?? item.status}
                      size="small"
                      color={STATUS_COLOR[item.status] ?? "default"}
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>{item.appointmentAt ? dayjs(item.appointmentAt).format("DD.MM.YYYY HH:mm") : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pageCount > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <Pagination count={pageCount} page={page} onChange={(_, v) => setPage(v)} color="primary" />
        </Box>
      )}
    </Stack>
  );
};

export default DjangoNotificationSettingsPage;
