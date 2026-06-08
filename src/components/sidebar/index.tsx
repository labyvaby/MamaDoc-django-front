import React, { useEffect, useState } from "react";
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  IconButton,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import Backdrop from "@mui/material/Backdrop";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme, alpha } from "@mui/material/styles";
import appLogo from "../../assets/img/logo.png";


import HomeOutlined from "@mui/icons-material/HomeOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
// import BlockOutlined from "@mui/icons-material/BlockOutlined";
// import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import AnalyticsOutlined from "@mui/icons-material/AnalyticsOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import MenuOutlined from "@mui/icons-material/MenuOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";

import { useThemedLayoutContext } from "@refinedev/mui";
import { logout as djangoLogout } from "../../api";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { supabase } from "../../utility/supabaseClient";
import { Link as RouterLink, useLocation } from "react-router";
import { useMobileSidebar } from "./mobile-context";
import { SettingsModal } from "./SettingsModal";
import { ActiveContextSwitcher } from "./ActiveContextSwitcher";
import { useWorkShift } from "../../hooks/useWorkShift";
import { usePermissions } from "../../hooks/usePermissions";
import { useSkudActions } from "../../hooks/useSkudActions";
import { useCanChecker } from "../../hooks/useCan";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { AccountBalanceWalletOutlined } from "@mui/icons-material";
import WorkOutlineOutlined from "@mui/icons-material/WorkOutline";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import ManageAccountsOutlined from "@mui/icons-material/ManageAccountsOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";

type NavGroup = "all" | "my-work" | "org" | "storage" | "management";

const NAV_FILTER_TABS: { id: NavGroup; label: string; icon: React.ElementType }[] = [
  { id: "all",        label: "Все",          icon: GridViewOutlined },
  { id: "my-work",   label: "Моя работа",   icon: WorkOutlineOutlined },
  { id: "org",       label: "Организация",  icon: LocalHospitalOutlined },
  { id: "storage",   label: "Склады",       icon: WarehouseOutlined },
  { id: "management",label: "Управление",   icon: ManageAccountsOutlined },
];

// Sidebar root that ThemedLayout will render via Sider={() => <Sidebar />}
export const Sidebar: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  const { setMobileOpen } = useMobileSidebar();

  const stickyTop = (
    <>
      {isMobile && <MobileSidebarHeader />}
      {isDesktop && <DesktopSidebarHeader />}
      <Divider sx={{ my: 1 }} />
      {IS_DJANGO_BACKEND && (
        <ActiveContextSwitcher
          onSwitched={() => {
            if (isMobile) setMobileOpen(false);
          }}
        />
      )}
    </>
  );

  const nav = <SidebarSecondary />;

  const footer = (
    <>
      <Divider sx={{ my: 1 }} />
      <SidebarFooter />
    </>
  );

  return (
    <SidebarContainer stickyTop={stickyTop} footer={footer}>
      {nav}
    </SidebarContainer>
  );
};

