import React from "react";
import { Alert, Box, Pagination, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import AssignmentIndOutlined from "@mui/icons-material/AssignmentIndOutlined";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  getRegistry,
  setOnboardingCompleted,
  type RegistryParams,
  type RegistryRow,
  type RegistryTab,
} from "../../api/registry";
import { AppButton, AppCard, ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../../components/ui";
import { useActiveScope } from "../../hooks/useActiveScope";
import { useCanChecker } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useT } from "../../i18n/VerticalProvider";
import DjangoAddAppointmentDrawer from "../appointments/DjangoAddAppointmentDrawer";
import { CancelEnrollmentDialog } from "./dialogs/CancelEnrollmentDialog";
import { ChangeDoctorDialog } from "./dialogs/ChangeDoctorDialog";
import { InteractionDialog } from "./dialogs/InteractionDialog";
import { PayDialog } from "./dialogs/PayDialog";
import { RenewDialog } from "./dialogs/RenewDialog";
import { targetFromRow } from "./enrollmentTarget";
import { IntakeWizard } from "./intake/IntakeWizard";
import { RegistryFilters, type RegistryFilterValues } from "./RegistryFilters";
import { RegistryTable, type RowAction } from "./RegistryTable";
import { REGISTRY_TABS, tabLabelKey } from "./registryTabs";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type DialogAction = Exclude<RowAction, "openBook" | "markExamined" | "unmarkExamined">;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * «Учёт» — дети на сопровождении по учётным программам. Вкладки отвечают
 * на вопросы регистратуры: кто ждёт первичного осмотра, у кого не оплачено,
 * у кого истекает срок, кого сняли.
 */
const RegistryPage: React.FC = () => {
  const { t } = useT("registry");
  usePageTitle(t("page.title"));
  const scope = useActiveScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const canManage = can("enrollments.manage");
  const [tab, setTab] = React.useState<RegistryTab>("active");
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState<RegistryFilterValues>({ q: "", mine: false });
  const [dialog, setDialog] = React.useState<{ action: DialogAction; row: RegistryRow } | null>(null);
  const [intakeOpen, setIntakeOpen] = React.useState(false);
  const search = useDebounced(filters.q.trim(), SEARCH_DEBOUNCE_MS);

  const params: RegistryParams = {
    tab,
    branchId: filters.branchId,
    employeeId: filters.mine ? undefined : filters.employeeId,
    programId: filters.programId,
    ageFromMonths: filters.ageFromMonths,
    ageToMonths: filters.ageToMonths,
    q: search || undefined,
    mine: filters.mine,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: djangoQueryKeys.programs.registry(scope, params),
    queryFn: ({ signal }) => getRegistry(scope, params, signal),
    enabled: scope.isReady && scope.orgReady,
    placeholderData: keepPreviousData,
  });

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["django", "programs"] });
  }, [queryClient]);
  const closeDialog = () => setDialog(null);
  const doneDialog = () => {
    setDialog(null);
    refresh();
  };

  const onboarding = useMutation({
    mutationFn: ({ row, completed }: { row: RegistryRow; completed: boolean }) =>
      setOnboardingCompleted(scope, row.enrollmentId, completed),
    onSuccess: (_, { completed }) => {
      enqueueSnackbar(t(completed ? "onboarding.done" : "onboarding.undone"), { variant: "success" });
      refresh();
    },
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: "error" }),
  });

  const onAction = (action: RowAction, row: RegistryRow) => {
    if (action === "openBook") {
      navigate(`/patients/${row.patient.id}/program`);
      return;
    }
    if (action === "markExamined" || action === "unmarkExamined") {
      onboarding.mutate({ row, completed: action === "markExamined" });
      return;
    }
    setDialog({ action, row });
  };

  const counts = query.data?.counts;
  const total = query.data?.count ?? 0;
  const target = dialog ? targetFromRow(dialog.row) : null;

  return (
    <Box sx={{ px: (theme) => theme.appLayout.page.paddingX, pb: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        gap={1.5}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t("page.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("page.subtitle")}
          </Typography>
        </Box>
        {canManage && (
          <AppButton variant="contained" startIcon={<AddOutlined />} onClick={() => setIntakeOpen(true)}>
            {t("page.intake")}
          </AppButton>
        )}
      </Stack>
      <Stack gap={1.5}>
        <SegmentedTabs
          layoutId="registry-tabs"
          value={tab}
          onChange={(key) => {
            setTab(key);
            setPage(1);
          }}
          tabs={REGISTRY_TABS.map((key) => ({ key, label: t(tabLabelKey(key)), badge: counts?.[key] }))}
        />
        <RegistryFilters
          scope={scope}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
        <AppCard variant="outlined" sx={{ p: { xs: 1, md: 0 } }}>
          {query.error ? (
            <Alert severity="error">{t("errors.load")}</Alert>
          ) : query.isLoading ? (
            <ListLoadingSkeleton />
          ) : !query.data?.results.length ? (
            <ListEmptyState icon={<AssignmentIndOutlined />} title={t("page.empty")} />
          ) : (
            <RegistryTable rows={query.data.results} canManage={canManage} onAction={onAction} />
          )}
          {total > PAGE_SIZE && (
            <Pagination
              sx={{ p: 1.5 }}
              page={page}
              count={Math.ceil(total / PAGE_SIZE)}
              onChange={(_, value) => setPage(value)}
            />
          )}
        </AppCard>
      </Stack>

      <IntakeWizard
        open={intakeOpen}
        scope={scope}
        onClose={() => setIntakeOpen(false)}
        onDone={() => {
          setIntakeOpen(false);
          refresh();
        }}
      />
      {dialog && target && dialog.action === "pay" && (
        <PayDialog open scope={scope} target={target} onClose={closeDialog} onDone={doneDialog} />
      )}
      {dialog && target && dialog.action === "renew" && (
        <RenewDialog open scope={scope} target={target} onClose={closeDialog} onDone={doneDialog} />
      )}
      {dialog && target && dialog.action === "changeDoctor" && (
        <ChangeDoctorDialog open scope={scope} target={target} onClose={closeDialog} onDone={doneDialog} />
      )}
      {dialog && target && dialog.action === "call" && (
        <InteractionDialog open scope={scope} target={target} onClose={closeDialog} onDone={doneDialog} />
      )}
      {dialog && dialog.action === "cancel" && (
        <CancelEnrollmentDialog
          open
          scope={scope}
          enrollmentId={dialog.row.enrollmentId}
          patientName={dialog.row.patient.fullName}
          onClose={closeDialog}
          onDone={doneDialog}
        />
      )}
      {dialog && dialog.action === "book" && (
        <DjangoAddAppointmentDrawer
          open
          onClose={closeDialog}
          initialPatientId={dialog.row.patient.id}
          initialEmployeeId={dialog.row.responsibleEmployee?.id ?? null}
          onCreated={doneDialog}
        />
      )}
    </Box>
  );
};

export default RegistryPage;
