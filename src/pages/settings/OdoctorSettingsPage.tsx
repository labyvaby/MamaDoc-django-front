import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormHelperText,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";
import {
  buildOdoctorSettingsPatch,
  findOdoctorSettingsProblem,
  getOdoctorSettings,
  odoctorSettingsErrorMessage,
  odoctorSettingsToForm,
  updateOdoctorSettings,
  type OdoctorSettingsForm,
} from "../../api/odoctor";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

// ── Главный компонент ────────────────────────────────────────────────────────

/**
 * Настройки интеграции с витриной записи odoctor.kg — единственный интерфейс к
 * учётной записи внешнего кабинета: до этой страницы её можно было завести
 * только в админке Django, куда оператор клиники не ходит и ходить не должен.
 *
 * Права на чтение и на запись у бэка одни (`odoctor.manage`), поэтому режима
 * «смотреть, но не править» здесь нет — роут гейтит страницу целиком.
 */
const OdoctorSettingsPage: React.FC = () => {
  const { t } = useT("settings");
  usePageTitle(t("odoctor.title"));
  const {
    isSuperAdmin,
    activeOrganization,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<OdoctorSettingsForm | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;
  const orgId = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;

  const settingsQuery = useQuery({
    queryKey: djangoQueryKeys.odoctor.settings(orgId ?? null),
    queryFn: ({ signal }) => getOdoctorSettings(signal, { organizationId: orgId }),
    enabled: !permLoading && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 404, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const settings = settingsQuery.data;

  /**
   * Форма заполняется из ответа сервера ровно один раз на каждый ответ, и
   * только через `odoctorSettingsToForm` — там же живёт правило «поле пароля
   * из ответа не заполняется никогда».
   *
   * Ключ эффекта — сам объект ответа, а не его поля: после сохранения бэк
   * отдаёт сохранённое состояние, и форма должна встать на него (в том числе
   * очистить поле пароля и снять галочку отзыва). Правки, которые оператор
   * ещё не сохранил, при этом не затираются: пока запрос не перезапросили,
   * ссылка на данные та же.
   */
  React.useEffect(() => {
    if (settings) setForm(odoctorSettingsToForm(settings));
  }, [settings]);

  const hasPassword = settings?.hasPassword ?? false;
  // 404 = эндпоинта ещё нет на бэке. Сырое «Page not found» ничего не
  // объясняет — показываем причину словами.
  const notImplemented = (settingsQuery.error as ApiError)?.status === 404;

  const patch = (change: Partial<OdoctorSettingsForm>) => {
    setSaveError(null);
    setForm((prev) => (prev ? { ...prev, ...change } : prev));
  };

  /**
   * Причина, по которой бэк откажет. Показываем её до отправки и блокируем
   * сохранение: все три отказа бэка — про недопустимое состояние, и оператору
   * нужна инструкция, а не 400 с техническим ключом.
   */
  const problem = form ? findOdoctorSettingsProblem(form, hasPassword) : null;

  const handleSave = async () => {
    if (!form || problem) return;
    setBusy(true);
    setSaveError(null);
    try {
      const next = await updateOdoctorSettings(buildOdoctorSettingsPatch(form, orgId));
      // Кладём ответ в кеш вместо инвалидации: он и есть сохранённое
      // состояние, а лишний GET заново собрал бы ту же строку.
      queryClient.setQueryData(djangoQueryKeys.odoctor.settings(orgId ?? null), next);
      setSaved(true);
    } catch (e) {
      setSaveError(odoctorSettingsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsLayout>
      <Stack spacing={3}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={2}
          flexWrap="wrap"
        >
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {t("odoctor.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("odoctor.description")}
            </Typography>
          </Box>
        </Stack>

        {needsOrg && <Alert severity="info">{t("odoctor.needsOrg")}</Alert>}

        {settingsQuery.error && !needsOrg && (
          <Alert severity={notImplemented ? "info" : "error"}>
            {notImplemented
              ? t("odoctor.notImplemented")
              : odoctorSettingsErrorMessage(settingsQuery.error)}
          </Alert>
        )}

        {settingsQuery.isLoading && !needsOrg && (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {form && (
          <>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.isEnabled}
                    onChange={(e) => patch({ isEnabled: e.target.checked })}
                    disabled={busy}
                  />
                }
                label={t("odoctor.form.enabledLabel")}
              />
              <FormHelperText>{t("odoctor.form.enabledHelper")}</FormHelperText>
            </Box>

            <TextField
              label={t("odoctor.form.horizonLabel")}
              type="number"
              size="small"
              value={form.horizonDays}
              onChange={(e) => {
                // Пустое поле держим нулём, а не NaN: ноль — осмысленное
                // состояние (бэк отвергает его только при включённой
                // интеграции), и о нём есть что сказать словами.
                const parsed = Number.parseInt(e.target.value, 10);
                patch({ horizonDays: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 });
              }}
              disabled={busy}
              inputProps={{ min: 0, max: 365 }}
              helperText={t("odoctor.form.horizonHelper")}
              sx={{ maxWidth: 320 }}
            />

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                {t("odoctor.credentialsTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("odoctor.credentialsDescription")}
              </Typography>
            </Box>

            <TextField
              label={t("odoctor.form.loginLabel")}
              size="small"
              value={form.odoctorLogin}
              onChange={(e) => patch({ odoctorLogin: e.target.value })}
              disabled={busy}
              inputProps={{ maxLength: 254 }}
              autoComplete="off"
              sx={{ maxWidth: 420 }}
            />

            {/*
              Поле пароля пустое всегда: значения в ответе нет и быть не может,
              а пустое поле уже значит «оставить прежний». Подпись рядом — по
              hasPassword, иначе пустое поле нельзя отличить от незаданного
              пароля.
            */}
            <TextField
              label={t("odoctor.form.passwordLabel")}
              type="password"
              size="small"
              value={form.newPassword}
              onChange={(e) => patch({ newPassword: e.target.value })}
              disabled={busy || form.clearPassword}
              inputProps={{ maxLength: 254 }}
              autoComplete="new-password"
              helperText={
                form.newPassword !== ""
                  ? t("odoctor.form.passwordChanging")
                  : hasPassword
                    ? t("odoctor.form.passwordSet")
                    : t("odoctor.form.passwordUnset")
              }
              sx={{ maxWidth: 420 }}
            />

            {/*
              Отзыв пароля — отдельный явный элемент, а не пустое поле ввода:
              пустым полем выглядит любая правка соседних настроек, и стирание
              на этом месте выключало бы интеграцию молча. Показываем только
              когда пароль есть — отзывать иначе нечего.
            */}
            {hasPassword && (
              <Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.clearPassword}
                      onChange={(e) =>
                        // Введённый пароль и стирание вместе бэк отвергает
                        // (400), поэтому взведённая галочка очищает поле, а не
                        // копит противоречие.
                        patch(
                          e.target.checked
                            ? { clearPassword: true, newPassword: "" }
                            : { clearPassword: false },
                        )
                      }
                      disabled={busy}
                    />
                  }
                  label={t("odoctor.form.clearPasswordLabel")}
                />
                <FormHelperText>
                  {form.clearPassword
                    ? t("odoctor.form.clearPasswordPending")
                    : t("odoctor.form.clearPasswordHelper")}
                </FormHelperText>
              </Box>
            )}

            {problem && <Alert severity="warning">{t(`odoctor.problems.${problem}`)}</Alert>}

            {saveError && (
              <Alert severity="error" onClose={() => setSaveError(null)}>
                {saveError}
              </Alert>
            )}

            <Box>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={busy || problem !== null}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {busy ? t("common:state.saving") : t("odoctor.saveButton")}
              </Button>
            </Box>
          </>
        )}
      </Stack>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message={t("odoctor.savedSnack")}
      />
    </SettingsLayout>
  );
};

export default OdoctorSettingsPage;