// Container responsible for width/collapsed behavior
const SidebarContainer: React.FC<React.PropsWithChildren<{ stickyTop?: React.ReactNode; footer?: React.ReactNode }>> = ({ children, stickyTop, footer }) => {
  const { siderCollapsed, setSiderCollapsed } = useThemedLayoutContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // mobile-only open state comes from shared header/sidebar context
  const { mobileOpen, setMobileOpen } = useMobileSidebar();

  const desktopWidth = siderCollapsed ? 64 : 260;
  const overlayWidth = 260;

  // Ensure layout stays collapsed on mobile to prevent content shift
  useEffect(() => {
    if (isMobile && !siderCollapsed) {
      setSiderCollapsed?.(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && mobileOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original || "";
      };
    }
    return;
  }, [isMobile, mobileOpen]);

  return (
    <>
      {/* Backdrop behind the sidebar on mobile */}
      <Backdrop
        open={Boolean(isMobile && mobileOpen)}
        onClick={() => setMobileOpen(false)}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 3 }}
      />

      {/* Layout participant wrapper ensures no width on mobile */}
      <Box sx={{ width: { xs: 0, md: desktopWidth }, transition: (theme) => theme.transitions.create("width", { duration: theme.transitions.duration.standard }) }}>
        {/* Desktop sidebar (sticky, participates in layout) */}
        <Box
          component="nav"
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            width: "100%",
            bgcolor: "background.paper",
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            height: (theme) => theme.appLayout.fullPage.minHeight,
            position: "sticky",
            top: 0,
            p: 1,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {/* Лого + divider — не скроллируются */}
          <Box sx={{ flexShrink: 0 }}>{stickyTop}</Box>
          {/* Список пунктов — скроллируется */}
          <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, msOverflowStyle: "none", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
            {children}
          </Box>
          {/* Футер — не скроллируется */}
          <Box sx={{ flexShrink: 0 }}>{footer}</Box>
        </Box>
      </Box>

      {/* Mobile overlay sidebar (fixed, does not affect layout) */}
      <Box
        component="nav"
        sx={{
          display: { xs: "flex", md: "none" },
          flexDirection: "column",
          width: overlayWidth,
          bgcolor: "background.paper",
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          height: "100dvh",
          position: "fixed",
          left: 0,
          top: 0,
          p: 1,
          boxSizing: "border-box",
          overflow: "hidden",
          zIndex: (theme) => theme.zIndex.drawer + 5,
          boxShadow: 8,
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 300ms ease-in-out !important",
        }}
      >
        {/* Лого + divider — не скроллируются */}
        <Box sx={{ flexShrink: 0 }}>{stickyTop}</Box>
        {/* Список пунктов — скроллируется */}
        <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, msOverflowStyle: "none", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          {children}
        </Box>
        {/* Футер — не скроллируется */}
        <Box sx={{ flexShrink: 0 }}>{footer}</Box>
      </Box>
    </>
  );
};

// Mobile header with logo (< 768px - мобильные и планшеты)
const MobileSidebarHeader: React.FC = () => {
  const { mobileOpen } = useMobileSidebar();

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pt: 2,
        pb: 1.5,
        px: 1,
        opacity: mobileOpen ? 1 : 0,
        transform: mobileOpen ? "translateY(0)" : "translateY(-10px)",
        transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <Box
        component="img"
        src={appLogo}
        alt="Мама Доктор"
        sx={{
          height: 36,
          width: "auto",
        }}
      />
    </Box>
  );
};

// Desktop header with logo and burger button on same level (>= 768px)
const DesktopSidebarHeader: React.FC = () => {
  const { siderCollapsed, setSiderCollapsed } = useThemedLayoutContext();

  const handleClick = () => {
    setSiderCollapsed?.(!siderCollapsed);
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: siderCollapsed ? "center" : "space-between",
        alignItems: "center",
        py: 1,
        px: 1,
      }}
    >
      {/* Логотип слева - скрывается при коллапсе */}
      <Box
        sx={{
          opacity: !siderCollapsed ? 1 : 0,
          transform: !siderCollapsed ? "translateX(0)" : "translateX(-10px)",
          transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
          width: !siderCollapsed ? "auto" : 0,
          overflow: "hidden",
        }}
      >
        <Box
          component="img"
          src={appLogo}
          alt="Мама Доктор"
          sx={{
            height: 28,
            width: "auto",
          }}
        />
      </Box>

      {/* Кнопка бургера - всегда видна */}
      <Tooltip title={siderCollapsed ? "Открыть меню" : "Скрыть меню"} placement="right">
        <IconButton onClick={handleClick} size="small">
          <MenuOutlined />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

