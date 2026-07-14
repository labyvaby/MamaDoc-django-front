import React from "react";
import { Box, CircularProgress } from "@mui/material";
import { useModuleGate, type MockedModule } from "../../hooks/useModuleGate";
import { AccessDenied } from "./AccessDenied";

interface RequireModuleProps {
  module: MockedModule;
  /** Переопределить права по умолчанию (например, только manage для настроек). */
  permissions?: readonly string[];
  children: React.ReactNode;
}

/**
 * Route-гейт для модулей на моках (documents / cleaning / knowledge).
 * В демо-режиме (*_USE_MOCKS = true) пускает всех аутентифицированных,
 * после выключения флага требует права модуля — см. useModuleGate.
 *
 * @example
 * <RequireModule module="cleaning">
 *   <CleaningPage />
 * </RequireModule>
 */
export const RequireModule: React.FC<RequireModuleProps> = ({
  module,
  permissions,
  children,
}) => {
  const { loading, moduleGate } = useModuleGate();

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "60vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!moduleGate(module, permissions)) {
    return (
      <AccessDenied description="Модуль недоступен для вашей организации или у вас нет прав." />
    );
  }

  return <>{children}</>;
};

export default RequireModule;
