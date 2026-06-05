import { useList } from "@refinedev/core";
import React from "react";
import {
  Box,
  Typography,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Button,
} from "@mui/material";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { usePageTitle } from "../../hooks/usePageTitle";

import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import ViewModuleOutlined from "@mui/icons-material/ViewModuleOutlined";

import EmployeeList from "./components/EmployeeList";
import EmployeeCard from "./components/EmployeeCard";
import AddEmployeeDrawer from "./components/AddEmployeeDrawer";
import EditEmployeeDrawer from "./components/EditEmployeeDrawer";
import DeleteEmployeeDialog from "./components/DeleteEmployeeDialog";
import OnboardEmployeeDrawer from "./components/OnboardEmployeeDrawer";
import EmployeeServicesDrawer from "./components/EmployeeServicesDrawer";
import { useEmployeesPageState } from "./hooks/useEmployeesPage";
import { fetchServices, type ServiceRow as ServiceDto } from "../../services/services";
import { AppBottomSheet, PageHeader } from "../../components/ui";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import type { OnboardEmployeeResponse } from "../../api/staff";

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

  const { canManageEmployees, isAdmin } = usePermissions();

  // Права для кнопки онбординга (хуки вызываются безусловно)
  const canStaffCreate = useCan("staff.create");
  const canMembershipsCreate = useCan("rbac.memberships.create");
  const canMembershipsUpdate = useCan("rbac.memberships.update");
  const canOnboard =
    IS_DJANGO_BACKEND &&
    canStaffCreate &&
    (canMembershipsCreate || canMembershipsUpdate);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Загружаем услуги для отображения в карточке
  const [allServices, setAllServices] = React.useState<ServiceDto[]>([]);

  // In Django-mode, roles come from Django RBAC API — not from Refine dataProvider.
  const { result: rolesData } = useList({
    resource: "roles",
    queryOptions: { enabled: !IS_DJANGO_BACKEND },
  });
  const roles = rolesData?.data || [];

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchServices();
        if (!cancelled) setAllServices(items);
      } catch (e) {
        console.error("Fetch services error:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
        onAdd={canManageEmployees() ? () => state.setAddOpen(true) : undefined}
        showSearch
        searchVal={state.q}
        onSearchChange={(v) => state.setQ(v)}
        actions={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {canOnboard && (
              <Tooltip title="Создать сотрудника с аккаунтом и членством">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PersonAddOutlined />}
                  onClick={() => setOnboardOpen(true)}
                  sx={{ height: 40, whiteSpace: "nowrap" }}
                >
                  {isMobile ? "" : "Создать сотрудника"}
                </Button>
              </Tooltip>
            )}
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
                    "&:hover": {
                      bgcolor: "primary.dark",
                    },
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
          </Box>
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

        {/* --- ГРИД С КОЛОНКАМИ --- */}
        <Grid container spacing={2} sx={{ flex: 1, minHeight: 0, height: 0, overflow: "hidden" }}>

          {/* ЛЕВАЯ КОЛОННА (Список) */}
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
                onEdit={canManageEmployees() ? (e) => state.setEditOpen(e) : undefined}
                onDelete={isAdmin() && canManageEmployees() ? (e) => state.setDeleteOpen(e) : undefined}
                onOpenServices={
                  IS_DJANGO_BACKEND
                    ? (e) => {
                        const id = typeof e.id === "number" ? e.id : Number(e.id);
                        if (!isNaN(id)) openServicesDrawer(id, e.full_name);
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

          {/* ПРАВАЯ КОЛОННА (Карточка) - Скрыта на мобильных */}
          {!isMobile && (
            <Grid
              item
              xs={12}
              md={6}
              sx={{
                height: {
                  md: "100%",
                },
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

      {/* --- BOTTOM SHEET (Мобильная карточка) --- */}
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

      {/* --- ДИАЛОГИ ДЕЙСТВИЙ --- */}
      {IS_DJANGO_BACKEND && servicesDrawer.employeeId > 0 && (
        <EmployeeServicesDrawer
          open={servicesDrawer.open}
          onClose={closeServicesDrawer}
          employeeId={servicesDrawer.employeeId}
          employeeName={servicesDrawer.employeeName}
        />
      )}
      {IS_DJANGO_BACKEND && (
        <OnboardEmployeeDrawer
          open={onboardOpen}
          onClose={() => setOnboardOpen(false)}
          onCreated={(_res: OnboardEmployeeResponse) => {
            // Сбрасываем поиск, чтобы список обновился при следующем открытии
            state.setQ("");
          }}
        />
      )}
      <AddEmployeeDrawer
        open={state.addOpen}
        onClose={() => state.setAddOpen(false)}
        onCreated={(rec) => state.setItems((pr) => [rec, ...pr])}
      />
      <EditEmployeeDrawer
        record={state.editOpen}
        onClose={() => state.setEditOpen(null)}
        onUpdated={(rec) => {
          state.setItems((pr) => pr.map((x) => (x.id === rec.id ? rec : x)));
          if (state.detailsOpen && state.detailsOpen.id === rec.id) {
            state.setDetailsOpen(rec);
          }
        }}
      />
      <DeleteEmployeeDialog
        record={state.deleteOpen}
        onClose={() => state.setDeleteOpen(null)}
        onDeleted={(id) => state.setItems((pr) => pr.filter((x) => x.id !== id))}
      />
    </Box>
  );
};

export default EmployeesPage;
