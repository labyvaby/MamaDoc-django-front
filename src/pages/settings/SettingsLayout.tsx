import React from "react";
import {
  Box,
  Button,
  GlobalStyles,
  Paper,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Link as RouterLink, useLocation } from "react-router";

import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import StoreOutlined from "@mui/icons-material/StoreOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import WorkOutlined from "@mui/icons-material/WorkOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import KeyboardArrowLeftOutlined from "@mui/icons-material/KeyboardArrowLeftOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";

import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import RouterOutlined from "@mui/icons-material/RouterOutlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";

import { CASHLESS_METHODS_ENABLED } from "../../api/cashlessMethods";
import { DEALS_MODULE_ENABLED } from "../../api/deals";
import { useCanChecker } from "../../hooks/useCan";
import { useModuleGate } from "../../hooks/useModuleGate";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { useT } from "../../i18n/VerticalProvider";
import {
  SETTINGS_TAB_PERMISSIONS,
  type SettingsTabKey,
} from "../../config/settingsPermissions";

export { SETTINGS_TAB_PERMISSIONS };
export type { SettingsTabKey };

/**
 * Group keys for the mobile hub (hub-and-spoke navigation).  Order
 * here is the order the groups appear on the /settings hub screen.
 * Display labels live in locales/ru/settings.json (layout.groups.*) —
 * these are stable lookup keys, not user-facing text.
 */
export const SETTINGS_GROUPS = [
  "clinic",
  "access",
  "catalogs",
  "operations",
] as const;

export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

type TabDef = {
  key: SettingsTabKey;
  to: string;
  icon: React.ReactElement;
  group: SettingsGroup;
  tone?: "primary" | "success";
};

