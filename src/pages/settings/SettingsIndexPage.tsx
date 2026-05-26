import React from "react";
import { Navigate } from "react-router";
import { Box, CircularProgress } from "@mui/material";

import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { useVisibleSettingsTabs } from "./SettingsLayout";

/**
 * /settings entry point.  Picks the first tab the user can see and
 * forwards them to it; falls back to AccessDenied when no tab is
 * available.  Permissions still loading → show a spinner so we don't
 * flash a 403 during the initial RBAC fetch.
 */
const SettingsIndexPage: React.FC = () => {
  const { loading } = usePermissions();
  const tabs = useVisibleSettingsTabs();

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

  return <Navigate to={tabs[0].to} replace />;
};

export default SettingsIndexPage;
