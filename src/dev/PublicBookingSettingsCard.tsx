/**
 * «Бронирование через сайт» в настройках отеля: включить публичную страницу
 * прямых продаж и задать её адрес (slug). Гость на ней выбирает даты и
 * оставляет заявку — номер резервируется на 30 минут, сотрудник подтверждает
 * бронь в CRM. Бэк: GET/PATCH /hotel/properties/{id}/public-booking/
 * (право hotel.manage). Slug уникален: 3–80 символов, a–z, цифры, дефис.
 * По умолчанию выключено.
 */
import React from "react";
import { Alert, Box, Button, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getPublicBookingSettings, updatePublicBookingSettings } from "../api/hotel";
import { getErrorFields, getErrorMessage } from "../api/client";
import { FormField } from "./formField";

const SLUG_RULES = {
  required: true,
  maxLength: 80,
  validate: (v: string) => (/^[a-z0-9-]{3,80}$/.test(v) ? null : "3–80 символов: строчные латинские буквы, цифры и дефис"),
};

export const PublicBookingSettingsCard: React.FC<{ propertyId: number }> = ({ propertyId }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const query = useQuery({
    queryKey: ["hotel", "publicBooking", propertyId],
    queryFn: ({ signal }) => getPublicBookingSettings(propertyId, signal),
  });
  const [slug, setSlug] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [slugError, setSlugError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!query.data) return;
    setSlug(query.data.publicSlug ?? "");
    setEnabled(query.data.publicBookingEnabled);
  }, [query.data]);

  if (query.isPending) return null;
  if (query.isError) {
    return (
      <Alert severity="error" variant="outlined">
        {getErrorMessage(query.error, "Не удалось загрузить настройки бронирования через сайт")}
      </Alert>
    );
  }

  const saved = query.data;
  const dirty = slug !== (saved.publicSlug ?? "") || enabled !== saved.publicBookingEnabled;
  const url = saved.publicSlug ? `${window.location.origin}/stay/${saved.publicSlug}` : null;

  const save = async () => {
    setSlugError(null);
    setError(null);
    if (enabled && !slug) {
      setSlugError("Задайте адрес страницы");
      return;
    }
    if (slug && !/^[a-z0-9-]{3,80}$/.test(slug)) {
      setSlugError("3–80 символов: строчные латинские буквы, цифры и дефис");
      return;
    }
    setSaving(true);
    try {
      await updatePublicBookingSettings(propertyId, {
        ...(slug !== (saved.publicSlug ?? "") && slug ? { publicSlug: slug } : {}),
        publicBookingEnabled: enabled,
      });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "publicBooking", propertyId] });
      enqueueSnackbar(enabled ? "Бронирование через сайт включено" : "Бронирование через сайт выключено", { variant: "success" });
    } catch (err) {
      const fields = getErrorFields(err);
      if (fields?.publicSlug) setSlugError(fields.publicSlug);
      else setError(getErrorMessage(err, "Не удалось сохранить настройки"));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      enqueueSnackbar("Ссылка скопирована", { variant: "success" });
    } catch {
      enqueueSnackbar(url, { variant: "info" });
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        Бронирование через сайт
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Страница, где гость сам выбирает даты и оставляет заявку. Номер резервируется на 30 минут — подтвердите бронь в CRM, иначе он вернётся в продажу.
      </Typography>
      <Stack gap={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <FormField
          icon={<LinkOutlined />}
          label="Адрес страницы"
          value={slug}
          onValueChange={(v) => {
            setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            setSlugError(null);
          }}
          rules={SLUG_RULES}
          placeholder="grand-hotel"
          error={slugError != null}
          helperText={slugError ?? `${window.location.origin}/stay/${slug || "…"}`}
          disabled={saving}
          showValid={false}
          fullWidth
        />
        <FormControlLabel
          control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={saving} />}
          label={
            <Box>
              <Typography variant="body2" fontWeight={600}>
                Принимать заявки с сайта
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Выключено — страница отвечает «недоступно», заявки не принимаются
              </Typography>
            </Box>
          }
        />
        <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
          <Button variant="contained" disableElevation onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
          {url && saved.publicBookingEnabled && (
            <>
              <Button startIcon={<ContentCopyOutlined />} onClick={() => void copy()}>
                Скопировать ссылку
              </Button>
              <Button startIcon={<OpenInNewOutlined />} href={url} target="_blank" rel="noopener">
                Открыть
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default PublicBookingSettingsCard;
