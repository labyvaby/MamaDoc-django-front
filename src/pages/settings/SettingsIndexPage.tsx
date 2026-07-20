import React from "react";
import { Navigate } from "react-router";
import { Box, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { useVisibleSettingsTabs, SettingsHub } from "./SettingsLayout";

/**
 * /settings entry point.
 *
 * Desktop: picks the first tab the user can see and forwards them to
 * it (the left rail is always visible there anyway).
 *
 * Mobile (hub-and-spoke): shows the settings hub — a grouped list of
 * sections — instead of redirecting, so there is a real "home" screen
 * to come back to.
 *
 * Falls back to AccessDenied when no tab is available.  Permissions
 * still loading → spinner so we don't flash a 403 during the initial
 * RBAC fetch.
 */
const SettingsIndexPage: React.FC = () => {
  const { loading } = usePermissions();
  const tabs = useVisibleSettingsTabs();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (tabs.length === 0) {
    return <AccessDenied />;
  }

  if (isMobile) {
    return <SettingsHub />;
  }

  return <Navigate to={tabs[0].to} replace />;
};

export default SettingsIndexPage;
