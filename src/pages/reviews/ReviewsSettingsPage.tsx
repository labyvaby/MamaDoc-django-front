import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import { Link as RouterLink } from "react-router";

import { PageHeader } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getReviewSettings,
  updateReviewSettings,
  type ReviewChannel,
  type ReviewSettings,
  type ReviewSettingsPatch,
} from "../../api/reviews";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { CHANNEL_LABELS } from "./meta";

const CHANNEL_OPTIONS: ReviewChannel[] = ["whatsapp", "sms", "whatsapp_then_sms"];

// Editable subset of settings (organizationId/variables are read-only).
type FormState = Omit<ReviewSettings, "organizationId" | "variables">;

const ReviewsSettingsPage: React.FC = () => {
  usePageTitle("Настройки отзывов");
  const theme = useTheme();
  const canManage = useCan("reviews.manage");
  const { isSuperAdmin, activeOrganization, loading: permLoading } = usePermissions();
  const isSuper = isSuperAdmin();
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const orgKey = isSuper ? activeOrganization?.id ?? null : null;

  const queryClient = useQueryClient();
  const { open: notify } = useNotification();

  const query = useQuery({
    queryKey: djangoQueryKeys.reviews.settings(orgKey),
    queryFn: ({ signal }) => getReviewSettings(organizationId, signal),
    enabled: !permLoading && canManage,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const [form, setForm] = React.useState<FormState | null>(null);

  // Seed local form from the loaded settings.
  React.useEffect(() => {
    if (query.data) {
      const { organizationId: _o, variables: _v, ...rest } = query.data;
      setForm(rest);
    }
  }, [query.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const mutation = useMutation({
    mutationFn: (patch: ReviewSettingsPatch) => updateReviewSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(djangoQueryKeys.reviews.settings(orgKey), data);
      notify?.({ type: "success", message: "Настройки сохранены" });
    },
    onError: (e) =>
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  if (!permLoading && !canManage) return <AccessDenied />;

  // Only send fields that actually changed (PATCH is partial).
  const handleSave = () => {
    if (!form || !query.data) return;
    const original = query.data;
    const patch: ReviewSettingsPatch = {};
    (Object.keys(form) as (keyof FormState)[]).forEach((key) => {
      if (form[key] !== original[key]) {
        // @ts-expect-error keys of FormState are a subset of ReviewSettingsPatch
        patch[key] = form[key];
      }
    });
    if (Object.keys(patch).length === 0) {
      notify?.({ type: "success", message: "Нет изменений" });
      return;
    }
    if (isSuper && organizationId != null) patch.organizationId = organizationId;
    mutation.mutate(patch);
  };

  const dirty =
    !!form &&
    !!query.data &&
    (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== query.data![k]);

  const variables = query.data?.variables ?? [];
  const placeholdersHint = variables.length
    ? `Плейсхолдеры: ${variables.map((v) => `{${v}}`).join(", ")}`
    : undefined;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Настройки отзывов"
        showTitle={false}
        showSearch={false}
        leftActions={
          <Button
            size="small"
            startIcon={<ArrowBackOutlined />}
            component={RouterLink}
            to="/reviews"
          >
            К отзывам
          </Button>
        }
      />

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          px: theme.appLayout.page.paddingX,
          pb: 4,
          maxWidth: 720,
        }}
      >
        {query.isLoading || !form ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : query.error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
          </Alert>
        ) : (
          <Stack spacing={3} sx={{ mt: 2 }}>
            {/* ── Основное ── */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Автоматическая рассылка
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.enabled}
                    onChange={(e) => set("enabled", e.target.checked)}
                  />
                }
                label="Включить авторассылку запросов отзыва"
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Поллер найдёт завершённые приёмы и отправит приглашение через заданную
                задержку. Глобальный рубильник также должен быть включён на сервере.
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap">
                <TextField
                  select
                  size="small"
                  label="Канал"
                  value={form.channel}
                  onChange={(e) => set("channel", e.target.value as ReviewChannel)}
                  sx={{ minWidth: 200 }}
                >
                  {CHANNEL_OPTIONS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  type="number"
                  size="small"
                  label="Задержка после приёма (мин)"
                  value={form.delayMinutes}
                  onChange={(e) => set("delayMinutes", Number(e.target.value))}
                  inputProps={{ min: 0 }}
                  sx={{ width: 220 }}
                />
                <TextField
                  type="number"
                  size="small"
                  label="Срок ответа (часы)"
                  value={form.expireHours}
                  onChange={(e) => set("expireHours", Number(e.target.value))}
                  inputProps={{ min: 1 }}
                  sx={{ width: 180 }}
                />
                <TextField
                  select
                  size="small"
                  label="Порог негатива"
                  value={String(form.negativeThreshold)}
                  onChange={(e) => set("negativeThreshold", Number(e.target.value))}
                  helperText="Оценка ниже порога — негатив"
                  sx={{ width: 180 }}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <MenuItem key={n} value={String(n)}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <TextField
                fullWidth
                size="small"
                label="Ссылка 2ГИС"
                value={form.gisUrl}
                onChange={(e) => set("gisUrl", e.target.value)}
                placeholder="https://2gis.kg/..."
                sx={{ mt: 2 }}
              />
            </Paper>

            {/* ── Шаблоны ── */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Шаблоны сообщений
              </Typography>
              {placeholdersHint && (
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 2 }}>
                  {variables.map((v) => (
                    <Chip key={v} label={`{${v}}`} size="small" variant="outlined" />
                  ))}
                </Stack>
              )}
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  label="Приглашение (со ссылкой на оценку)"
                  value={form.templateInvite}
                  onChange={(e) => set("templateInvite", e.target.value)}
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  label="Запрос комментария (оценка ниже порога)"
                  value={form.templateAskComment}
                  onChange={(e) => set("templateAskComment", e.target.value)}
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  label="Благодарность за высокую оценку (со ссылкой 2ГИС)"
                  value={form.templateThanks5}
                  onChange={(e) => set("templateThanks5", e.target.value)}
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  label="Благодарность за низкую оценку"
                  value={form.templateThanksLow}
                  onChange={(e) => set("templateThanksLow", e.target.value)}
                />
              </Stack>
            </Paper>

            <Box>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={!dirty || mutation.isPending}
                startIcon={mutation.isPending ? <CircularProgress size={16} /> : undefined}
              >
                Сохранить
              </Button>
            </Box>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default ReviewsSettingsPage;
