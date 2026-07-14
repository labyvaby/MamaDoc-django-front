import React from "react";
import {
  Box,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Link as RouterLink, useLocation } from "react-router";

import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import WorkOutlined from "@mui/icons-material/WorkOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";

import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";

import { useCanChecker } from "../../hooks/useCan";
import { useModuleGate } from "../../hooks/useModuleGate";
import { AccessDenied } from "../../components/rbac/AccessDenied";

/**
 * Permission codes that gate each tab.  Kept in sync with the
 * Django-side permission registry — the wiring lives in the
 * sync_permissions management command.
 */
export const SETTINGS_TAB_PERMISSIONS = {
  organization: "organization.view",
  branches: "branches.view",
  roles: "rbac.roles.view",
  memberships: "rbac.memberships.view",
  specializations: "staff.specializations.view",
  banks: "staff.private.view",
  insurers: "finance.view",
  expenseCategories: "finance.expense.manage",
  diagnoses: "medical.diagnoses.manage",
  tasks: "tasks.manage",
  cleaning: "cleaning.manage",
} as const;

export type SettingsTabKey = keyof typeof SETTINGS_TAB_PERMISSIONS;

type TabDef = {
  key: SettingsTabKey;
  label: string;
  to: string;
  icon: React.ReactElement;
};

const TABS: TabDef[] = [
  {
    key: "organization",
    label: "Организация",
    to: "/settings/organization",
    icon: <BusinessOutlined fontSize="small" />,
  },
  {
    key: "branches",
    label: "Филиалы",
    to: "/settings/branches",
    icon: <StoreOutlined fontSize="small" />,
  },
  {
    key: "roles",
    label: "Роли",
    to: "/settings/roles",
    icon: <AdminPanelSettingsOutlined fontSize="small" />,
  },
  {
    key: "memberships",
    label: "Сотрудники и доступы",
    to: "/settings/memberships",
    icon: <GroupsOutlined fontSize="small" />,
  },
  {
    key: "specializations",
    label: "Специализации",
    to: "/settings/specializations",
    icon: <WorkOutlined fontSize="small" />,
  },
  {
    key: "banks",
    label: "Банки",
    to: "/settings/banks",
    icon: <AccountBalanceOutlined fontSize="small" />,
  },
  {
    key: "insurers",
    label: "Страховые",
    to: "/settings/insurers",
    icon: <HealthAndSafetyOutlined fontSize="small" />,
  },
  {
    key: "expenseCategories",
    label: "Категории расходов",
    to: "/settings/expense-categories",
    icon: <ReceiptLongOutlined fontSize="small" />,
  },
  {
    key: "diagnoses",
    label: "Диагнозы",
    to: "/settings/diagnoses",
    icon: <LocalHospitalOutlined fontSize="small" />,
  },
  {
    key: "tasks",
    label: "Задачи",
    to: "/settings/tasks",
    icon: <AssignmentOutlined fontSize="small" />,
  },
  {
    key: "cleaning",
    label: "Уборка",
    to: "/settings/cleaning",
    icon: <CleaningServicesOutlined fontSize="small" />,
  },
];

/**
 * Returns the list of tabs visible to the current user, taking RBAC
 * permissions into account.  Used both by the layout and by the
 * sidebar so a tab that is hidden in one place stays hidden in the
 * other.
 */
export function useVisibleSettingsTabs(): TabDef[] {
  const { can } = useCanChecker();
  const { moduleGate } = useModuleGate();
  return TABS.filter((tab) =>
    // Уборка на моках: гейт единый с роутом и сайдбаром (см. useModuleGate).
    tab.key === "cleaning"
      ? moduleGate("cleaning", [SETTINGS_TAB_PERMISSIONS.cleaning])
      : can(SETTINGS_TAB_PERMISSIONS[tab.key]),
  );
}

/**
 * Shell layout for the /settings/* section.
 *
 * Renders a left rail with tabs (or a top tab bar on mobile) and the
 * page content on the right.  If the caller has no permission for
 * *any* settings tab, the whole shell is replaced with AccessDenied.
 * Tabs the caller cannot see are hidden automatically.
 */
export const SettingsLayout: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const visibleTabs = useVisibleSettingsTabs();
  const location = useLocation();

  if (visibleTabs.length === 0) {
    return <AccessDenied />;
  }

  const activeIndex = Math.max(
    0,
    visibleTabs.findIndex((tab) =>
      location.pathname === tab.to ||
      location.pathname.startsWith(`${tab.to}/`),
    ),
  );

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, height: "100%" }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Stack
          direction="row"
          alignItems="baseline"
          justifyContent="space-between"
        >
          <Typography variant="h5" fontWeight={600}>
            Настройки
          </Typography>
        </Stack>

        <Box
          sx={{
            display: { xs: "block", md: "grid" },
            gridTemplateColumns: { md: "240px 1fr" },
            gap: 2,
            flex: 1,
            minHeight: 0,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 0, md: 1 },
              alignSelf: { md: "start" },
            }}
          >
            <Tabs
              value={activeIndex}
              orientation={isMobile ? "horizontal" : "vertical"}
              variant={isMobile ? "scrollable" : "standard"}
              scrollButtons={isMobile ? "auto" : false}
              allowScrollButtonsMobile
              aria-label="Разделы настроек"
              sx={{
                borderRight: { md: 0 },
                "& .MuiTab-root": {
                  alignItems: { md: "flex-start" },
                  justifyContent: { md: "flex-start" },
                  textAlign: { md: "left" },
                  minHeight: 44,
                  textTransform: "none",
                },
              }}
            >
              {visibleTabs.map((tab) => (
                <Tab
                  key={tab.key}
                  component={RouterLink}
                  to={tab.to}
                  icon={tab.icon}
                  iconPosition="start"
                  label={tab.label}
                />
              ))}
            </Tabs>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, md: 3 },
              minHeight: 240,
              overflow: "auto",
            }}
          >
            {children}
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
};

export default SettingsLayout;
