import React from "react";
import {
  Alert,
  Box,
  Divider,
  FormControlLabel,
  InputAdornment,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";

import SettingsLayout from "./SettingsLayout";
import { AppButton } from "../../components/ui/AppButton";
import { usePermissions } from "../../hooks/usePermissions";
import {
  getOrganization,
  updateOrganization,
  type DjangoOrganization,
} from "../../api/organization";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";
import {
  LANDING_BLOCKS,
  LANDING_SOCIALS,
  parseLandingConfig,
  serializeLandingConfig,
  writeLandingPreview,
  type LandingConfig,
} from "../public-site/landingConfig";
import { SOCIAL_LABELS, SOCIAL_PLACEHOLDERS } from "../public-site/socialMeta";
import { landingUrl } from "../public-site/links";

/**
 * «Настройки» → «Сайт»: конструктор лендинга организации (`/site`).
 *
 * Сам сайт работает без этой страницы — он собран из данных CRM. Здесь задаётся
 * только то, чего в данных нет: слоган, «о нас», часы работы, соцсети, акцентный
 * цвет и набор блоков.
 *
 * Хранится это в `themeConfig.landing` организации — существующем свободном
 * поле, чтобы не ждать миграции на бэке. С 03.09.2026 бэк отдаёт этот ключ (и
 * только его, не весь themeConfig) в публичном ответе
 * `/api/v1/organizations/<slug>/`, поэтому сохранённые правки видит и гость.
 *
 * Кнопка «Предпросмотр» осталась для несохранённых правок: она показывает
 * страницу с текущим состоянием формы в этой вкладке (конфиг в
 * sessionStorage). Через ссылку конфиг не передаём — иначе любой собрал бы
 * адрес витрины с подменённым текстом и телефоном.
 */

/** Готовые акценты: цвета витрины и частые фирменные оттенки. */
const ACCENT_PRESETS = ["#007BFF", "#0EA5A5", "#7C3AED", "#DB2777", "#F97316", "#16A34A"];

const SiteSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  const { activeOrganization, isSuperAdmin, hasPermission } = usePermissions();
  const canUpdate = isSuperAdmin() || hasPermission("organization.update");
  const orgId = activeOrganization?.id ?? null;

  const [org, setOrg] = React.useState<DjangoOrganization | null>(null);
  const [config, setConfig] = React.useState<LandingConfig>(() => parseLandingConfig(null));
  const [savedConfig, setSavedConfig] = React.useState<LandingConfig>(() =>
    parseLandingConfig(null),
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const extractErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return t("site.unknownError");
  };

  const load = React.useCallback(async () => {
    if (orgId == null) {
      setLoading(false);
      setLoadError(t("organization.noOrgSelected"));
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getOrganization(orgId);
      const landing = parseLandingConfig(
        (data.themeConfig as Record<string, unknown> | null | undefined)?.landing,
      );
      setOrg(data);
      setConfig(landing);
      setSavedConfig(landing);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(serializeLandingConfig(config)) !==
    JSON.stringify(serializeLandingConfig(savedConfig));

  const siteUrl = landingUrl(org?.slug ?? activeOrganization?.slug ?? null);

  const patch = (part: Partial<LandingConfig>) => {
    setConfig((prev) => ({ ...prev, ...part }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!org || !dirty) return;
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      // Тема организации живёт в том же `themeConfig` (primaryColor, colorScheme
      // — см. contexts/color-mode): пишем поверх, а не вместо, иначе сохранение
      // сайта сбросило бы фирменные цвета CRM.
      const themeConfig = {
        ...((org.themeConfig as Record<string, unknown> | null) ?? {}),
        landing: serializeLandingConfig(config),
      };
      const updated = await updateOrganization(org.id, { themeConfig });
      setOrg(updated);
      setSavedConfig(config);
      setSaved(true);
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = () => {
    const slug = org?.slug ?? activeOrganization?.slug ?? "";
    writeLandingPreview(slug, config);
    window.open(landingUrl(slug, { preview: true }), "_blank", "noopener");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен (нет разрешения) — ссылка видна в поле, скопируют руками.
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={2.5} sx={{ maxWidth: 720 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <LanguageOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            {t("site.title")}
          </Typography>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {t("site.intro")}
        </Typography>

        {loading && (
          <Stack spacing={1.5}>
            <Skeleton variant="text" width={240} height={28} />
            <Skeleton variant="rounded" height={160} />
          </Stack>
        )}

        {!loading && loadError && (
          <Alert
            severity="error"
            action={
              <AppButton size="small" color="inherit" onClick={load}>
                {t("common:actions.retry")}
              </AppButton>
            }
          >
            {loadError}
          </Alert>
        )}

        {!loading && !loadError && org && (
          <>
            {/* Адрес сайта */}
            <TextField
              label={t("site.urlLabel")}
              value={siteUrl}
              size="small"
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Stack direction="row" gap={0.5}>
                      <Tooltip title={copied ? t("site.copied") : t("site.copy")}>
                        <span>
                          <AppButton size="small" onClick={handleCopy}>
                            <ContentCopyOutlined fontSize="small" />
                          </AppButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={t("site.open")}>
                        <span>
                          <AppButton
                            size="small"
                            onClick={() => window.open(siteUrl, "_blank", "noopener")}
                          >
                            <OpenInNewOutlined fontSize="small" />
                          </AppButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </InputAdornment>
                ),
              }}
              helperText={t("site.urlHint")}
            />

            <Alert severity="info">{t("site.publishNote")}</Alert>

            <Divider />

            {/* Тексты */}
            <Typography variant="subtitle2" fontWeight={600}>
              {t("site.sections.texts")}
            </Typography>
            <TextField
              label={t("site.taglineLabel")}
              placeholder={t("site.taglinePlaceholder")}
              value={config.tagline}
              onChange={(e) => patch({ tagline: e.target.value })}
              disabled={!canUpdate}
              size="small"
              inputProps={{ maxLength: 160 }}
              helperText={t("site.taglineHint")}
            />
            <TextField
              label={t("site.aboutLabel")}
              placeholder={t("site.aboutPlaceholder")}
              value={config.about}
              onChange={(e) => patch({ about: e.target.value })}
              disabled={!canUpdate}
              size="small"
              multiline
              minRows={4}
              inputProps={{ maxLength: 1200 }}
              helperText={t("site.aboutHint")}
            />
            <TextField
              label={t("site.workHoursLabel")}
              placeholder={t("site.workHoursPlaceholder")}
              value={config.workHours}
              onChange={(e) => patch({ workHours: e.target.value })}
              disabled={!canUpdate}
              size="small"
              inputProps={{ maxLength: 120 }}
            />

            <Divider />

            {/* Акцент */}
            <Typography variant="subtitle2" fontWeight={600}>
              {t("site.sections.accent")}
            </Typography>
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              {ACCENT_PRESETS.map((color) => {
                const active = config.accentColor === color;
                return (
                  <Box
                    key={color}
                    component="button"
                    type="button"
                    aria-label={color}
                    disabled={!canUpdate}
                    onClick={() => patch({ accentColor: color })}
                    sx={{
                      width: 32,
                      height: 32,
                      p: 0,
                      cursor: "pointer",
                      borderRadius: "50%",
                      bgcolor: color,
                      border: 2,
                      borderColor: active ? "text.primary" : "transparent",
                      outline: "1px solid",
                      outlineColor: "divider",
                    }}
                  />
                );
              })}
              <AppButton
                size="small"
                disabled={!canUpdate || !config.accentColor}
                onClick={() => patch({ accentColor: null })}
              >
                {t("site.accentReset")}
              </AppButton>
            </Stack>

            <Divider />

            {/* Блоки */}
            <Typography variant="subtitle2" fontWeight={600}>
              {t("site.sections.blocks")}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gap: 0.5,
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              }}
            >
              {LANDING_BLOCKS.map((block) => (
                <FormControlLabel
                  key={block}
                  control={
                    <Switch
                      checked={config.blocks[block]}
                      disabled={!canUpdate}
                      onChange={(e) =>
                        patch({ blocks: { ...config.blocks, [block]: e.target.checked } })
                      }
                    />
                  }
                  label={t(`site.blocks.${block}`)}
                />
              ))}
            </Box>

            <Divider />

            {/* Соцсети */}
            <Typography variant="subtitle2" fontWeight={600}>
              {t("site.sections.socials")}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              }}
            >
              {LANDING_SOCIALS.map((kind) => (
                <TextField
                  key={kind}
                  label={SOCIAL_LABELS[kind]}
                  placeholder={SOCIAL_PLACEHOLDERS[kind]}
                  value={config.socials[kind]}
                  onChange={(e) =>
                    patch({ socials: { ...config.socials, [kind]: e.target.value } })
                  }
                  disabled={!canUpdate}
                  size="small"
                />
              ))}
            </Box>

            {saveError && <Alert severity="error">{saveError}</Alert>}
            {saved && !dirty && <Alert severity="success">{t("site.saved")}</Alert>}

            <Stack direction="row" gap={1} flexWrap="wrap">
              <AppButton
                variant="contained"
                disabled={!canUpdate || !dirty || busy}
                loading={busy}
                onClick={handleSave}
              >
                {t("common:actions.save")}
              </AppButton>
              <AppButton
                variant="outlined"
                startIcon={<VisibilityOutlined />}
                onClick={handlePreview}
              >
                {t("site.preview")}
              </AppButton>
            </Stack>
          </>
        )}
      </Stack>
    </SettingsLayout>
  );
};

export default SiteSettingsPage;
