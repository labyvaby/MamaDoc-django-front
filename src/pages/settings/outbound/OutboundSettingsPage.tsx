import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../../hooks/usePageTitle";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { SettingsLayout } from "../SettingsLayout";
import {
  checkOutbound,
  getOutboundSettings,
  updateOutboundSettings,
  type OutboundCheck,
  type OutboundCheckResult,
  type OutboundSettingsPatch,
} from "../../../api/outbound";
import { parseBackendError } from "../../../api/appointments";
import { djangoQueryKeys } from "../../../api/queryKeys";
import {
  buildPatch,
  draftFrom,
  isPhoneNumberId,
  isRavenKey,
  type OutboundDraft,
} from "./outboundForm";

const Section: React.FC<
  React.PropsWithChildren<{ title: string; hint: string; status?: React.ReactNode }>
> = ({ title, hint, status, children }) => (
  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px" }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
      <Typography variant="subtitle1" fontWeight={700}>
        {title}
      </Typography>
      {status}
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      {hint}
    </Typography>
    <Stack spacing={2} sx={{ maxWidth: 440 }}>
      {children}
    </Stack>
  </Paper>
);

const Stored: React.FC<{ on: boolean; yes: string; no: string }> = ({ on, yes, no }) => (
  <Chip
    size="small"
    label={on ? yes : no}
    color={on ? "success" : "default"}
    variant={on ? "filled" : "outlined"}
  />
);

const CheckLine: React.FC<{ label: string; result: OutboundCheckResult }> = ({
  label,
  result,
}) => (
  <Alert
    severity={result.ok ? "success" : "error"}
    icon={result.ok ? <CheckCircleOutline /> : <ErrorOutline />}
  >
    <strong>{label}:</strong> {result.detail}
  </Alert>
);

