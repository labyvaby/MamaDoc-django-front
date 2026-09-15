import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import dayjs from "dayjs";

import {
  retryWhatsAppSetup,
  setupState,
  type WhatsAppSetupInfo,
  type WhatsAppSettings,
} from "../../../api/whatsapp";
import { useT } from "../../../i18n/VerticalProvider";

const formatAt = (value: string | null | undefined): string =>
  value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—";

const STATE_COLOR = {
  confirmed: "success",
  pending: "warning",
  failed: "error",
} as const;

interface WhatsAppSetupCardProps {
  setup: WhatsAppSetupInfo | undefined;
  organizationId: number;
  onUpdated: (data: WhatsAppSettings) => void;
}

/**
 * Настройка приложения Meta со стороны Raven: вебхук и подписка на WABA.
 *
 * Пока Meta не подтвердила вебхук, статусы доставки и вердикты по шаблонам
 * не приходят — поэтому блок не прячет неудачу за общим «ошибка», а даёт
 * ровно два выхода: «Повторить настройку» (Raven пробует ещё раз с
 * сохранёнными данными) и ручной ввод Callback URL и Verify token в App
 * Dashboard, с кнопками копирования.
 */
export const WhatsAppSetupCard: React.FC<WhatsAppSetupCardProps> = ({
  setup,
  organizationId,
  onUpdated,
}) => {
  const { t } = useT("settings");
  const [error, setError] = useState<string | null>(null);
  const state = setupState(setup);

  const retry = useMutation({
    mutationFn: () => retryWhatsAppSetup({ organizationId }),
    onSuccess: (data) => {
      setError(null);
      onUpdated(data);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("whatsapp.setup.retryError"));
    },
  });

  const steps: { label: string; done: boolean; at: string | null; error: string }[] = setup
    ? [
        {
          label: t("whatsapp.setup.steps.registered"),
          done: setup.webhookRegistered,
          at: setup.webhookRegisteredAt,
          error: setup.webhookError,
        },
        {
          label: t("whatsapp.setup.steps.confirmed"),
          done: setup.webhookConfirmed,
          at: setup.webhookVerifiedAt,
          error: "",
        },
        {
          label: t("whatsapp.setup.steps.subscribed"),
          done: setup.appSubscribed,
          at: setup.appSubscribedAt,
          error: setup.appSubscriptionError,
        },
      ]
    : [];

  return (
    <Stack spacing={1.25} sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
          {t("whatsapp.setup.title")}
        </Typography>
        <Tooltip title={t(`whatsapp.setup.stateHint.${state}`)}>
          <Chip
            size="small"
            label={t(`whatsapp.setup.state.${state}`)}
            color={STATE_COLOR[state]}
            sx={{ fontWeight: 600 }}
          />
        </Tooltip>
      </Stack>

      {steps.length > 0 && (
        <Stack spacing={0.5}>
          {steps.map((step) => (
            <Stack key={step.label} direction="row" spacing={1} alignItems="flex-start">
              <CheckCircleOutlined
                fontSize="small"
                color={step.done ? "success" : "disabled"}
                sx={{ mt: "2px" }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2">
                  {step.label}
                  {step.done && (
                    <Typography component="span" variant="caption" color="text.secondary">
                      {" · "}
                      {formatAt(step.at)}
                    </Typography>
                  )}
                </Typography>
                {step.error && (
                  <Typography variant="caption" color="error.main" sx={{ wordBreak: "break-word" }}>
                    {step.error}
                  </Typography>
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
      )}

      {state !== "confirmed" && setup && (
        <Alert severity={state === "failed" ? "warning" : "info"}>
          <Typography variant="body2" gutterBottom>
            {t("whatsapp.setup.manualIntro")}
          </Typography>
          <CopyRow label={t("whatsapp.setup.callbackUrl")} value={setup.webhookUrl} />
          <CopyRow label={t("whatsapp.setup.verifyToken")} value={setup.webhookVerifyToken} />
          <Typography variant="caption" color="text.secondary">
            {t("whatsapp.setup.manualFields")}
          </Typography>
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {state !== "confirmed" && (
        <Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              retry.isPending ? <CircularProgress size={16} color="inherit" /> : <ReplayOutlined />
            }
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            {t("whatsapp.setup.retry")}
          </Button>
        </Box>
      )}
    </Stack>
  );
};

const CopyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { t } = useT("settings");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена недоступен (http, старый браузер) — значение и так на экране.
    }
  };

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}:
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontFamily: "monospace", wordBreak: "break-all", flex: 1, minWidth: 0 }}
      >
        {value || "—"}
      </Typography>
      {value && (
        <Tooltip title={copied ? t("whatsapp.setup.copied") : t("whatsapp.setup.copy")}>
          <IconButton size="small" onClick={copy} aria-label={t("whatsapp.setup.copy")}>
            <ContentCopyOutlined fontSize="inherit" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
};
