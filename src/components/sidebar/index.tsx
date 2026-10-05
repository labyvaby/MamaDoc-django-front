import React, { useEffect, useState } from "react";
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
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
import OrganizationBrand from "../brand/OrganizationBrand";
import { useAppVersion } from "../../api/appVersion";
import { fetchChatwootCounts } from "../../api/chatwoot";
import { useT } from "../../i18n/VerticalProvider";


import HomeOutlined from "@mui/icons-material/HomeOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import CurrencyExchangeOutlined from "@mui/icons-material/CurrencyExchangeOutlined";
import HomeWorkOutlined from "@mui/icons-material/HomeWorkOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
// import BlockOutlined from "@mui/icons-material/BlockOutlined";
import AnalyticsOutlined from "@mui/icons-material/AnalyticsOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import DonutSmallOutlined from "@mui/icons-material/DonutSmallOutlined";
import RequestQuoteOutlined from "@mui/icons-material/RequestQuoteOutlined";
import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import MenuOutlined from "@mui/icons-material/MenuOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import ReviewsOutlined from "@mui/icons-material/ReviewsOutlined";
import BookOnlineOutlined from "@mui/icons-material/BookOnlineOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import DrawOutlined from "@mui/icons-material/DrawOutlined";
import HandshakeOutlined from "@mui/icons-material/HandshakeOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";

import { useThemedLayoutContext } from "@refinedev/mui";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { logout as djangoLogout } from "../../api";
import { getTasksSummary } from "../../api/tasks";
import { getWaitlistSummary, WAITLIST_MODULE_ENABLED } from "../../api/waitlist";
import { DEALS_MODULE_ENABLED } from "../../api/deals";
import { getBookings } from "../../api/bookings";
import { getDraftCount } from "../../api/vaccinations";
import { useModuleGate } from "../../hooks/useModuleGate";
import { useEstateNav } from "../../hooks/useEstateNav";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { getRealtyTasks, realtyTaskKeys } from "../../api/realtyTasks";
import { getCashForecast, getDebtSummary, treasuryKeys } from "../../api/treasury";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_POLL_INTERVAL_MS,
} from "../../api/queryKeys";
import { Link as RouterLink, useLocation } from "react-router";
import { useMobileSidebar } from "./mobile-context";
import { ThemeCustomizerButton } from "../theme/ThemeCustomizer";
import { ActiveContextSwitcher } from "./ActiveContextSwitcher";
import { usePermissions } from "../../hooks/usePermissions";
import { useDjangoSkudActions } from "../../hooks/useDjangoSkud";
import { useCanChecker } from "../../hooks/useCan";
import { superSeesAllPages } from "../../config/moduleView";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useActiveScope } from "../../hooks/useActiveScope";
import {
  PAGE_PERMISSIONS,
  SETTINGS_TAB_PERMISSIONS,
} from "../../config/accessPermissions";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { AccountBalanceWalletOutlined } from "@mui/icons-material";
import WorkOutlineOutlined from "@mui/icons-material/WorkOutline";
import WarehouseOutlined from "@mui/icons-material/WarehouseOutlined";
import ManageAccountsOutlined from "@mui/icons-material/ManageAccountsOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import InsightsOutlined from "@mui/icons-material/InsightsOutlined";

type NavGroup = "all" | "my-work" | "org" | "storage" | "management";

// Сохраняет/восстанавливает позицию вертикального скролла контейнера навигации.
// Нужно на случай, если ThemedLayout всё-таки размонтирует сайдбар при смене
// маршрута: без этого новый DOM-узел встаёт на scrollTop=0 и пункт «уезжает»
// наверх. Ключ в sessionStorage — чтобы позиция жила в пределах сессии.
const SIDEBAR_SCROLL_KEY = "sidebar-scroll-top";

function useSidebarScrollMemory() {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
    if (saved > 0) el.scrollTop = saved;

    const onScroll = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return ref;
}

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
      <Divider sx={{ my: 0.5 }} />
      {
        <ActiveContextSwitcher
          onSwitched={() => {
            if (isMobile) setMobileOpen(false);
          }}
        />
      }
    </>
  );

  const nav = <SidebarNav />;

  const footer = (
    <>
      <Divider sx={{ my: 0.5 }} />
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

  const desktopScrollRef = useSidebarScrollMemory();
  const mobileScrollRef = useSidebarScrollMemory();

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
          <Box ref={desktopScrollRef} sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, msOverflowStyle: "none", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
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
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 300ms ease-in-out !important",
        }}
      >
        {/* Лого + divider — не скроллируются */}
        <Box sx={{ flexShrink: 0 }}>{stickyTop}</Box>
        {/* Список пунктов — скроллируется */}
        <Box ref={mobileScrollRef} sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, msOverflowStyle: "none", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          {children}
        </Box>
        {/* Футер — не скроллируется */}
        <Box sx={{ flexShrink: 0 }}>{footer}</Box>
      </Box>
    </>
  );
};

// Название контекста уже есть в ActiveContextSwitcher; здесь остаётся только знак.
const SidebarBrand: React.FC<{ height: number }> = ({ height }) => {
  return <OrganizationBrand height={height} />;
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
      <SidebarBrand height={36} />
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
        <SidebarBrand height={28} />
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
function useHasVisibleSettingsTab(): boolean {
  const { can } = useCanChecker();
  const { moduleGate } = useModuleGate();
  return Object.entries(SETTINGS_TAB_PERMISSIONS).some(([key, permission]) =>
    key === "cleaning" ? moduleGate("cleaning", [SETTINGS_TAB_PERMISSIONS.cleaning]) : can(permission),
  );
}

/**
 * Меню по вертикали — одно место вместо проверок «это застройщик?» в каждом
 * бейдже. У застройщика клиничное меню SidebarSecondary не монтируется вовсе,
 * а с ним и его запросы: лист ожидания, записи клиники, СКУД. Пока /auth/me/
 * не ответил и вертикаль неизвестна — нейтральная заглушка, а не клиничные
 * пункты («Процедурный кабинет» у застройщика на секунду при перезагрузке).
 * Тот же приём, что у отеля (Viva) в ветке test.
 */
const SidebarNav: React.FC = () => {
  const { activeOrganization, loading } = usePermissions();
  if (loading) return <SidebarMenuSkeleton />;
  if (activeOrganization?.vertical === "realestate") return <RealEstateSidebarMenu />;
  return <SidebarSecondary />;
};

const SidebarMenuSkeleton: React.FC = () => {
  const { siderCollapsed } = useThemedLayoutContext();
  return (
    <Stack gap={1} sx={{ px: 1.5, py: 1 }} aria-busy="true" aria-label="Меню загружается">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rounded" height={32} width={siderCollapsed ? 32 : "100%"} />
      ))}
    </Stack>
  );
};

