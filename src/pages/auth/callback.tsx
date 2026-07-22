import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Box, Stack, Typography, CircularProgress, Alert, Button } from "@mui/material";
import AximoLogo from "../../components/auth/AximoLogo";
import { supabase } from "../../utility/supabaseClient";
import { useClientSession } from "../../contexts/client-session-context";
import { ROLE_HOME_PAGES, type RoleName } from "../../types/rbac";

const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setPatient } = useClientSession();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // Supabase сам обрабатывает токен из URL hash/query и создаёт сессию
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!session) throw new Error("Сессия не создана. Попробуйте войти снова.");

        if (cancelled) return;

        const user = session.user;
        const accountType = user.user_metadata?.account_type;
        const next = searchParams.get("next");

        if (accountType === "patient") {
          // Найдём пациента по phone из auth user и положим в ClientSession
          const phone = user.phone;
          if (phone) {
            const { data } = await supabase.rpc("get_patient_by_phone", { p_phone: phone });
            const patient = Array.isArray(data) ? data[0] : data;
            if (patient) {
              setPatient({
                id: patient.id,
                fio: patient.fio,
                phone: patient.phone,
                birth_date: patient.birth_date,
                photo: patient.photo,
              });
            }
          }
          // Разлогиниваем из Supabase Auth — клиентам не нужна полноценная сессия
          await supabase.auth.signOut();
          navigate(next && next.startsWith("/") ? `/client${next}` : "/client/profile", { replace: true });
        } else {
          // Сотрудник — редиректим на нужную страницу по роли
          const { data: employeeData } = await supabase
            .from("Employees")
            .select("roles(name)")
            .eq("auth_user_id", user.id)
            .maybeSingle();

          const roleName = Array.isArray(employeeData?.roles)
            ? employeeData?.roles[0]?.name
            : (employeeData?.roles as any)?.name;

          const defaultNext = roleName && ROLE_HOME_PAGES[roleName as RoleName]
            ? ROLE_HOME_PAGES[roleName as RoleName]
            : "/home";

          // Для сотрудников игнорируем next из внешних систем (Профиграм и др.)
          // — они могут указывать на несуществующие маршруты прежней системы.
          // Всегда редиректим на домашнюю страницу по роли.
          navigate(defaultNext, { replace: true });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
        setErrorMsg(msg);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [navigate, searchParams, setPatient]);

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 400,
          bgcolor: "background.paper",
          borderRadius: "14px",
          border: 1,
          borderColor: "divider",
          p: { xs: 3, sm: 4 },
        }}
      >
        <Stack alignItems="center" spacing={2}>
          <AximoLogo />

          {!errorMsg && (
            <>
              <CircularProgress size={36} />
              <Typography variant="body2" color="text.secondary">
                Завершение входа...
              </Typography>
            </>
          )}

          {errorMsg && (
            <>
              <Alert severity="error" sx={{ width: "100%" }}>{errorMsg}</Alert>
              <Button variant="outlined" href="/client/login" fullWidth sx={{ borderRadius: "14px" }}>
                Войти вручную
              </Button>
            </>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default AuthCallbackPage;