const OutboundSettingsPage: React.FC = () => {
  usePageTitle("Исходящие сообщения (Raven)");
  const orgId = useApiOrgId();
  const queryClient = useQueryClient();
  const key = djangoQueryKeys.outbound.settings(orgId);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getOutboundSettings(orgId, signal),
  });
  const saved = query.data;

  const [draft, setDraft] = React.useState<OutboundDraft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [snack, setSnack] = React.useState<string | null>(null);
  const [check, setCheck] = React.useState<OutboundCheck | null>(null);

  React.useEffect(() => {
    if (saved) setDraft(draftFrom(saved));
  }, [saved]);

  const set = (field: keyof OutboundDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => (d ? { ...d, [field]: e.target.value } : d));

  const save = useMutation({
    mutationFn: (patch: OutboundSettingsPatch) =>
      updateOutboundSettings({ ...patch, organizationId: orgId }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setError(null);
      setCheck(null);
      setSnack("Сохранено");
    },
    onError: (e) => setError(parseBackendError(e)),
  });

  const probe = useMutation({
    mutationFn: () => checkOutbound(orgId),
    onSuccess: (data) => {
      setError(null);
      setCheck(data);
    },
    onError: (e) => setError(parseBackendError(e)),
  });

  const patch = saved && draft ? buildPatch(saved, draft) : {};
  const invalid =
    !!draft && (!isPhoneNumberId(draft.whatsappLogin) || !isRavenKey(draft.ravenApiKey));
  const dirty = Object.keys(patch).length > 0;
  const busy = save.isPending || probe.isPending;

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Исходящие сообщения (Raven)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Через какой проект Raven и каких отправителей клиника пишет
            пациентам: коды входа, напоминания о приёмах, приглашения оставить
            отзыв. Ключи и токены после сохранения не показываются — только
            отметка, что они заданы.
          </Typography>
        </Box>

        {query.isLoading && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}
        {query.isError && <Alert severity="error">{parseBackendError(query.error)}</Alert>}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {saved && draft && (
          <>
            <Section
              title="Проект Raven"
              hint="В проекте Raven живут номер WhatsApp, шаблоны и сценарии клиники (например, сценарий отзывов). Без своего ключа сообщения идут через общий проект платформы."
              status={
                <Stored on={saved.ravenKeyConfigured} yes="Свой ключ" no="Ключ платформы" />
              }
            >
              <TextField
                size="small"
                type="password"
                autoComplete="new-password"
                label={saved.ravenKeyConfigured ? "Новый ключ проекта" : "Ключ проекта Raven"}
                placeholder="nrk_live_…"
                value={draft.ravenApiKey}
                onChange={set("ravenApiKey")}
                error={!isRavenKey(draft.ravenApiKey)}
                helperText={
                  !isRavenKey(draft.ravenApiKey)
                    ? "Одна строка без пробелов"
                    : "Raven → Проекты → API-ключи. Пусто — не менять."
                }
              />
              {saved.ravenKeyConfigured && (
                <Box>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    onClick={() => save.mutate({ ravenApiKeyClear: true })}
                  >
                    Стереть ключ — слать через платформу
                  </Button>
                </Box>
              )}
            </Section>

            <Section
              title="WhatsApp — свой номер"
              hint="Номер из Meta WhatsApp Manager для отдельных сообщений: уведомлений и автоматизаций. Сценарии (отзывы) уходят с номера, настроенного в проекте Raven."
              status={
                <Stored on={saved.whatsappConfigured} yes="Задан" no="Не задан" />
              }
            >
              <TextField
                size="small"
                label="Phone Number ID"
                inputProps={{ inputMode: "numeric" }}
                value={draft.whatsappLogin}
                onChange={set("whatsappLogin")}
                error={!isPhoneNumberId(draft.whatsappLogin)}
                helperText={
                  !isPhoneNumberId(draft.whatsappLogin)
                    ? "Только цифры"
                    : "Meta → WhatsApp Manager → номер телефона → ID"
                }
              />
              <TextField
                size="small"
                type="password"
                autoComplete="new-password"
                label="Access Token"
                value={draft.whatsappPassword}
                onChange={set("whatsappPassword")}
                helperText={
                  saved.whatsappConfigured
                    ? "Токен сохранён. Пусто — не менять."
                    : "Постоянный токен системного пользователя Meta"
                }
              />
              {saved.whatsappConfigured && (
                <Box>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    onClick={() => save.mutate({ whatsappPasswordClear: true })}
                  >
                    Стереть токен
                  </Button>
                </Box>
              )}
            </Section>

            <Section
              title="SMS — свой шлюз"
              hint="Логин и пароль SMS-шлюза клиники и имя отправителя. Пусто — SMS идут через шлюз проекта Raven."
              status={<Stored on={saved.smsConfigured} yes="Задан" no="Не задан" />}
            >
              <TextField size="small" label="Логин" value={draft.smsLogin} onChange={set("smsLogin")} />
              <TextField
                size="small"
                type="password"
                autoComplete="new-password"
                label="Пароль"
                value={draft.smsPassword}
                onChange={set("smsPassword")}
                helperText={saved.smsConfigured ? "Пароль сохранён. Пусто — не менять." : undefined}
              />
              <TextField
                size="small"
                label="Имя отправителя"
                value={draft.smsSender}
                onChange={set("smsSender")}
                inputProps={{ maxLength: 50 }}
              />
              {saved.smsConfigured && (
                <Box>
                  <Button
                    size="small"
                    color="error"
                    disabled={busy}
                    onClick={() => save.mutate({ smsPasswordClear: true })}
                  >
                    Стереть пароль
                  </Button>
                </Box>
              )}
            </Section>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                variant="contained"
                disabled={!dirty || invalid || busy}
                onClick={() => save.mutate(patch)}
                startIcon={save.isPending ? <CircularProgress size={16} /> : undefined}
              >
                Сохранить
              </Button>
              <Button
                variant="outlined"
                disabled={busy || dirty}
                onClick={() => probe.mutate()}
                startIcon={probe.isPending ? <CircularProgress size={16} /> : undefined}
              >
                Проверить подключение
              </Button>
            </Stack>
            {dirty && (
              <Typography variant="caption" color="text.secondary">
                Сначала сохраните изменения — проверка идёт по сохранённым настройкам.
              </Typography>
            )}

            {check && (
              <Stack spacing={1}>
                <CheckLine label="Raven" result={check.raven} />
                {check.whatsapp && <CheckLine label="WhatsApp" result={check.whatsapp} />}
              </Stack>
            )}
          </>
        )}
      </Stack>
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </SettingsLayout>
  );
};

export default OutboundSettingsPage;
