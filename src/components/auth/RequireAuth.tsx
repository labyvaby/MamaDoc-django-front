import React from "react";
import { Navigate, useLocation } from "react-router";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import { usePermissions } from "../../hooks/usePermissions";

type Props = {
  children: React.ReactNode;
};

export const RequireAuth: React.FC<Props> = ({ children }) => {
  const location = useLocation();

  return <DjangoRequireAuth location={location}>{children}</DjangoRequireAuth>;
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

export default RequireAuth;
