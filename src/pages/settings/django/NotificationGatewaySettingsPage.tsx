import React from "react";
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
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import SmsOutlined from "@mui/icons-material/SmsOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import RouterOutlined from "@mui/icons-material/RouterOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "../../../components/ui";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import {
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from "../../../api/notifications";
import { useCan } from "../../../hooks/useCan";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useT } from "../../../i18n/VerticalProvider";
import { SettingsLayout } from "../SettingsLayout";

type FormState = {
  enabled: boolean;
  ravenApiKey: string;
  ravenApiKeyClear: boolean;
  smsLogin: string;
  smsPassword: string;
  smsPasswordClear: boolean;
  smsSender: string;
  whatsappLogin: string;
  whatsappPassword: string;
  whatsappPasswordClear: boolean;
};

const toForm = (settings: NotificationSettings): FormState => ({
  enabled: settings.enabled,
  ravenApiKey: "",
  ravenApiKeyClear: false,
  smsLogin: settings.credentials.smsLogin,
  smsPassword: "",
  smsPasswordClear: false,
  smsSender: settings.credentials.smsSender,
  whatsappLogin: settings.credentials.whatsappLogin,
  whatsappPassword: "",
  whatsappPasswordClear: false,
});

const NotificationGatewaySettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("notificationGateway.pageTitle"));
  const queryClient = useQueryClient();
  const canView = useCan("notifications.manage");
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const enabledFetch = !permLoading && canView && !needsOrg;

  const [form, setForm] = React.useState<FormState | null>(null);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.notifications.settings(organizationId ?? null, null),
    queryFn: ({ signal }) => getNotificationSettings({ organizationId }, signal),
    enabled: enabledFetch,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  React.useEffect(() => {
    if (settingsQuery.data) setForm(toForm(settingsQuery.data));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!settingsQuery.data || !form) throw new Error(t("notificationGateway.notReady"));
      return saveNotificationSettings({
        enabled: form.enabled,
        branchEnabled: settingsQuery.data.branchEnabled,
        organizationId,
        branchId: null,
        rules: settingsQuery.data.rules.map((rule) => ({
          notificationType: rule.notificationType,
          enabled: rule.enabled,
          channel: rule.channel,
          body: rule.body,
          offsetMinutes: rule.offsetMinutes,
        })),
        credentials: {
          ravenApiKey: form.ravenApiKey,
          ravenApiKeyClear: form.ravenApiKeyClear,
          smsLogin: form.smsLogin,
          smsPassword: form.smsPassword,
          smsSender: form.smsSender,
          smsPasswordClear: form.smsPasswordClear,
          whatsappLogin: form.whatsappLogin,
          whatsappPassword: form.whatsappPassword,
          whatsappPasswordClear: form.whatsappPasswordClear,
        },
      });
    },
    onSuccess: (data) => {
      setForm(toForm(data));
      queryClient.setQueryData(djangoQueryKeys.notifications.settings(organizationId ?? null, null), data);
      setMessage({ type: "success", text: t("notificationGateway.saveSuccess") });
    },
    onError: (err) => {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : t("notificationGateway.saveError"),
      });
    },
  });

  const update = (patch: Partial<FormState>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (!permLoading && !canView) {
    return (
      <SettingsLayout>
        <AccessDenied />
      </SettingsLayout>
    );
  }

  const configured = settingsQuery.data?.credentials;

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <PageHeader title={t("notificationGateway.pageTitle")} showSearch={false} />

        {needsOrg ? (
          <Alert severity="info">{t("notificationGateway.needsOrg")}</Alert>
        ) : settingsQuery.isError ? (
          <Alert severity="error">
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : t("notificationGateway.loadError")}
          </Alert>
        ) : settingsQuery.isLoading || !form ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Alert severity="info">{t("notificationGateway.info")}</Alert>

            <Card variant="outlined">
              <CardHeader
                avatar={<RouterOutlined color="primary" />}
                title={t("notificationGateway.master.title")}
                subheader={t("notificationGateway.master.subtitle")}
                action={
                  <Chip
                    size="small"
                    color={form.enabled ? "success" : "default"}
                    label={form.enabled ? t("notificationGateway.status.enabled") : t("notificationGateway.status.disabled")}
                  />
                }
              />
              <Divider />
              <CardContent>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.enabled}
                      onChange={(event) => update({ enabled: event.target.checked })}
                    />
                  }
                  label={t("notificationGateway.master.switch")}
                />
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardHeader
                avatar={<KeyOutlined color="primary" />}
                title={t("notificationGateway.raven.title")}
                subheader={t("notificationGateway.raven.subtitle")}
                action={
                  <Chip
                    size="small"
                    color={configured?.ravenKeyConfigured ? "success" : "default"}
                    label={configured?.ravenKeyConfigured ? t("notificationGateway.status.configured") : t("notificationGateway.status.notConfigured")}
                  />
                }
              />
              <Divider />
              <CardContent>
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    type="password"
                    label={t("notificationGateway.raven.keyLabel")}
                    value={form.ravenApiKey}
                    onChange={(event) => update({ ravenApiKey: event.target.value, ravenApiKeyClear: false })}
                    helperText={
                      configured?.ravenKeyConfigured
                        ? t("notificationGateway.secret.keepHint")
                        : t("notificationGateway.raven.keyHint")
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.ravenApiKeyClear}
                        onChange={(event) => update({ ravenApiKeyClear: event.target.checked, ravenApiKey: "" })}
                      />
                    }
                    label={t("notificationGateway.raven.clear")}
                  />
                </Stack>
              </CardContent>
            </Card>

            <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="stretch">
              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardHeader
                  avatar={<SmsOutlined color="primary" />}
                  title={t("notificationGateway.sms.title")}
                  subheader={t("notificationGateway.sms.subtitle")}
                  action={
                    <Chip
                      size="small"
                      color={configured?.smsConfigured ? "success" : "default"}
                      label={configured?.smsConfigured ? t("notificationGateway.status.configured") : t("notificationGateway.status.notConfigured")}
                    />
                  }
                />
                <Divider />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      label={t("notificationGateway.sms.login")}
                      value={form.smsLogin}
                      onChange={(event) => update({ smsLogin: event.target.value })}
                    />
                    <TextField
                      fullWidth
                      type="password"
                      label={t("notificationGateway.sms.password")}
                      value={form.smsPassword}
                      onChange={(event) => update({ smsPassword: event.target.value, smsPasswordClear: false })}
                      helperText={configured?.smsConfigured ? t("notificationGateway.secret.keepHint") : undefined}
                    />
                    <TextField
                      fullWidth
                      label={t("notificationGateway.sms.sender")}
                      value={form.smsSender}
                      onChange={(event) => update({ smsSender: event.target.value })}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.smsPasswordClear}
                          onChange={(event) => update({ smsPasswordClear: event.target.checked, smsPassword: "" })}
                        />
                      }
                      label={t("notificationGateway.sms.clear")}
                    />
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ flex: 1 }}>
                <CardHeader
                  avatar={<WhatsApp color="primary" />}
                  title={t("notificationGateway.whatsapp.title")}
                  subheader={t("notificationGateway.whatsapp.subtitle")}
                  action={
                    <Chip
                      size="small"
                      color={configured?.whatsappConfigured ? "success" : "default"}
                      label={configured?.whatsappConfigured ? t("notificationGateway.status.configured") : t("notificationGateway.status.notConfigured")}
                    />
                  }
                />
                <Divider />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      label={t("notificationGateway.whatsapp.phoneId")}
                      value={form.whatsappLogin}
                      onChange={(event) => update({ whatsappLogin: event.target.value })}
                    />
                    <TextField
                      fullWidth
                      type="password"
                      label={t("notificationGateway.whatsapp.token")}
                      value={form.whatsappPassword}
                      onChange={(event) => update({ whatsappPassword: event.target.value, whatsappPasswordClear: false })}
                      helperText={configured?.whatsappConfigured ? t("notificationGateway.secret.keepHint") : undefined}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.whatsappPasswordClear}
                          onChange={(event) => update({ whatsappPasswordClear: event.target.checked, whatsappPassword: "" })}
                        />
                      }
                      label={t("notificationGateway.whatsapp.clear")}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Stack>

            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="large"
                variant="contained"
                startIcon={saveMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <SaveOutlined />}
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? t("common:state.saving") : t("notificationGateway.saveButton")}
              </Button>
            </Box>
          </>
        )}
      </Stack>

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
    </SettingsLayout>
  );
};

export default NotificationGatewaySettingsPage;
