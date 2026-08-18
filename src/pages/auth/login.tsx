import React from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Box,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
  IconButton,
  InputAdornment,
  Tabs,
  Tab,
  CircularProgress,
} from "@mui/material";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphoneOutlined";
import EmailIcon from "@mui/icons-material/EmailOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import {
  login as djangoLogin,
  requestOtp as djangoRequestOtp,
  verifyOtp as djangoVerifyOtp,
} from "../../api";
import { applyMeResponse, refreshAuthContext, usePermissions } from "../../hooks/usePermissions";
import { markBranchPickerPending } from "../../components/auth/BranchPickerDialog";
import { ApiError } from "../../api/client";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import AximoLogo from "../../components/auth/AximoLogo";
import OtpCodeInput from "../../components/auth/OtpCodeInput";
import { useWebOtpAutofill } from "../../components/auth/useWebOtpAutofill";
import { PhoneCountryCodeSelect } from "../../components/ui";
import {
  composePhone,
  getPhoneLocalMaxLength,
  normalizePhoneLocal,
  formatPhoneLocalDisplay,
  parsePhone,
  type PhoneCountryCode,
} from "../../utility/phone";
import { usePhoneLocalInput } from "../../hooks/usePhoneLocalInput";
import { subtleBg } from "../../theme";

// Формат таймера кулдауна: секунды → "M:SS".
const formatMMSS = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const OTP_RESEND_COOLDOWN = 60; // сек — задержка перед повторной отправкой кода

// Простая проверка формата email для инлайн-валидации (не заменяет серверную).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Запоминаем последний выбранный способ входа, чтобы при следующем визите
// открыть привычную вкладку (персонал заходит ежедневно).
const AUTH_METHOD_KEY = "mamadoc:auth-method";

const readSavedAuthMethod = (): "email" | "phone" => {
  try {
    const saved = window.localStorage.getItem(AUTH_METHOD_KEY);
    if (saved === "email" || saved === "phone") return saved;
  } catch {
    // localStorage может быть недоступен (приватный режим) — молча игнорируем
  }
  return "phone";
};

// Запоминаем последний успешно вошедший номер и предзаполняем его при
// следующем визите: персонал заходит ежедневно с одного и того же устройства.
const AUTH_PHONE_KEY = "mamadoc:auth-phone";

const readSavedPhone = () => {
  try {
    return parsePhone(window.localStorage.getItem(AUTH_PHONE_KEY));
  } catch {
    return parsePhone(null);
  }
};

