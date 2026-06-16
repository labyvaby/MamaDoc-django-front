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
import { useLocation, useNavigate } from "react-router";

import { Header } from "./components/header";
import { Sidebar } from "./components/sidebar";
import { MobileSidebarProvider } from "./components/sidebar/mobile-context";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { ThemeCustomizerFab } from "./components/theme/ThemeCustomizerFab";
import { RefreshProvider } from "./contexts/refresh-context";
import { ClientSessionProvider } from "./contexts/client-session-context";
import { TitleProvider } from "./contexts/title-context";
import { PageCacheProvider } from "./contexts/page-cache-context";
import { RequireAuth } from "./components/auth/RequireAuth";
import { ProtectedRoute } from "./components/rbac/ProtectedRoute";
import { RequirePermission } from "./components/rbac/RequirePermission";
import { CallNotification } from "./components/CallNotification";
// import { RoleDebugNotification } from "./components/debug/RoleDebugNotification"; // ⚠️ Временно отключено

import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuthIdentitySync } from "./hooks/useAuthIdentitySync";
import { IS_DJANGO_BACKEND } from "./config/backend";
import { djangoQueryKeys } from "./api/queryKeys";
import { LegacyRouteGuard } from "./components/routing/LegacyRouteGuard";
import { djangoDataProvider } from "./config/djangoDataProvider";
// 🔥 SUPABASE — только в Supabase-mode
import { dataProvider } from "@refinedev/supabase";
import { supabase } from "./utility/supabaseClient";

