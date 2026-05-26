import React from "react";
import { Navigate, useLocation } from "react-router";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import { getCurrentUser } from "../../api";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { supabase } from "../../utility/supabaseClient";

type Props = {
  children: React.ReactNode;
};

export const RequireAuth: React.FC<Props> = ({ children }) => {
  const [loading, setLoading] = React.useState(true);
  const [authenticated, setAuthenticated] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        if (IS_DJANGO_BACKEND) {
          await getCurrentUser();
          setAuthenticated(true);
          return;
        }

        const { data } = await supabase.auth.getSession();
        setAuthenticated(!!data?.session);
      } finally {
        setLoading(false);
      }

      if (IS_DJANGO_BACKEND) return;

      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        switch (event) {
          case 'SIGNED_IN':
          case 'USER_UPDATED':
          case 'INITIAL_SESSION':
            setAuthenticated(!!session);
            break;
          case 'PASSWORD_RECOVERY':
            console.log("RequireAuth: Recovery event detected, authenticated set to true to prevent redirect");
            setAuthenticated(true);
            break;
          case 'SIGNED_OUT':
            setAuthenticated(false);
            break;
          case 'TOKEN_REFRESHED':
          default:
            // Не меняем состояние при обновлении токена/прочих событиях, чтобы избежать лишних ре-рендеров
            break;
        }
      });
      unsub = () => sub.subscription.unsubscribe();
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
    // ПРОВЕРКА: Если в URL есть токен восстановления, НЕ редиректим на логин.
    // Даем возможность AuthHelper подхватить это событие.
    if (window.location.hash.includes("type=recovery")) {
      console.log("RequireAuth: Recovery link detected, holding redirect...");
      return (
        <Box sx={{ px: 2, pt: 1 }}>
          <LinearProgress />
        </Box>
      );
    }

    const to = location.pathname + location.search;
    // ВАЖНО: сохраняем хэш, чтобы не потерять токен восстановления при редиректе
    return <Navigate to={`/login?to=${encodeURIComponent(to)}${window.location.hash}`} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