const saveAuthPhone = (fullPhone: string) => {
  try {
    window.localStorage.setItem(AUTH_PHONE_KEY, fullPhone);
  } catch {
    // localStorage недоступен — просто не запомним номер
  }
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get("to") || "/appointments";

  const [authMethod, setAuthMethod] = React.useState<"email" | "phone">(readSavedAuthMethod);

  // -- PHONE STATES --
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(
    () => readSavedPhone().countryCode,
  );
  const [phoneLocal, setPhoneLocal] = React.useState(() => readSavedPhone().local);
  // Правка в середине номера не должна выбрасывать курсор в конец. Обработчика
  // вставки здесь нет, поэтому код страны из буфера по-прежнему режет
  // normalizePhoneLocal — теперь внутри хука.
  const phoneInput = usePhoneLocalInput(
    phoneCountryCode,
    phoneLocal,
    (digits) => {
      setPhoneLocal(digits);
      clearError();
    },
    normalizePhoneLocal,
  );
  const [lastSentPhone, setLastSentPhone] = React.useState<string | null>(null);
  const [otpCode, setOtpCode] = React.useState("");
  const [isOtpSent, setIsOtpSent] = React.useState(false);

  // -- EMAIL STATES --
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);

  // -- COMMON --
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [infoMsg, setInfoMsg] = React.useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [redirecting, setRedirecting] = React.useState(false);

  // Тик кулдауна повторной отправки OTP: 1 раз в секунду до нуля.
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const { authStatus } = usePermissions();
  const didDjangoRedirect = React.useRef(false);
  React.useEffect(() => {
    if (didDjangoRedirect.current) return;
    if (authStatus === 'authenticated') {
      didDjangoRedirect.current = true;
      navigate(redirectTo, { replace: true });
    }
  }, [authStatus, navigate, redirectTo]);

  const handleMethodChange = (_: React.SyntheticEvent, newValue: "email" | "phone") => {
    setAuthMethod(newValue);
    try {
      window.localStorage.setItem(AUTH_METHOD_KEY, newValue);
    } catch {
      // localStorage недоступен — не критично, просто не запомним выбор
    }
    setErrorMsg(null);
    setInfoMsg(null);
    setIsOtpSent(false);
    setOtpCode("");
  };

  const getErrorMessage = (error: unknown): string => {
    // Django ApiError — разбираем по статусу, не показываем технический текст
    if (error instanceof ApiError) {
      if (error.status === 401) return "Неверный логин или пароль";
      if (error.status === 429) {
        return "Приносим извинения: запрос временно не выполнился. Обновите страницу и попробуйте снова";
      }
      if (error.status === 0 || error.status >= 500) {
        return "Сервер временно недоступен. Проверьте подключение и попробуйте снова.";
      }
      // payload может содержать { detail: "..." } от Django
      if (
        error.payload &&
        typeof error.payload === "object" &&
        "detail" in error.payload
      ) {
        return String((error.payload as { detail: unknown }).detail);
      }
    }

    let message = "Произошла неизвестная ошибка";
    if (error instanceof Error) message = error.message;
    else if (typeof error === "object" && error !== null && "message" in error) {
      message = String((error as { message: unknown }).message);
    }

    if (message.includes("Rate limit exceeded")) {
      return "Приносим извинения: запрос временно не выполнился. Обновите страницу и попробуйте снова";
    }
    return message;
  };


  // --- ЛОГИКА ТЕЛЕФОНА ---
  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();

    setLoading(true);
    setErrorMsg(null);

    const digits = phoneLocal.replace(/[^0-9]/g, "");
    const maxLen = getPhoneLocalMaxLength(phoneCountryCode);

    if (digits.length < maxLen) {
      setErrorMsg("Введите полный номер телефона");
      setLoading(false);
      return;
    }

    const fullPhone = composePhone(phoneCountryCode, phoneLocal);

    if (!fullPhone) {
      setErrorMsg("Введите номер телефона");
      setLoading(false);
      return;
    }

    try {
      await djangoRequestOtp(fullPhone);
      setIsOtpSent(true);
      setLastSentPhone(fullPhone);
      setInfoMsg("Если номер зарегистрирован, на него отправлен код.");
      setResendCooldown(OTP_RESEND_COOLDOWN);
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // codeOverride — для авто-сабмита из OtpCodeInput: он зовёт onComplete сразу
  // после onChange, когда otpCode в состоянии ещё без последней цифры.
  const verifyOtp = async (e?: React.FormEvent, codeOverride?: string) => {
    e?.preventDefault();

    setLoading(true);
    setErrorMsg(null);

    const code = (codeOverride ?? otpCode).trim();
    const fullPhone = composePhone(phoneCountryCode, phoneLocal);

    if (!fullPhone) {
      setErrorMsg("Введите номер телефона");
      setLoading(false);
      return;
    }

    try {
      const meData = await djangoVerifyOtp(fullPhone, code);
      saveAuthPhone(fullPhone);
      setRedirecting(true);
      markBranchPickerPending();
      didDjangoRedirect.current = true;
      applyMeResponse(meData);
      await refreshAuthContext();
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Автоподстановка кода из SMS на Android Chrome (условия и ограничения —
  // в самом хуке). На iOS работает пассивный autocomplete в OtpCodeInput.
  useWebOtpAutofill({
    enabled: isOtpSent,
    onCode: (code) => {
      setOtpCode(code);
      void verifyOtp(undefined, code);
    },
  });

  // --- ЛОГИКА EMAIL ---
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const rawLogin = email.trim();
      const normalizedLogin = rawLogin.includes("@")
        ? rawLogin.toLowerCase()
        : rawLogin;
      const meData = await djangoLogin(normalizedLogin, password);
      setRedirecting(true);
      markBranchPickerPending();
      didDjangoRedirect.current = true;
      applyMeResponse(meData);
      await refreshAuthContext();
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Инлайн-валидация: показываем подсказку у поля, только когда пользователь
  // уже что-то ввёл, но значение ещё неполное/некорректное.
  const phoneMaxLen = getPhoneLocalMaxLength(phoneCountryCode);
  const phoneIncomplete = phoneLocal.length > 0 && phoneLocal.length < phoneMaxLen;
  const emailInvalid =
    email.trim().includes("@") && !EMAIL_RE.test(email.trim());

  // Сбрасываем ошибку сразу при правке поля, а не только при смене вкладки.
  const clearError = () => setErrorMsg((prev) => (prev ? null : prev));

  return (
    <AuthLayout>
      <AuthCard>
        <Box sx={{ mb: 3 }}>
          <Stack
            direction="row"
            alignItems="center"
            gap={1.25}
            mb={3.5}
            sx={{ display: { xs: "none", md: "flex" } }}
          >
            <AximoLogo />
          </Stack>

          <Typography variant="h5" fontWeight={600} sx={{ mb: 0.5 }}>
            Вход в систему
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Рады видеть вас снова
          </Typography>

          {/* Сегмент-контрол: способ входа. Логика через тот же handleMethodChange. */}
          <Tabs
            value={authMethod}
            onChange={handleMethodChange}
            variant="fullWidth"
            sx={(theme) => ({
              minHeight: 44,
              p: 0.5,
              borderRadius: "14px",
              bgcolor: subtleBg(theme),
              "& .MuiTabs-indicator": { display: "none" },
              "& .MuiTab-root": {
                minHeight: 36,
                py: 0.5,
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 500,
                color: "text.secondary",
                border: "1px solid transparent",
                transition: "background-color .15s ease, color .15s ease",
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                },
              },
              "& .MuiTab-root.Mui-selected": {
                bgcolor: "background.paper",
                color: "text.primary",
                border: `1px solid ${theme.palette.divider}`,
              },
            })}
          >
            <Tab iconPosition="start" icon={<PhoneIphoneIcon fontSize="small" />} label="Телефон" value="phone" />
            <Tab iconPosition="start" icon={<EmailIcon fontSize="small" />} label="Логин" value="email" />
          </Tabs>
        </Box>

        {/* Постоянный live-регион: новые сообщения озвучиваются скринридером. */}
        <Box aria-live="polite" role="status">
          {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
          {infoMsg && <Alert severity="info" sx={{ mb: 2 }}>{infoMsg}</Alert>}
        </Box>

        {/* --- ВКЛАДКА ТЕЛЕФОН --- */}
        {authMethod === "phone" && (
          <Stack spacing={2}>
            {!isOtpSent ? (
              <form onSubmit={sendOtp}>
                <Stack spacing={2}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    Номер телефона
                  </Typography>
                  <TextField
                    value={formatPhoneLocalDisplay(phoneCountryCode, phoneLocal)}
                    inputRef={phoneInput.inputRef}
                    onChange={phoneInput.onChange}
                    onKeyDown={phoneInput.onKeyDown}
                    fullWidth
                    autoFocus
                    type="tel"
                    name="phone"
                    error={phoneIncomplete}
                    helperText={phoneIncomplete ? "Введите полный номер" : " "}
                    inputProps={{ inputMode: "numeric", autoComplete: "tel-national" }}
                    placeholder={getPhoneLocalMaxLength(phoneCountryCode) === 10 ? "XXX XXX XXXX" : "XXX XXX XXX"}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start" sx={{ mr: 1, ml: '-14px' }}>
                          <PhoneCountryCodeSelect
                            value={phoneCountryCode}
                            onChange={(code) => {
                              setPhoneCountryCode(code);
                            }}
                          />
                        </InputAdornment>
                      ),
                      sx: {
                        '& input': {
                          paddingLeft: '15px',
                        }
                      }
                    }}
                    sx={{
                      '& .MuiInputLabel-root': {
                        top: '8px',
                      },
                      '& .MuiInputLabel-shrink': {
                        top: '0',
                      }
                    }}
                  />

                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
                  >
                    {loading ? "Отправка..." : "Получить код"}
                  </Button>
                </Stack>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <Stack spacing={2.5}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      Код отправлен на номер
                    </Typography>
                    <Stack direction="row" justifyContent="center" alignItems="center" gap={0.5}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {lastSentPhone ?? composePhone(phoneCountryCode, phoneLocal) ?? ""}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => setIsOtpSent(false)}
                        disabled={loading}
                        aria-label="Изменить номер"
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>

                  <OtpCodeInput
                    value={otpCode}
                    onChange={(v) => {
                      setOtpCode(v);
                      clearError();
                    }}
                    onComplete={(code) => verifyOtp(undefined, code)}
                    disabled={loading}
                    autoFocus
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={loading || redirecting}
                    startIcon={(loading || redirecting) ? <CircularProgress size={18} color="inherit" /> : null}
                  >
                    {redirecting ? "Входим…" : loading ? "Проверка..." : "Войти"}
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => sendOtp()}
                    disabled={loading || resendCooldown > 0}
                  >
                    {resendCooldown > 0
                      ? `Отправить код повторно через ${formatMMSS(resendCooldown)}`
                      : "Отправить код повторно"}
                  </Button>
                </Stack>
              </form>
            )}
          </Stack>
        )}

        {/* --- ВКЛАДКА EMAIL --- */}
        {authMethod === "email" && (
          <Stack spacing={2}>
            <Stack component="form" onSubmit={handleEmailSubmit} spacing={2}>
                <TextField
                  label="Email или логин"
                  type="text"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  required
                  fullWidth
                  autoComplete="username"
                  error={emailInvalid}
                  helperText={emailInvalid ? "Введите корректный email" : " "}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Пароль"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  required
                  fullWidth
                  autoComplete="current-password"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPw(!showPw)}
                          edge="end"
                          aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
                        >
                          {showPw ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading || redirecting}
                  fullWidth
                  startIcon={(loading || redirecting) ? <CircularProgress size={18} color="inherit" /> : null}
                >
                  {redirecting ? "Входим…" : loading ? "Вход..." : "Войти"}
                </Button>
                {
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      setAuthMethod("phone");
                      setErrorMsg(null);
                      setInfoMsg("Введите номер телефона, привязанный к вашему аккаунту.");
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Не помните пароль? Войдите по SMS-коду
                  </Button>
                }
            </Stack>
          </Stack>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", textAlign: "center", mt: "auto", pt: 3 }}
        >
          Нужна помощь? Напишите администратору
        </Typography>
      </AuthCard>
    </AuthLayout>
  );
};

export default LoginPage;
