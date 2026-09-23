import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Link,
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
  type ReviewSettings,
  type ReviewSettingsPatch,
} from "../../api/reviews";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";
import { MAP_META } from "./meta";

type FormState = Pick<
  ReviewSettings,
  | "enabled"
  | "delayMinutes"
  | "expireHours"
  | "quietFrom"
  | "quietTo"
  | "minDaysBetween"
  | "positiveTags"
  | "negativeTags"
>;

const FORM_KEYS: (keyof FormState)[] = [
  "enabled",
  "delayMinutes",
  "expireHours",
  "quietFrom",
  "quietTo",
  "minDaysBetween",
  "positiveTags",
  "negativeTags",
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const pick = (s: ReviewSettings): FormState =>
  Object.fromEntries(FORM_KEYS.map((k) => [k, s[k]])) as FormState;

const TagEditor: React.FC<{
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  color: "success" | "error";
}> = ({ label, value, onChange, color }) => (
  <Autocomplete
    multiple
    freeSolo
    options={[] as string[]}
    value={value}
    onChange={(_, tags) =>
      onChange([...new Set(tags.map((t) => t.trim()).filter(Boolean))].map((t) => t.slice(0, 60)))
    }
    renderTags={(tags, getTagProps) =>
      tags.map((tag, index) => {
        const { key, ...rest } = getTagProps({ index });
        return <Chip key={key} label={tag} size="small" color={color} variant="outlined" {...rest} />;
      })
    }
    renderInput={(params) => (
      <TextField {...params} size="small" label={label} placeholder="Новый тег + Enter" />
    )}
  />
);

const ReviewsSettingsPage: React.FC = () => {
  const { t } = useT("reviews");
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
  React.useEffect(() => {
    if (query.data) setForm(pick(query.data));
  }, [query.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const mutation = useMutation({
    mutationFn: (patch: ReviewSettingsPatch) => updateReviewSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(djangoQueryKeys.reviews.settings(orgKey), data);
      notify?.({ type: "success", message: "Настройки сохранены" });
    },
    onError: (e) => notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" }),
  });

  if (!permLoading && !canManage) return <AccessDenied />;

  const original = query.data;
  const dirty = !!form && !!original && FORM_KEYS.some((k) => !same(form[k], original[k]));

  const handleSave = () => {
    if (!form || !original) return;
    const patch: ReviewSettingsPatch = {};
    FORM_KEYS.forEach((k) => {
      if (!same(form[k], original[k])) Object.assign(patch, { [k]: form[k] });
    });
    if (isSuper && organizationId != null) patch.organizationId = organizationId;
    mutation.mutate(patch);
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Настройки отзывов"
        showTitle={false}
        showSearch={false}
        leftActions={
          <Button size="small" startIcon={<ArrowBackOutlined />} component={RouterLink} to="/reviews">
            К отзывам
          </Button>
        }
      />

      <Box sx={{ flex: 1, overflow: "auto", px: theme.appLayout.page.paddingX, pb: 4, maxWidth: 760 }}>
        {query.error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
          </Alert>
        ) : query.isLoading || !form || !original ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px" }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Автоматическая рассылка
              </Typography>
              {!original.platformEnabled && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  Автоматическая рассылка на платформе пока не включена. Ручной запрос из карточки приёма
                  работает.
                </Alert>
              )}
              <FormControlLabel
                control={<Switch checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />}
                label="Спрашивать отзыв после каждого завершённого приёма"
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {t("settings.pollerHint")} Сообщение уходит в WhatsApp, если не доставлено — SMS.
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap" useFlexGap>
                <TextField
                  type="number"
                  size="small"
                  label={t("settings.delayLabel")}
                  value={form.delayMinutes}
                  onChange={(e) => set("delayMinutes", Math.max(0, Number(e.target.value)))}
                  inputProps={{ min: 0 }}
                  sx={{ width: 240 }}
                />
                <TextField
                  type="time"
                  size="small"
                  label="Не писать с"
                  value={form.quietFrom}
                  onChange={(e) => set("quietFrom", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 140 }}
                />
                <TextField
                  type="time"
                  size="small"
                  label="до"
                  value={form.quietTo}
                  onChange={(e) => set("quietTo", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 140 }}
                />
                <TextField
                  type="number"
                  size="small"
                  label="Не чаще раза в N дней"
                  helperText="На одного пациента или номер"
                  value={form.minDaysBetween}
                  onChange={(e) => set("minDaysBetween", Math.max(0, Number(e.target.value)))}
                  inputProps={{ min: 0 }}
                  sx={{ width: 220 }}
                />
                <TextField
                  type="number"
                  size="small"
                  label="Ссылка действует, часов"
                  helperText="Сколько можно ответить и исправить ответ"
                  value={form.expireHours}
                  onChange={(e) => set("expireHours", Math.max(1, Number(e.target.value)))}
                  inputProps={{ min: 1 }}
                  sx={{ width: 240 }}
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px" }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Теги на странице отзыва
              </Typography>
              <Stack spacing={2}>
                <TagEditor
                  label="Что понравилось (при 5★)"
                  value={form.positiveTags}
                  onChange={(tags) => set("positiveTags", tags)}
                  color="success"
                />
                <TagEditor
                  label="Что было не так (ниже 5★)"
                  value={form.negativeTags}
                  onChange={(tags) => set("negativeTags", tags)}
                  color="error"
                />
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "14px" }}>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Карты для отзывов с 5★
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                Ссылки берутся из настроек филиала. Кнопки карт видит только пациент, который поставил 5★ с
                первого раза и ещё не оставлял подтверждённый отзыв.
              </Typography>
              <Stack spacing={1.5}>
                {original.branchMaps.map((b) => (
                  <Box key={b.branchId}>
                    <Typography variant="body2" fontWeight={600}>
                      {b.branchName}
                    </Typography>
                    {b.maps.length === 0 ? (
                      <Alert severity="warning" sx={{ mt: 0.5 }}>
                        Нет ссылок на карты — пациенты с 5★ не получат кнопки. Заполните их в настройках
                        филиала.
                      </Alert>
                    ) : (
                      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
                        {b.maps.map((m) => (
                          <Link key={m.platform} href={m.url} target="_blank" rel="noopener" underline="none">
                            <Chip label={MAP_META[m.platform]} size="small" clickable variant="outlined" />
                          </Link>
                        ))}
                      </Stack>
                    )}
                  </Box>
                ))}
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
