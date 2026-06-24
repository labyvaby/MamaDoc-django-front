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

const CHANNEL_LABEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp" };

const TIMING_LABEL: Record<string, string> = {
  created_10m: "Отправить через (мин)",
  reminder_2h: "Отправить за (мин)",
  appointment_change: "Задержка (мин)",
  appointment_cancel: "Задержка (мин)",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает",
  queued: "В очереди",
  sent: "Отправлено",
  delivered: "Доставлено",
  failed: "Ошибка",
};

const STATUS_COLOR: Record<string, "default" | "info" | "success" | "error" | "warning"> = {
  pending: "default",
  queued: "info",
  sent: "success",
  delivered: "success",
  failed: "error",
};

const PAGE_SIZE = 50;

const DjangoNotificationSettingsPage: React.FC = () => {
  usePageTitle("Уведомления");
  const queryClient = useQueryClient();

  const canView = useCan("notifications.manage");
  const {
    isSuperAdmin,
    activeOrganization,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  const orgId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const enabledFetch = !permLoading && canView && !needsOrg;

  const [activeTab, setActiveTab] = useState(0);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.notifications.settings(orgId ?? null),
    queryFn: ({ signal }) => getNotificationSettings({ organizationId: orgId }, signal),
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
        organizationId: orgId,
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
      queryClient.setQueryData(djangoQueryKeys.notifications.settings(orgId ?? null), data);
      setMessage({ type: "success", text: "Настройки уведомлений сохранены" });
    },
    onError: (err) => {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ошибка при сохранении",
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
      <PageHeader title="Уведомления" showSearch={false} />

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
      >
        <Tab icon={<SettingsOutlined fontSize="small" />} iconPosition="start" label="Настройки" />
        <Tab icon={<HistoryOutlined fontSize="small" />} iconPosition="start" label="История отправок" />
      </Tabs>

      {needsOrg ? (
        <Alert severity="info">Выберите организацию для настройки уведомлений.</Alert>
      ) : (
        <Box sx={{ flex: 1, overflowY: "auto", pb: 6 }}>
          {activeTab === 0 && (
            settingsQuery.isError ? (
              <Alert severity="error">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "Не удалось загрузить настройки уведомлений"}
              </Alert>
            ) : settingsQuery.isLoading || !draft ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Stack spacing={3}>
                <Alert severity="info" icon={<InfoOutlined />}>
                  Произвольный текст отправляется по SMS. Сейчас реально уходит «Подтверждение записи»;
                  остальные типы настраиваются и заработают после подключения их триггеров.
                </Alert>

                <Card variant="outlined">
                  <CardHeader title="Глобальный переключатель" subheader="Общее управление уведомлениями клиники" />
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
                          <Typography variant="body1" fontWeight={600}>Уведомления включены</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Если выключено, клиника не отправляет никакие уведомления
                          </Typography>
                        </Box>
                      }
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
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                          <TextField
                            select
                            size="small"
                            label="Канал"
                            value={rule.channel}
                            onChange={(e) => updateRule(index, { channel: e.target.value })}
                            sx={{ width: { xs: "100%", sm: 180 } }}
                          >
                            {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
                              <MenuItem key={value} value={value}>{label}</MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            size="small"
                            type="number"
                            label={TIMING_LABEL[rule.notificationType] ?? "Смещение (мин)"}
                            value={rule.offsetMinutes}
                            onChange={(e) =>
                              updateRule(index, { offsetMinutes: Math.max(0, Number(e.target.value) || 0) })
                            }
                            sx={{ width: { xs: "100%", sm: 200 } }}
                          />
                        </Stack>

                        <TextField
                          fullWidth
                          multiline
                          rows={3}
                          label="Текст сообщения"
                          placeholder="Здравствуйте, {{patient_name}}! Вы записаны на {{appointment_date}}."
                          value={rule.body}
                          onChange={(e) => updateRule(index, { body: e.target.value })}
                          helperText="Пусто — будет использован стандартный шаблон Raven (WhatsApp)."
                        />

                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                          <Typography variant="caption" color="text.secondary">Переменные:</Typography>
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
                    {saveMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
                  </Button>
                </Box>
              </Stack>
            )
          )}

          {activeTab === 1 && <NotificationHistoryTab orgId={orgId} enabled={enabledFetch} />}
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

const NotificationHistoryTab: React.FC<{ orgId?: number; enabled: boolean }> = ({ orgId, enabled }) => {
  const [page, setPage] = useState(1);
  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.notifications.history({ page, orgId: orgId ?? null }),
    queryFn: ({ signal }) => getNotificationHistory({ page, organizationId: orgId }, signal),
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
              <TableCell sx={{ fontWeight: 700 }}>Дата отправки</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Пациент</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Тип</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Статус</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Приём</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                  <Stack alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
                    <InfoOutlined />
                    <Typography>История уведомлений пуста</Typography>
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
