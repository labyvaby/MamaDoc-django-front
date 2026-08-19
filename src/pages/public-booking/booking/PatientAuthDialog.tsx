import React from "react";
import { Box, Button, CircularProgress, Dialog, IconButton, Stack, Typography } from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";

import {
  registerPatient,
  requestPatientOtp,
  verifyPatientOtp,
  patientErrorCode,
  type PatientCard,
  type PatientGenderInput,
} from "../../../api/publicPatient";
import { ApiError } from "../../../api/client";
import { useWebOtpAutofill } from "../../../components/auth/useWebOtpAutofill";
import { useT } from "../../../i18n/VerticalProvider";
import { capitalizeFullName } from "../../../utility/name";
import { shortYearInputBlur } from "../../../utility/shortYear";
import type { PhoneCountryInfo } from "../../../utility/phone";
import { usePatientSession } from "../PatientSession";
import { useBookingOrgSlug } from "../orgSlug";
import {
  BOOKING_PRIMARY,
  BOOKING_PRIMARY_HOVER,
  BOOKING_RADIUS,
  BORDER,
  MUTED,
  PILL_RADIUS,
} from "../theme";
import { isPhoneLocalComplete } from "../../../utility/phone";
import { PhoneField } from "./PhoneField";
import { FIELD_SX, INPUT_SX, defaultPhoneCountry, phoneErrorText } from "./fieldStyles";

/**
 * Вход пациента по SMS: телефон → код → выбор карты (или регистрация).
 *
 * Экран выбора нужен потому, что один номер обычно держит несколько карт:
 * клиника педиатрическая, у детей записан телефон родителя. Одна карта —
 * выбираем молча, ни о чём не спрашивая.
 */

type Step = "phone" | "code" | "choose" | "register";

const CODE_LENGTH = 6;

const PrimaryButton: React.FC<
  React.PropsWithChildren<{ onClick: () => void; disabled?: boolean }>
> = ({ onClick, disabled, children }) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    disableElevation
    sx={{
      width: "100%",
      py: 1.75,
      borderRadius: PILL_RADIUS,
      fontSize: 16,
      fontWeight: 600,
      color: "#FFFFFF",
      bgcolor: BOOKING_PRIMARY,
      "&:hover": { bgcolor: BOOKING_PRIMARY_HOVER },
      "&.Mui-disabled": { bgcolor: BOOKING_PRIMARY, color: "#FFFFFF", opacity: 0.6 },
    }}
  >
    {children}
  </Button>
);

