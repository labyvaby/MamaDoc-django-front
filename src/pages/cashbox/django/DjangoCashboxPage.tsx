import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Divider,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { PageHeader } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import {
  getCashboxSummary,
  getCashboxEntries,
  parseBackendError,
  type CashboxEntryType,
} from "../../../api/cashbox";
import { getBranches } from "../../../api/organization";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { ApiError } from "../../../api/client";

import CashboxFiltersBar, {
  initialFilterState,
  filtersToApiParams,
  type FilterState,
} from "./CashboxFiltersBar";
import CashboxSummaryPanel from "./CashboxSummaryPanel";
import CashboxEntriesTable, { PAGE_SIZE } from "./CashboxEntriesTable";
import ExpensesPanel from "./expenses/ExpensesPanel";

// ── Component ─────────────────────────────────────────────────────────────────

type TabValue = CashboxEntryType | "expenses-manage";

const DjangoCashboxPage: React.FC = () => {
  usePageTitle("Касса");
  const canView = useCan("finance.view");
  const canManageExpenses = useCan("finance.expense.manage");
  const { isSuperAdmin, activeOrganization, memberships, loading: permLoading } = usePermissions();
  const isSuper = isSuperAdmin();

  // Multi-org: user has memberships in more than one organization
  const isMultiOrg = (memberships ?? []).length > 1;
  // organizationId required for: superuser or multi-org user
  const orgRequired = isSuper || isMultiOrg;
  // The org id to include in expense create payloads (undefined for single-org regular users)
  const orgIdForExpenses = orgRequired ? (activeOrganization?.id ?? undefined) : undefined;
  // Block expense creation if org is required but not selected
  const expenseNeedsOrg = orgRequired && !activeOrganization;

  const [filters, setFilters] = React.useState<FilterState>(initialFilterState);
  const [tab, setTab] = React.useState<TabValue>("payment");
  const [paymentsPage, setPaymentsPage] = React.useState(1);
  const [refundsPage, setRefundsPage] = React.useState(1);
  const [expenseEntriesPage, setExpenseEntriesPage] = React.useState(1);

  // Reset branchId and pages when org changes
  const prevOrgIdRef = React.useRef<number | null | undefined>(activeOrganization?.id);
  React.useEffect(() => {
    if (prevOrgIdRef.current !== activeOrganization?.id) {
      prevOrgIdRef.current = activeOrganization?.id;
      setFilters((f) => ({ ...f, branchId: "" }));
      setPaymentsPage(1);
      setRefundsPage(1);
      setExpenseEntriesPage(1);
    }
  }, [activeOrganization?.id]);

  const handleFiltersChange = React.useCallback((next: FilterState) => {
    setFilters(next);
    setPaymentsPage(1);
    setRefundsPage(1);
    setExpenseEntriesPage(1);
  }, []);

  // Build shared API params — null when range is invalid
  const apiParams = React.useMemo(() => {
    const base = filtersToApiParams(filters);
    const rangeInvalid =
      base.dateFrom && base.dateTo
        ? new Date(base.dateFrom) > new Date(base.dateTo)
        : false;
    if (rangeInvalid) return null;
    return {
      ...base,
      organizationId: isSuper ? (activeOrganization?.id ?? undefined) : undefined,
    };
  }, [filters, isSuper, activeOrganization?.id]);

  const superNeedsOrg = isSuper && !activeOrganization;
  const queriesEnabled = !permLoading && canView && apiParams !== null && !superNeedsOrg;

  // ── Branches query ────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: djangoQueryKeys.organization.branches,
    queryFn: () => getBranches(),
    enabled: !permLoading && canView,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ((err as ApiError)?.status === 403) return false;
      return count < 1;
    },
  });
  const branches = (branchesQuery.data ?? []).map((b) => ({ id: b.id, name: b.name }));

  // ── Summary query ─────────────────────────────────────────────────────────
  const summaryKey = djangoQueryKeys.cashbox.summary(apiParams ?? { _invalid: true });
  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: ({ signal }) => getCashboxSummary(apiParams!, signal),
    enabled: queriesEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled ? 60_000 : false,
    retry: (count, err) => {
      const status = (err as ApiError)?.status;
      if (status === 400 || status === 403) return false;
      return count < 1;
    },
  });

  // ── Entries query (payment / refund / expense entries tab) ────────────────
  const isEntriesTab =
    tab === "payment" || tab === "refund" || tab === "expense";
  const currentEntriesEntryType = isEntriesTab ? (tab as CashboxEntryType) : "payment";
  const currentPage =
    tab === "payment"
      ? paymentsPage
      : tab === "refund"
        ? refundsPage
        : expenseEntriesPage;
  const setCurrentPage =
    tab === "payment"
      ? setPaymentsPage
      : tab === "refund"
        ? setRefundsPage
        : setExpenseEntriesPage;

  const entriesKey = djangoQueryKeys.cashbox.entries(currentEntriesEntryType, {
    ...(apiParams ?? { _invalid: true }),
    page: currentPage,
    pageSize: PAGE_SIZE,
  });
  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: ({ signal }) =>
      getCashboxEntries(
        {
          ...apiParams!,
          entryType: currentEntriesEntryType,
          page: currentPage,
          pageSize: PAGE_SIZE,
        },
        signal,
      ),
    enabled: queriesEnabled && isEntriesTab,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled && isEntriesTab ? 60_000 : false,
    retry: (count, err) => {
      const status = (err as ApiError)?.status;
      if (status === 400 || status === 403) return false;
      return count < 1;
    },
  });

  // ── Access denied ────────────────────────────────────────────────────────
  if (!permLoading && !canView) return <AccessDenied />;

  // ── Error states ──────────────────────────────────────────────────────────
  const is400 =
    (summaryQuery.error as ApiError)?.status === 400 ||
    (entriesQuery.error as ApiError)?.status === 400;

  const summaryError = summaryQuery.error ? parseBackendError(summaryQuery.error) : null;
  const entriesError = entriesQuery.error ? parseBackendError(entriesQuery.error) : null;

  // ── Derived values for ExpensesPanel ─────────────────────────────────────
  const expenseFilters = apiParams
    ? {
        // Use orgIdForExpenses (multi-org aware) instead of apiParams.organizationId
        organizationId: orgIdForExpenses,
        branchId: apiParams.branchId,
        dateFrom: apiParams.dateFrom,
        dateTo: apiParams.dateTo,
      }
    : null;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 1200, mx: "auto" }}>
      <PageHeader title="Касса" />

      <Stack spacing={2.5} mt={2}>
        {/* Filters */}
        <CashboxFiltersBar
          value={filters}
          branches={branches}
          onChange={handleFiltersChange}
        />

        {superNeedsOrg && (
          <Alert severity="info">
            Выберите организацию в контексте, чтобы просмотреть данные кассы.
          </Alert>
        )}

        {apiParams === null && (
          <Alert severity="warning">Некорректный диапазон дат — начальная дата позже конечной.</Alert>
        )}

        {is400 && !superNeedsOrg && (
          <Alert severity="error">{summaryError ?? entriesError}</Alert>
        )}

        {!superNeedsOrg && apiParams !== null && !is400 && (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ md: "flex-start" }}
          >
            {/* Summary panel */}
            <Box sx={{ width: { xs: "100%", md: 260 }, flexShrink: 0 }}>
              {summaryError && !is400 && (
                <Alert severity="warning" sx={{ mb: 1, py: 0.5 }}>{summaryError}</Alert>
              )}
              <CashboxSummaryPanel
                summary={summaryQuery.data}
                isLoading={summaryQuery.isLoading}
                isFetching={summaryQuery.isFetching}
              />
            </Box>

            <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />
            <Divider sx={{ display: { xs: "block", md: "none" } }} />

            {/* Right: tabs + content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v as TabValue)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{ mb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
              >
                <Tab
                  value="payment"
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>Платежи</span>
                      {summaryQuery.data && (
                        <Typography variant="caption" color="text.secondary">
                          ({summaryQuery.data.paymentCount})
                        </Typography>
                      )}
                    </Stack>
                  }
                />
                <Tab
                  value="refund"
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>Возвраты</span>
                      {summaryQuery.data && summaryQuery.data.refundCount > 0 && (
                        <Typography variant="caption" color="error.main">
                          ({summaryQuery.data.refundCount})
                        </Typography>
                      )}
                    </Stack>
                  }
                />
                <Tab
                  value="expense"
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span>Расходы (записи)</span>
                      {summaryQuery.data && summaryQuery.data.expenseCount > 0 && (
                        <Typography variant="caption" color="error.main">
                          ({summaryQuery.data.expenseCount})
                        </Typography>
                      )}
                    </Stack>
                  }
                />
                {canManageExpenses && (
                  <Tab value="expenses-manage" label="Управление расходами" />
                )}
              </Tabs>

              {/* Entries: payment / refund / expense cashbox entries */}
              {isEntriesTab && (
                <>
                  {entriesError && !is400 && (
                    <Alert severity="warning" sx={{ mb: 1, py: 0.5 }}>{entriesError}</Alert>
                  )}
                  <CashboxEntriesTable
                    entryType={currentEntriesEntryType}
                    entries={entriesQuery.data?.results ?? []}
                    total={entriesQuery.data?.count ?? 0}
                    page={currentPage}
                    pageSize={PAGE_SIZE}
                    isLoading={entriesQuery.isLoading}
                    isFetching={entriesQuery.isFetching}
                    error={entriesError && !is400 ? entriesError : null}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}

              {/* Expenses management tab */}
              {tab === "expenses-manage" && expenseFilters && (
                <ExpensesPanel
                  organizationId={expenseFilters.organizationId}
                  branchId={expenseFilters.branchId}
                  dateFrom={expenseFilters.dateFrom}
                  dateTo={expenseFilters.dateTo}
                  branches={branches}
                  canManage={canManageExpenses}
                  queriesEnabled={queriesEnabled}
                  expenseNeedsOrg={expenseNeedsOrg}
                />
              )}
            </Box>
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default DjangoCashboxPage;