/**
 * Застройщик: одно плоское меню без клиничных групп «Моя работа /
 * Организация» — отдел продаж работает в шахматке и задачах, а справочное
 * (сотрудники, настройки) — отдельной секцией «Компания». Каждый пункт —
 * своим правом или модулем: выключенный у организации модуль прячет пункт сам.
 *
 * Воронки (`/deals`), покупателей (`/patients`) и расходов (`/expenses`)
 * MamaDoc здесь нет (решение 06.10.2026): у застройщика лиды и деньги живут в
 * `/api/v2/realty` и `/api/v2/treasury`, и записи из экранов MamaDoc в AIVIO
 * не попали бы (гайды бэка frontend-sales/-finance). Права на них есть у
 * бухгалтера и управляющего — пункты были видны. «Задачи» и «Сотрудники»
 * MamaDoc оставлены, пока нет их экранов AIVIO (realty tasks, personnel).
 */
const RealEstateSidebarMenu: React.FC = () => {
  const { siderCollapsed } = useThemedLayoutContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { can } = useCanChecker();
  const { moduleGate } = useModuleGate();
  const canSettings = useHasVisibleSettingsTab();
  // Экраны AIVIO — ещё и по матрице ролей бэка: у юриста шахматки в меню нет, хотя realty.view есть.
  const estateNav = useEstateNav();
  const seen = (screen: string) => estateNav?.(screen) ?? true;

  const canDashboard = can(PAGE_PERMISSIONS.estateDashboard) && seen("dashboard");
  const canChessboard = moduleGate("realty") && seen("inventory");
  const canFunnel = can(PAGE_PERMISSIONS.realtySales) && seen("funnel");
  const canLeads = can(PAGE_PERMISSIONS.realtySales) && seen("leads");
  const canCalls = can(PAGE_PERMISSIONS.realtySales) && seen("calls");
  const canShows = can(PAGE_PERMISSIONS.realtySales) && seen("measurements");
  const canDeals = can(PAGE_PERMISSIONS.realtySales) && seen("estimates");
  const canCatalog = can(PAGE_PERMISSIONS.realtySales) && seen("objects");
  const canMortgage = can(PAGE_PERMISSIONS.realtySales) && seen("mortgage");
  // «Риелторы и партнёры» и «Маркетинг» в матрице есть только у руководителя (гайд §1) — по ссылке открываются всем с realty.view.
  const canPartners = can(PAGE_PERMISSIONS.realtySales) && seen("partners");
  const canMarketing = can(PAGE_PERMISSIONS.realtySales) && seen("marketing");
  const canMotivation = can(PAGE_PERMISSIONS.realtyMotivation) && seen("motivation");
  // «Мой день» — задачи CRM застройщика; внутренние заявки MamaDoc («Задачи»)
  // застройщику не нужны: его звонки и показы живут в /api/v2/realty/tasks/.
  const canToday = can(PAGE_PERMISSIONS.realtyToday) && seen("today");
  const canChats = can(PAGE_PERMISSIONS.chats);
  const canKnowledge = moduleGate("knowledge");
  const canEmployees = can(PAGE_PERMISSIONS.employees);
  const canBilling = can(PAGE_PERMISSIONS.billing) && seen("billing");
  // «Финансы» AIVIO (гайд frontend-finance §1): все четыре экрана — treasury.view, пункты — по матрице.
  const canFinance = can(PAGE_PERMISSIONS.realtyFinance);
  const canCashbank = canFinance && seen("cashbank");
  const canPaycal = canFinance && seen("paycal");
  const canBudget = canFinance && seen("budget");
  const canReceivables = canFinance && seen("receivables");
  const canSalesDocs = can(PAGE_PERMISSIONS.salesDocuments) && seen("documents");
  const canEdo = can(PAGE_PERMISSIONS.edo);
  const docsItems = canEdo
    ? ([
        ["edo", "/edo", "ЭДО", <DrawOutlined key="i" />],
        ["contracts", "/edo/contracts", "Договоры", <HandshakeOutlined key="i" />],
        ["templates", "/edo/templates", "Шаблоны", <ContentCopyOutlined key="i" />],
        ["archive", "/edo/archive", "Архив", <Inventory2Outlined key="i" />],
      ] as const).filter(([screen]) => seen(screen))
    : [];

  // Бейдж «Мой день» — открытые задачи CRM на сегодня, красный — если есть
  // просроченные. Ключ тот же, что у экрана без фильтров: кэш общий.
  const realtyScope = useRealtyScope();
  const todayParams = React.useMemo(() => ({ date: dayjs().format("YYYY-MM-DD"), managerId: null }), []);
  const todayTasks = useQuery({
    queryKey: realtyTaskKeys.list(realtyScope, todayParams),
    queryFn: ({ signal }) => getRealtyTasks(todayParams, realtyScope, signal),
    enabled: canToday && realtyScope.orgReady !== false,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  }).data;
  const tasksBadgeCount = todayTasks?.filter((task) => !task.done).length ?? 0;
  // «!» у календаря — кассовый разрыв в ближайшие 30 дней; у долгов — просроченная кредиторка (гайд §3, §5).
  const gap = useQuery({
    queryKey: treasuryKeys.forecast(realtyScope, 30, false),
    queryFn: ({ signal }) => getCashForecast(30, realtyScope, signal, false),
    enabled: canPaycal && realtyScope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  }).data?.hasGap;
  const payableOverdue = useQuery({
    queryKey: treasuryKeys.debtSummary(realtyScope, "payable"),
    queryFn: ({ signal }) => getDebtSummary("payable", realtyScope, signal),
    enabled: canReceivables && realtyScope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  }).data?.overdueCount;
  const tasksBadgeColor: "error" | "primary" = todayTasks?.some((task) => task.overdue && !task.done) ? "error" : "primary";

  const sectionLabel = (text: string) =>
    siderCollapsed && !isMobile ? (
      <Box sx={{ mx: 1.5, my: 1, borderTop: 1, borderColor: "divider" }} />
    ) : (
      <Typography
        sx={{ px: 2, pt: 2, pb: 0.75, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
      >
        {text}
      </Typography>
    );

  return (
    <List sx={{ py: 0, mt: 0.5 }}>
      {canDashboard && <SidebarMenuItem to="/realestate/dashboard" icon={<InsightsOutlined />} label="Рабочий стол" collapsed={siderCollapsed} />}
      {canToday && (
        <SidebarMenuItem to="/realestate/today" icon={<AssignmentOutlined />} label="Мой день" collapsed={siderCollapsed} badgeCount={tasksBadgeCount} badgeColor={tasksBadgeColor} />
      )}
      {canChats && <SidebarMenuItem to="/chats" icon={<ForumOutlined />} label="Чаты" collapsed={siderCollapsed} />}
      {canKnowledge && <SidebarMenuItem to="/knowledge" icon={<MenuBookOutlined />} label="База знаний" collapsed={siderCollapsed} />}

      {(canFunnel || canLeads || canCalls || canShows || canChessboard || canDeals || canCatalog || canMortgage || canPartners || canMarketing) && sectionLabel("Продажи")}
      {canFunnel && <SidebarMenuItem to="/realestate/funnel" icon={<FilterAltOutlined />} label="CRM · воронка" collapsed={siderCollapsed} />}
      {canLeads && <SidebarMenuItem to="/realestate/leads" icon={<SearchOutlined />} label="Лиды и клиенты" collapsed={siderCollapsed} />}
      {canCalls && <SidebarMenuItem to="/realestate/calls" icon={<PhoneInTalkOutlined />} label="Звонки и записи" collapsed={siderCollapsed} />}
      {canShows && <SidebarMenuItem to="/realestate/shows" icon={<PlaceOutlined />} label="Показы" collapsed={siderCollapsed} />}
      {canChessboard && <SidebarMenuItem to="/realestate/chessboard" icon={<ApartmentOutlined />} label="Квартиры / шахматка" collapsed={siderCollapsed} />}
      {canDeals && <SidebarMenuItem to="/realestate/deals" icon={<CurrencyExchangeOutlined />} label="Брони и оплаты" collapsed={siderCollapsed} />}
      {canCatalog && <SidebarMenuItem to="/realestate/catalog" icon={<HomeWorkOutlined />} label="Каталог объектов" collapsed={siderCollapsed} />}
      {canMortgage && <SidebarMenuItem to="/realestate/mortgage" icon={<AccountBalanceOutlined />} label="Ипотека и банки" collapsed={siderCollapsed} />}
      {canPartners && <SidebarMenuItem to="/realestate/partners" icon={<HandshakeOutlined />} label="Риелторы и партнёры" collapsed={siderCollapsed} />}
      {canMarketing && <SidebarMenuItem to="/realestate/marketing" icon={<CampaignOutlined />} label="Маркетинг и ROI" collapsed={siderCollapsed} />}

      {(docsItems.length > 0 || canSalesDocs) && sectionLabel("Документы")}
      {docsItems.map(([screen, to, label, icon]) => (
        <SidebarMenuItem
          key={screen}
          to={to}
          icon={icon}
          label={label}
          collapsed={siderCollapsed}
          // /edo — префикс остальных разделов: «ЭДО» не подсвечиваем на договорах, шаблонах и архиве.
          excludePaths={screen === "edo" ? ["/edo/contracts", "/edo/templates", "/edo/archive"] : undefined}
        />
      ))}
      {canSalesDocs && <SidebarMenuItem to="/realestate/documents" icon={<FolderOutlined />} label="Документы CRM" collapsed={siderCollapsed} />}

      {(canCashbank || canPaycal || canBudget || canReceivables || canBilling) && sectionLabel("Финансы")}
      {canCashbank && <SidebarMenuItem to="/finance/cashbank" icon={<PaymentsOutlined />} label="Касса и банк" collapsed={siderCollapsed} />}
      {canPaycal && <SidebarMenuItem to="/finance/paycal" icon={<CalendarMonthOutlined />} label="Платёжный календарь" collapsed={siderCollapsed} badgeText={gap ? "!" : undefined} badgeColor="error" />}
      {canBudget && <SidebarMenuItem to="/finance/budget" icon={<DonutSmallOutlined />} label="Бюджеты проектов" collapsed={siderCollapsed} />}
      {canReceivables && (
        <SidebarMenuItem to="/finance/receivables" icon={<RequestQuoteOutlined />} label="Дебиторка / кредиторка" collapsed={siderCollapsed} badgeCount={payableOverdue ?? 0} badgeColor="warning" />
      )}
      {canBilling && <SidebarMenuItem to="/finance/billing" icon={<AccountBalanceWalletOutlined />} label="Биллинг" collapsed={siderCollapsed} />}

      {(canEmployees || canMotivation) && sectionLabel("Персонал")}
      {canEmployees && <SidebarMenuItem to="/employees" icon={<BadgeOutlined />} label="Сотрудники" collapsed={siderCollapsed} />}
      {canMotivation && <SidebarMenuItem to="/realestate/motivation" icon={<EmojiEventsOutlined />} label="Планы и мотивация" collapsed={siderCollapsed} />}

      {canSettings && sectionLabel("Компания")}
      {canSettings && (
        <SidebarMenuItem to="/settings" icon={<TuneOutlined />} label="Настройки" collapsed={siderCollapsed} excludePaths={["/settings/notifications"]} />
      )}
    </List>
  );
};

const SidebarSecondary: React.FC = () => {
  const { t } = useT("sidebar");
  const { siderCollapsed } = useThemedLayoutContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const {
    isSuperAdmin,
    activeEmployee,
    activeBranch,
    activeOrganization,
    loading: permissionsLoading,
    isPlatformAdmin,
    viewAsOrganization,
  } = usePermissions();
  const { can } = useCanChecker();
  const { moduleGate } = useModuleGate();
  const hasVisibleSettingsTab = useHasVisibleSettingsTab();
  const orgId = useApiOrgId();
  const activeBranchId = useActiveScope().branchId;
  const isSuper = isSuperAdmin();
  // Обход «isSuper ||» у пунктов ниже; в «Меню как у клиники» выключен.
  const superSeesAll = superSeesAllPages(isSuper, Boolean(isPlatformAdmin), Boolean(viewAsOrganization));
  const isRetail = activeOrganization?.vertical === "retail";
  const [activeGroup, setActiveGroup] = useState<NavGroup>(() => {
    const saved = sessionStorage.getItem("sidebar-group");
    return (saved as NavGroup) ?? "my-work";
  });

  const handleGroupChange = (group: NavGroup) => {
    setActiveGroup(group);
    sessionStorage.setItem("sidebar-group", group);
  };

  const show = (group: NavGroup) => activeGroup === "all" || activeGroup === group;

  // ── Видимость каждого пункта меню (единый источник истины) ──────────────────
  // Эти же флаги используются и для условий рендера пунктов ниже, и для расчёта
  // видимости вкладки группы (groupVisible). Так вкладка скрывается, когда у
  // сотрудника нет доступа НИ К ОДНОЙ странице раздела.
  // Группировка пунктов — пожелание заказчика 14.07.2026: «Моя работа» —
  // всё ежедневное (брони, задачи, расходы, база знаний, достижения),
  // «Организация» — справочное (пациенты, приёмы, услуги, документы).
  const can_ = {
    // МОЯ РАБОТА
    // Три рабочих пространства приёмов гейтятся отдельными page-visibility
    // правами (appointments.*_room/registry.view): организация сама решает в
    // редакторе ролей, кому какой кабинет показывать. Данные внутри страниц
    // по-прежнему требуют appointments.view.
    registratura: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.appointmentsRegistry)),
    bookings: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.bookings)),
    chats: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.chats)),
    doctorRoom: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.doctorRoom)),
    nurseRoom: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.nurseRoom)),
    // Клинический раздел: ретейлу приём анализов не нужен, поэтому под тем
    // же !isRetail, что и остальные медицинские пункты. Отдельной проверки
    // модуля не нужно — `can` уже сверяется с картой префикс→модуль.
    lab: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.lab)),
    schedule: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.schedule)),
    skud: superSeesAll || can(PAGE_PERMISSIONS.attendance),
    cleaning: moduleGate("cleaning"),
    tasks: can(PAGE_PERMISSIONS.tasks),
    // Лист ожидания и воронка ждут бэкенда на проде — гейт по правам их не
    // прикрывает: роль superadmin проходит любую проверку прав.
    waitlist: WAITLIST_MODULE_ENABLED && can(PAGE_PERMISSIONS.waitlist),
    deals: DEALS_MODULE_ENABLED && can(PAGE_PERMISSIONS.deals),
    expenses: can(PAGE_PERMISSIONS.expenses),
    knowledge: moduleGate("knowledge"),
    realestate: moduleGate("realty"),
    achievements: can(PAGE_PERMISSIONS.achievements),
    // ОРГАНИЗАЦИЯ
    employees: can(PAGE_PERMISSIONS.employees),
    patients: !isRetail && can(PAGE_PERMISSIONS.patients),
    clients: can(PAGE_PERMISSIONS.clients),
    vaccinations: !isRetail && can(PAGE_PERMISSIONS.vaccinations),
    // Исторические реестры — по page-visibility праву, как Регистратура;
    // по умолчанию право ни у кого, поэтому без явной выдачи видит только суперадмин.
    allAppointments: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.allAppointments)),
    allProcedures: !isRetail && (superSeesAll || can(PAGE_PERMISSIONS.allProcedures)),
    services: !isRetail && can(PAGE_PERMISSIONS.services),
    documents: moduleGate("documents"),
    // СКЛАДЫ
    pos: can(PAGE_PERMISSIONS.pos),
    products: can(PAGE_PERMISSIONS.products),
    // Для retail источником продаж является касса POS; старая страница
    // warehouse/sales относится к медицинскому режиму и дублирует кассу.
    sales: !isRetail && can(PAGE_PERMISSIONS.sales),
    storage: can(PAGE_PERMISSIONS.warehouses),
    inventory: can(PAGE_PERMISSIONS.warehouses),
    // Накладные (закупки): page-visibility право; модуль procurement гейтится
    // внутри can() по префиксу кода — выключенный модуль прячет пункт сам.
    procurement: can(PAGE_PERMISSIONS.procurementInvoices),
    // УПРАВЛЕНИЕ
    // payroll.view открывает общий отчёт; payroll.view_own + активная карточка
    // сотрудника — тот же экран в персональном режиме (только свои цифры).
    salaryReports: can("payroll.view") || (can("payroll.view_own") && activeEmployee != null),
    // В Django-режиме гейтим правом, а не ролью: роль-гейт скрывал «Отчеты»
    // у всех, кому reports.view выдан (владелец, бухгалтер, главврач,
    // управляющий филиалом). Тот же принцип, что у соседнего пункта load.
    reports: can(PAGE_PERMISSIONS.reports),
    cashbox: can(PAGE_PERMISSIONS.cashbox),
    load: !isRetail && can(PAGE_PERMISSIONS.reports),
    notifications: can(PAGE_PERMISSIONS.notifications),
    settings: hasVisibleSettingsTab,
  };

  // Бейдж «Задачи»: счётчик + срочность цветом.
  // Тот же queryKey, что у сводки на доске задач, — кэш общий.
  const tasksSummaryQuery = useQuery({
    queryKey: djangoQueryKeys.tasks.summary(orgId),
    queryFn: ({ signal }) => getTasksSummary(orgId, signal),
    enabled: can_.tasks && !permissionsLoading,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    // Бейдж живёт в сайдбаре на всех страницах, а задачи закрывают несколько
    // человек параллельно: без поллинга и рефетча по возврату на вкладку цифра
    // «замерзала» до перезагрузки страницы, когда изменение пришло не из этой
    // сессии (коллега закрыл задачу, поллер бэка создал повторяющуюся).
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  // Число в бейдже: все открытые задачи филиала (new + inProgress +
  // awaitingApproval — done/cancelled сюда не входят). Если среди них есть
  // просроченные — красим бейдж красным (срочность), иначе нейтральный
  // брендовый акцент. Считаем именно все открытые, а не «новые для меня»: у
  // суперадмина/управленца нет группы категории, поэтому newForMe у него всегда
  // 0 и бейдж иначе не загорался бы, хотя активные задачи в филиале есть.
  const tasksSummary = tasksSummaryQuery.data;
  const tasksOverdue = tasksSummary?.overdue ?? 0;
  const tasksBadgeCount =
    (tasksSummary?.new ?? 0) +
    (tasksSummary?.inProgress ?? 0) +
    (tasksSummary?.awaitingApproval ?? 0);
  const tasksBadgeColor: "error" | "primary" = tasksOverdue > 0 ? "error" : "primary";

  // Бейдж «Лист ожидания»: сколько человек стоит в очереди (waiting). Красный —
  // когда среди них есть срочные: такой очередью надо заняться сегодня.
  const waitlistSummaryQuery = useQuery({
    queryKey: djangoQueryKeys.waitlist.summary(orgId, activeBranchId),
    queryFn: ({ signal }) => getWaitlistSummary(orgId, activeBranchId, signal),
    enabled: can_.waitlist && !permissionsLoading,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const waitlistBadgeCount = waitlistSummaryQuery.data?.waiting ?? 0;

  // Бейдж «Вакцины»: проданные в приёмах, но не оформленные прививки — без
  // оформления они не попадают ни в карту, ни в отчётность.
  const canRecordVaccination = can("vaccinations.record");
  const vaccinationDraftsQuery = useQuery({
    queryKey: djangoQueryKeys.vaccinations.draftCount({ branchId: activeBranchId ?? null, orgId }),
    queryFn: ({ signal }) => getDraftCount(activeBranchId ?? null, orgId, signal),
    enabled: can_.vaccinations && canRecordVaccination && !permissionsLoading,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
  const vaccinationDraftsCount = vaccinationDraftsQuery.data ?? 0;
  const waitlistBadgeColor: "error" | "primary" =
    (waitlistSummaryQuery.data?.urgent ?? 0) > 0 ? "error" : "primary";

  // Бейдж «Брони»: заявки, ждущие подтверждения персоналом (status=pending) —
  // и с гостевой формы /book, и из синка operator.kg. Отдельного счётчика на
  // бэке нет, но `count` из DRF-пагинации даёт его без выгрузки строк
  // (pageSize:1). Диапазон дат в getBookings обязателен, поэтому окно задаём
  // сами: месяц назад — 90 дней вперёд. Прошедшие даты включены осознанно:
  // pending на вчера — это «висяк», по которому никто не связался с пациентом,
  // и терять его из вида нельзя (он же красит бейдж, как просрочка у задач).
  // Окно считается раз за монтирование — после полуночи сдвинется на F5.
  const bookingsWindow = React.useMemo(() => {
    const today = dayjs();
    return {
      pastFrom: today.subtract(30, "day").format("YYYY-MM-DD"),
      yesterday: today.subtract(1, "day").format("YYYY-MM-DD"),
      today: today.format("YYYY-MM-DD"),
      futureTo: today.add(90, "day").format("YYYY-MM-DD"),
    };
  }, []);
  // Суперадмин без выбранной организации: запрос без organizationId уходить не
  // должен — орг-скоупные эндпоинты отвечают на него 400 (та же причина, что
  // enabled/needsOrg на самой странице «Брони»).
  const bookingsBadgeEnabled =
    can_.bookings && !permissionsLoading && (!isSuper || orgId != null);
  // Филиал в бейдже обязателен: бэк скоупит брони только по явному `branchId`
  // (без параметра отдаёт всю организацию), поэтому иначе бейдж показывал бы
  // одно и то же число во всех филиалах — не то, что человек увидит в списке.
  const badgeBranchId = activeBranch?.id ?? undefined;
  // Два count-запроса вместо выгрузки строк: всего pending в окне и сколько из
  // них на прошедшие даты (только они решают цвет).
  const bookingsPendingQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({
      badge: "pending-total",
      orgId: orgId ?? null,
      branch: badgeBranchId ?? null,
      from: bookingsWindow.pastFrom,
      to: bookingsWindow.futureTo,
    }),
    queryFn: ({ signal }) =>
      getBookings(
        {
          dateFrom: bookingsWindow.pastFrom,
          dateTo: bookingsWindow.futureTo,
          status: "pending",
          organizationId: orgId,
          branchId: badgeBranchId,
          page: 1,
          pageSize: 1,
        },
        signal,
      ),
    enabled: bookingsBadgeEnabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    // Заявки приходят извне (гостевая форма /book, синк operator.kg) — без
    // поллинга регистратура узнала бы о новой заявке только после F5.
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const bookingsOverdueQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({
      badge: "pending-overdue",
      orgId: orgId ?? null,
      branch: badgeBranchId ?? null,
      from: bookingsWindow.pastFrom,
      to: bookingsWindow.yesterday,
    }),
    queryFn: ({ signal }) =>
      getBookings(
        {
          dateFrom: bookingsWindow.pastFrom,
          dateTo: bookingsWindow.yesterday,
          status: "pending",
          organizationId: orgId,
          branchId: badgeBranchId,
          page: 1,
          pageSize: 1,
        },
        signal,
      ),
    enabled: bookingsBadgeEnabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  // Чаты: бейдж — открытые диалоги, которые сотрудник реально видит.
  // Запрос включён только при праве на раздел; 403 (нет связи с Чат-центром)
  // и 404 (интеграция выключена) — не ошибка, а «бейджа нет», поэтому retry
  // выключен и ошибка молча превращается в ноль.
  const chatsCountsQuery = useQuery({
    queryKey: ["chatwoot", "counts"],
    queryFn: fetchChatwootCounts,
    enabled: can_.chats,
    retry: false,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const chatsCounts = chatsCountsQuery.data;
  const chatsBadgeCount = chatsCounts
    ? chatsCounts.mine + chatsCounts.unassigned
    : 0;
  // Свои диалоги — личный долг, поэтому краснее; ничьи сами по себе спокойнее.
  const chatsBadgeColor: "error" | "primary" =
    (chatsCounts?.mine ?? 0) > 0 ? "error" : "primary";

  // «Сводка»: срочное из блока «Требует внимания» — просроченные задачи и
  // заявки без ответа с прошедшей датой. Оба счётчика сайдбар уже опрашивает
  // для своих пунктов, поэтому бейдж не стоит ни одного нового запроса. Минус
  // в кассе сюда не входит: ради него пришлось бы опрашивать кассу со всех
  // страниц приложения.
  const dashboardUrgentCount = tasksOverdue + (bookingsOverdueQuery.data?.count ?? 0);

  const bookingsBadgeCount = bookingsPendingQuery.data?.count ?? 0;
  const bookingsBadgeColor: "error" | "primary" =
    (bookingsOverdueQuery.data?.count ?? 0) > 0 ? "error" : "primary";

  // Группа видна, если в ней есть хотя бы один доступный пункт.
  const groupVisible: Record<Exclude<NavGroup, "all">, boolean> = {
    "my-work": can_.registratura || can_.bookings || can_.waitlist || can_.doctorRoom || can_.nurseRoom || can_.lab || can_.schedule || can_.skud || can_.cleaning || can_.tasks || can_.deals || can_.realestate || can_.expenses || can_.knowledge || can_.achievements || can_.pos,
    "org": can_.employees || can_.patients || can_.allAppointments || can_.allProcedures || can_.services || can_.documents,
    "storage": can_.products || can_.vaccinations || can_.sales || can_.storage || can_.procurement,
    "management": can_.salaryReports || can_.reports || can_.cashbox || can_.load || can_.notifications || can_.settings,
  };

  // Если активная группа стала недоступной — сбросить на "all"
  React.useEffect(() => {
    if (activeGroup !== "all" && !groupVisible[activeGroup as Exclude<NavGroup, "all">]) {
      handleGroupChange("all");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, groupVisible["my-work"], groupVisible.org, groupVisible.storage, groupVisible.management]);

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
        <Box sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
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
              mb: 0.75,
              py: 0.75,
              px: 2,
              border: "1px solid",
              borderRadius: 1,
              cursor: "pointer",
              transition: "all 150ms",
              borderColor: activeGroup === "all" ? "primary.main" : "divider",
              bgcolor: activeGroup === "all" ? (t) => alpha(t.palette.primary.main, 0.1) : "transparent",
              color: activeGroup === "all" ? "primary.onSurface" : "text.secondary",
              "&:hover": { borderColor: "primary.main", color: "primary.onSurface" },
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
                  gap: 0.5,
                  py: 1,
                  px: 1,
                  border: "1px solid",
                  borderRadius: 1,
                  cursor: "pointer",
                  transition: "all 150ms",
                  borderColor: activeGroup === id ? "primary.main" : "divider",
                  bgcolor: activeGroup === id ? (t) => alpha(t.palette.primary.main, 0.1) : "transparent",
                  color: activeGroup === id ? "primary.onSurface" : "text.secondary",
                  "&:hover": { borderColor: "primary.main", color: "primary.onSurface" },
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
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

        {/* Сводка доступна суперадминистратору только при включённом модуле
            reports. Роут дополнительно закрыт RequirePermission в App.tsx. */}
        {show("my-work") && isSuper && can_.reports && (
          <SidebarMenuItem
            to="/dashboard"
            icon={<InsightsOutlined />}
            label="Сводка"
            collapsed={siderCollapsed}
            badgeCount={dashboardUrgentCount}
            badgeColor="error"
          />
        )}

        {/* Регистратура — в Django-mode ведёт на /appointments */}
        {show("my-work") && can_.registratura && (
          <SidebarMenuItem
            to="/appointments"
            icon={<HomeOutlined />}
            label="Регистратура"
            collapsed={siderCollapsed}
          />
        )}

        {/* Брони (гостевая форма /book + синк operator.kg, Django-mode only).
            Бейдж — сколько заявок ждёт подтверждения. */}
        {show("my-work") && can_.bookings && (
          <SidebarMenuItem to="/bookings" icon={<BookOnlineOutlined />} label="Онлайн-запись" collapsed={siderCollapsed} badgeCount={bookingsBadgeCount} badgeColor={bookingsBadgeColor} />
        )}

        {/* Чаты — встроенный дашборд Chatwoot (chat.operator.kg) со сквозной
            авторизацией. Пункт виден по праву chatwoot.view; сотрудник без
            учётки в Chatwoot увидит на странице заглушку «запросите доступ». */}
        {show("my-work") && can_.chats && (
          <SidebarMenuItem to="/chats" icon={<ForumOutlined />} label="Чаты" collapsed={siderCollapsed} badgeCount={chatsBadgeCount} badgeColor={chatsBadgeColor} />
        )}

        {/* Лист ожидания: кому не хватило свободного окна.
            Бейдж — сколько человек сейчас в очереди. */}
        {show("my-work") && can_.waitlist && (
          <SidebarMenuItem
            to="/waitlist"
            icon={<HourglassEmptyOutlined />}
            label="Лист ожидания"
            collapsed={siderCollapsed}
            badgeCount={waitlistBadgeCount}
            badgeColor={waitlistBadgeColor}
          />
        )}

        {/* Воронка продаж: обращения от первого звонка до оплаты.
            Пункт виден по deals.list — права появляются вместе с модулем. */}
        {show("my-work") && can_.deals && (
          <SidebarMenuItem
            to="/deals"
            icon={<FilterAltOutlined />}
            label="Воронка продаж"
            collapsed={siderCollapsed}
          />
        )}

        {/* Квартиры и шахматка застройщика (модуль бэка realty) */}
        {show("my-work") && can_.realestate && (
          <SidebarMenuItem to="/realestate/chessboard" icon={<ApartmentOutlined />} label="Квартиры / шахматка" collapsed={siderCollapsed} />
        )}

        {/* Кабинет врача */}
        {show("my-work") && can_.doctorRoom && (
          <SidebarMenuItem to="/doctor" icon={<LocalHospitalOutlined />} label={t("doctorRoom")} collapsed={siderCollapsed} />
        )}

        {/* Процедурный кабинет */}
        {show("my-work") && can_.nurseRoom && (
          <SidebarMenuItem to="/nurse" icon={<MedicalServicesOutlined />} label="Процедурный кабинет" collapsed={siderCollapsed} />
        )}

        {/* Лаборатория */}
        {show("my-work") && can_.lab && (
          <SidebarMenuItem to="/lab" icon={<ScienceOutlined />} label="Лаборатория" collapsed={siderCollapsed} />
        )}

        {/* Расписание */}
        {show("my-work") && can_.schedule && (
          <SidebarMenuItem to="/schedule" icon={<CalendarMonthOutlined />} label="Расписание" collapsed={siderCollapsed} />
        )}

        {/* СКУД */}
        {show("my-work") && can_.skud && (
          <SidebarSkudItem collapsed={siderCollapsed} />
        )}

        {/* Уборка (Django-mode only, пока на моках) */}
        {show("my-work") && can_.cleaning && (
          <SidebarMenuItem to="/cleaning" icon={<CleaningServicesOutlined />} label="Уборка" collapsed={siderCollapsed} />
        )}

        {/* Задачи */}
        {show("my-work") && can_.tasks && (
          <SidebarMenuItem
            to="/tasks"
            icon={<AssignmentOutlined />}
            label="Задачи"
            collapsed={siderCollapsed}
            badgeCount={tasksBadgeCount}
            badgeColor={tasksBadgeColor}
          />
        )}

        {/* Расходы */}
        {show("my-work") && can_.expenses && (
          <SidebarMenuItem
            to="/expenses"
            icon={<PaymentsOutlined />}
            label="Расходы"
            collapsed={siderCollapsed}
          />
        )}

        {/* База знаний (Django-mode only, пока на моках) */}
        {show("my-work") && can_.knowledge && (
          <SidebarMenuItem to="/knowledge" icon={<MenuBookOutlined />} label="База знаний" collapsed={siderCollapsed} />
        )}

        {/* Достижения (Django-mode only) */}
        {show("my-work") && can_.achievements && (
          <SidebarMenuItem to="/achievements" icon={<EmojiEventsOutlined />} label="Мои достижения" collapsed={siderCollapsed} />
        )}

        {/* Касса магазина — рабочий инструмент продаж, в разделе «Моя работа» */}
        {show("my-work") && can_.pos && (
          <>
            <SidebarMenuItem to="/pos" icon={<PointOfSaleOutlined />} label="Касса магазина" collapsed={siderCollapsed} excludePaths={["/pos/history"]} />
            <SidebarMenuItem to="/pos/history" icon={<HistoryOutlined />} label="История продаж" collapsed={siderCollapsed} />
          </>
        )}

        {/* ══════════════════════════════════════════
            ОРГАНИЗАЦИЯ
            ══════════════════════════════════════════ */}

        {/* Сотрудники */}
        {show("org") && can_.employees && (
          <SidebarMenuItem to="/employees" icon={<BadgeOutlined />} label="Сотрудники" collapsed={siderCollapsed} />
        )}

        {/* Все пациенты */}
        {show("org") && can_.patients && (
          <SidebarMenuItem
            to="/patients"
            icon={<SearchOutlined />}
            label={t("allPatients")}
            collapsed={siderCollapsed}
          />
        )}

        {/* Все клиенты retail-организации */}
        {show("org") && can_.clients && (
          <SidebarMenuItem
            to="/clients"
            icon={<SearchOutlined />}
            label="Клиенты"
            collapsed={siderCollapsed}
          />
        )}

        {/* Все приемы */}
        {show("org") && can_.allAppointments && (
          <SidebarMenuItem to="/all-appointments" icon={<HistoryOutlined />} label={t("allAppointments")} collapsed={siderCollapsed} />
        )}

        {/* Все процедуры */}
        {show("org") && can_.allProcedures && (
          <SidebarMenuItem to="/all-procedures" icon={<MedicalServicesOutlined />} label="Все процедуры" collapsed={siderCollapsed} />
        )}

        {/* Услуги */}
        {show("org") && can_.services && (
          <SidebarMenuItem to="/services" icon={<MedicalServicesOutlined />} label="Услуги" collapsed={siderCollapsed} />
        )}

        {/* Документы организации (Django-mode only, пока на моках) */}
        {show("org") && can_.documents && (
          <SidebarMenuItem to="/documents" icon={<FolderOutlined />} label="Документы" collapsed={siderCollapsed} />
        )}

        {/* ══════════════════════════════════════════
            СКЛАДЫ
            ══════════════════════════════════════════ */}

        {show("storage") && can_.products && (
          <SidebarMenuItem to="/products" icon={<Inventory2Outlined />} label="Товары" collapsed={siderCollapsed} />
        )}

        {/* Вакцины (карточки вакцин — товары склада с меткой «вакцина») */}
        {show("storage") && can_.vaccinations && (
          <SidebarMenuItem to="/vaccinations" icon={<VaccinesOutlined />} label="Вакцины" collapsed={siderCollapsed} badgeCount={vaccinationDraftsCount} badgeColor="primary" />
        )}

        {/* Продажи товаров */}
        {show("storage") && can_.sales && (
          <SidebarMenuItem to="/sales" icon={<AnalyticsOutlined />} label="Продажи товаров" collapsed={siderCollapsed} />
        )}

        {/* Остатки (объединённые «Движение товара» + «Склад») */}
        {show("storage") && can_.storage && (
          <SidebarMenuItem to="/warehouses" icon={<Inventory2Outlined />} label="Остатки" collapsed={siderCollapsed} />
        )}

        {/* Инвентаризация по штрихкодам */}
        {show("storage") && can_.inventory && (
          <SidebarMenuItem to="/inventory" icon={<FactCheckOutlined />} label="Инвентаризация" collapsed={siderCollapsed} />
        )}

        {/* Накладные: приход от поставщиков, возвраты, оплаты, поставщики */}
        {show("storage") && can_.procurement && (
          <SidebarMenuItem to="/invoices" icon={<ReceiptLongOutlined />} label="Накладные" collapsed={siderCollapsed} />
        )}

        {/* ══════════════════════════════════════════
            УПРАВЛЕНИЕ
            ══════════════════════════════════════════ */}

        {/* Отчет по ЗП */}
        {show("management") && can_.salaryReports && (
          <SidebarMenuItem to="/salary-reports" icon={<AccountBalanceWalletOutlined />} label="Отчет по ЗП" collapsed={siderCollapsed} />
        )}

        {/* Отчеты */}
        {show("management") && can_.reports && (
          <SidebarMenuItem to="/reports" icon={<AssessmentOutlined />} label="Отчеты" collapsed={siderCollapsed} />
        )}

        {/* Отзывы (Django-mode only) */}
        {show("management") && !isRetail && can(PAGE_PERMISSIONS.reviews) && (
          <SidebarMenuItem to="/reviews" icon={<ReviewsOutlined />} label="Отзывы" collapsed={siderCollapsed} />
        )}

        {/* Касса */}
        {show("management") && can_.cashbox && (
          <SidebarMenuItem to="/cashbox" icon={<AccountBalanceWalletOutlined />} label="Касса / финансы" collapsed={siderCollapsed} />
        )}

        {/* Нагрузка */}
        {show("management") && can_.load && (
          <SidebarMenuItem to="/load" icon={<AnalyticsOutlined />} label="Нагрузка" collapsed={siderCollapsed} />
        )}

        {/* Уведомления */}
        {show("management") && can_.notifications && (
          <SidebarMenuItem to="/settings/notifications" icon={<NotificationsOutlined />} label="Уведомления" collapsed={siderCollapsed} />
        )}

        {/* Настройки (Django-mode only) */}
        {show("management") && can_.settings && (
          <SidebarMenuItem
            to="/settings"
            icon={<TuneOutlined />}
            label="Настройки"
            collapsed={siderCollapsed}
            excludePaths={
              ["/settings/notifications"]
            }
          />
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
  /** Число в бейдже пункта. 0/undefined — бейдж не показывается. */
  badgeCount?: number;
  /** Цвет бейджа: срочность (error — просрочено, primary — новые). */
  badgeColor?: "error" | "primary" | "warning";
  /** Знак вместо числа («!» — кассовый разрыв); показывается и без badgeCount. */
  badgeText?: string;
  /**
   * Child paths that belong to a *different* menu item and must not light
   * this one up. Used by a parent route (e.g. "/settings") so it stays
   * inactive on sub-pages that have their own sidebar entry
   * (e.g. "/settings/notifications").
   */
  excludePaths?: string[];
};

const SidebarMenuItem: React.FC<SidebarMenuItemProps> = ({
  to,
  icon,
  label,
  selected,
  collapsed,
  badgeCount = 0,
  badgeColor = "error",
  badgeText,
  excludePaths,
}) => {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const collapsedFinal = (collapsed ?? false) && !isMobile;
  const hasBadge = badgeCount > 0 || Boolean(badgeText);
  const badgeLabel = badgeText ?? (badgeCount > 99 ? "99+" : String(badgeCount));
  const matchesSelf =
    location.pathname === to || location.pathname.startsWith(to + "/");
  const matchesExcluded = (excludePaths ?? []).some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
  );
  const isActive = selected ?? (matchesSelf && !matchesExcluded);

  const text = (
    <Box
      sx={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        opacity: collapsedFinal ? 0 : 1,
        width: collapsedFinal ? 0 : "auto",
        flexGrow: collapsedFinal ? 0 : 1,
        minWidth: 0,
        transition: (theme) => theme.transitions.create(["opacity", "width", "margin"], { duration: 200 }),
        ml: collapsedFinal ? 0 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      {/* Длинная подпись с бейджем («Дебиторка / кредиторка») — многоточие, полный текст в title. */}
      <ListItemText
        primary={label}
        primaryTypographyProps={{ noWrap: true, title: typeof label === "string" ? label : undefined }}
        sx={{ my: 0, minWidth: 0 }}
      />
      {/* Standalone Badge позиционируется absolute (translate 50%) и вылезает за
          границы — его срезал бы overflow:hidden. Поэтому в развёрнутом сайдбаре
          рисуем счётчик обычной пилюлей в потоке; цвет = срочность. */}
      {hasBadge && !collapsedFinal && (
        <Box
          sx={{
            ml: 'auto',
            minWidth: 18,
            height: 18,
            px: 0.5,
            borderRadius: '9px',
            bgcolor: `${badgeColor}.main`,
            color: `${badgeColor}.contrastText`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            fontWeight: 700,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {badgeLabel}
        </Box>
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
          borderRadius: "10px",
          my: theme.appLayout.sidebar.itemGap,
          py: theme.appLayout.sidebar.itemPaddingY,
          px: 1.4,
          color: (theme) => (isActive ? theme.palette.primary.onSurface : undefined),
          '& .MuiListItemIcon-root': {
            color: (theme) => (isActive ? theme.palette.primary.onSurface : undefined),
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
            {hasBadge && collapsedFinal ? (
              <Badge
                badgeContent={badgeLabel}
                color={badgeColor}
                sx={{
                  '& .MuiBadge-badge': {
                    fontSize: '0.6rem',
                    height: 16,
                    minWidth: 16,
                    fontWeight: 700,
                  },
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
const SkudItemView: React.FC<{
  collapsed?: boolean;
  hasShift: boolean;
  isIpCorrect: boolean;
  actionLoading: boolean;
  onStart: () => void;
  onStop: () => void;
}> = ({ collapsed, hasShift, isIpCorrect, actionLoading, onStart, onStop }) => {
  // If collapsed, show standard item with icon
  if (collapsed) {
    return <SidebarMenuItem to="/work-shifts" icon={<AccessTimeOutlined />} label="СКУД" collapsed={true} />;
  }

  // Expanded: No left icon, show Play/Stop buttons next to text
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStart();
  };

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStop();
  };

  const labelContent = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>СКУД</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, mr: -1 }}>
        {!hasShift ? (
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

const DjangoSidebarSkudItem: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const { currentShift, handleStartShift, handleEndShift, actionLoading, isIpCorrect } =
    useDjangoSkudActions();
  return (
    <SkudItemView
      collapsed={collapsed}
      hasShift={Boolean(currentShift)}
      isIpCorrect={isIpCorrect}
      actionLoading={actionLoading}
      onStart={handleStartShift}
      onStop={handleEndShift}
    />
  );
};

const SidebarSkudItem: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => <DjangoSidebarSkudItem collapsed={collapsed} />;

// Bottom area (copyright / version)
const SidebarFooter: React.FC = () => {
  const { siderCollapsed } = useThemedLayoutContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isCollapsed = siderCollapsed && !isMobile; // Always expanded on mobile

  const [logoutOpen, setLogoutOpen] = React.useState(false);
  const appVersion = useAppVersion();

  const handleLogoutClick = () => {
    setLogoutOpen(true);
  };

  const handleConfirmLogout = async () => {
    try {
      await djangoLogout();
      window.location.href = '/login';
    } catch (e) {
      console.error("Logout error:", e);
      window.location.href = '/login';
    }
  };

  return (
    <Box px={1} py={1}>
      <Stack
        direction={isCollapsed ? "column" : "row"}
        justifyContent={isCollapsed ? "center" : "space-between"}
        alignItems="center"
        spacing={1}
      >
        {isCollapsed ? (
          <Stack spacing={1} alignItems="center">
            <ThemeCustomizerButton tooltipPlacement="right" />
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
              {appVersion}
            </Typography>
          </Stack>
        ) : (
          <>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                ErkinAI {appVersion}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                © {new Date().getFullYear()}
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.5}>
              <ThemeCustomizerButton tooltipPlacement="top" />
              <Tooltip title="Выйти" placement="top">
                <IconButton onClick={handleLogoutClick} size="small" color="error">
                  <LogoutOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </>
        )}
      </Stack>

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
