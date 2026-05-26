import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Box, Stack, Typography, CircularProgress, Alert, Button } from "@mui/material";
import logo from "../../assets/img/logo.png";
import { supabase } from "../../utility/supabaseClient";

function toFriendlyError(raw: string): string {
  // Если сервер уже вернул русский текст — показываем как есть
  if (/[а-яёА-ЯЁ]/.test(raw)) return raw;
  // Fallback для старых/неожиданных английских ошибок
  return "Не удалось выполнить вход. Попробуйте позже или войдите вручную.";
}

async function extractError(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx?.json) {
      const body = await ctx.json();
      if (body?.error) return toFriendlyError(body.error);
    }
  } catch {
    // ignore
  }
  const msg = error instanceof Error ? error.message : "";
  return toFriendlyError(msg);
}

const SsoPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg("Отсутствует ссылка для входа. Попробуйте получить новую ссылку.");
      setStatus("error");
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("sso-login", {
          body: { token },
        });

        if (cancelled) return;

        if (error) {
          const msg = await extractError(error);
          setErrorMsg(msg);
          setStatus("error");
          return;
        }

        if (!data?.action_link) {
          setErrorMsg("Не удалось выполнить вход. Попробуйте позже или войдите вручную.");
          setStatus("error");
          return;
        }

        window.location.href = data.action_link;
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = await extractError(err);
        setErrorMsg(msg);
        setStatus("error");
      }
    };

    run();

    return () => { cancelled = true; };
  }, [token]);

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e0f7fa 0%, #e8f5e9 100%)",
        px: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 400,
          bgcolor: "background.paper",
          borderRadius: 3,
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          p: { xs: 3, sm: 4 },
        }}
      >
        <Stack alignItems="center" spacing={2}>
          <Box component="img" src={logo} alt="Мама Доктор" sx={{ height: 56, objectFit: "contain" }} />

          {status === "loading" && (
            <>
              <CircularProgress size={36} />
              <Typography variant="body2" color="text.secondary">
                Выполняется вход...
              </Typography>
            </>
          )}

          {status === "error" && (
            <>
              <Alert severity="error" sx={{ width: "100%" }}>
                {errorMsg}
              </Alert>
              <Button variant="outlined" href="/client/login" fullWidth sx={{ borderRadius: 2 }}>
                Войти вручную
              </Button>
            </>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default SsoPage;