// ОПТИМИЗАЦИЯ: Все страницы загружаются через lazy() для code splitting
const UnderConstruction = lazy(() =>
  import("./pages/placeholder").then((m) => ({ default: m.UnderConstruction })),
);
const HomePage = lazy(() => import("./pages/home"));
const PatientSearchPage = lazy(() => import("./pages/patient-search"));
const ExpensesListPage = lazy(() => import("./pages/expenses"));
const EmployeesPage = lazy(() => import("./pages/employes"));
const ServicesPage = lazy(() => import("./pages/services"));
const ProductsPage = lazy(() => import("./pages/products"));
const StoragePage = lazy(() => import("./pages/storage"));
const WarehousesPage = lazy(() => import("./pages/warehouses"));
const DjangoStoragePage = lazy(() => import("./pages/storage/django"));
const DjangoWarehousesPage = lazy(() => import("./pages/warehouses/django"));
const DjangoProductsPage = lazy(() => import("./pages/products/django"));
const DjangoSalesPage = lazy(() => import("./pages/sales/django"));
const SalesPage = lazy(() => import("./pages/sales"));
const LoginPage = lazy(() => import("./pages/auth/login"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const WorkShiftsPage = lazy(() => import("./pages/work-shifts"));
const DjangoWorkShiftsPage = lazy(() => import("./pages/work-shifts/django"));
const AccessDeniedPage = lazy(() => import("./pages/AccessDenied"));
const DoctorWorkPage = lazy(() => import("./pages/doctor"));
const NursePage = lazy(() => import("./pages/nurse"));
const SkudSettingsPage = lazy(() => import("./pages/settings/SkudSettingsPage").then(module => ({ default: module.SkudSettingsPage })));
const DjangoSkudSettingsPage = lazy(() => import("./pages/settings/django/SkudSettingsPage"));
const ConclusionPrintPage = lazy(() => import("./pages/print/ConclusionPrintPage").then(module => ({ default: module.ConclusionPrintPage }))); // New Print Page
const CertificatePrintPage = lazy(() => import("./pages/print/CertificatePrintPage").then(module => ({ default: module.CertificatePrintPage }))); // New Certificate Page
const CashboxPage = lazy(() => import("./pages/cashbox"));
const DjangoCashboxPage = lazy(() => import("./pages/cashbox/django"));
const DjangoExpensesPage = lazy(() => import("./pages/expenses/DjangoExpensesPage"));
const DjangoSalaryReportsPage = lazy(() => import("./pages/salary-reports/django"));
const ExpenseCategoriesSettingsPage = lazy(() => import("./pages/settings/ExpenseCategoriesSettingsPage"));
const ReportsPage = lazy(() => import("./pages/reports"));
const AllAppointmentsPage = lazy(() => import("./pages/all-appointments"));
const AllProceduresPage = lazy(() => import("./pages/all-procedures"));
const PatientsPage = lazy(() => import("./pages/patients"));
const DiagnosesPage = lazy(() => import("./pages/admin/DiagnosesPage"));
const NotificationSettingsPage = lazy(() => import("./pages/settings/NotificationSettingsPage").then(module => ({ default: module.NotificationSettingsPage })));
const SettingsIndexPage = lazy(() => import("./pages/settings/SettingsIndexPage"));
const OrganizationSettingsPage = lazy(() => import("./pages/settings/OrganizationSettingsPage"));
const BranchesSettingsPage = lazy(() => import("./pages/settings/BranchesSettingsPage"));
const RolesSettingsPage = lazy(() => import("./pages/settings/RolesSettingsPage"));
const MembershipsSettingsPage = lazy(() => import("./pages/settings/MembershipsSettingsPage"));
const AppointmentsPage = lazy(() => import("./pages/appointments/AppointmentsPage"));
const SalaryReportsPage = lazy(() => import("./pages/salary-reports"));
const LoadAnalyticsPage = lazy(() => import("./pages/admin/load").then(module => ({ default: module.LoadAnalyticsPage })));
import UpdatePasswordPage from "./pages/auth/update-password";
const ClientLoginPage = lazy(() => import("./pages/client/login"));
const ClientProfilePage = lazy(() => import("./pages/client/profile"));
const SsoPage = lazy(() => import("./pages/auth/sso"));
const AuthCallbackPage = lazy(() => import("./pages/auth/callback"));
const ProfilePage = lazy(() => import("./pages/profile"));


// Вспомогательный компонент для обработки глобальных событий аутентификации
const AuthHelper = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (IS_DJANGO_BACKEND) return;

    // 1. Слушаем события изменения состояния авторизации
    let lastUserId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUserId = session?.user?.id ?? null;
      if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && lastUserId !== null && lastUserId !== currentUserId)) {
        // Очищаем черновики только при реальном выходе или смене пользователя
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("conclusion_draft_")) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
      lastUserId = currentUserId;
      if (event === "PASSWORD_RECOVERY") {
        console.log("AuthHelper: PASSWORD_RECOVERY event detected");
        // Принудительно уходим на страницу смены пароля, сохраняя хэш для Supabase
        navigate("/update-password" + window.location.hash);
      }
    });

    // 2. Дополнительная проверка хэша в URL (иногда событие может проскочить слишком быстро или не сработать)
    const checkHash = () => {
      // Если мы на любой странице кроме смены пароля, но в URL есть признаки восстановления
      if (window.location.hash.includes("type=recovery") && !window.location.pathname.includes("update-password")) {
        console.log("AuthHelper: Hash check found recovery token, redirecting...");
        navigate("/update-password" + window.location.hash);
      }
    };

    checkHash(); // Сразу при загрузке
    const interval = setInterval(checkHash, 1000);

    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [navigate]);

  return null;
};

// Вспомогательный компонент для защиты корневого редиректа
const RootRedirect = () => {
  if (window.location.hash.includes("type=recovery")) {
    return <Navigate to={"/update-password" + window.location.hash} replace />;
  }
  // В Django-режиме корень ведёт на /appointments, а не на Supabase-only /home
  return <Navigate to={IS_DJANGO_BACKEND ? "/appointments" : "/home"} replace />;
};

const DjangoQueryCacheReset = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!IS_DJANGO_BACKEND) return;

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
    if (!IS_DJANGO_BACKEND) return;

    const bump = () => setContextVersion((v) => v + 1);
    window.addEventListener("mamadoc:django-context-switched", bump);
    return () => {
      window.removeEventListener("mamadoc:django-context-switched", bump);
    };
  }, []);

  return <Fragment key={contextVersion}>{children}</Fragment>;
};

