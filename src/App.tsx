import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { useQueryClient } from "@tanstack/react-query";

import {
  RefineSnackbarProvider,
  ThemedLayout,
  useNotificationProvider,
} from "@refinedev/mui";

import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import { useMediaQuery, useTheme } from "@mui/material";
import LinearProgress from "@mui/material/LinearProgress";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ruRU } from "@mui/x-date-pickers/locales";
import dayjs from "dayjs";

import routerProvider, {
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";

import { Outlet, Route, Routes, Navigate } from "react-router";

import { Header } from "./components/header";
import { Sidebar } from "./components/sidebar";
import { PatientSessionProvider } from "./pages/public-booking/PatientSession";
import { AchievementToast } from "./components/achievements/AchievementToast";
import { AnnouncementBanner } from "./components/announcements/AnnouncementBanner";
import { FloatingTopBanners } from "./components/layout/FloatingTopBanners";
import { BranchPickerDialog } from "./components/auth/BranchPickerDialog";
import { MobileSidebarProvider } from "./components/sidebar/mobile-context";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { RefreshProvider } from "./contexts/refresh-context";
import { TitleProvider } from "./contexts/title-context";
import { PageCacheProvider } from "./contexts/page-cache-context";
import "./i18n";
import { VerticalProvider } from "./i18n/VerticalProvider";
import { tt } from "./i18n/t";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequirePermission } from "./components/rbac/RequirePermission";
import { RequireSuperAdmin } from "./components/rbac/RequireSuperAdmin";
import { RequireModule } from "./components/rbac/RequireModule";
import {
  PAGE_PERMISSIONS,
  SETTINGS_TAB_PERMISSIONS,
} from "./config/accessPermissions";
import { useCanChecker } from "./hooks/useCan";
import { usePermissions } from "./hooks/usePermissions";
import { useModuleGate } from "./hooks/useModuleGate";
import { resolveHomeRoute } from "./config/homeRoute";
import { RateLimitDialog } from "./components/errors/RateLimitDialog";
// import { RoleDebugNotification } from "./components/debug/RoleDebugNotification"; // ⚠️ Временно отключено

import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { djangoQueryKeys } from "./api/queryKeys";
import { ApiError } from "./api/client";
import { CASHLESS_METHODS_ENABLED } from "./api/cashlessMethods";
import { djangoDataProvider } from "./config/djangoDataProvider";

