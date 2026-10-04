import React from "react";
import { Alert, Box, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useCan } from "../../hooks/useCan";
import { getDoctorProfit } from "../../api/doctorProfit";
import { getActiveMonths } from "../../api/reports";
import { parseBackendError } from "../../api/appointments";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { MonthNavigation, PageHeader } from "../../components/ui";
import { formatKGS } from "../../utility/format";

import { ProfitKpiTiles } from "./ProfitKpiTiles";
import { ProfitTable } from "./ProfitTable";
import { OverheadBreakdown } from "./OverheadBreakdown";
import { FixedCostsDialog } from "./FixedCostsDialog";
import { toNumber } from "./profitRows";

/**
 * «Прибыль по врачам» за месяц: выручка врача, прямые расходы (начисленная
 * ЗП + себестоимость) и доля общих расходов клиники по часам. Считает бэкенд
 * (`/reports/doctor-profit/`), страница только показывает.
 */
export const DoctorProfitPage: React.FC = () => {
  usePageTitle("Прибыль по врачам");
  const theme = useTheme();
  const { isSuperAdmin, activeOrganization, activeBranch } = usePermissions();
  // Месяцы с данными отдаёт общий отчёт — подсветка только при его праве.
  const canSeeMonths = useCan("reports.view");
  const canManageFixed = useCan("reports.fixed_costs.manage");

  const [selectedDate, setSelectedDate] = React.useState<string>(() => dayjs().format("YYYY-MM-DD"));
  const [fixedOpen, setFixedOpen] = React.useState(false);
  const month = dayjs(selectedDate).format("YYYY-MM");

  const isSuper = isSuperAdmin();
  const needsOrg = isSuper && !activeOrganization;
  const organizationId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const branchId = activeBranch?.id ?? undefined;

  const query = useQuery({
    queryKey: djangoQueryKeys.reports.doctorProfit({ month, branchId, organizationId }),
    queryFn: ({ signal }) => getDoctorProfit({ month, branchId, organizationId }, signal),
    enabled: !needsOrg,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const monthsQuery = useQuery({
    queryKey: djangoQueryKeys.reports.activeMonths(activeOrganization?.id ?? null),
    queryFn: ({ signal }) => getActiveMonths({ organizationId: activeOrganization?.id ?? undefined }, signal),
    enabled: !needsOrg && canSeeMonths,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const activeMonths = React.useMemo(
    () => (monthsQuery.data ? new Set(monthsQuery.data.months) : null),
    [monthsQuery.data],
  );

  const data = query.data;
  const warnings = data?.warnings;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Прибыль по врачам"
        showTitle={false}
        showSearch={false}
        dateNavigation={<MonthNavigation date={selectedDate} setDate={setSelectedDate} activeMonths={activeMonths} />}
      />
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          px: theme.appLayout.page.paddingX,
          py: 2,
        }}
      >
        {needsOrg ? (
          <Alert severity="info">Выберите организацию, чтобы увидеть отчёт.</Alert>
        ) : query.isError ? (
          <Alert severity="error">{parseBackendError(query.error)}</Alert>
        ) : !data ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {warnings && warnings.productsWithoutCostCount > 0 && (
              <Alert severity="warning">
                У {warnings.productsWithoutCostCount} товаров нет закупочной цены — их себестоимость посчитана как 0, и
                прибыль завышена (продано таких на {formatKGS(warnings.salesWithoutCost)}).{" "}
                <Tooltip title={warnings.productsWithoutCost.join(", ")} arrow>
                  <Box component="span" sx={{ textDecoration: "underline dotted", cursor: "help" }}>
                    Какие товары
                  </Box>
                </Tooltip>
                . Цена вносится в карточке товара или приходом на склад.
              </Alert>
            )}
            {warnings && warnings.employeesWithoutSchedule > 0 && (
              <Alert severity="info">
                У {warnings.employeesWithoutSchedule} врачей нет графика на этот месяц — их часы для раздела общих
                расходов взяты по времени приёмов.
              </Alert>
            )}

            <ProfitKpiTiles totals={data.totals} />

            {data.rows.length === 0 ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  За этот месяц нет приёмов{toNumber(data.totals.overhead) > 0 ? ", а общие расходы есть" : ""}.
                </Typography>
              </Stack>
            ) : (
              <ProfitTable rows={data.rows} totals={data.totals} />
            )}

            <OverheadBreakdown
              overhead={data.overhead}
              branchSelected={branchId != null}
              onEditFixed={() => setFixedOpen(true)}
            />
          </>
        )}
      </Box>

      <FixedCostsDialog
        open={fixedOpen}
        onClose={() => setFixedOpen(false)}
        month={month}
        branchId={branchId}
        organizationId={organizationId}
        branchesOrgId={activeOrganization?.id ?? undefined}
        canManage={canManageFixed}
      />
    </Box>
  );
};

export default DoctorProfitPage;