// Extra static sections: mimic the provided design with many items
const SidebarSecondary: React.FC = () => {
  const { siderCollapsed } = useThemedLayoutContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  useWorkShift();
  const { hasRole, isNurse: isNurseFunc, isAdmin, isRegistrator, isDoctor, isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const { can } = useCanChecker();
  const isNurse = isNurseFunc();
  const isSuper = isSuperAdmin();
  const hasAccessToCashbox = isSuper || hasRole(['admin', 'superadmin', 'accountant', 'receptionist']);
  const [activeGroup, setActiveGroup] = useState<NavGroup>(() => {
    const saved = sessionStorage.getItem("sidebar-group");
    return (saved as NavGroup) ?? "my-work";
  });

  const handleGroupChange = (group: NavGroup) => {
    setActiveGroup(group);
    sessionStorage.setItem("sidebar-group", group);
  };

  const show = (group: NavGroup) => activeGroup === "all" || activeGroup === group;

  // Есть ли хотя бы один видимый пункт в каждой группе для текущей роли
  const groupVisible: Record<Exclude<NavGroup, "all">, boolean> = {
    "my-work":    true, // СКУД виден всем
    "org":        true, // Расписание, Все приёмы, Услуги — видны всем
    "storage":    true, // Товары — видны всем
    "management": true, // Отчет по ЗП, Расходы — видны всем
  };

  // Если активная группа стала недоступной — сбросить на "all"
  React.useEffect(() => {
    if (activeGroup !== "all" && !groupVisible[activeGroup as Exclude<NavGroup, "all">]) {
      handleGroupChange("all");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNurse, isSuper]);

  if (permissionsLoading) {
    return (
      <List sx={{ py: 0 }}>
        <SidebarMenuItem to="/schedule" icon={<CalendarMonthOutlined />} label="Расписание" collapsed={siderCollapsed} />
        <SidebarMenuItem to="/nurse" icon={<MedicalServicesOutlined />} label="Процедурный кабинет" collapsed={siderCollapsed} />
        <SidebarMenuItem to="/expenses" icon={<PaymentsOutlined />} label="Расходы" collapsed={siderCollapsed} />
        <SidebarMenuItem to="/products" icon={<Inventory2Outlined />} label="Товары" collapsed={siderCollapsed} />
        <SidebarSkudItem collapsed={siderCollapsed} />
      </List>
    );
  }

  return (
    <>
      {/* ── Фильтр-вкладки (мобильный + раскрытый десктоп) ── */}
      {(!siderCollapsed || isMobile) && (
        <Box sx={{ px: 1, pt: 1, pb: 0.5 }}>
          {/* Кнопка "Все" — на всю ширину, меньше высотой */}
          <Box
            component="button"
            onClick={() => handleGroupChange("all")}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              width: "100%",
              mb: 1,
              py: 1,
              px: 2,
              border: "1px solid",
              borderRadius: 1,
              cursor: "pointer",
              transition: "all 150ms",
              borderColor: activeGroup === "all" ? "primary.main" : "divider",
              bgcolor: activeGroup === "all" ? (t) => alpha(t.palette.primary.main, 0.1) : "transparent",
              color: activeGroup === "all" ? "primary.main" : "text.secondary",
              "&:hover": { borderColor: "primary.main", color: "primary.main" },
            }}
          >
            <GridViewOutlined sx={{ fontSize: 16 }} />
            <Typography variant="caption" fontWeight={600} sx={{ fontSize: "0.72rem" }}>Все</Typography>
          </Box>

          {/* 2×2 сетка для 4 остальных групп */}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            {NAV_FILTER_TABS.filter(t => t.id !== "all" && groupVisible[t.id as Exclude<NavGroup, "all">]).map(({ id, label, icon: Icon }) => (
              <Box
                key={id}
                component="button"
                onClick={() => handleGroupChange(id)}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.75,
                  py: 1.5,
                  px: 1,
                  border: "1px solid",
                  borderRadius: 1,
                  cursor: "pointer",
                  transition: "all 150ms",
                  borderColor: activeGroup === id ? "primary.main" : "divider",
                  bgcolor: activeGroup === id ? (t) => alpha(t.palette.primary.main, 0.1) : "transparent",
                  color: activeGroup === id ? "primary.main" : "text.secondary",
                  "&:hover": { borderColor: "primary.main", color: "primary.main" },
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
                <Typography variant="caption" fontWeight={500} sx={{ fontSize: "0.65rem", lineHeight: 1.2, textAlign: "center" }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Список пунктов меню ── */}
      <List sx={{ py: 0, mt: (!siderCollapsed || isMobile) ? 0.5 : 0 }}>

        {/* ══════════════════════════════════════════
            МОЯ РАБОТА
            В Django-mode: Регистратура → /appointments
            Остальные → placeholder (видны в меню, не скрыты)
            ══════════════════════════════════════════ */}

        {/* Регистратура — в Django-mode ведёт на /appointments */}
        {show("my-work") && (isSuper || (!isNurse && !isDoctor())) && (
          <SidebarMenuItem
            to={IS_DJANGO_BACKEND ? "/appointments" : "/home"}
            icon={<HomeOutlined />}
            label="Регистратура"
            collapsed={siderCollapsed}
          />
        )}

        {/* Кабинет врача */}
        {show("my-work") && (isSuper || (!isNurse && !isAdmin() && !isRegistrator())) && (
          <SidebarMenuItem to="/doctor" icon={<LocalHospitalOutlined />} label="Кабинет врача" collapsed={siderCollapsed} />
        )}

        {/* Процедурный кабинет */}
        {show("my-work") && (isSuper || isAdmin() || isNurse) && (
          <SidebarMenuItem to="/nurse" icon={<MedicalServicesOutlined />} label="Процедурный кабинет" collapsed={siderCollapsed} />
        )}

        {/* Все пациенты */}
        {show("my-work") && (isSuper || (IS_DJANGO_BACKEND ? can('patients.view') : !isNurse)) && (
          <SidebarMenuItem
            to={IS_DJANGO_BACKEND ? "/patients" : "/patient-search"}
            icon={<SearchOutlined />}
            label="Все пациенты"
            collapsed={siderCollapsed}
          />
        )}

        {/* Расписание */}
        {show("my-work") && (
          <SidebarMenuItem to="/schedule" icon={<CalendarMonthOutlined />} label="Расписание" collapsed={siderCollapsed} />
        )}

        {/* СКУД */}
        {show("my-work") && <SidebarSkudItem collapsed={siderCollapsed} />}

        {/* ══════════════════════════════════════════
            ОРГАНИЗАЦИЯ
            ══════════════════════════════════════════ */}

        {/* Сотрудники */}
        {show("org") && (isSuper || (IS_DJANGO_BACKEND ? can('staff.view') : !isNurse)) && (
          <SidebarMenuItem to="/employees" icon={<BadgeOutlined />} label="Сотрудники" collapsed={siderCollapsed} />
        )}

        {/* Все приемы — в Django-mode ведёт на /all-appointments (placeholder) */}
        {show("org") && (
          <SidebarMenuItem to="/all-appointments" icon={<HistoryOutlined />} label="Все приемы" collapsed={siderCollapsed} />
        )}

        {/* Все процедуры */}
        {show("org") && (
          <SidebarMenuItem to="/all-procedures" icon={<MedicalServicesOutlined />} label="Все процедуры" collapsed={siderCollapsed} />
        )}

        {/* Услуги */}
        {show("org") && (isSuper || (IS_DJANGO_BACKEND ? can('catalog.view') : true)) && (
          <SidebarMenuItem to="/services" icon={<MedicalServicesOutlined />} label="Услуги" collapsed={siderCollapsed} />
        )}

        {/* Диагнозы */}
        {show("org") && (isSuper || (IS_DJANGO_BACKEND ? can('catalog.view') : isDoctor())) && (
          <SidebarMenuItem to="/settings/diagnoses" icon={<ScienceOutlined />} label="Диагнозы" collapsed={siderCollapsed} />
        )}

        {/* ══════════════════════════════════════════
            СКЛАДЫ
            ══════════════════════════════════════════ */}

        {/* Товары */}
        {show("storage") && (
          <SidebarMenuItem to="/products" icon={<Inventory2Outlined />} label="Товары" collapsed={siderCollapsed} />
        )}

        {/* Продажи товаров */}
        {show("storage") && (isSuper || isAdmin() || isRegistrator()) && (
          <SidebarMenuItem to="/sales" icon={<AnalyticsOutlined />} label="Продажи товаров" collapsed={siderCollapsed} />
        )}

        {/* Движение товара + Склад */}
        {show("storage") && (isSuper || isAdmin()) && (
          <>
            <SidebarMenuItem to="/storage" icon={<Inventory2Outlined />} label="Движение товара" collapsed={siderCollapsed} />
            <SidebarMenuItem to="/warehouses" icon={<Inventory2Outlined />} label="Склад" collapsed={siderCollapsed} />
          </>
        )}

        {/* ══════════════════════════════════════════
            УПРАВЛЕНИЕ
            ══════════════════════════════════════════ */}

        {/* Отчет по ЗП */}
        {show("management") && (
          <SidebarMenuItem to="/salary-reports" icon={<AccountBalanceWalletOutlined />} label="Отчет по ЗП" collapsed={siderCollapsed} />
        )}

        {/* Отчеты */}
        {show("management") && (isSuper || isAdmin() || hasRole(['accountant'])) && (
          <SidebarMenuItem to="/reports" icon={<AssessmentOutlined />} label="Отчеты" collapsed={siderCollapsed} />
        )}

        {/* Расходы */}
        {show("management") && (
          <SidebarMenuItem
            to="/expenses"
            icon={<PaymentsOutlined />}
            label="Расходы"
            collapsed={siderCollapsed}
          />
        )}

        {/* Касса */}
        {show("management") && (IS_DJANGO_BACKEND ? (isSuper || can('finance.view')) : hasAccessToCashbox) && (
          <SidebarMenuItem to="/cashbox" icon={<AccountBalanceWalletOutlined />} label="Касса" collapsed={siderCollapsed} />
        )}

        {/* Нагрузка */}
        {show("management") && isSuper && (
          <SidebarMenuItem to="/admin/load" icon={<AnalyticsOutlined />} label="Нагрузка" collapsed={siderCollapsed} />
        )}

        {/* Уведомления */}
        {show("management") && isSuper && (
          <SidebarMenuItem to="/settings/notifications" icon={<NotificationsOutlined />} label="Уведомления" collapsed={siderCollapsed} />
        )}

        {/* Настройки (Django-mode only) */}
        {show("management") && IS_DJANGO_BACKEND && (
          isSuper
          || can('organization.view')
          || can('branches.view')
          || can('rbac.roles.view')
          || can('rbac.memberships.view')
        ) && (
          <SidebarMenuItem to="/settings" icon={<TuneOutlined />} label="Настройки" collapsed={siderCollapsed} />
        )}
      </List>
    </>
  );
};

// Reusable item with tooltip-on-collapse
type SidebarMenuItemProps = {
  to: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  selected?: boolean;
  collapsed?: boolean;
  showBadge?: boolean;
};

const SidebarMenuItem: React.FC<SidebarMenuItemProps> = ({
  to,
  icon,
  label,
  selected,
  collapsed,
  showBadge = false,
}) => {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const collapsedFinal = (collapsed ?? false) && !isMobile;
  const isActive = selected ?? (location.pathname === to || location.pathname.startsWith(to + "/"));

  const text = (
    <Box
      sx={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        opacity: collapsedFinal ? 0 : 1,
        width: collapsedFinal ? 0 : "auto",
        transition: (theme) => theme.transitions.create(["opacity", "width", "margin"], { duration: 200 }),
        ml: collapsedFinal ? 0 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <ListItemText primary={label} />
      {showBadge && !collapsedFinal && (
        <Badge
          variant="dot"
          color="error"
          sx={{
            '& .MuiBadge-dot': {
              width: 8,
              height: 8,
              borderRadius: '50%',
            }
          }}
        />
      )}
    </Box>
  );

  const button = (
    <ListItem disablePadding>
      <ListItemButton
        component={RouterLink}
        to={to}
        selected={isActive}
        sx={{
          borderRadius: 4,
          my: 0.5,
          px: 1.4,
          color: (theme) => (isActive ? theme.palette.primary.main : undefined),
          '& .MuiListItemIcon-root': {
            color: (theme) => (isActive ? theme.palette.primary.main : undefined),
          },
          bgcolor: (theme) =>
            isActive
              ? (theme.palette.mode === 'dark'
                ? alpha(theme.palette.primary.main, 0.22)
                : alpha(theme.palette.primary.main, 0.08))
              : 'transparent',
          '&:hover': {
            bgcolor: (theme) =>
              isActive
                ? (theme.palette.mode === 'dark'
                  ? alpha(theme.palette.primary.main, 0.28)
                  : alpha(theme.palette.primary.main, 0.12))
                : theme.palette.action.hover,
          },
        }}
      >
        {icon && (
          <ListItemIcon sx={{ minWidth: 36 }}>
            {showBadge && collapsedFinal ? (
              <Badge
                variant="dot"
                color="error"
                sx={{
                  '& .MuiBadge-dot': {
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                  }
                }}
              >
                {icon}
              </Badge>
            ) : (
              icon
            )}
          </ListItemIcon>
        )}
        {text}
      </ListItemButton>
    </ListItem>
  );

  if (collapsedFinal) {
    return (
      <Tooltip title={label} placement="right">
        <Box>{button}</Box>
      </Tooltip>
    );
  }

  return button;
};

// Custom SKUD item with quick actions
const SidebarSkudItem: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const {
    currentShift,
    handleStartShift,
    handleEndShift,
    actionLoading,
    isIpCorrect
  } = useSkudActions();

  // If collapsed, show standard item with icon
  if (collapsed) {
    return <SidebarMenuItem to="/work-shifts" icon={<AccessTimeOutlined />} label="СКУД" collapsed={true} />;
  }

  // Expanded: No left icon, show Play/Stop buttons next to text
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleStartShift();
  };

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleEndShift();
  };

  const labelContent = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>СКУД</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, mr: -1 }}>
        {!currentShift ? (
          <IconButton
            size="small"
            onClick={handlePlay}
            disabled={actionLoading || !isIpCorrect}
            color="success"
            title={!isIpCorrect ? "Доступно только из офиса" : "Начать смену"}
            sx={{ p: 0.5 }}
          >
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        ) : (
          <IconButton
            size="small"
            onClick={handleStop}
            disabled={actionLoading}
            color="error"
            title="Завершить смену"
            sx={{ p: 0.5 }}
          >
            <StopIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );

  return <SidebarMenuItem to="/work-shifts" icon={<AccessTimeOutlined />} label={labelContent} collapsed={false} />;
};

// Bottom area (copyright / version)
const SidebarFooter: React.FC = () => {
  const { siderCollapsed } = useThemedLayoutContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isCollapsed = siderCollapsed && !isMobile; // Always expanded on mobile

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const handleLogoutClick = () => {
    setSettingsOpen(false); // Close settings if open (though they are different modals)
    setLogoutOpen(true);
  };

  const handleConfirmLogout = async () => {
    try {
      if (IS_DJANGO_BACKEND) {
        await djangoLogout();
      } else {
        await supabase.auth.signOut();
      }
      window.location.href = '/login';
    } catch (e) {
      console.error("Logout error:", e);
      window.location.href = '/login';
    }
  };

  return (
    <Box px={1} py={1.5}>
      <Stack
        direction={isCollapsed ? "column" : "row"}
        justifyContent={isCollapsed ? "center" : "space-between"}
        alignItems="center"
        spacing={1}
      >
        {isCollapsed ? (
          <Stack spacing={1} alignItems="center">
            <Tooltip title="Настройки" placement="right">
              <IconButton onClick={() => setSettingsOpen(true)} size="small">
                <SettingsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Выйти" placement="right">
              <IconButton onClick={handleLogoutClick} size="small" color="error">
                <LogoutOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              textAlign="center"
              sx={{ fontSize: '0.65rem' }}
            >
              v0.1
            </Typography>
          </Stack>
        ) : (
          <>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                MamaDoc v0.1.0
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                © {new Date().getFullYear()}
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Настройки" placement="top">
                <IconButton onClick={() => setSettingsOpen(true)} size="small">
                  <SettingsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Выйти" placement="top">
                <IconButton onClick={handleLogoutClick} size="small" color="error">
                  <LogoutOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </>
        )}
      </Stack>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Confirmation Dialog */}
      <Dialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
      >
        <DialogTitle id="logout-dialog-title">
          {"Выход из аккаунта"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="logout-dialog-description">
            Вы действительно хотите выйти из аккаунта?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutOpen(false)} color="inherit">
            Отмена
          </Button>
          <Button onClick={handleConfirmLogout} color="error" variant="contained" autoFocus>
            Выйти
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
