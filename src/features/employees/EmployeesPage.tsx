import React from "react";
import {
  Box,
  Typography,
  Grid,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useT } from "../../i18n/VerticalProvider";

import EmployeeList from "./components/EmployeeList";
import EmployeeCard from "./components/EmployeeCard";
import OnboardEmployeeDrawer from "./components/OnboardEmployeeDrawer";
import EmployeeServicesDrawer from "./components/EmployeeServicesDrawer";
import DjangoEditEmployeeDrawer from "./components/DjangoEditEmployeeDrawer";
import DjangoFireEmployeeDialog from "./components/DjangoFireEmployeeDialog";
import DjangoRestoreEmployeeDialog from "./components/DjangoRestoreEmployeeDialog";
import { useEmployeesPageState } from "./hooks/useEmployeesPage";
import { mapDjangoFullToRow } from "./viewModel";
import type { DjangoEmployee } from "../../api/staff";
import { AppBottomSheet, PageHeader } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import type { EmployesRow } from "./types";

const EmployeesPage: React.FC = () => {
  const { t } = useT("employees");
  usePageTitle(t("page.title"));
  const state = useEmployeesPageState();
  const [onboardOpen, setOnboardOpen] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState<EmployesRow | null>(null);

  // После увольнения/восстановления бэк отдаёт свежую карточку — с журналом
  // «кем и когда». Кладём её целиком: правка одного status оставляла плашку
  // с датой прошлого увольнения, а услуги в карточке не перечитывались.
  const applyFreshEmployee = React.useCallback(
    (fresh: DjangoEmployee) => {
      const id = String(fresh.id);
      state.setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? { ...x, status: fresh.status, updated_at: fresh.updatedAt }
            : x,
        ),
      );
      if (state.detailsOpen?.id === id) {
        state.setDetailsOpen((prev) =>
          prev ? mapDjangoFullToRow(fresh, prev) : prev,
        );
      }
    },
    [state],
  );
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

  const canStaffView = useCan("staff.view");
  const canStaffCreate = useCan("staff.create");
  const canStaffUpdate = useCan("staff.update");
  const canStaffDelete = useCan("staff.delete"); // "уволить"

  // Кнопка «Создать» держится на одном праве домена — staff.create. Раньше к
  // нему добавлялось rbac.memberships.create/update, потому что онбординг
  // заводит ещё и членство. Это соглашение фронта, а не требование бэка, и
  // оно молча прятало кнопку у ролей, которым создание сотрудников выдали:
  // коды rbac.* режутся вдобавок модулем "rbac" (utils/moduleMapping), а он
  // включён не в каждой организации. Право на членство проверяет сам
  // POST /staff/employees/onboard/ — его отказ дровер показывает текстом.
  const canOnboard = canStaffCreate;
  const canEdit = canStaffUpdate;
  const canFire = canStaffDelete;
  const handleAddClick = canOnboard ? () => setOnboardOpen(true) : undefined;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const listRef = React.useRef<HTMLDivElement | null>(null);


  // Guard: в Django-режиме нужен staff.view
  if (!canStaffView) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          {t("page.noAccess")}
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
        title={t("page.title")}
        showTitle={false}
        addButtonText={t("page.addButton")}
        onAdd={handleAddClick}
        showSearch
        searchPlaceholder={t("page.searchPlaceholder")}
        searchVal={state.q}
        onSearchChange={(v) => state.setQ(v)}
      />

      <Box
        sx={(theme) => ({
          px: theme.appLayout.page.paddingX,
          pb: theme.appLayout.page.paddingY,
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        })}
      >
        <Grid
          container
          spacing={2}
          sx={{ flex: 1, minHeight: 0, height: "100%", overflow: "hidden" }}
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
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <EmployeeList
              items={state.filtered}
              onSelect={(e) => state.setDetailsOpen(e)}
              onEdit={canEdit ? (e) => state.setEditOpen(e) : undefined}
              onDelete={canFire ? (e) => state.setDeleteOpen(e) : undefined}
              onRestore={canFire ? (e) => setRestoreOpen(e) : undefined}
              listRef={listRef}
              onScroll={state.loadMore}
              loading={state.loading}
              hasMore={state.hasMore}
              loadingMore={state.loadingMore}
              isGrouped
              selectedId={state.detailsOpen?.id ?? null}
            />
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
                    onEdit={canEdit ? (e) => state.setEditOpen(e) : undefined}
                    onRestore={canFire ? (e) => setRestoreOpen(e) : undefined}
                    onOpenServices={
                      (id, name) => openServicesDrawer(id, name)
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
                    <Typography>{t("page.selectPrompt")}</Typography>
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
              onEdit={canEdit ? (e) => state.setEditOpen(e) : undefined}
              onRestore={canFire ? (e) => setRestoreOpen(e) : undefined}
              onOpenServices={
                (id, name) => openServicesDrawer(id, name)
              }
            />
          </Box>
        </AppBottomSheet>
      )}

      {servicesDrawer.employeeId > 0 && (
        <EmployeeServicesDrawer
          open={servicesDrawer.open}
          onClose={closeServicesDrawer}
          employeeId={servicesDrawer.employeeId}
          employeeName={servicesDrawer.employeeName}
          onChanged={(id) => {
            // Карточка перечитывает услуги при изменении updated_at — бампаем его,
            // чтобы изменения из «Управления услугами» отразились сразу.
            if (state.detailsOpen?.id === String(id)) {
              state.setDetailsOpen((prev) =>
                prev ? { ...prev, updated_at: new Date().toISOString() } : prev,
              );
            }
          }}
        />
      )}

      <OnboardEmployeeDrawer
          open={onboardOpen}
          onClose={() => setOnboardOpen(false)}
          onCreated={(row: EmployesRow) => {
            state.setItems((prev) => [row, ...prev]);
          }}
        />

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

      <DjangoFireEmployeeDialog
          record={state.deleteOpen}
          onClose={() => state.setDeleteOpen(null)}
          onFired={(fresh) => {
            // Строка остаётся в списке — меняется статус.
            applyFreshEmployee(fresh);
            state.setDeleteOpen(null);
          }}
        />

      <DjangoRestoreEmployeeDialog
          record={restoreOpen}
          onClose={() => setRestoreOpen(null)}
          onRestored={(fresh) => {
            applyFreshEmployee(fresh);
            setRestoreOpen(null);
          }}
        />

    </Box>
  );
};

export default EmployeesPage;