// ОПТИМИЗАЦИЯ: Все страницы загружаются через lazy() для code splitting
const UnderConstruction = lazy(() =>
  import("./pages/placeholder").then((m) => ({ default: m.UnderConstruction })),
);
const DashboardPage = lazy(() => import("./pages/dashboard"));
const EmployeesPage = lazy(() => import("./pages/employes"));
const ServicesPage = lazy(() => import("./pages/services/DjangoServicesPage"));
const DjangoWarehousesPage = lazy(() => import("./pages/warehouses/django"));
const DjangoProductsPage = lazy(() => import("./pages/products/django"));
const DjangoSalesPage = lazy(() => import("./pages/sales/django"));
const LoginPage = lazy(() => import("./pages/auth/login"));
const DjangoSchedulePage = lazy(() => import("./pages/schedule/django"));
const DjangoWorkShiftsPage = lazy(() => import("./pages/work-shifts/django"));
const AccessDeniedPage = lazy(() => import("./pages/AccessDenied"));
const DjangoSkudSettingsPage = lazy(() => import("./pages/settings/django/SkudSettingsPage"));
const ConclusionPrintPage = lazy(() => import("./pages/print/ConclusionPrintPage").then(module => ({ default: module.ConclusionPrintPage }))); // New Print Page
const CertificatePrintPage = lazy(() => import("./pages/print/CertificatePrintPage").then(module => ({ default: module.CertificatePrintPage }))); // New Certificate Page
const DjangoCashboxPage = lazy(() => import("./pages/cashbox/django"));
const DjangoExpensesPage = lazy(() => import("./pages/expenses/DjangoExpensesPage"));
const DjangoSalaryReportsPage = lazy(() => import("./pages/salary-reports/django"));
const ReviewsPage = lazy(() => import("./pages/reviews"));
const BookingsPage = lazy(() => import("./pages/bookings"));
const ChatsPage = lazy(() => import("./pages/chats"));
const TasksPage = lazy(() => import("./pages/tasks"));
const VaccinationsPage = lazy(() => import("./pages/vaccinations"));
const AchievementsPage = lazy(() => import("./pages/achievements"));
const DocumentsPage = lazy(() => import("./pages/documents"));
const CleaningPage = lazy(() => import("./pages/cleaning"));
const CleaningSettingsPage = lazy(() => import("./pages/settings/CleaningSettingsPage"));
const AnnouncementsSettingsPage = lazy(() => import("./pages/settings/AnnouncementsSettingsPage"));
const KnowledgePage = lazy(() => import("./pages/knowledge"));
const KnowledgeArticlePage = lazy(() => import("./pages/knowledge/ArticleViewPage"));
const ReviewsSettingsPage = lazy(() => import("./pages/reviews/ReviewsSettingsPage"));
const PublicRatePage = lazy(() => import("./pages/reviews/PublicRatePage"));
const PublicBookSpecialtiesPage = lazy(() => import("./pages/public-booking/SpecialtiesPage"));
const PublicBookDoctorsPage = lazy(() => import("./pages/public-booking/DoctorsPage"));
const PublicBookDoctorPage = lazy(() => import("./pages/public-booking/DoctorBookingPage"));
const PublicBookMyBookingsPage = lazy(() => import("./pages/public-booking/MyBookingsPage"));
const PublicBookByCodePage = lazy(() => import("./pages/public-booking/BookingByCodePage"));
const PublicLandingPage = lazy(() => import("./pages/public-site"));
const ExpenseCategoriesSettingsPage = lazy(() => import("./pages/settings/ExpenseCategoriesSettingsPage"));
const TasksSettingsPage = lazy(() => import("./pages/settings/TasksSettingsPage"));
const DiagnosesSettingsPage = lazy(() => import("./pages/settings/DiagnosesSettingsPage"));
const ConclusionFormsSettingsPage = lazy(() => import("./pages/settings/ConclusionFormsSettingsPage"));
const DjangoReportsPage = lazy(() => import("./pages/reports/django"));
const PatientsPage = lazy(() => import("./pages/patients"));
const DjangoNotificationSettingsPage = lazy(() => import("./pages/settings/django/NotificationSettingsPage"));
const AutomationsSettingsPage = lazy(() => import("./pages/settings/automations/AutomationsSettingsPage"));
const SettingsIndexPage = lazy(() => import("./pages/settings/SettingsIndexPage"));
const OrganizationSettingsPage = lazy(() => import("./pages/settings/OrganizationSettingsPage"));
const BranchesSettingsPage = lazy(() => import("./pages/settings/BranchesSettingsPage"));
const SiteSettingsPage = lazy(() => import("./pages/settings/SiteSettingsPage"));
const RolesSettingsPage = lazy(() => import("./pages/settings/RolesSettingsPage"));
const MembershipsSettingsPage = lazy(() => import("./pages/settings/MembershipsSettingsPage"));
const SpecializationsSettingsPage = lazy(() => import("./pages/settings/SpecializationsSettingsPage"));
const BanksSettingsPage = lazy(() => import("./pages/settings/BanksSettingsPage"));
const InsurersSettingsPage = lazy(() => import("./pages/settings/InsurersSettingsPage"));
const CashlessMethodsSettingsPage = lazy(() => import("./pages/settings/CashlessMethodsSettingsPage"));
const AppointmentsPage = lazy(() => import("./pages/appointments/AppointmentsPage"));
// Реестры «Все приёмы» / «Все процедуры» — исторический список за период
// (registry/RegistryJournalView), а не рабочий кабинет с навигацией по дням.
const AllAppointmentsPage = lazy(() => import("./pages/all-appointments"));
const AllProceduresPage = lazy(() => import("./pages/all-procedures"));
const LoadAnalyticsPage = lazy(() => import("./pages/admin/load").then(module => ({ default: module.LoadAnalyticsPage })));
const ProfilePage = lazy(() => import("./pages/profile"));
const RetailDashboardPage = lazy(() => import("./pages/retail/RetailDashboardPage"));