function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-link phone-login UUID to existing employee record on first sign-in
  useAuthIdentitySync();

  // ПРИНУДИТЕЛЬНЫЙ ПЕРЕХВАТ ВОССТАНОВЛЕНИЯ
  // Это срабатывает на самом верхнем уровне React-приложения
  useEffect(() => {
    if (window.location.hash.includes("type=recovery") && !location.pathname.includes("update-password")) {
      console.log("App Top-Level: Recovery token detected, force redirecting to /update-password...");
      navigate("/update-password" + window.location.hash, { replace: true });
    }
  }, [location.pathname, navigate]);

  // ОПТИМИЗАЦИЯ: Более умный prefetch с приоритизацией
  useEffect(() => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    const ric = w.requestIdleCallback;

    // Приоритет 1: Самые часто используемые страницы
    const prefetchPriority = () => {
      if (IS_DJANGO_BACKEND) {
        import("./pages/appointments/AppointmentsPage");
        import("./pages/employes");
        return;
      }
      import("./pages/home");
      import("./pages/expenses");
    };

    // Приоритет 2: Менее важные страницы загружаем позже
    const prefetchSecondary = () => {
      if (IS_DJANGO_BACKEND) {
        import("./pages/services");
        import("./pages/patients");
        return;
      }
      import("./pages/employes");
      import("./pages/services");
      import("./pages/products");
    };

    // Приоритет 3: Редко используемые страницы загружаем в последнюю очередь
    const prefetchTertiary = () => {
      if (IS_DJANGO_BACKEND) {
        import("./pages/settings/RolesSettingsPage");
        return;
      }
      import("./pages/storage");
      import("./pages/warehouses");
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
                    dataProvider={IS_DJANGO_BACKEND ? djangoDataProvider : dataProvider(supabase)}
                    notificationProvider={useNotificationProvider}
                    routerProvider={routerProvider}
                    resources={[
                      {
                        name: "Appointments",
                        list: "/home",
                        show: "/home/appointments/:id",
                      },
                      {
                        name: "categories",
                        list: "/categories",
                        create: "/categories/create",
                        edit: "/categories/edit/:id",
                        show: "/categories/show/:id",
                        meta: { canDelete: true },
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
                        meta: { label: "Пациенты" }
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
                        meta: { label: "Кабинет врача" }
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
                        meta: { label: "Все приемы" }
                      },
                      {
                        name: "all-procedures",
                        list: "/all-procedures",
                        meta: { label: "Все процедуры" }
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
                              retry: 1,
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
                                Header={() => <Header sticky />}
                                Sider={() => <Sidebar />}
                                childrenBoxProps={{
                                  sx: {
                                    p: 1,
                                    height: { xs: "calc(100dvh - 56px)", sm: "calc(100vh - 64px)" },
                                    overflow: "hidden",
                                    position: "relative",
                                  }
                                }}
                              >
                                <DjangoContextRemount>
                                  <Outlet />
                                </DjangoContextRemount>
                              </ThemedLayout>
                            </MobileSidebarProvider>
                          </RequireAuth>
                        }
                      >
                        <Route index element={<RootRedirect />} />
                        <Route
                          path="home"
                          element={
                            IS_DJANGO_BACKEND
                              ? <Navigate to="/appointments" replace />
                              : (
                                <ProtectedRoute allowedRoles={['admin', 'superadmin', 'manager', 'owner', 'receptionist', 'registrator', 'accountant']}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <HomePage />
                                  </Suspense>
                                </ProtectedRoute>
                              )
                          }
                        />
                        <Route
                          path="patient-search"
                          element={
                            <LegacyRouteGuard redirectTo="/patients">
                              <ProtectedRoute allowedRoles={['admin', 'superadmin', 'manager', 'owner', 'receptionist', 'registrator', 'accountant', 'doctor', 'nurse']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <PatientSearchPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="patients"
                          element={
                            <ProtectedRoute deniedRoles={[]}>
                              <Suspense fallback={<LinearProgress />}>
                                <PatientsPage />
                              </Suspense>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="expenses"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="finance.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoExpensesPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <ProtectedRoute deniedRoles={[]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <ExpensesListPage />
                                </Suspense>
                              </ProtectedRoute>
                            )
                          }
                        />
                        <Route
                          path="employees"
                          element={
                            <ProtectedRoute deniedRoles={[]}>
                              <Suspense fallback={<LinearProgress />}>
                                <EmployeesPage />
                              </Suspense>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="services"
                          element={
                            <ProtectedRoute deniedRoles={[]}>
                              <Suspense fallback={<LinearProgress />}>
                                <ServicesPage />
                              </Suspense>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="products"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission={["warehouse.view", "warehouse.sales.view"]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoProductsPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <ProtectedRoute deniedRoles={[]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <ProductsPage />
                                </Suspense>
                              </ProtectedRoute>
                            )
                          }
                        />

                        <Route
                          path="storage"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="warehouse.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoStoragePage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <StoragePage />
                                </Suspense>
                              </ProtectedRoute>
                            )
                          }
                        />
                        <Route
                          path="warehouses"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="warehouse.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoWarehousesPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <WarehousesPage />
                                </Suspense>
                              </ProtectedRoute>
                            )
                          }
                        />
                        <Route
                          path="schedule"
                          element={
                            <LegacyRouteGuard title="Расписание в разработке">
                              <ProtectedRoute deniedRoles={[]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <SchedulePage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="doctor"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="appointments.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <AppointmentsPage scope="me" />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <LegacyRouteGuard title="Кабинет врача в разработке">
                                <ProtectedRoute allowedRoles={['doctor']}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <DoctorWorkPage />
                                  </Suspense>
                                </ProtectedRoute>
                              </LegacyRouteGuard>
                            )
                          }
                        />
                        <Route
                          path="nurse"
                          element={
                            <LegacyRouteGuard title="Процедурный кабинет в разработке">
                              <ProtectedRoute allowedRoles={['nurse', 'admin', 'superadmin', 'receptionist']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <NursePage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="work-shifts"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="attendance.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoWorkShiftsPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <LegacyRouteGuard title="СКУД в разработке">
                                <ProtectedRoute deniedRoles={[]}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <WorkShiftsPage />
                                  </Suspense>
                                </ProtectedRoute>
                              </LegacyRouteGuard>
                            )
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
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission={["warehouse.sales.view", "warehouse.view"]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoSalesPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <ProtectedRoute allowedRoles={['admin', 'superadmin', 'registrator', 'receptionist']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <SalesPage />
                                </Suspense>
                              </ProtectedRoute>
                            )
                          }
                        />
                        <Route
                          path="cashbox"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="finance.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoCashboxPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <ProtectedRoute allowedRoles={['admin', 'superadmin', 'accountant', 'receptionist']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <CashboxPage />
                                </Suspense>
                              </ProtectedRoute>
                            )
                          }
                        />
                        <Route
                          path="reports"
                          element={
                            <LegacyRouteGuard title="Отчеты в разработке">
                              <ProtectedRoute allowedRoles={['admin', 'superadmin', 'accountant']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <ReportsPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="salary-reports"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="payroll.view">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoSalaryReportsPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <LegacyRouteGuard title="Отчет по ЗП в разработке">
                                <ProtectedRoute deniedRoles={[]}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <SalaryReportsPage />
                                  </Suspense>
                                </ProtectedRoute>
                              </LegacyRouteGuard>
                            )
                          }
                        />
                        <Route
                          path="all-appointments"
                          element={
                            <LegacyRouteGuard title="Все приемы в разработке">
                              <ProtectedRoute deniedRoles={[]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <AllAppointmentsPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="all-procedures"
                          element={
                            <LegacyRouteGuard title="Все процедуры в разработке">
                              <ProtectedRoute deniedRoles={[]}>
                                <Suspense fallback={<LinearProgress />}>
                                  <AllProceduresPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />

                        <Route
                          path="settings/skud"
                          element={
                            IS_DJANGO_BACKEND ? (
                              <RequirePermission permission="attendance.manage">
                                <Suspense fallback={<LinearProgress />}>
                                  <DjangoSkudSettingsPage />
                                </Suspense>
                              </RequirePermission>
                            ) : (
                              <LegacyRouteGuard redirectTo="/settings">
                                <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
                                  <Suspense fallback={<LinearProgress />}>
                                    <SkudSettingsPage />
                                  </Suspense>
                                </ProtectedRoute>
                              </LegacyRouteGuard>
                            )
                          }
                        />
                        <Route
                          path="settings/diagnoses"
                          element={
                            <LegacyRouteGuard title="Диагнозы в разработке">
                              <ProtectedRoute allowedRoles={['superadmin', 'doctor']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <DiagnosesPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="settings/notifications"
                          element={
                            <LegacyRouteGuard title="Уведомления в разработке">
                              <ProtectedRoute allowedRoles={['superadmin']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <NotificationSettingsPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        <Route
                          path="admin/load"
                          element={
                            <LegacyRouteGuard title="Нагрузка в разработке">
                              <ProtectedRoute allowedRoles={['superadmin']}>
                                <Suspense fallback={<LinearProgress />}>
                                  <LoadAnalyticsPage />
                                </Suspense>
                              </ProtectedRoute>
                            </LegacyRouteGuard>
                          }
                        />
                        {IS_DJANGO_BACKEND && (
                          <>
                            <Route
                              path="appointments"
                              element={
                                <RequirePermission permission="appointments.view">
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
                                <RequirePermission permission="organization.view">
                                  <Suspense fallback={<LinearProgress />}>
                                    <OrganizationSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/branches"
                              element={
                                <RequirePermission permission="branches.view">
                                  <Suspense fallback={<LinearProgress />}>
                                    <BranchesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/roles"
                              element={
                                <RequirePermission permission="rbac.roles.view">
                                  <Suspense fallback={<LinearProgress />}>
                                    <RolesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/memberships"
                              element={
                                <RequirePermission permission="rbac.memberships.view">
                                  <Suspense fallback={<LinearProgress />}>
                                    <MembershipsSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="settings/expense-categories"
                              element={
                                <RequirePermission permission="finance.expense.manage">
                                  <Suspense fallback={<LinearProgress />}>
                                    <ExpenseCategoriesSettingsPage />
                                  </Suspense>
                                </RequirePermission>
                              }
                            />
                          </>
                        )}
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
                            <Suspense fallback={<LinearProgress />}>
                              <ConclusionPrintPage />
                            </Suspense>
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
                        element={<UpdatePasswordPage />}
                      />
                      <Route
                        element={
                          <ClientSessionProvider>
                            <Outlet />
                          </ClientSessionProvider>
                        }
                      >
                        <Route
                          path="auth/callback"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <AuthCallbackPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="sso"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <SsoPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="client/login"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <ClientLoginPage />
                            </Suspense>
                          }
                        />
                        <Route
                          path="client/profile"
                          element={
                            <Suspense fallback={<LinearProgress />}>
                              <ClientProfilePage />
                            </Suspense>
                          }
                        />
                      </Route>
                    </Routes>

                    <AuthHelper />
                    <DjangoQueryCacheReset />
                    <CallNotification />
                    <RefineKbar />
                    <UnsavedChangesNotifier />
                    <DocumentTitleHandler
                      handler={(options) => {
                        const baseTitle = "Мама Доктор";
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
              <ThemeCustomizerFab />
            </RefreshProvider>
          </ColorModeContextProvider>
        </TitleProvider>
      </PageCacheProvider>
    </RefineKbarProvider>
  );
}

export default App;
