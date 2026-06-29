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
} from "@mui/material";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphoneOutlined";
import EmailIcon from "@mui/icons-material/EmailOutlined";
import smallIcon from "../../assets/img/icon_2s.png";
import {
  login as djangoLogin,
  requestOtp as djangoRequestOtp,
  verifyOtp as djangoVerifyOtp,
} from "../../api";
import { applyMeResponse, usePermissions } from "../../hooks/usePermissions";
import { ApiError } from "../../api/client";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { supabase } from "../../utility/supabaseClient";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthCard from "../../components/auth/AuthCard";
import { PhoneCountryCodeSelect } from "../../components/ui";
import {
  composePhone,
  DEFAULT_PHONE_COUNTRY_CODE,
  getPhoneLocalMaxLength,
  type PhoneCountryCode,
} from "../../utility/phone";
import { ROLE_HOME_PAGES, type RoleName } from "../../types/rbac";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get("to") || "/home";

  const [authMethod, setAuthMethod] = React.useState<"email" | "phone">("phone");

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
  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();

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
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setErrorMsg(null);

    const fullPhone = composePhone(phoneCountryCode, phoneLocal);

    if (!fullPhone) {
      setErrorMsg("Введите номер телефона");
      setLoading(false);
      return;
    }

    if (IS_DJANGO_BACKEND) {
      try {
        const meData = await djangoVerifyOtp(fullPhone, otpCode.trim());
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
        token: otpCode.trim(),
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
      if (IS_DJANGO_BACKEND) {
        setInfoMsg("Сброс пароля через Django еще не подключен. Обратитесь к администратору.");
        setIsResetting(false);
        return;
      }

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

  return (
    <AuthLayout>
      <AuthCard>
        <Box sx={{ textAlign: "center", mb: 2 }}>
          <Stack direction="row" justifyContent="center" alignItems="center" gap={1} mb={2}>
            <Box component="img" src={smallIcon} sx={{ height: 32 }} />
            <Typography variant="h5" fontWeight={600}>Мама Доктор</Typography>
          </Stack>

          <Tabs value={authMethod} onChange={handleMethodChange} centered sx={{ mb: 2 }}>
            <Tab icon={<PhoneIphoneIcon />} label="Телефон" value="phone" />
            <Tab icon={<EmailIcon />} label="Email" value="email" />
          </Tabs>
        </Box>

        {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
        {infoMsg && <Alert severity="info" sx={{ mb: 2 }}>{infoMsg}</Alert>}

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
                    value={phoneLocal}
                    onChange={(e) => {
                      const maxLen = getPhoneLocalMaxLength(phoneCountryCode);
                      setPhoneLocal(e.target.value.replace(/[^0-9]/g, "").slice(0, maxLen));
                    }}
                    fullWidth
                    autoFocus
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

                  <Button type="submit" variant="contained" fullWidth disabled={loading}>
                    {loading ? "Отправка..." : "Получить код"}
                  </Button>
                </Stack>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <Stack spacing={2}>
                  <Typography variant="body2" textAlign="center">
                    Код отправлен на {lastSentPhone ?? composePhone(phoneCountryCode, phoneLocal) ?? ""}
                  </Typography>
                  <TextField
                    label="Код из СМС"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    fullWidth
                    autoFocus
                  />
                  <Button type="submit" variant="contained" fullWidth disabled={loading}>
                    {loading ? "Проверка..." : "Войти"}
                  </Button>
                  <Button variant="text" onClick={() => setIsOtpSent(false)} disabled={loading}>
                    Изменить данные
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
                <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
                <TextField
                  label="Пароль"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPw(!showPw)}>
                          {showPw ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button type="submit" variant="contained" disabled={loading} fullWidth>
                  {loading ? "..." : "Войти"}
                </Button>
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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  fullWidth
                  autoFocus
                />
                <Button type="submit" variant="contained" disabled={loading} fullWidth>
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
      </AuthCard>
    </AuthLayout>
  );
};

export default LoginPage;