// Вспомогательный компонент для защиты корневого редиректа
const RootRedirect = () => {
  // Корень раскладывает вход по правам (config/homeRoute.ts): раньше здесь
  // был хардкод /appointments, и вход без права appointments.registry.view
  // заканчивался экраном «Нет доступа».
  const { loading, can } = useCanChecker();
  const { role, activeEmployee } = usePermissions();
  const { loading: moduleLoading, moduleGate } = useModuleGate();
  if (loading || moduleLoading) {
    return <LinearProgress />;
  }
  const path = resolveHomeRoute({
    roleCode: role?.name,
    can,
    canOpenModule: moduleGate,
    hasActiveEmployee: activeEmployee != null,
  });
  return <Navigate to={path} replace />;
};

const DjangoQueryCacheReset = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const reset = () => {
      void queryClient.removeQueries({ queryKey: djangoQueryKeys.all });
    };

    window.addEventListener("mamadoc:django-context-switched", reset);
    return () => {
      window.removeEventListener("mamadoc:django-context-switched", reset);
    };
  }, [queryClient]);

  return null;
};

/**
 * Пересоздаёт текущую страницу при смене активной организации/филиала.
 *
 * Страницы загружают данные при монтировании, поэтому remount подтягивает
 * данные нового контекста без полной перезагрузки приложения — шапка,
 * сайдбар и бандл остаются на месте. Счётчик растёт только при явном
 * switchContext() (событие mamadoc:django-context-switched), так что
 * первоначальная загрузка /auth/me/ лишнего remount не вызывает.
 */
const DjangoContextRemount = ({ children }: { children: ReactNode }) => {
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    const bump = () => setContextVersion((v) => v + 1);
    window.addEventListener("mamadoc:django-context-switched", bump);
    return () => {
      window.removeEventListener("mamadoc:django-context-switched", bump);
    };
  }, []);

  return <Fragment key={contextVersion}>{children}</Fragment>;
};

// Стабильные ссылки для ThemedLayout. Если передавать инлайн-стрелки
// (Sider={() => <Sidebar />}), React при каждом ререндере ThemedLayout видит
// новый тип компонента и размонтирует/монтирует сайдбар заново — из-за чего
// теряется позиция скролла (выбрасывает наверх при выборе пункта снизу).
const renderHeader = () => <Header sticky />;
const renderSider = () => <Sidebar />;

