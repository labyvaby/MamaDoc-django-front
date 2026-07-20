import React from "react";
import {
  Box,
  Button,
  GlobalStyles,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
  alpha,
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
import KeyboardArrowLeftOutlined from "@mui/icons-material/KeyboardArrowLeftOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";

import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";

import { useCanChecker } from "../../hooks/useCan";
import { useModuleGate } from "../../hooks/useModuleGate";
import { usePermissions } from "../../hooks/usePermissions";
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

/**
 * Group labels for the mobile hub (hub-and-spoke navigation).  Order
 * here is the order the groups appear on the /settings hub screen.
 */
export const SETTINGS_GROUPS = [
  "Клиника",
  "Доступы",
  "Справочники",
  "Операционные",
] as const;

export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

type TabDef = {
  key: SettingsTabKey;
  label: string;
  to: string;
  icon: React.ReactElement;
  group: SettingsGroup;
  tone?: "primary" | "success";
};

const TABS: TabDef[] = [
  {
    key: "organization",
    label: "Организация",
    to: "/settings/organization",
    icon: <BusinessOutlined fontSize="small" />,
    group: "Клиника",
  },
  {
    key: "branches",
    label: "Филиалы",
    to: "/settings/branches",
    icon: <StoreOutlined fontSize="small" />,
    group: "Клиника",
  },
  {
    key: "roles",
    label: "Роли",
    to: "/settings/roles",
    icon: <AdminPanelSettingsOutlined fontSize="small" />,
    group: "Доступы",
    tone: "success",
  },
  {
    key: "memberships",
    label: "Сотрудники и доступы",
    to: "/settings/memberships",
    icon: <GroupsOutlined fontSize="small" />,
    group: "Доступы",
    tone: "success",
  },
  {
    key: "specializations",
    label: "Специализации",
    to: "/settings/specializations",
    icon: <WorkOutlined fontSize="small" />,
    group: "Справочники",
  },
  {
    key: "banks",
    label: "Банки",
    to: "/settings/banks",
    icon: <AccountBalanceOutlined fontSize="small" />,
    group: "Справочники",
  },
  {
    key: "insurers",
    label: "Страховые",
    to: "/settings/insurers",
    icon: <HealthAndSafetyOutlined fontSize="small" />,
    group: "Справочники",
  },
  {
    key: "expenseCategories",
    label: "Категории расходов",
    to: "/settings/expense-categories",
    icon: <ReceiptLongOutlined fontSize="small" />,
    group: "Справочники",
  },
  {
    key: "diagnoses",
    label: "Диагнозы",
    to: "/settings/diagnoses",
    icon: <LocalHospitalOutlined fontSize="small" />,
    group: "Справочники",
  },
  {
    key: "tasks",
    label: "Задачи",
    to: "/settings/tasks",
    icon: <AssignmentOutlined fontSize="small" />,
    group: "Операционные",
  },
  {
    key: "cleaning",
    label: "Уборка",
    to: "/settings/cleaning",
    icon: <CleaningServicesOutlined fontSize="small" />,
    group: "Операционные",
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
 * Mobile settings hub (hub-and-spoke).  Shown at /settings on small
 * screens instead of redirecting to the first tab: a grouped list of
 * sections the caller can see, each linking to its own screen.
 */
export const SettingsHub: React.FC = () => {
  const visibleTabs = useVisibleSettingsTabs();
  const { activeOrganization } = usePermissions();

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        bgcolor: "background.default",
        width: "calc(100% + 16px)",
        mx: -1,
        px: 2,
        pt: 1.25,
        pb: "calc(28px + env(safe-area-inset-bottom))",
        animation: "settingsHubIn .28s cubic-bezier(.22, 1, .36, 1)",
        "@keyframes settingsHubIn": {
          from: { opacity: 0.4, transform: "translateX(-12%)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
      }}
    >
      <Box sx={{ px: 0.5, pb: 1.25 }}>
        <Typography
          component="h1"
          sx={{
            fontSize: 28,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: "-0.6px",
          }}
        >
          Настройки
        </Typography>
        <Typography
          color="text.secondary"
          sx={{ mt: 0.25, fontSize: 13.5, lineHeight: 1.35 }}
        >
          {activeOrganization?.name ?? "Организация не выбрана"}
        </Typography>
      </Box>
      <Stack spacing={0}>
        {SETTINGS_GROUPS.map((group) => {
          const groupTabs = visibleTabs.filter((t) => t.group === group);
          if (groupTabs.length === 0) return null;
          return (
            <Box key={group}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  px: 1,
                  pt: 2,
                  pb: 1,
                  display: "block",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {group}
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  overflow: "hidden",
                  borderRadius: "16px",
                  bgcolor: "background.paper",
                  boxShadow: "none",
                }}
              >
                {groupTabs.map((tab, i) => (
                  <Box
                    key={tab.key}
                    component={RouterLink}
                    to={tab.to}
                    sx={(t) => ({
                      display: "flex",
                      alignItems: "center",
                      gap: 1.625,
                      px: 1.875,
                      py: 1.625,
                      minHeight: 58,
                      textDecoration: "none",
                      color: "text.primary",
                      borderBottom:
                        i < groupTabs.length - 1 ? `1px solid ${t.palette.divider}` : "none",
                      transition: "background-color .13s ease",
                      "&:active": { bgcolor: t.palette.action.selected },
                    })}
                  >
                    <Box
                      sx={(t) => ({
                        width: 34,
                        height: 34,
                        borderRadius: "9px",
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color:
                          tab.tone === "success"
                            ? t.palette.success.main
                            : t.palette.primary.main,
                        bgcolor: alpha(
                          tab.tone === "success"
                            ? t.palette.success.main
                            : t.palette.primary.main,
                          t.palette.mode === "dark" ? 0.17 : 0.1,
                        ),
                        "& .MuiSvgIcon-root": { fontSize: 19 },
                      })}
                    >
                      {tab.icon}
                    </Box>
                    <Typography
                      variant="body1"
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15.5,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {tab.label}
                    </Typography>
                    {tab.key === "organization" && activeOrganization?.name ? (
                      <Typography
                        color="text.secondary"
                        sx={{
                          maxWidth: 120,
                          fontSize: 13.5,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {activeOrganization.name}
                      </Typography>
                    ) : null}
                    <KeyboardArrowRightOutlined
                      sx={{ color: "text.disabled", fontSize: 19 }}
                    />
                  </Box>
                ))}
              </Paper>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

/**
 * Shell layout for the /settings/* section.
 *
 * Desktop: a left rail with vertical tabs + page content on the right.
 * Mobile (hub-and-spoke): the tab rail is replaced by a "‹ Настройки"
 * back link to the hub, and the page content fills the width — each
 * page keeps its own header, which serves as the section title.
 *
 * If the caller has no permission for *any* settings tab, the whole
 * shell is replaced with AccessDenied.
 */
export const SettingsLayout: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const visibleTabs = useVisibleSettingsTabs();
  const location = useLocation();

  React.useEffect(() => {
    if (!isMobile) return;
    document.body.classList.add("mamadoc-settings-mobile");
    return () => document.body.classList.remove("mamadoc-settings-mobile");
  }, [isMobile]);

  if (visibleTabs.length === 0) {
    return <AccessDenied />;
  }

  // ── Mobile: back-to-hub bar + full-width content ──
  if (isMobile) {
    return (
      <>
        <GlobalStyles
          styles={(t) => ({
            ".mamadoc-settings-mobile .MuiDialog-container": {
              alignItems: "flex-end",
            },
            ".mamadoc-settings-mobile .MuiDialog-paper": {
              width: "100% !important",
              maxWidth: "none !important",
              maxHeight: "92dvh !important",
              margin: "0 !important",
              borderRadius: "22px 22px 0 0 !important",
              bgcolor: t.palette.background.paper,
              "&::before": {
                content: '""',
                width: 38,
                height: 5,
                flexShrink: 0,
                alignSelf: "center",
                mt: 1,
                borderRadius: "3px",
                bgcolor: t.palette.divider,
              },
            },
            ".mamadoc-settings-mobile .MuiDialogTitle-root": {
              px: 2.25,
              pt: 1.25,
              pb: 1,
            },
            ".mamadoc-settings-mobile .MuiDialogContent-root": {
              px: 2.25,
              pb: 2,
            },
            ".mamadoc-settings-mobile .MuiDialogActions-root": {
              gap: 1,
              px: 2.25,
              pt: 1.5,
              pb: "calc(12px + env(safe-area-inset-bottom))",
              "& .MuiButton-root": {
                minHeight: 44,
                borderRadius: "12px",
              },
            },
            ".mamadoc-settings-mobile .MuiDrawer-paperAnchorRight": {
              width: "100% !important",
              maxWidth: "100vw !important",
            },
          })}
        />
        <Box
          sx={{
            height: "100%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: "background.default",
            width: "calc(100% + 16px)",
            mx: -1,
            animation: "settingsPageIn .28s cubic-bezier(.22, 1, .36, 1)",
            "@keyframes settingsPageIn": {
              from: { transform: "translateX(100%)" },
              to: { transform: "translateX(0)" },
            },
          }}
        >
          <Box sx={{ flexShrink: 0, px: 1.25, pt: 0.75, pb: 0.5 }}>
            <Button
              component={RouterLink}
              to="/settings"
              startIcon={<KeyboardArrowLeftOutlined />}
              size="small"
              sx={{
                alignSelf: "flex-start",
                textTransform: "none",
                fontWeight: 500,
                color: "primary.main",
                minHeight: 36,
                borderRadius: "9px",
                px: 0.5,
                fontSize: 15,
                "& .MuiButton-startIcon": { mr: 0.25 },
              }}
            >
              Настройки
            </Button>
          </Box>
          <Box
            className="settings-mobile-content"
            sx={(t) => ({
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              px: 2,
              pt: 0.25,
              pb: "calc(28px + env(safe-area-inset-bottom))",
              WebkitOverflowScrolling: "touch",
              "& > .MuiStack-root": {
                width: "100%",
                maxWidth: "none !important",
              },
              "& > .MuiStack-root > .MuiStack-root:first-of-type .MuiTypography-h6": {
                fontSize: 28,
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.6px",
              },
              "& > .MuiStack-root > .MuiStack-root:first-of-type": {
                width: "100%",
                flexDirection: "column !important",
                alignItems: "stretch !important",
              },
              "& > .MuiStack-root > .MuiStack-root:first-of-type > .MuiSvgIcon-root": {
                display: "none",
              },
              "& > .MuiStack-root > .MuiStack-root:first-of-type > .MuiStack-root:first-of-type > .MuiSvgIcon-root": {
                display: "none",
              },
              "& > .MuiStack-root > .MuiStack-root:first-of-type > .MuiButton-root": {
                width: "100%",
                minHeight: 44,
              },
              "& > .MuiStack-root > .MuiStack-root:first-of-type > .MuiStack-root:last-of-type:not(:first-of-type)": {
                width: "100%",
                flexDirection: "column",
                alignItems: "stretch",
                "& .MuiTextField-root": { width: "100% !important" },
                "& .MuiButton-root": { width: "100%", minHeight: 44 },
              },
              "& .MuiOutlinedInput-root": {
                borderRadius: "12px",
                bgcolor: "background.paper",
              },
              "& .MuiFormControl-root:not(.MuiTextField-root)": {
                p: 1.75,
                border: `1px solid ${t.palette.divider}`,
                borderRadius: "16px",
                bgcolor: t.palette.background.paper,
              },
              "& .MuiButton-root:not(.MuiIconButton-root)": {
                borderRadius: "12px",
              },
              "& > .MuiStack-root > .MuiBox-root:last-of-type .MuiButton-root": {
                width: "100%",
                minHeight: 48,
              },
              "& .MuiPaper-outlined": {
                borderRadius: "16px",
                boxShadow: "none",
              },
              "& .MuiTableContainer-root": {
                overflow: "visible",
              },
              "& .MuiTable-root, & .MuiTableBody-root": {
                display: "block",
                width: "100%",
              },
              "& .MuiTableHead-root": {
                display: "none",
              },
              "& .MuiTableBody-root": {
                display: "grid",
                gap: 1,
              },
              "& .MuiTableRow-root": {
                position: "relative",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                columnGap: 1,
                alignItems: "center",
                p: 1.75,
                border: `1px solid ${t.palette.divider}`,
                borderRadius: "16px",
                bgcolor: t.palette.background.paper,
                overflow: "hidden",
              },
              "& .MuiTableCell-root": {
                display: "block",
                width: "auto !important",
                minWidth: 0,
                p: 0,
                border: 0,
                textAlign: "left",
              },
              "& .MuiTableCell-root:first-of-type": {
                gridColumn: 1,
                fontSize: 15,
                fontWeight: 600,
                color: "text.primary",
              },
              "& .MuiTableCell-root:not(:first-of-type):not(:last-of-type)": {
                gridColumn: 1,
                mt: 0.5,
                fontSize: 12.5,
                color: "text.secondary",
                "& .MuiTypography-root": { color: "inherit" },
              },
              "& .MuiTableCell-root:last-of-type:not(:first-of-type)": {
                gridColumn: 2,
                gridRow: "1 / span 8",
                alignSelf: "center",
                justifySelf: "end",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                color: "text.secondary",
              },
              "& .MuiTableCell-root[colspan]": {
                gridColumn: "1 / -1",
                gridRow: "auto",
                justifySelf: "stretch",
                textAlign: "center",
              },
              "& .MuiDivider-root": {
                borderColor: "divider",
              },
            })}
          >
            {children}
          </Box>
        </Box>
      </>
    );
  }

  // ── Desktop: left rail + content ──
  const activeIndex = Math.max(
    0,
    visibleTabs.findIndex((tab) =>
      location.pathname === tab.to ||
      location.pathname.startsWith(`${tab.to}/`),
    ),
  );

  return (
    <Box sx={{ p: 2, height: "100%" }}>
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
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: 2,
            flex: 1,
            minHeight: 0,
          }}
        >
          <Paper variant="outlined" sx={{ p: 1, alignSelf: "start" }}>
            <Tabs
              value={activeIndex}
              orientation="vertical"
              variant="standard"
              aria-label="Разделы настроек"
              sx={{
                borderRight: 0,
                "& .MuiTab-root": {
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  textAlign: "left",
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
            sx={{ p: 3, minHeight: 240, overflow: "auto" }}
          >
            {children}
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
};

export default SettingsLayout;
