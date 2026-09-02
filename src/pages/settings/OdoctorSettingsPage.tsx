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
  applyClearPasswordToggle,
  findOdoctorSettingsProblem,
  getOdoctorSettings,
  odoctorSettingsErrorMessage,
  odoctorSettingsToForm,
  parseHorizonDays,
  passwordFieldState,
  saveOdoctorSettingsForm,
  ODOCTOR_HORIZON_MAX_DAYS,
  type OdoctorPasswordFieldState,
  type OdoctorSettingsForm,
} from "../../api/odoctor";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

/** Подпись под полем пароля — по состоянию из passwordFieldState. */
const PASSWORD_HELPER: Record<OdoctorPasswordFieldState, string> = {
  clearing: "odoctor.form.passwordClearing",
  changing: "odoctor.form.passwordChanging",
  set: "odoctor.form.passwordSet",
  unset: "odoctor.form.passwordUnset",
};

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
   * Первое заполнение формы и подхват внешних изменений строки настроек.
   *
   * Только этот путь, и только через `odoctorSettingsToForm` — там живёт
   * правило «поле пароля из ответа не заполняется никогда». Незаконченную
   * правку эффект не затирает: пока данные структурно те же, react-query
   * держит прежнюю ссылку.
   *
   * ⚠ Сбросом формы после сохранения этот эффект быть не может — ровно по той
   * же причине: смена одного пароля возвращает побайтово тот же payload,
   * ссылка не меняется, и эффект не срабатывает. Сброс живёт в `handleSave`,
   * см. `saveOdoctorSettingsForm`.
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
      const { settings: next, form: nextForm } = await saveOdoctorSettingsForm(form, orgId);
      // Кладём ответ в кеш вместо инвалидации: он и есть сохранённое
      // состояние, а лишний GET заново собрал бы ту же строку.
      queryClient.setQueryData(djangoQueryKeys.odoctor.settings(orgId ?? null), next);
      // Сброс формы — здесь, безусловно, а не эффектом на данных запроса:
      // setQueryData на совпадающем ответе оставляет прежнюю ссылку, и
      // набранный пароль остался бы в поле (см. saveOdoctorSettingsForm).
      setForm(nextForm);
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
              onChange={(e) => patch({ horizonDays: parseHorizonDays(e.target.value) })}
              disabled={busy}
              inputProps={{ min: 0, max: ODOCTOR_HORIZON_MAX_DAYS }}
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
              helperText={t(PASSWORD_HELPER[passwordFieldState(form, hasPassword)])}
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
                      onChange={(e) => {
                        // Введённый пароль и стирание вместе бэк отвергает
                        // (400), поэтому взведённая галочка очищает поле, а не
                        // копит противоречие. Правило — в applyClearPasswordToggle,
                        // под тестом: на нём и держится «отправить нельзя вовсе».
                        setSaveError(null);
                        setForm((prev) =>
                          prev ? applyClearPasswordToggle(prev, e.target.checked) : prev,
                        );
                      }}
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
