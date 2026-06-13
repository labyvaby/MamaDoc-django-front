import { useList } from "@refinedev/core";
import React from "react";
import {
  Box,
  Typography,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { usePageTitle } from "../../hooks/usePageTitle";

import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import ViewModuleOutlined from "@mui/icons-material/ViewModuleOutlined";

import EmployeeList from "./components/EmployeeList";
import EmployeeCard from "./components/EmployeeCard";
import OnboardEmployeeDrawer from "./components/OnboardEmployeeDrawer";
import EmployeeServicesDrawer from "./components/EmployeeServicesDrawer";
import DjangoSalaryRulesDrawer from "./components/DjangoSalaryRulesDrawer";
import DjangoEditEmployeeDrawer from "./components/DjangoEditEmployeeDrawer";
import DjangoFireEmployeeDialog from "./components/DjangoFireEmployeeDialog";
import { useEmployeesPageState } from "./hooks/useEmployeesPage";
import { fetchServices, type ServiceRow as ServiceDto } from "../../services/services";
import { AppBottomSheet, PageHeader } from "../../components/ui";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import type { EmployesRow } from "./types";

// Supabase-only drawers — imported lazily so they don't pull Supabase into
// the Django bundle. In Django mode they are never rendered.
const AddEmployeeDrawer = React.lazy(
  () => import("./components/AddEmployeeDrawer"),
);
const EditEmployeeDrawer = React.lazy(
  () => import("./components/EditEmployeeDrawer"),
);
const DeleteEmployeeDialog = React.lazy(
  () => import("./components/DeleteEmployeeDialog"),
);

const EmployeesPage: React.FC = () => {
  usePageTitle("Сотрудники");
  const state = useEmployeesPageState();
  const [isGrouped, setIsGrouped] = React.useState(true);
  const [onboardOpen, setOnboardOpen] = React.useState(false);
  const [servicesDrawer, setServicesDrawer] = React.useState<{
    open: boolean;
    employeeId: number;
    employeeName: string;
  }>({ open: false, employeeId: 0, employeeName: "" });

  const openServicesDrawer = React.useCallback(
    (id: number, name: string) =>
      setServicesDrawer({ open: true, employeeId: id, employeeName: name }),
    [],
  );
  const closeServicesDrawer = React.useCallback(
    () => setServicesDrawer((s) => ({ ...s, open: false })),
    [],
  );

  const [salaryDrawer, setSalaryDrawer] = React.useState<{
    open: boolean;
    employeeId: number;
    employeeName: string;
  }>({ open: false, employeeId: 0, employeeName: "" });
  const openSalaryDrawer = React.useCallback(
    (id: number, name: string) =>
      setSalaryDrawer({ open: true, employeeId: id, employeeName: name }),
    [],
  );
  const closeSalaryDrawer = React.useCallback(
    () => setSalaryDrawer((s) => ({ ...s, open: false })),
    [],
  );

  const { canManageEmployees, isAdmin } = usePermissions();

  // Django RBAC permissions
  const canStaffView = useCan("staff.view");
  const canStaffCreate = useCan("staff.create");
  const canStaffUpdate = useCan("staff.update");
  const canStaffDelete = useCan("staff.delete"); // "уволить"
  const canMembershipsCreate = useCan("rbac.memberships.create");
  const canMembershipsUpdate = useCan("rbac.memberships.update");
  const canPayrollView = useCan("payroll.view");

  const canOnboard =
    IS_DJANGO_BACKEND && canStaffCreate && (canMembershipsCreate || canMembershipsUpdate);
  const canEdit = IS_DJANGO_BACKEND ? canStaffUpdate : canManageEmployees();
  const canFire = IS_DJANGO_BACKEND ? canStaffDelete : isAdmin() && canManageEmployees();
  // Django: «Добавить сотрудника» открывает OnboardEmployeeDrawer
  const handleAddClick = IS_DJANGO_BACKEND
    ? (canOnboard ? () => setOnboardOpen(true) : undefined)
    : (canManageEmployees() ? () => state.setAddOpen(true) : undefined);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const [allServices, setAllServices] = React.useState<ServiceDto[]>([]);

  // Supabase-only: roles via Refine (disabled in Django mode)
  const { result: rolesData } = useList({
    resource: "roles",
    queryOptions: { enabled: !IS_DJANGO_BACKEND },
  });
  const roles = rolesData?.data || [];

  React.useEffect(() => {
    if (IS_DJANGO_BACKEND) return; // Django карточка не нужен внешний список услуг
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchServices();
        if (!cancelled) setAllServices(items);
      } catch (e) {
        console.error("Fetch services error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Guard: в Django-режиме нужен staff.view
  if (IS_DJANGO_BACKEND && !canStaffView) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          У вас нет прав на просмотр сотрудников
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* --- ШАПКА --- */}
      <PageHeader
        title="Сотрудники"
        showTitle={false}
        addButtonText="Добавить сотрудника"
        onAdd={handleAddClick}
        showSearch
        searchVal={state.q}
        onSearchChange={(v) => state.setQ(v)}
        actions={
          <ToggleButtonGroup
            size="small"
            value={isGrouped}
            exclusive
            onChange={(_, val) => val !== null && setIsGrouped(val)}
            sx={{
              height: 40,
              bgcolor: "background.paper",
              "& .MuiToggleButton-root": {
                px: 2,
                borderColor: "divider",
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "white",
                  "&:hover": { bgcolor: "primary.dark" },
                },
              },
            }}
          >
            <Tooltip title="Группировать по ролям">
              <ToggleButton value={true}>
                <GroupsOutlined fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip title="Список">
              <ToggleButton value={false}>
                <ViewModuleOutlined fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        }
      />

      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pb: theme.appLayout.page.paddingY,
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        })}
      >
        <Grid
          container
          spacing={2}
          sx={{ flex: 1, minHeight: 0, height: 0, overflow: "hidden" }}
        >
          {/* Левая колонна — список */}
          <Grid
            item
            xs={12}
            md={6}
            sx={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5 }}>
              <EmployeeList
                items={state.filtered}
                onSelect={(e) => state.setDetailsOpen(e)}
                onEdit={canEdit ? (e) => state.setEditOpen(e) : undefined}
                onDelete={canFire ? (e) => state.setDeleteOpen(e) : undefined}
                onOpenServices={
                  IS_DJANGO_BACKEND
                    ? (e) => {
                        const id =
                          typeof e.id === "number" ? e.id : Number(e.id);
                        if (!isNaN(id)) openServicesDrawer(id, e.full_name);
                      }
                    : undefined
                }
                onOpenSalaryRules={
                  IS_DJANGO_BACKEND && canPayrollView
                    ? (e) => {
                        const id =
                          typeof e.id === "number" ? e.id : Number(e.id);
                        if (!isNaN(id)) openSalaryDrawer(id, e.full_name);
                      }
                    : undefined
                }
                listRef={listRef}
                onScroll={state.loadMore}
                loading={state.loading}
                hasMore={state.hasMore}
                loadingMore={state.loadingMore}
                isGrouped={isGrouped}
                roles={roles}
              />
            </Box>
          </Grid>

          {/* Правая колонна — карточка (скрыта на мобильных) */}
          {!isMobile && (
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                height: { md: "100%" },
                display: "flex",
                flexDirection: "column",
                overflow: { xs: "visible", md: "hidden" },
              }}
            >
              <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5 }}>
                {state.detailsOpen ? (
                  <EmployeeCard
                    emp={state.detailsOpen}
                    allServices={allServices}
                    onOpenServices={
                      IS_DJANGO_BACKEND
                        ? (id, name) => openServicesDrawer(id, name)
                        : undefined
                    }
                  />
                ) : (
                  <Box
                    sx={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px dashed",
                      borderColor: "divider",
                      borderRadius: 1,
                      color: "text.secondary",
                    }}
                  >
                    <Typography>Выберите сотрудника для просмотра</Typography>
                  </Box>
                )}
              </Box>
            </Grid>
          )}
        </Grid>
      </Box>

      {/* --- BOTTOM SHEET (мобильная карточка) --- */}
      {isMobile && (
        <AppBottomSheet
          open={Boolean(state.detailsOpen)}
          onClose={() => state.setDetailsOpen(null)}
        >
          <Box sx={{ p: 2 }}>
            <EmployeeCard
              emp={state.detailsOpen}
              allServices={allServices}
              onOpenServices={
                IS_DJANGO_BACKEND
                  ? (id, name) => openServicesDrawer(id, name)
                  : undefined
              }
            />
          </Box>
        </AppBottomSheet>
      )}

      {/* --- DJANGO: Services drawer --- */}
      {IS_DJANGO_BACKEND && servicesDrawer.employeeId > 0 && (
        <EmployeeServicesDrawer
          open={servicesDrawer.open}
          onClose={closeServicesDrawer}
          employeeId={servicesDrawer.employeeId}
          employeeName={servicesDrawer.employeeName}
        />
      )}

      {/* --- DJANGO: Salary rules drawer --- */}
      {IS_DJANGO_BACKEND && salaryDrawer.employeeId > 0 && (
        <DjangoSalaryRulesDrawer
          open={salaryDrawer.open}
          onClose={closeSalaryDrawer}
          employeeId={salaryDrawer.employeeId}
          employeeName={salaryDrawer.employeeName}
        />
      )}

      {/* --- DJANGO: Onboard drawer --- */}
      {IS_DJANGO_BACKEND && (
        <OnboardEmployeeDrawer
          open={onboardOpen}
          onClose={() => setOnboardOpen(false)}
          onCreated={(row: EmployesRow) => {
            state.setItems((prev) => [row, ...prev]);
          }}
        />
      )}

      {/* --- DJANGO: Edit drawer --- */}
      {IS_DJANGO_BACKEND && (
        <DjangoEditEmployeeDrawer
          record={state.editOpen}
          onClose={() => state.setEditOpen(null)}
          onUpdated={(updated) => {
            state.setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? updated : x)),
            );
            if (state.detailsOpen?.id === updated.id) {
              state.setDetailsOpen(updated);
            }
          }}
        />
      )}

      {/* --- DJANGO: Fire dialog --- */}
      {IS_DJANGO_BACKEND && (
        <DjangoFireEmployeeDialog
          record={state.deleteOpen}
          onClose={() => state.setDeleteOpen(null)}
          onFired={(id) => {
            // Update status to "fired" in list rather than removing
            state.setItems((prev) =>
              prev.map((x) =>
                x.id === id ? { ...x, status: "fired" } : x,
              ),
            );
            if (state.detailsOpen?.id === id) {
              state.setDetailsOpen((prev) =>
                prev ? { ...prev, status: "fired" } : prev,
              );
            }
            state.setDeleteOpen(null);
          }}
        />
      )}

      {/* --- SUPABASE: Legacy drawers (not rendered in Django mode) --- */}
      {!IS_DJANGO_BACKEND && (
        <React.Suspense fallback={null}>
          <AddEmployeeDrawer
            open={state.addOpen}
            onClose={() => state.setAddOpen(false)}
            onCreated={(rec) => state.setItems((pr) => [rec, ...pr])}
          />
          <EditEmployeeDrawer
            record={state.editOpen}
            onClose={() => state.setEditOpen(null)}
            onUpdated={(rec) => {
              state.setItems((pr) =>
                pr.map((x) => (x.id === rec.id ? rec : x)),
              );
              if (state.detailsOpen?.id === rec.id) {
                state.setDetailsOpen(rec);
              }
            }}
          />
          <DeleteEmployeeDialog
            record={state.deleteOpen}
            onClose={() => state.setDeleteOpen(null)}
            onDeleted={(id) =>
              state.setItems((pr) => pr.filter((x) => x.id !== id))
            }
          />
        </React.Suspense>
      )}
    </Box>
  );
};

export default EmployeesPage;
