import React from "react";
import { Navigate, useLocation } from "react-router";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { usePermissions } from "../../hooks/usePermissions";

type Props = {
  children: React.ReactNode;
};

export const RequireAuth: React.FC<Props> = ({ children }) => {
  const location = useLocation();

  if (IS_DJANGO_BACKEND) {
    return <DjangoRequireAuth location={location}>{children}</DjangoRequireAuth>;
  }

  return <SupabaseRequireAuth location={location}>{children}</SupabaseRequireAuth>;
};

// ── Django-режим ──────────────────────────────────────────────────────────────

type InnerProps = {
  children: React.ReactNode;
  location: ReturnType<typeof useLocation>;
};

const DjangoRequireAuth: React.FC<InnerProps> = ({ children, location }) => {
  const { authStatus, authError, retryAuth } = usePermissions();

  if (authStatus === 'loading') {
    return (
      <Box sx={{ px: 2, pt: 1 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (authStatus === 'unauthenticated') {
    const to = location.pathname + location.search;
    return <Navigate to={`/login?to=${encodeURIComponent(to)}`} replace />;
  }

  if (authStatus === 'unavailable') {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={retryAuth}
            >
              Повторить
            </Button>
          }
        >
          {authError && authError !== 'Сетевая ошибка'
            ? `Сервер временно недоступен (${authError}). Проверьте подключение и повторите попытку.`
            : 'Сервер временно недоступен. Проверьте подключение и повторите попытку.'}
        </Alert>
      </Container>
    );
  }

  // authStatus === 'authenticated'
  return <>{children}</>;
};

// ── Supabase-режим (без изменений) ───────────────────────────────────────────

const SupabaseRequireAuth: React.FC<InnerProps> = ({ children, location }) => {
  const [loading, setLoading] = React.useState(true);
  const [authenticated, setAuthenticated] = React.useState(false);

  React.useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const { supabase } = await import("../../utility/supabaseClient");
        const { data } = await supabase.auth.getSession();
        setAuthenticated(!!data?.session);
        setLoading(false);

        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
          switch (event) {
            case 'SIGNED_IN':
            case 'USER_UPDATED':
            case 'INITIAL_SESSION':
              setAuthenticated(!!session);
              break;
            case 'PASSWORD_RECOVERY':
              setAuthenticated(true);
              break;
            case 'SIGNED_OUT':
              setAuthenticated(false);
              break;
            default:
              break;
          }
        });
        unsub = () => sub.subscription.unsubscribe();
      } catch {
        setLoading(false);
      }
    })();

    return () => {
      try {
        if (typeof unsub === "function") unsub();
      } catch {
        // ignore
      }
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ px: 2, pt: 1 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!authenticated) {
    if (window.location.hash.includes("type=recovery")) {
      return (
        <Box sx={{ px: 2, pt: 1 }}>
          <LinearProgress />
        </Box>
      );
    }

    const to = location.pathname + location.search;
    return <Navigate to={`/login?to=${encodeURIComponent(to)}${window.location.hash}`} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