export const PatientAuthDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Вызывается, когда карта выбрана и сессия готова к работе. */
  onSignedIn?: () => void;
}> = ({ open, onClose, onSignedIn }) => {
  const { t } = useT("publicBooking");
  const { signIn, selectPatient, addPatient, session, selectedPatient } = usePatientSession();
  // Пул пациентов у каждой клиники свой — вход всегда в клинику из адреса.
  const orgSlug = useBookingOrgSlug();

  const [step, setStep] = React.useState<Step>("phone");
  const [country, setCountry] = React.useState<PhoneCountryInfo>(defaultPhoneCountry);
  const [phone, setPhone] = React.useState("");
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [cards, setCards] = React.useState<PatientCard[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryAfter, setRetryAfter] = React.useState(0);
  // Защита от двойной проверки: код может прийти из SMS ровно в тот момент,
  // когда пациент дожал последнюю цифру руками.
  const verifyingRef = React.useRef(false);

  // Поля регистрации (A3): бэк требует все четыре.
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [gender, setGender] = React.useState<PatientGenderInput | "">("");

  const fullPhone = country.dialCode + phone.replace(/\D/g, "");
  const phoneOk = isPhoneLocalComplete(country.dialCode, phone);

  React.useEffect(() => {
    if (!open) {
      // Закрыли — сбрасываем всё, кроме номера: повторный вход обычно с того же.
      setStep("phone");
      setCode("");
      setError(null);
      setBusy(false);
      setPhoneTouched(false);
      return;
    }
    // Уже вошли, но карта не выбрана (несколько карт на номер) — открываемся
    // сразу на выборе: вводить телефон и код второй раз незачем.
    if (session && !selectedPatient && session.patients.length > 0) {
      setCards(session.patients);
      setStep("choose");
    }
    // Шаг вычисляем на момент открытия; дальше им управляют обработчики.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Обратный отсчёт до повторной отправки — бэк присылает retry_after (60 с).
  React.useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setTimeout(() => setRetryAfter((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [retryAfter]);

  const describeError = (e: unknown): string => {
    const code = patientErrorCode(e);
    if (code === "invalid_code" || code === "code_expired") return t("auth.codeInvalid");
    // Клиники с таким slug нет — чинить нечего ни пациенту, ни повтором:
    // отправляем звонить в регистратуру, а не «попробуйте ещё раз».
    if (code === "organization_not_found") return t("auth.orgNotFound");
    if (e instanceof ApiError && e.status === 429) return t("tooManyAttempts");
    return t("auth.failed");
  };

  const handleRequestCode = async () => {
    if (!phoneOk) {
      setPhoneTouched(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await requestPatientOtp(fullPhone, orgSlug);
      setRetryAfter(res.retryAfter || 60);
      setStep("code");
      setCode("");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  // codeOverride — для авто-входа сразу после подстановки кода из SMS: на этот
  // момент state ещё без кода (setCode асинхронный).
  const handleVerify = async (codeOverride?: string) => {
    const value = (codeOverride ?? code).trim();
    if (value.length < CODE_LENGTH || verifyingRef.current) return;
    verifyingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyPatientOtp(fullPhone, value, orgSlug);
      signIn(fullPhone, result);
      if (result.patients.length === 0) {
        setStep("register");
      } else if (result.patients.length === 1) {
        onSignedIn?.();
        onClose();
      } else {
        setCards(result.patients);
        setStep("choose");
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      verifyingRef.current = false;
      setBusy(false);
    }
  };

  // Код из входящей SMS (Android Chrome) — подставляем и входим сразу.
  useWebOtpAutofill({
    enabled: open && step === "code",
    onCode: (smsCode) => {
      const value = smsCode.slice(0, CODE_LENGTH);
      setCode(value);
      if (value.length === CODE_LENGTH) void handleVerify(value);
    },
  });

  const handleRegister = async () => {
    if (!session?.token) return;
    if (!firstName.trim() || !lastName.trim() || !birthDate || !gender) {
      setError(t("auth.registerRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const card = await registerPatient(session.token, {
        firstName: capitalizeFullName(firstName.trim()),
        lastName: capitalizeFullName(lastName.trim()),
        birthDate,
        gender,
      });
      addPatient(card);
      onSignedIn?.();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const body = () => {
    if (step === "phone") {
      return (
        <>
          <Typography sx={{ fontSize: 14, color: "#333", textAlign: "center" }}>
            {t("auth.phoneHint")}
          </Typography>
          <PhoneField
            country={country}
            phone={phone}
            error={phoneTouched && !phoneOk}
            onCountryChange={setCountry}
            onPhoneChange={(v) => {
              setPhone(v);
              if (isPhoneLocalComplete(country.dialCode, v)) setPhoneTouched(false);
            }}
            onEnter={() => void handleRequestCode()}
          />
          {phoneTouched && !phoneOk && (
            <Typography sx={{ width: "100%", mt: -1, fontSize: 13, color: "error.main" }}>
              {phoneErrorText(country.dialCode, t)}
            </Typography>
          )}
          <PrimaryButton onClick={() => void handleRequestCode()} disabled={busy}>
            {busy ? t("sending") : t("auth.getCode")}
          </PrimaryButton>
        </>
      );
    }

    if (step === "code") {
      return (
        <>
          <Typography sx={{ fontSize: 14, color: "#333", textAlign: "center" }}>
            {t("auth.codeHint", { phone: fullPhone })}
          </Typography>
          <Box sx={FIELD_SX}>
            <Box
              component="input"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              name="one-time-code"
              value={code}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
                setCode(next);
                // Код набран (или подставлен из SMS в iOS Safari) — входим сами,
                // жать «Войти» после автоподстановки пациенту незачем.
                if (next.length === CODE_LENGTH) void handleVerify(next);
              }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") void handleVerify();
              }}
              placeholder={t("auth.codePlaceholder")}
              sx={{ ...INPUT_SX, textAlign: "center", letterSpacing: 6, fontSize: 20 }}
            />
          </Box>
          <PrimaryButton
            onClick={() => void handleVerify()}
            disabled={busy || code.length < CODE_LENGTH}
          >
            {busy ? t("auth.checking") : t("auth.signIn")}
          </PrimaryButton>
          <Button
            onClick={() => void handleRequestCode()}
            disabled={busy || retryAfter > 0}
            sx={{ fontSize: 13, color: MUTED, textTransform: "none" }}
          >
            {retryAfter > 0 ? t("auth.resendIn", { seconds: retryAfter }) : t("auth.resend")}
          </Button>
        </>
      );
    }

    if (step === "choose") {
      return (
        <>
          <Typography sx={{ fontSize: 14, color: "#333", textAlign: "center" }}>
            {t("auth.chooseHint")}
          </Typography>
          <Stack spacing={1} sx={{ width: "100%" }}>
            {cards.map((c) => (
              <Stack
                key={c.id}
                direction="row"
                alignItems="center"
                spacing={1.5}
                onClick={() => {
                  selectPatient(c.id);
                  onSignedIn?.();
                  onClose();
                }}
                sx={{
                  p: 1.5,
                  border: `1px solid ${BORDER}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "border-color .2s",
                  "&:hover": { borderColor: BOOKING_PRIMARY },
                }}
              >
                <PersonOutlineOutlined sx={{ fontSize: 22, color: MUTED }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 500 }} noWrap>
                    {c.fullName}
                  </Typography>
                  {c.birthDate && (
                    <Typography sx={{ fontSize: 12, color: MUTED }}>
                      {t("auth.birthDate", { date: c.birthDate })}
                    </Typography>
                  )}
                </Box>
              </Stack>
            ))}
          </Stack>
        </>
      );
    }

    // step === "register": номера не было в базе — создаём карту.
    return (
      <>
        <Typography sx={{ fontSize: 14, color: "#333", textAlign: "center" }}>
          {t("auth.registerHint")}
        </Typography>
        <Box sx={FIELD_SX}>
          <Box
            component="input"
            value={lastName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
            placeholder={t("auth.lastName")}
            sx={INPUT_SX}
          />
        </Box>
        <Box sx={FIELD_SX}>
          <Box
            component="input"
            value={firstName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
            placeholder={t("auth.firstName")}
            sx={INPUT_SX}
          />
        </Box>
        <Box sx={FIELD_SX}>
          <Box
            component="input"
            type="date"
            value={birthDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBirthDate(e.target.value)}
            onBlur={shortYearInputBlur("past", setBirthDate)}
            sx={INPUT_SX}
          />
        </Box>
        <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
          {(["female", "male"] as PatientGenderInput[]).map((g) => (
            <Button
              key={g}
              onClick={() => setGender(g)}
              sx={{
                flex: 1,
                py: 1.25,
                borderRadius: "8px",
                border: `1px solid ${gender === g ? BOOKING_PRIMARY : BORDER}`,
                color: gender === g ? BOOKING_PRIMARY : "text.primary",
                fontWeight: 500,
                textTransform: "none",
              }}
            >
              {t(g === "female" ? "auth.genderFemale" : "auth.genderMale")}
            </Button>
          ))}
        </Stack>
        <PrimaryButton onClick={() => void handleRegister()} disabled={busy}>
          {busy ? t("sending") : t("auth.registerAction")}
        </PrimaryButton>
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      PaperProps={{
        sx: {
          maxWidth: 400,
          width: "100%",
          m: 2,
          borderRadius: BOOKING_RADIUS,
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
        },
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, pt: 1.5 }}>
        {step === "code" && (
          <IconButton size="small" onClick={() => setStep("phone")} aria-label={t("auth.back")}>
            <ArrowBackOutlined sx={{ fontSize: 20 }} />
          </IconButton>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={onClose} aria-label={t("auth.close")}>
          <CloseOutlined sx={{ fontSize: 20 }} />
        </IconButton>
      </Stack>

      <Stack alignItems="center" spacing={2} sx={{ px: 3, pb: 3, pt: 0.5 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{t("auth.title")}</Typography>
        {body()}
        {error && (
          <Typography sx={{ width: "100%", fontSize: 14, color: "error.main", textAlign: "center" }}>
            {error}
          </Typography>
        )}
        {busy && step === "choose" && <CircularProgress size={20} />}
      </Stack>
    </Dialog>
  );
};
