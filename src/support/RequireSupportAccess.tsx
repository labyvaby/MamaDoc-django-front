import React from "react";
import { Box, CircularProgress } from "@mui/material";

import { AccessDenied } from "../components/rbac/AccessDenied";
import { usePermissions } from "../hooks/usePermissions";
import { useSupportAccess } from "./useSupport";

/**
 * Гейт страницы «Поддержка». Как RequirePermission(PAGE_PERMISSIONS.support),
 * но пропускает разработчика платформы и тогда, когда модуль у организации
 * выключен: обращения из такой организации всё равно приходят ему.
 */
export const RequireSupportAccess: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { loading } = usePermissions();
  const { canView } = useSupportAccess();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!canView) {
    return <AccessDenied description="Модуль недоступен для вашей организации или у вас нет прав." />;
  }
  return <>{children}</>;
};

/** Показывает детей, только если сотрудник может отправить обращение. */
export const IfCanReport: React.FC<React.PropsWithChildren> = ({ children }) =>
  useSupportAccess().canCreate ? <>{children}</> : null;

export default RequireSupportAccess;
