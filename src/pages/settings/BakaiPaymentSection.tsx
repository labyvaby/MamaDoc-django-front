import React from "react";
import {
  Alert,
  Box,
  Chip,
  FormControlLabel,
  FormLabel,
  IconButton,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import AutorenewOutlined from "@mui/icons-material/AutorenewOutlined";

import { AppButton } from "../../components/ui/AppButton";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  getPaymentWebhooks,
  rotatePaymentWebhooks,
  updateOrganization,
  type DjangoOrganization,
  type PaymentWebhooks,
} from "../../api/organization";
import { getErrorFields, getErrorMessage } from "../../api/client";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Подключение онлайн-оплаты Bakai самим админом организации: токен
 * OpenBanking → переключатель → URL вебхуков для кабинета Bakai → перевыпуск
 * секрета. URL собирает бэк, фронт их только показывает
 * (гайд `payment-webhooks-frontend-guide.md`).
 *
 * Эндпоинт вебхуков требует `organization.update`, поэтому секция рендерится
 * только тем, кто может править организацию.
 */
const BakaiPaymentSection: React.FC<{
  org: DjangoOrganization;
  onOrgUpdated: (org: DjangoOrganization) => void;
  disabled?: boolean;
}> = ({ org, onOrgUpdated, disabled = false }) => {
  const { t } = useT("settings");

  const [hooks, setHooks] = React.useState<PaymentWebhooks | null>(null);
  const [hooksLoading, setHooksLoading] = React.useState(true);
  const [hooksError, setHooksError] = React.useState<string | null>(null);

  const [token, setToken] = React.useState("");
  const [tokenSaving, setTokenSaving] = React.useState(false);
  const [tokenError, setTokenError] = React.useState<string | null>(null);

  const [toggling, setToggling] = React.useState(false);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);
  const [rotateError, setRotateError] = React.useState<string | null>(null);
  const [rotated, setRotated] = React.useState(false);

  const loadHooks = React.useCallback(async () => {
    setHooksLoading(true);
    setHooksError(null);
    try {
      setHooks(await getPaymentWebhooks(org.id));
    } catch (err) {
      setHooksError(getErrorMessage(err));
    } finally {
      setHooksLoading(false);
    }
  }, [org.id]);

  React.useEffect(() => {
    loadHooks();
  }, [loadHooks]);

  // Флаги берём из ответа вебхуков: в нём они есть всегда, а старый ответ
  // GET /organization/<id>/ может их не содержать.
  const tokenSet = hooks?.bakaiTokenSet ?? !!org.bakaiTokenMasked;
  const enabled = hooks?.onlinePaymentEnabled ?? org.onlinePaymentEnabled;
  const trimmedToken = token.trim();

  const handleSaveToken = async () => {
    if (!trimmedToken) return;
    setTokenSaving(true);
    setTokenError(null);
    try {
      const updated = await updateOrganization(org.id, {
        bakaiOpenbankingToken: trimmedToken,
      });
      onOrgUpdated(updated);
      setToken("");
      // bakaiTokenSet живёт в ответе вебхуков — перечитываем (URL при этом
      // не меняется, повторный GET отдаёт тот же секрет).
      await loadHooks();
    } catch (err) {
      setTokenError(
        getErrorFields(err)?.bakaiOpenbankingToken ?? getErrorMessage(err),
      );
    } finally {
      setTokenSaving(false);
    }
  };

  const handleToggle = async (next: boolean) => {
    setToggling(true);
    setToggleError(null);
    try {
      const updated = await updateOrganization(org.id, {
        onlinePaymentEnabled: next,
      });
      onOrgUpdated(updated);
      await loadHooks();
    } catch (err) {
      // Без токена бэк отвечает 400 с ошибкой на поле bakaiOpenbankingToken.
      setToggleError(
        getErrorFields(err)?.bakaiOpenbankingToken ?? getErrorMessage(err),
      );
    } finally {
      setToggling(false);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      setHooks(await rotatePaymentWebhooks(org.id));
      setRotated(true);
      setConfirmOpen(false);
    } catch (err) {
      setRotateError(getErrorMessage(err));
      setConfirmOpen(false);
    } finally {
      setRotating(false);
    }
  };

  const locked = disabled || tokenSaving || toggling || rotating;

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
        <PaymentsOutlined fontSize="small" color="action" />
        <FormLabel sx={{ fontWeight: 600 }}>{t("organization.bakai.sectionTitle")}</FormLabel>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
        {t("organization.bakai.sectionHint")}
      </Typography>

      <Stack spacing={2}>
        {/* 1. Токен */}
        <Box>
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            flexWrap="wrap"
            mb={1}
          >
            <Typography variant="body2" fontWeight={500}>
              {t("organization.bakai.tokenTitle")}
            </Typography>
            {tokenSet ? (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                icon={<CheckOutlined />}
                label={
                  org.bakaiTokenMasked
                    ? t("organization.bakai.tokenSavedMasked", {
                        mask: org.bakaiTokenMasked,
                      })
                    : t("organization.bakai.tokenSaved")
                }
              />
            ) : (
              <Chip
                size="small"
                variant="outlined"
                label={t("organization.bakai.tokenMissing")}
              />
            )}
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "flex-start" }}>
            <TextField
              size="small"
              fullWidth
              type="password"
              autoComplete="off"
              label={
                tokenSet
                  ? t("organization.bakai.tokenReplaceLabel")
                  : t("organization.bakai.tokenLabel")
              }
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTokenError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && trimmedToken) handleSaveToken();
              }}
              disabled={locked}
              error={!!tokenError}
              helperText={tokenError ?? t("organization.bakai.tokenHint")}
            />
            <AppButton
              variant="outlined"
              onClick={handleSaveToken}
              disabled={locked || !trimmedToken}
              loading={tokenSaving}
              sx={{ flexShrink: 0, minHeight: { xs: 44, sm: 40 } }}
            >
              {t("organization.bakai.tokenSave")}
            </AppButton>
          </Stack>
        </Box>

        {/* 2. Переключатель */}
        <Box>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => handleToggle(e.target.checked)}
                // Выключить можно всегда, включить — только с токеном.
                disabled={locked || hooksLoading || (!enabled && !tokenSet)}
              />
            }
            label={
              <Box sx={{ py: 0.25 }}>
                <Typography variant="body2" fontWeight={500}>
                  {t("organization.bakai.enabledLabel")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {!enabled && !tokenSet
                    ? t("organization.bakai.enabledNeedsToken")
                    : t("organization.bakai.enabledHint")}
                </Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", ml: 0, gap: 1, "& .MuiSwitch-root": { mt: -0.5 } }}
          />
          {toggleError && (
            <Alert severity="error" onClose={() => setToggleError(null)} sx={{ mt: 1 }}>
              {toggleError}
            </Alert>
          )}
        </Box>

        {/* 3. URL вебхуков */}
        <Box>
          <Typography variant="body2" fontWeight={500} mb={0.5}>
            {t("organization.bakai.webhooksTitle")}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
            {t("organization.bakai.webhooksHint")}
          </Typography>

          {hooksLoading && !hooks && (
            <Stack spacing={1}>
              <Skeleton variant="rounded" height={40} />
              <Skeleton variant="rounded" height={40} />
            </Stack>
          )}

          {hooksError && (
            <Alert
              severity="error"
              action={
                <AppButton size="small" color="inherit" onClick={loadHooks}>
                  {t("common:actions.retry")}
                </AppButton>
              }
            >
              {hooksError}
            </Alert>
          )}

          {hooks && (
            <Stack spacing={1.5}>
              <WebhookUrlField
                label={t("organization.bakai.billingUrlLabel")}
                value={hooks.billingUrl}
              />
              <WebhookUrlField
                label={t("organization.bakai.bookingsUrlLabel")}
                value={hooks.bookingsUrl}
              />
            </Stack>
          )}
        </Box>

        {/* 4. Перевыпуск секрета */}
        {hooks && (
          <Box>
            <AppButton
              variant="outlined"
              color="warning"
              startIcon={<AutorenewOutlined />}
              onClick={() => {
                setRotated(false);
                setRotateError(null);
                setConfirmOpen(true);
              }}
              disabled={locked}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              {t("organization.bakai.rotate")}
            </AppButton>
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              {t("organization.bakai.rotateHint")}
            </Typography>
            {rotated && (
              <Alert severity="warning" onClose={() => setRotated(false)} sx={{ mt: 1 }}>
                {t("organization.bakai.rotateDone")}
              </Alert>
            )}
            {rotateError && (
              <Alert severity="error" onClose={() => setRotateError(null)} sx={{ mt: 1 }}>
                {rotateError}
              </Alert>
            )}
          </Box>
        )}
      </Stack>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !rotating && setConfirmOpen(false)}
        onConfirm={handleRotate}
        title={t("organization.bakai.rotateConfirmTitle")}
        message={t("organization.bakai.rotateConfirmMessage")}
        confirmText={t("organization.bakai.rotateConfirm")}
        cancelText={t("common:actions.cancel")}
        variant="warning"
        loading={rotating}
      />
    </Box>
  );
};

/** Поле только для чтения с кнопкой «Копировать». */
const WebhookUrlField: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const { t } = useT("settings");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard API недоступен (http, старый браузер): выделяем текст,
      // пользователь копирует сам.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <TextField
      size="small"
      fullWidth
      label={label}
      value={value}
      inputRef={inputRef}
      onFocus={(e) => e.target.select()}
      InputProps={{
        readOnly: true,
        sx: { fontFamily: "monospace", fontSize: 13 },
        endAdornment: (
          <Tooltip
            title={
              copied ? t("organization.bakai.copied") : t("organization.bakai.copy")
            }
          >
            <IconButton
              size="small"
              edge="end"
              onClick={copy}
              aria-label={t("organization.bakai.copy")}
            >
              {copied ? (
                <CheckOutlined fontSize="small" color="success" />
              ) : (
                <ContentCopyOutlined fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        ),
      }}
    />
  );
};

export default BakaiPaymentSection;
