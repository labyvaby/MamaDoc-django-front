import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { SettingsLayout } from "./SettingsLayout";
import { AltegioLinksSection } from "./AltegioLinksSection";
import { AltegioJournalSection } from "./AltegioJournalSection";
import {
  connectAltegio,
  disconnectAltegio,
  getAltegioSettings,
  updateAltegioSettings,
  type AltegioSettings,
} from "../../api/altegio";
import { getServices } from "../../api/catalog";
import { orgWide } from "../../api/scope";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";

function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU");
}

const AltegioSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("altegio.title"));
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const settingsKey = djangoQueryKeys.altegio.settings(orgId);
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => getAltegioSettings(signal, { organizationId: orgId }),
  });
  const servicesQuery = useQuery({
    queryKey: djangoQueryKeys.reference.services({ orgId }),
    queryFn: ({ signal }) => getServices(orgWide(orgId), undefined, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const [partnerToken, setPartnerToken] = React.useState("");
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [snack, setSnack] = React.useState<string | null>(null);

  const settings = settingsQuery.data;
  const services = servicesQuery.data ?? [];

  const run = async (action: () => Promise<AltegioSettings>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      queryClient.setQueryData(settingsKey, await action());
      setSnack(message);
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const next = await connectAltegio({ organizationId: orgId, partnerToken, login, password });
      setPartnerToken("");
      setPassword("");
      return next;
    }, t("altegio.connectedSnack"));

  const disconnect = () =>
    run(() => disconnectAltegio({ organizationId: orgId }), t("altegio.disconnectedSnack"));

  const save = (patch: { isEnabled?: boolean; fallbackServiceId?: number }) =>
    run(() => updateAltegioSettings({ organizationId: orgId, ...patch }), t("altegio.savedSnack"));

  const canConnect =
    !busy && partnerToken.trim() !== "" && login.trim() !== "" && password !== "";

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            {t("altegio.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("altegio.description")}
          </Typography>
        </Box>
        {settingsQuery.isLoading && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}
        {settingsQuery.isError && (
          <Alert severity="error">{parseBackendError(settingsQuery.error)}</Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {settings && (
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              {t("altegio.connectionTitle")}
            </Typography>
            {settings.isConnected ? (
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography>{t("altegio.connectedAs", { login: settings.login })}</Typography>
                <Button variant="outlined" color="error" disabled={busy} onClick={disconnect}>
                  {t("altegio.disconnectButton")}
                </Button>
              </Stack>
            ) : (
              <Stack spacing={2} maxWidth={420}>
                <Typography variant="body2" color="text.secondary">
                  {t("altegio.connectionDescription")}
                </Typography>
                <TextField
                  size="small"
                  type="password"
                  autoComplete="off"
                  label={t("altegio.partnerTokenLabel")}
                  value={partnerToken}
                  onChange={(e) => setPartnerToken(e.target.value)}
                />
                <TextField
                  size="small"
                  autoComplete="off"
                  label={t("altegio.loginLabel")}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
                <TextField
                  size="small"
                  type="password"
                  autoComplete="new-password"
                  label={t("altegio.passwordLabel")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Box>
                  <Button
                    variant="contained"
                    disabled={!canConnect}
                    onClick={connect}
                    startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                  >
                    {t("altegio.connectButton")}
                  </Button>
                </Box>
              </Stack>
            )}
          </Stack>
        )}
        {settings?.isConnected && (
          <>
            <Divider />
            <Stack spacing={2} maxWidth={520}>
              <Typography variant="subtitle1" fontWeight={600}>
                {t("altegio.syncTitle")}
              </Typography>
              <TextField
                select
                size="small"
                label={t("altegio.fallbackLabel")}
                helperText={t("altegio.fallbackHelper")}
                value={settings.fallbackServiceId ?? ""}
                disabled={busy}
                onChange={(e) => save({ fallbackServiceId: Number(e.target.value) })}
              >
                {services.map((service) => (
                  <MenuItem key={service.id} value={service.id}>
                    {service.name}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.isEnabled}
                    disabled={busy}
                    onChange={(_event, checked) => save({ isEnabled: checked })}
                  />
                }
                label={t("altegio.enabledLabel")}
              />
              <Typography variant="body2" color="text.secondary">
                {t("altegio.enabledHelper")}
              </Typography>
              <Typography variant="body2">
                {settings.lastSuccessAt
                  ? t("altegio.lastSuccess", { at: formatMoment(settings.lastSuccessAt) })
                  : t("altegio.neverRun")}
              </Typography>
              {settings.lastError && (
                <Alert severity="warning">{t("altegio.lastError", { error: settings.lastError })}</Alert>
              )}
              <Typography variant="body2">{t("altegio.waiting", { n: settings.waitingStaffCount })}</Typography>
              <Typography variant="body2">{t("altegio.diverged", { n: settings.divergedCount })}</Typography>
            </Stack>
            <Divider />
            <AltegioLinksSection organizationId={orgId} services={services} />
            <Divider />
            <AltegioJournalSection organizationId={orgId} />
          </>
        )}
        <Snackbar
          open={snack !== null}
          autoHideDuration={3000}
          onClose={() => setSnack(null)}
          message={snack ?? ""}
        />
      </Stack>
    </SettingsLayout>
  );
};

export default AltegioSettingsPage;
