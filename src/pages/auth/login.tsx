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
import smallIcon from "../../assets/img/icon_2s.png";
import {
  login as djangoLogin,
  requestOtp as djangoRequestOtp,
  verifyOtp as djangoVerifyOtp,
} from "../../api";
import { applyMeResponse, usePermissions } from "../../hooks/usePermissions";
import { markBranchPickerPending } from "../../components/auth/BranchPickerDialog";
import { ApiError } from "../../api/client";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { supabase } from "../../utility/supabaseClient";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import OtpCodeInput from "../../components/auth/OtpCodeInput";
import { PhoneCountryCodeSelect } from "../../components/ui";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  normalizePhoneLocal,
  formatPhoneLocalDisplay,
  type PhoneCountryCode,
} from "../../utility/phone";
import { ROLE_HOME_PAGES, type RoleName } from "../../types/rbac";
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

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get("to") || "/home";

  const [authMethod, setAuthMethod] = React.useState<"email" | "phone">(readSavedAuthMethod);

  // -- PHONE STATES --
  const [phoneCountryCode, setPhoneCountryCode] = React.useState<PhoneCountryCode>(DEFAULT_PHONE_COUNTRY_CODE);
  const [phoneLocal, setPhoneLocal] = React.useState("");
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
  const [isResetting, setIsResetting] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [redirecting, setRedirecting] = React.useState(false);

  // Тик кулдауна повторной отправки OTP: 1 раз в секунду до нуля.
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Django-режим: слушаем authStatus из глобального state (уже инициализирован)
  const { authStatus } = usePermissions();
  const didDjangoRedirect = React.useRef(false);
  React.useEffect(() => {
    if (!IS_DJANGO_BACKEND) return;
    if (didDjangoRedirect.current) return;
    if (authStatus === 'authenticated') {
      didDjangoRedirect.current = true;
      navigate(redirectTo, { replace: true });
    }
  }, [authStatus, navigate, redirectTo]);

  React.useEffect(() => {
    if (IS_DJANGO_BACKEND) return;

    (async () => {
      // ПРОВЕРКА: Если мы пришли по ссылке восстановления пароля, УВОДИМ на страницу смены пароля
      if (window.location.hash.includes("type=recovery")) {
        navigate("/update-password" + window.location.hash);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          const { data: employeeData } = await supabase
            .from('Employees')
            .select(`roles ( name )`)
            .eq('auth_user_id', data.session.user.id)
            .maybeSingle();

          const roleName = Array.isArray(employeeData?.roles)
            ? employeeData?.roles[0]?.name
            : (employeeData?.roles as unknown as { name?: string })?.name;

          if (roleName && ROLE_HOME_PAGES[roleName as RoleName]) {
            navigate(ROLE_HOME_PAGES[roleName as RoleName], { replace: true });
          } else {
            navigate(redirectTo, { replace: true });
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [navigate, redirectTo]);

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
      if (error.status === 429) return "Слишком много попыток. Пожалуйста, подождите немного";
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

    // Перевод распространённых ошибок Supabase
    if (message.includes("Invalid credentials")) return "Неверный логин или пароль";
    if (message.includes("Authentication required")) return "Необходимо войти в систему";
    if (message.includes("Invalid login credentials")) return "Неверный email или пароль";
    if (message.includes("User not found")) return "Пользователь с таким Email не найден";
    if (message.includes("Email not confirmed")) return "Email не подтверждён. Пожалуйста, проверьте почту";
    if (message.includes("Rate limit exceeded")) return "Слишком много попыток. Пожалуйста, подождите немного";
    if (message.includes("Auth session missing")) return "Сессия авторизации отсутствует или истекла. Пожалуйста, перейдите по ссылке из письма снова";

    return message;
  };

  const handleLoginSuccess = async (userId: string, extra?: { email?: string; phone?: string }) => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // 1. Пытаемся найти сотрудника по всем каналам (ID, Email, Телефон)
      const { data: employeeData, error: employeeError } = await supabase
        .from('Employees')
        .select('id, auth_user_id, email, phone, roles(name)')
        .or(`auth_user_id.eq.${userId}${extra?.email ? `,email.eq.${extra.email}` : ''}${extra?.phone ? `,phone.ilike.%${extra.phone.slice(-9)}` : ''}`)
        .maybeSingle();

      if (employeeError) {
        console.error("Employee fetch error:", employeeError);
      }

      // 2. Если сотрудник найден, но не привязан к текущему сессионному ID — ПРИВЯЗЫВАЕМ
      if (employeeData && employeeData.auth_user_id !== userId) {
        try {
          // Используем Edge Function для привязки, так как у неё есть права на изменение auth_user_id
          const { error: linkError } = await supabase.functions.invoke('admin-create-user', {
            body: {
              phone: employeeData.phone,
              email: employeeData.email,
              link_to_auth_id: userId // Добавляем флаг привязки (нужно будет проверить поддержку в функции)
            }
          });

          if (linkError) {
            console.warn("Edge Function linking failed, falling back to direct update:", linkError);
            // Если функция не поддержала новый флаг, пробуем напрямую (может не сработать из-за RLS)
            await supabase.from('Employees').update({ auth_user_id: userId }).eq('id', employeeData.id);
          }
        } catch (e) {
          console.error("Linking attempt failed:", e);
        }
      }

      // 3. Снова запрашиваем данные, чтобы убедиться в наличии роли и статуса
      const { data: finalEmployee } = await supabase
        .from('Employees')
        .select('*, roles(name)')
        .eq('auth_user_id', userId)
        .maybeSingle();

      const employee = finalEmployee || employeeData;

      if (!employee) {
        console.warn("No employee record for user", userId);
        await supabase.auth.signOut();
        setErrorMsg("Доступ запрещен. Ваш профиль сотрудника не найден в системе.");
        return;
      }

      if (employee.status && employee.status !== 'active') {
        await supabase.auth.signOut();
        setErrorMsg("Доступ закрыт. Ваша учётная запись деактивирована. Обратитесь к администратору.");
        return;
      }

      const roleObj = Array.isArray(employee.roles) ? employee.roles[0] : employee.roles;
      const roleName = roleObj?.name;

      if (roleName && ROLE_HOME_PAGES[roleName as RoleName]) {
        navigate(ROLE_HOME_PAGES[roleName as RoleName], { replace: true });
      } else {
        navigate(redirectTo, { replace: true });
      }

    } catch (e) {
      console.error("Login success handler failed:", e);
      setErrorMsg("Ошибка при проверке прав. Попробуйте обновить страницу.");
    } finally {
      setLoading(false);
    }
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

    if (IS_DJANGO_BACKEND) {
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
      return;
    }

    // Name validation removed


    try {
      // 1. Проверяем, есть ли такой сотрудник в базе вообще
      // Извлекаем последние 9 цифр для надежного поиска
      const last9 = fullPhone.slice(-9);

      const { data: existingEmployee, error: checkError } = await supabase
        .from('Employees')
        .select('id')
        .ilike('phone', `%${last9}`)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116' && !checkError.message.includes('permission denied')) {
        console.error("Database check error:", checkError);
      }

      // Если RLS блокирует анонимную проверку, мы временно пропускаем её, 
      // чтобы не блокировать вход (пока админ не применит SQL-фикс на базу)
      const isBlockedByRls = checkError?.message?.includes('permission denied');

      if (!existingEmployee && !isBlockedByRls) {
        setErrorMsg("Доступ запрещен. Ваш номер телефона не зарегистрирован в системе. Обратитесь к администратору.");
        setLoading(false);
        return;
      }

      // 2. Если сотрудник есть — отправляем OTP
      const { error } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
      });

      if (error) throw error;

      setIsOtpSent(true);
      setLastSentPhone(fullPhone);
      setInfoMsg("Код отправлен!");
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

    if (IS_DJANGO_BACKEND) {
      try {
        const meData = await djangoVerifyOtp(fullPhone, code);
        setRedirecting(true);
        markBranchPickerPending();
        applyMeResponse(meData);
        navigate(redirectTo, { replace: true });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          setErrorMsg("Неверный или истёкший код. Запросите новый.");
        } else {
          setErrorMsg(getErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: code,
        type: "sms",
      });

      if (error) throw error;
      console.log("Успех:", data);
      if (data.session?.user?.id) {
        await handleLoginSuccess(data.session.user.id, { phone: fullPhone });
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // --- ЛОГИКА EMAIL ---
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      // Сразу пробуем войти. Проверка связи с Сотрудником будет в handleLoginSuccess.
      const normalizedEmail = email.trim().toLowerCase();
      if (IS_DJANGO_BACKEND) {
        // djangoLogin возвращает MeResponse — сразу заполняем глобальный state,
        // второй GET /auth/me/ не нужен
        const meData = await djangoLogin(normalizedEmail, password);
        setRedirecting(true);
        markBranchPickerPending();
        applyMeResponse(meData);
        navigate(redirectTo, { replace: true });
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) throw error;
      if (data.session?.user?.id) {
        await handleLoginSuccess(data.session.user.id, { email: normalizedEmail });
      } else {
        navigate(redirectTo, { replace: true });
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg("Введите Email для сброса пароля");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      // В Django-режиме сброс по почте недоступен (кнопка скрыта, форма
      // недостижима), поэтому этот путь исполняется только в Supabase-режиме.
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setInfoMsg("Ссылка для сброса пароля отправлена на ваш Email");
      setIsResetting(false);
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
  const emailInvalid = email.trim().length > 0 && !EMAIL_RE.test(email.trim());

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
            <Box component="img" src={smallIcon} sx={{ height: 34 }} />
            <Typography variant="h6" fontWeight={700}>Мама Доктор</Typography>
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
            <Tab iconPosition="start" icon={<EmailIcon fontSize="small" />} label="Email" value="email" />
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
                    onChange={(e) => {
                      setPhoneLocal(normalizePhoneLocal(phoneCountryCode, e.target.value));
                      clearError();
                    }}
                    fullWidth
                    autoFocus
                    type="tel"
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
            {!isResetting ? (
              <Stack component="form" onSubmit={handleEmailSubmit} spacing={2}>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  required
                  fullWidth
                  autoComplete="email"
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
                {IS_DJANGO_BACKEND ? (
                  // Восстановление по почте на Django не подключено, а тикет бэку
                  // заводить не хотим. Но забывший пароль всё равно может войти по
                  // SMS-коду и сменить пароль в профиле — ведём его туда.
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      setAuthMethod("phone");
                      setIsResetting(false);
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Не помните пароль? Войдите по SMS-коду
                  </Button>
                ) : (
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      setIsResetting(true);
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Забыли пароль?
                  </Button>
                )}
              </Stack>
            ) : (
              <Stack component="form" onSubmit={handleResetRequest} spacing={2}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Введите ваш Email, и мы отправим вам ссылку для восстановления пароля.
                </Typography>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  required
                  fullWidth
                  autoFocus
                  autoComplete="email"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={loading}
                  fullWidth
                  startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
                >
                  {loading ? "Отправка..." : "Сбросить пароль"}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    setIsResetting(false);
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  Вернуться к входу
                </Button>
              </Stack>
            )}
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