/** Labels come from t(`layout.tabs.${key}`) — see useVisibleSettingsTabs. */
const TAB_DEFS: TabDef[] = [
  {
    key: "productAttributes",
    to: "/settings/product-attributes",
    icon: <Inventory2Outlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "organization",
    to: "/settings/organization",
    icon: <BusinessOutlined fontSize="small" />,
    group: "clinic",
  },
  {
    key: "branches",
    to: "/settings/branches",
    icon: <StoreOutlined fontSize="small" />,
    group: "clinic",
  },
  {
    key: "site",
    to: "/settings/site",
    icon: <LanguageOutlined fontSize="small" />,
    group: "clinic",
  },
  {
    key: "roles",
    to: "/settings/roles",
    icon: <AdminPanelSettingsOutlined fontSize="small" />,
    group: "access",
    tone: "success",
  },
  {
    key: "memberships",
    to: "/settings/memberships",
    icon: <GroupsOutlined fontSize="small" />,
    group: "access",
    tone: "success",
  },
  {
    key: "specializations",
    to: "/settings/specializations",
    icon: <WorkOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "banks",
    to: "/settings/banks",
    icon: <AccountBalanceOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "insurers",
    to: "/settings/insurers",
    icon: <HealthAndSafetyOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "cashlessMethods",
    to: "/settings/cashless-methods",
    icon: <CreditCardOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "expenseCategories",
    to: "/settings/expense-categories",
    icon: <ReceiptLongOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "diagnoses",
    to: "/settings/diagnoses",
    icon: <LocalHospitalOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "conclusionForms",
    to: "/settings/conclusion-forms",
    icon: <DescriptionOutlined fontSize="small" />,
    group: "catalogs",
  },
  {
    key: "tasks",
    to: "/settings/tasks",
    icon: <AssignmentOutlined fontSize="small" />,
    group: "operations",
  },
  {
    key: "deals",
    to: "/settings/deals",
    icon: <FilterAltOutlined fontSize="small" />,
    group: "operations",
  },
  {
    key: "cleaning",
    to: "/settings/cleaning",
    icon: <CleaningServicesOutlined fontSize="small" />,
    group: "operations",
  },
  {
    key: "skud",
    to: "/settings/skud",
    icon: <RouterOutlined fontSize="small" />,
    group: "operations",
  },
  {
    key: "announcements",
    to: "/settings/announcements",
    icon: <CampaignOutlined fontSize="small" />,
    group: "operations",
  },
  {
    key: "notifications",
    to: "/settings/notifications",
    icon: <NotificationsOutlined fontSize="small" />,
    group: "operations",
  },
  {
    key: "automations",
    to: "/settings/automations",
    icon: <BoltOutlined fontSize="small" />,
    group: "operations",
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
  const { activeOrganization } = usePermissions();
  const retailHiddenTabs: SettingsTabKey[] = [
    "site",
    "specializations",
    "banks",
    "insurers",
    "diagnoses",
    "conclusionForms",
  ];
  return TAB_DEFS.filter((tab) => {
    if (activeOrganization?.vertical === "retail" && retailHiddenTabs.includes(tab.key)) {
      return false;
    }
    if (tab.key === "productAttributes" && activeOrganization?.vertical !== "retail") return false;
    // Справочник способов безнала: на бэке эндпоинта ещё нет — вкладку
    // показываем только вместе с остальным UI, по флагу (api/cashlessMethods.ts).
    if (tab.key === "cashlessMethods" && !CASHLESS_METHODS_ENABLED) return false;
    // Воронка продаж: на проде эндпоинтов ещё нет — вкладку прячем тем же
    // флагом, что и роут с пунктом меню (api/deals.ts).
    if (tab.key === "deals" && !DEALS_MODULE_ENABLED) return false;
    // Уборка на моках: гейт единый с роутом и сайдбаром (см. useModuleGate).
    return tab.key === "cleaning"
      ? moduleGate("cleaning", [SETTINGS_TAB_PERMISSIONS.cleaning])
      : can(SETTINGS_TAB_PERMISSIONS[tab.key]);
  });
}

/**
 * Mobile settings hub (hub-and-spoke).  Shown at /settings on small
 * screens instead of redirecting to the first tab: a grouped list of
 * sections the caller can see, each linking to its own screen.
 */
export const SettingsHub: React.FC = () => {
  const visibleTabs = useVisibleSettingsTabs();
  const { activeOrganization } = usePermissions();
  const { t } = useT("settings");

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
          {t("layout.title")}
        </Typography>
        <Typography
          color="text.secondary"
          sx={{ mt: 0.25, fontSize: 13.5, lineHeight: 1.35 }}
        >
          {activeOrganization?.name ?? t("layout.noOrgSelected")}
        </Typography>
      </Box>
      <Stack spacing={0}>
        {SETTINGS_GROUPS.map((group) => {
          const groupTabs = visibleTabs.filter((tab) => tab.group === group);
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
                {t(`layout.groups.${group}`)}
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
                    sx={(theme) => ({
                      display: "flex",
                      alignItems: "center",
                      gap: 1.625,
                      px: 1.875,
                      py: 1.625,
                      minHeight: 58,
                      textDecoration: "none",
                      color: "text.primary",
                      borderBottom:
                        i < groupTabs.length - 1 ? `1px solid ${theme.palette.divider}` : "none",
                      transition: "background-color .13s ease",
                      "&:active": { bgcolor: theme.palette.action.selected },
                    })}
                  >
                    <Box
                      sx={(theme) => ({
                        width: 34,
                        height: 34,
                        borderRadius: "9px",
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color:
                          tab.tone === "success"
                            ? theme.palette.success.main
                            : theme.palette.primary.main,
                        bgcolor: alpha(
                          tab.tone === "success"
                            ? theme.palette.success.main
                            : theme.palette.primary.main,
                          theme.palette.mode === "dark" ? 0.17 : 0.1,
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
                      {t(`layout.tabs.${tab.key}`)}
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
  const { t } = useT("settings");

  React.useEffect(() => {
    if (!isMobile) return;
    document.body.classList.add("mamadoc-settings-mobile");
    return () => document.body.classList.remove("mamadoc-settings-mobile");
  }, [isMobile]);

  const [railSearch, setRailSearch] = React.useState("");

  // Рельс разделов скроллится сам, поэтому открытый раздел может оказаться за
  // его нижним краем — подтягиваем активный пункт в видимую часть.
  const activeItemRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [location.pathname]);

  if (visibleTabs.length === 0) {
    return <AccessDenied />;
  }

  // ── Mobile: back-to-hub bar + full-width content ──
  if (isMobile) {
    return (
      <>
        <GlobalStyles
          styles={(theme) => ({
            ".mamadoc-settings-mobile .MuiDialog-container": {
              alignItems: "flex-end",
            },
            ".mamadoc-settings-mobile .MuiDialog-paper": {
              width: "100% !important",
              maxWidth: "none !important",
              maxHeight: "92dvh !important",
              margin: "0 !important",
              borderRadius: "22px 22px 0 0 !important",
              bgcolor: theme.palette.background.paper,
              "&::before": {
                content: '""',
                width: 38,
                height: 5,
                flexShrink: 0,
                alignSelf: "center",
                mt: 1,
                borderRadius: "3px",
                bgcolor: theme.palette.divider,
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
              {t("layout.title")}
            </Button>
          </Box>
          <Box
            className="settings-mobile-content"
            sx={(theme) => ({
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
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: "16px",
                bgcolor: theme.palette.background.paper,
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
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: "16px",
                bgcolor: theme.palette.background.paper,
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
  const isActiveTab = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  // Поиск по рельсу ищет и по названию раздела, и по названию группы:
  // «доступ» приводит к «Роли» и «Сотрудники и доступы» одинаково ожидаемо.
  const railQuery = railSearch.trim().toLowerCase();
  const matchesQuery = (tab: TabDef) =>
    !railQuery ||
    t(`layout.tabs.${tab.key}`).toLowerCase().includes(railQuery) ||
    t(`layout.groups.${tab.group}`).toLowerCase().includes(railQuery);
  const foundTabs = visibleTabs.filter(matchesQuery);


  return (
    <Box sx={{ p: 2, height: "100%" }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Stack
          direction="row"
          alignItems="baseline"
          justifyContent="space-between"
        >
          <Typography variant="h5" fontWeight={600}>
            {t("layout.title")}
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
          {/* Рельс разделов: те же группы, что на мобильном хабе, и свой
              скролл — разделов больше двух десятков, плоским списком нижние
              уходили за край экрана без возможности доскроллить. */}
          <Paper
            component="nav"
            aria-label={t("layout.tabsAriaLabel")}
            variant="outlined"
            sx={{
              p: 1,
              alignSelf: "stretch",
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            <Box
              sx={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                bgcolor: "background.paper",
                pb: 1,
              }}
            >
              <TextField
                fullWidth
                size="small"
                value={railSearch}
                onChange={(e) => setRailSearch(e.target.value)}
                placeholder={t("layout.searchPlaceholder")}
                inputProps={{ "aria-label": t("layout.searchPlaceholder") }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            {foundTabs.length === 0 && (
              <Typography
                variant="body2"
                color="text.disabled"
                sx={{ textAlign: "center", py: 3 }}
              >
                {t("layout.searchEmpty")}
              </Typography>
            )}

            {SETTINGS_GROUPS.map((group) => {
              const groupTabs = foundTabs.filter((tab) => tab.group === group);
              if (groupTabs.length === 0) return null;
              return (
                <Box key={group} sx={{ "&:not(:first-of-type)": { mt: 1.5 } }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      px: 1,
                      pb: 0.5,
                      display: "block",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {t(`layout.groups.${group}`)}
                  </Typography>
                  <Stack spacing={0.25}>
                    {groupTabs.map((tab) => {
                      const active = isActiveTab(tab.to);
                      return (
                        <Box
                          key={tab.key}
                          ref={active ? activeItemRef : undefined}
                          component={RouterLink}
                          to={tab.to}
                          aria-current={active ? "page" : undefined}
                          sx={(theme) => {
                            const accent =
                              tab.tone === "success"
                                ? theme.palette.success.main
                                : theme.palette.primary.main;
                            return {
                              display: "flex",
                              alignItems: "center",
                              gap: 1.25,
                              px: 1,
                              py: 0.625,
                              minHeight: 38,
                              borderRadius: "10px",
                              textDecoration: "none",
                              color: active ? "primary.onSurface" : "text.primary",
                              bgcolor: active
                                ? alpha(accent, theme.palette.mode === "dark" ? 0.18 : 0.1)
                                : "transparent",
                              transition: "background-color .15s ease, color .15s ease",
                              "&:hover": {
                                bgcolor: active
                                  ? alpha(accent, theme.palette.mode === "dark" ? 0.24 : 0.14)
                                  : theme.palette.action.hover,
                              },
                              // Плашка как на мобильном хабе, но только у
                              // открытого раздела: 20 цветных квадратов подряд
                              // в узкой колонке перетягивают на себя внимание.
                              "& .settings-rail-icon": {
                                width: 28,
                                height: 28,
                                borderRadius: "8px",
                                flexShrink: 0,
                                display: "grid",
                                placeItems: "center",
                                color: accent,
                                bgcolor: active
                                  ? alpha(accent, theme.palette.mode === "dark" ? 0.22 : 0.12)
                                  : "transparent",
                                transition: "background-color .15s ease",
                              },
                              "& .MuiSvgIcon-root": { fontSize: 19 },
                            };
                          }}
                        >
                          <Box className="settings-rail-icon">{tab.icon}</Box>
                          <Typography
                            noWrap
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 14,
                              fontWeight: active ? 600 : 500,
                            }}
                          >
                            {t(`layout.tabs.${tab.key}`)}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
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
