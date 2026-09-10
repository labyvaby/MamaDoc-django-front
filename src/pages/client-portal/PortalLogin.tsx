import React from "react";
import { Alert, Box, Button, CircularProgress, Link, Stack, TextField, Typography } from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";

import { ApiError } from "../../api/client";
import { isPortalOrgUnknown, requestPortalOtp, verifyPortalOtp } from "../../api/clientPortal";
import { useWebOtpAutofill } from "../../components/auth/useWebOtpAutofill";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  isPhoneLocalComplete,
  normalizePhoneLocal,
  phonePlaceholder,
} from "../../utility/phone";
import { useClientPortalSession } from "./session";

/**
 * Вход клиента в биллинговый ЛК: телефон → код из SMS.
 *
 * Экрана выбора карты, как на витрине записи, здесь нет: `otp/verify/` отдаёт
 * ровно одного клиента (`clientId`), и связка «один телефон — несколько
 * плательщиков» в биллинге решается семейной группой внутри кабинета, а не
 * выбором при входе.
 */

const CODE_LENGTH = 6;

/** Кулдаун повторной отправки на бэке — `OTP_RESEND_COOLDOWN_SECONDS`, 60 с. */
const RESEND_SECONDS = 60;

/** Только цифры страны + локальная часть: бэк сам нормализует KG-номера. */
function fullPhone(local: string): string {
  return `${DEFAULT_PHONE_COUNTRY_CODE}${local}`;
}

export const PortalLogin: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
  const { signIn } = useClientPortalSession();
  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [local, setLocal] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  const phoneReady = isPhoneLocalComplete(DEFAULT_PHONE_COUNTRY_CODE, local);

  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const send = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await requestPortalOtp(orgSlug, fullPhone(local));
      setStep("code");
      setCode("");
      setSecondsLeft(RESEND_SECONDS);
    } catch (e) {
      // 404 здесь — неизвестная организация, а не «номера нет»: сам факт
      // регистрации номера бэк не раскрывает и всегда отвечает «отправлено».
      setError(
        isPortalOrgUnknown(e)
          ? "Организация не найдена. Проверьте ссылку, по которой вы открыли кабинет."
          : e instanceof ApiError
          ? e.message
          : "Не удалось отправить код. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }, [orgSlug, local]);

  const verify = React.useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await verifyPortalOtp(orgSlug, fullPhone(local), value);
        signIn(fullPhone(local), result.token, result.clientId);
      } catch (e) {
        // 401 — и неверный код, и просроченный: бэк их не различает.
        setError(
          e instanceof ApiError && e.status === 401
            ? "Неверный или просроченный код. Запросите новый."
            : e instanceof ApiError
            ? e.message
            : "Не удалось войти. Попробуйте ещё раз.",
        );
        setCode("");
      } finally {
        setBusy(false);
      }
    },
    [orgSlug, local, signIn],
  );

  // Android подставляет код из SMS сам, если сообщение размечено; на остальных
  // платформах хук ничего не делает.
  useWebOtpAutofill({
    enabled: step === "code",
    onCode: (received) => {
      setCode(received);
      void verify(received);
    },
  });

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Вход в кабинет
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {step === "phone"
            ? "Введите номер телефона, который вы оставили в организации."
            : `Код отправлен на ${fullPhone(local)}. Он действует 5 минут.`}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {step === "phone" ? (
        <>
          <TextField
            label="Телефон"
            value={local}
            onChange={(e) =>
              setLocal(normalizePhoneLocal(DEFAULT_PHONE_COUNTRY_CODE, e.target.value))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && phoneReady && !busy) void send();
            }}
            placeholder={phonePlaceholder(DEFAULT_PHONE_COUNTRY_CODE)}
            slotProps={{
              input: { startAdornment: <Box sx={{ mr: 1 }}>{DEFAULT_PHONE_COUNTRY_CODE}</Box> },
              htmlInput: { inputMode: "tel", autoComplete: "tel-national" },
            }}
            fullWidth
            autoFocus
          />
          <Button
            variant="contained"
            size="large"
            disableElevation
            disabled={!phoneReady || busy}
            onClick={() => void send()}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            Получить код
          </Button>
        </>
      ) : (
        <>
          <TextField
            label="Код из SMS"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            disabled={busy}
            slotProps={{
              htmlInput: {
                inputMode: "numeric",
                autoComplete: "one-time-code",
                maxLength: CODE_LENGTH,
                style: { letterSpacing: "0.5em", fontSize: 20 },
              },
            }}
            fullWidth
            autoFocus
          />
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              size="small"
              startIcon={<ArrowBackOutlined />}
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
            >
              Другой номер
            </Button>
            <Box sx={{ flex: 1 }} />
            {secondsLeft > 0 ? (
              <Typography variant="body2" color="text.secondary">
                Новый код через {secondsLeft} с
              </Typography>
            ) : (
              <Link component="button" type="button" onClick={() => void send()} disabled={busy}>
                Отправить код ещё раз
              </Link>
            )}
          </Stack>
          {busy && <CircularProgress size={20} sx={{ alignSelf: "center" }} />}
        </>
      )}
    </Stack>
  );
};