function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // ОПТИМИЗАЦИЯ: Более умный prefetch с приоритизацией
  useEffect(() => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    const ric = w.requestIdleCallback;

    // Приоритет 1: Самые часто используемые страницы
    const prefetchPriority = () => {
      import("./pages/appointments/AppointmentsPage");
      import("./pages/employes");
    };

    // Приоритет 2: Менее важные страницы загружаем позже
    const prefetchSecondary = () => {
      import("./pages/services/DjangoServicesPage");
      import("./pages/patients");
    };

    // Приоритет 3: Редко используемые страницы загружаем в последнюю очередь
    const prefetchTertiary = () => {
      import("./pages/settings/RolesSettingsPage");
    };

    if (typeof ric === "function") {
      ric(prefetchPriority);
      ric(() => {
        setTimeout(prefetchSecondary, 1000);
      });
      ric(() => {
        setTimeout(prefetchTertiary, 3000);
      });
    } else {
      setTimeout(prefetchPriority, 1500);
      setTimeout(prefetchSecondary, 3000);
      setTimeout(prefetchTertiary, 5000);
    }
  }, []);
  return (
    <RefineKbarProvider>
      <VerticalProvider>
      <PageCacheProvider>
        <TitleProvider>
          <ColorModeContextProvider>
            <RefreshProvider>
              <CssBaseline />
              <GlobalStyles
                styles={{
                  html: {
                    WebkitFontSmoothing: "antialiased",
                    MozOsxFontSmoothing: "grayscale",
                    overscrollBehaviorY: "contain",
                    height: "100%",
                    overflow: "hidden",
                  },
                  body: {
                    overscrollBehaviorY: "contain",
                    WebkitOverflowScrolling: "touch",
                    minHeight: "100%",
                    height: "100%",
                    overflow: "hidden",
                  },
                  "#root": {
                    minHeight: "100%",
                    height: "100%",
                    overflow: "hidden",
                  },
                }}
              />

              <RefineSnackbarProvider anchorOrigin={{ vertical: "top", horizontal: isMobile ? "right" : "center" }}>
                <LocalizationProvider
                  dateAdapter={AdapterDayjs}
                  adapterLocale="ru"
                  dateLibInstance={dayjs}
                  localeText={ruRU.components.MuiLocalizationProvider.defaultProps.localeText}
                >
                  <Refine
                    dataProvider={djangoDataProvider}
                    notificationProvider={useNotificationProvider}
                    routerProvider={routerProvider}
                    resources={[
                      {
                        name: "Appointments",
                        list: "/appointments",
                        show: "/appointments/:id",
                      },
                      {
                        name: "Expenses",
                        list: "/expenses",
                        meta: { label: "Расходы" }
                      },
                      {
                        name: "services",
                        list: "/services",
                        meta: { label: "Услуги" }
                      },
                      {
                        name: "products",
                        list: "/products",
                        meta: { label: "Товары" }
                      },
                      {
                        name: "sales",
                        list: "/sales",
                        meta: { label: "Продажи" }
                      },
                      {
                        name: "storage",
                        list: "/storage",
                        meta: { label: "Движение товара" }
                      },
                      {
                        name: "warehouses",
                        list: "/warehouses",
                        meta: { label: "Склад" }
                      },
                      {
                        name: "patients",
                        list: "/patients",
                        meta: { label: tt("patients:list.title") }
                      },
                      {
                        name: "employees",
                        list: "/employees",
                        meta: { label: "Сотрудники" }
                      },
                      {
                        name: "schedule",
                        list: "/schedule",
                        meta: { label: "Расписание" }
                      },
                      {
                        name: "doctor",
                        list: "/doctor",
                        meta: { label: tt("sidebar:doctorRoom") }
                      },
                      {
                        name: "nurse",
                        list: "/nurse",
                        meta: { label: "Процедурный кабинет" }
                      },
                      {
                        name: "work-shifts",
                        list: "/work-shifts",
                        meta: { label: "СКУД" }
                      },
                      {
                        name: "cashbox",
                        list: "/cashbox",
                        meta: { label: "Касса" }
                      },
                      {
                        name: "reports",
                        list: "/reports",
                        meta: { label: "Отчеты" }
                      },
                      {
                        name: "load",
                        list: "/admin/load",
                        meta: { label: "Нагрузка" }
                      },
                      {
                        name: "salary-reports",
                        list: "/salary-reports",
                        meta: { label: "Отчет по ЗП" }
                      },
                      {
                        name: "all-appointments",
                        list: "/all-appointments",
                        meta: { label: tt("sidebar:allAppointments") }
                      },
                      {
                        name: "all-procedures",
                        list: "/all-procedures",
                        meta: { label: "Все процедуры" }
                      },
                      {
                        name: "bookings",
                        list: "/bookings",
                        show: "/bookings/show/:id",
                        meta: { label: "Брони" }
                      },
                      {
                        name: "chats",
                        list: "/chats",
                        meta: { label: "Чаты" }
                      },
                      {
                        name: "tasks",
                        list: "/tasks",
                        meta: { label: "Задачи" }
                      },
                      {
                        name: "vaccinations",
                        list: "/vaccinations",
                        meta: { label: "Вакцины" }
                      },
                      {
                        name: "achievements",
                        list: "/achievements",
                        meta: { label: "Мои достижения" }
                      },
                      {
                        name: "diagnoses",
                        list: "/settings/diagnoses",
                        meta: { label: "Диагнозы" }
                      },
                    ]}
                    options={{
                      syncWithLocation: true,
                      warnWhenUnsavedChanges: true,
                      projectId: "Ajscvf-43VuiP-CaKNwq",
                      reactQuery: {
                        clientConfig: {
                          defaultOptions: {
                            queries: {
                              staleTime: 5 * 60 * 1000, // 5 minutes
                              gcTime: 10 * 60 * 1000, // 10 minutes
                              refetchOnWindowFocus: false,
                              // Повторяем один раз только временные сбои. 429
                              // обрабатывается единым диалогом; мгновенный retry
                              // лишь создаст ещё один отклонённый запрос.
                              retry: (failureCount, error) =>
                                !(
                                  error instanceof ApiError &&
                                  error.status === 429
                                ) && failureCount < 1,
                            },
                          },
                        },
                      },
                    }}
                  >
                    <Routes>
                      <Route
                        element={
                          <RequireAuth>
                            <MobileSidebarProvider>
                              <ThemedLayout
                                Header={renderHeader}
                                Sider={renderSider}
                                childrenBoxProps={{
                                  sx: {
                                    p: 1,
                                    // ⚠ Порог — md, а не sm: `sm` в теме равен
                                    // 360px, и телефон попадал в ветку рабочего
                                    // стола — вычиталось 64px вместо 56px, а
                                    // 100vh на мобильном браузере считается по
                                    // экрану без адресной строки, из-за чего низ
                                    // страницы уходил под неё.
                                    height: { xs: "calc(100dvh - 56px)", md: "calc(100vh - 64px)" },
                                    overflow: "hidden",
                                    position: "relative",
                                  }
                                }}
                              >
                                <DjangoContextRemount>
                                  <>
                                    <AnnouncementBanner />
                                     <Outlet />
                                     <FloatingTopBanners />
                                  </>
                                </DjangoContextRemount>
                                {/* Поздравление с новыми достижениями (mark-seen при закрытии) */}
                                <AchievementToast />
                                {/* Выбор филиала после логина (флаг ставит login.tsx) */}
                                <BranchPickerDialog />
                              </ThemedLayout>
                            </MobileSidebarProvider>
                          </RequireAuth>
                        }
                      >
                        <Route index element={<RootRedirect />} />
                        <Route path="home" element={<RootRedirect />} />
                        <Route path="patient-search" element={<Navigate to="/patients" replace />} />
                        {/* Исторические реестры «Все приёмы» / «Все процедуры» —
                            только суперадминистратор (пожелание заказчика
                            19.08.2026). Гейт ролевой, а не по праву: организация
                            не должна открыть их себе через редактор ролей. */}
                        <Route
                          path="all-appointments"
                          element={
                            <RequireSuperAdmin>
                              <Suspense fallback={<LinearProgress />}>
                                <AllAppointmentsPage />
                              </Suspense>
                            </RequireSuperAdmin>
                          }
                        />
                        <Route
                          path="all-procedures"
                          element={
                            <RequireSuperAdmin>
                              <Suspense fallback={<LinearProgress />}>
                                <AllProceduresPage />
                              </Suspense>
                            </RequireSuperAdmin>
                          }
                        />
                        {/* Сводка — пока только суперадминистратору (решение
                            заказчика 27.08.2026). Состав виджетов внутри
                            определяется правами, но сам раздел скрыт от
                            организаций до отдельного распоряжения. */}
                        <Route
                          path="dashboard"
                          element={
                            <RequireSuperAdmin>
                              <Suspense fallback={<LinearProgress />}>
                                <DashboardPage />
                              </Suspense>
                            </RequireSuperAdmin>
                          }
                        />
                        <Route
                          path="patients"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.patients}>
                              <Suspense fallback={<LinearProgress />}>
                                <PatientsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="expenses"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.expenses}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoExpensesPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="employees"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.employees}>
                              <Suspense fallback={<LinearProgress />}>
                                <EmployeesPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="services"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.services}>
                              <Suspense fallback={<LinearProgress />}>
                                <ServicesPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="products"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.products}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoProductsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />

                        <Route
                          path="storage"
                          element={
                            <Navigate to="/warehouses" replace />
                          }
                        />
                        <Route
                          path="warehouses"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.warehouses}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoWarehousesPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="retail"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.pos}>
                              <Suspense fallback={<LinearProgress />}>
                                <RetailDashboardPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="schedule"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.schedule}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoSchedulePage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="doctor"
                          element={
                            <RequirePermission
                              permission={PAGE_PERMISSIONS.doctorRoom}
                              fallback={<Navigate to="/" replace />}
                            >
                              <Suspense fallback={<LinearProgress />}>
                                <AppointmentsPage scope="me" />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="nurse"
                          element={
                            <RequirePermission
                              permission={PAGE_PERMISSIONS.nurseRoom}
                              fallback={<Navigate to="/" replace />}
                            >
                              <Suspense fallback={<LinearProgress />}>
                                <AppointmentsPage scope="nurse" />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="work-shifts"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.attendance}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoWorkShiftsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="profile"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <ProfilePage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="sales"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.sales}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoSalesPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="cashbox"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.cashbox}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoCashboxPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="reports"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.reports}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoReportsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="salary-reports"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.payroll}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoSalaryReportsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="settings/skud"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.attendanceSettings}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoSkudSettingsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="settings/notifications"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.notifications}>
                              <Suspense fallback={<LinearProgress />}>
                                <DjangoNotificationSettingsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="settings/automations"
                          element={
                            <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.automations}>
                              <Suspense fallback={<LinearProgress />}>
                                <AutomationsSettingsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <Route
                          path="admin/load"
                          element={
                            <RequirePermission permission={PAGE_PERMISSIONS.reports}>
                              <Suspense fallback={<LinearProgress />}>
                                <LoadAnalyticsPage />
                              </Suspense>
                            </RequirePermission>
                          }
                        />
                        <>
                            <Route
                              path="appointments"
                              element={
                                <RequirePermission
                                  permission={PAGE_PERMISSIONS.appointmentsRegistry}
                                  fallback={<Navigate to="/" replace />}
                                >
                                  <Suspense fallback={<LinearProgress />}>
                                    <AppointmentsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings"
                              element={
                                <Suspense fallback={<LinearProgress />}>
                                  <SettingsIndexPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="settings/organization"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.organization}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <OrganizationSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/branches"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.branches}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <BranchesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/site"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.site}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <SiteSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/roles"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.roles}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <RolesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/memberships"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.memberships}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <MembershipsSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/specializations"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.specializations}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <SpecializationsSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/banks"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.banks}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <BanksSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/insurers"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.insurers}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <InsurersSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            {/* Справочник способов безнала — вместе с флагом
                                CASHLESS_METHODS_ENABLED. */}
                            {CASHLESS_METHODS_ENABLED && (
                              <Route
                                path="settings/cashless-methods"
                                element={
                                  <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.cashlessMethods}>
                                    <Suspense fallback={<LinearProgress />}>
                                      <CashlessMethodsSettingsPage />
                                    </Suspense>
                                  </RequirePermission>
                                }
                              />
                            )}
                            <Route
                              path="settings/expense-categories"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.expenseCategories}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <ExpenseCategoriesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/tasks"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.tasks}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <TasksSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="reviews"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.reviews}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <ReviewsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="bookings"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.bookings}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <BookingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="chats"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.chats}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <ChatsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="tasks"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.tasks}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <TasksPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="vaccinations"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.vaccinations}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <VaccinationsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="achievements"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.achievements}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <AchievementsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            {/* Модули на моках (documents/cleaning/knowledge):
                                RequireModule пускает всех в демо-режиме и начнёт
                                требовать права автоматически после выключения
                                *_USE_MOCKS — см. useModuleGate. */}
                            <Route
                              path="documents"
                              element={
                                <RequireModule module="documents">
                                  <Suspense fallback={<LinearProgress />}>
                                    <DocumentsPage />
                                  </Suspense>
                                </RequireModule>
                              }
                            />
                            <Route
                              path="cleaning"
                              element={
                                <RequireModule module="cleaning">
                                  <Suspense fallback={<LinearProgress />}>
                                    <CleaningPage />
                                  </Suspense>
                                </RequireModule>
                              }
                            />
                            <Route
                              path="settings/cleaning"
                              element={
                                <RequireModule module="cleaning" permissions={["cleaning.manage"]}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <CleaningSettingsPage />
                                  </Suspense>
                                </RequireModule>
                              }
                            />
                            <Route
                              path="settings/announcements"
                              element={
                                <RequirePermission permission={PAGE_PERMISSIONS.announcements}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <AnnouncementsSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="knowledge"
                              element={
                                <RequireModule module="knowledge">
                                  <Suspense fallback={<LinearProgress />}>
                                    <KnowledgePage />
                                  </Suspense>
                                </RequireModule>
                              }
                            />
                            <Route
                              path="knowledge/:articleId"
                              element={
                                <RequireModule module="knowledge">
                                  <Suspense fallback={<LinearProgress />}>
                                    <KnowledgeArticlePage />
                                  </Suspense>
                                </RequireModule>
                              }
                            />
                            <Route
                              path="reviews/settings"
                              element={
                                <RequirePermission permission="reviews.manage">
                                  <Suspense fallback={<LinearProgress />}>
                                    <ReviewsSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/diagnoses"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.diagnoses}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <DiagnosesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/conclusion-forms"
                              element={
                                <RequirePermission permission={SETTINGS_TAB_PERMISSIONS.conclusionForms}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <ConclusionFormsSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                        </>
                        <Route
                          path="access-denied"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <AccessDeniedPage />
                            </Suspense>
                          }
                        />

                        <Route
                          path="*"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <UnderConstruction />
                            </Suspense>
                          }
                        />
                      </Route>
                      <Route
                        path="print/conclusion/:id"
                        element={
                          <RequireAuth>
                            <RequirePermission permission={PAGE_PERMISSIONS.conclusionPrint}>
                              <Suspense fallback={<LinearProgress />}>
                                <ConclusionPrintPage />
                              </Suspense>
                            </RequirePermission>
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="print/certificate/:id"
                        element={
                          <RequireAuth>
                            <Suspense fallback={<LinearProgress />}>
                              <CertificatePrintPage />
                            </Suspense>
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="login"
                        element={
                          <Suspense fallback={<LinearProgress />}>
                            <LoginPage />
                          </Suspense>
                        }
                      />
                      <Route
                        path="update-password"
                        element={<Navigate to="/profile" replace />}
                      />
                      <Route
                        path="review/:token"
                        element={
                          <Suspense fallback={<LinearProgress />}>
                            <PublicRatePage />
                          </Suspense>
                        }
                      />
                      {/* Публичная онлайн-запись (/book/*) — вне RequireAuth,
                          питается публичным /api/v1 (см. src/api/publicBooking.ts).
                          PatientSessionProvider держит токен пациента отдельно от
                          сессии сотрудника: витрина живёт на том же домене, что CRM. */}
                      <Route
                        element={
                          <PatientSessionProvider>
                            <Outlet />
                          </PatientSessionProvider>
                        }
                      >
                        <Route
                          path="book"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicBookSpecialtiesPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="book/doctors"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicBookDoctorsPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="book/doctor/:idOrSlug"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicBookDoctorPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="book/me"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicBookMyBookingsPage />
                            </Suspense>
                          }
                        />
                        {/* Карточка записи по коду подтверждения — сюда ведёт QR. */}
                        <Route
                          path="book/b/:code"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicBookByCodePage />
                            </Suspense>
                          }
                        />
                        {/* Лендинг организации: сайт-визитка на данных CRM, из
                            которого кнопки ведут в воронку /book. Два адреса —
                            `/site/<slug>` для ссылок наружу (его дают в рекламе)
                            и `/site` для организации по умолчанию либо `?org=`,
                            как на витрине записи. */}
                        <Route
                          path="site"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicLandingPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="site/:orgSlug"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <PublicLandingPage />
                            </Suspense>
                          }
                        />
                      </Route>
                    </Routes>

                    <DjangoQueryCacheReset />
                    <RateLimitDialog />
                    <RefineKbar />
                    <UnsavedChangesNotifier />
                    <DocumentTitleHandler
                      handler={(options) => {
                        const baseTitle = "Aximo";
                        if (options.resource) {
                          const resourceLabel = options.resource.meta?.label || options.resource.name;
                          if (resourceLabel) {
                            return `${resourceLabel} | ${baseTitle}`;
                          }
                        }
                        return baseTitle;
                      }}
                    />
                  </Refine>
                </LocalizationProvider>

              </RefineSnackbarProvider>
            </RefreshProvider>
          </ColorModeContextProvider>
        </TitleProvider>
      </PageCacheProvider>
      </VerticalProvider>
    </RefineKbarProvider>
  );
}

export default App;
