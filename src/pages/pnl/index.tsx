import React from "react";
import { Alert, Box, CircularProgress, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useActiveScope } from "../../hooks/useActiveScope";
import { getPnlReport, type PnlParams } from "../../api/pnl";
import { EMPTY_REQUISITES, getOrganization } from "../../api/organization";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { parseBackendError } from "../../api/appointments";
import { downloadBlob } from "../../utility/download";
import { buildPnlXlsx } from "../../features/pnl/buildPnlXlsx";
import { buildForm2Xlsx } from "../../features/pnl/form2/buildForm2Xlsx";
import { buildKpis, buildWaterfall, DEFAULT_EXPANDED } from "../../features/pnl/model";
import { describeRange, periodFor, toApiDate, type PnlPeriod } from "../../features/pnl/period";

import { PnlHeader } from "./PnlHeader";
import { PnlHints } from "./PnlHints";
import { PnlKpiCards } from "./PnlKpiCards";
import { PnlTable } from "./PnlTable";
import { PnlWaterfall } from "./PnlWaterfall";

/** Страница «Прибыли и убытки» (спека docs/superpowers/specs/2026-10-04-pnl-report-design.md §7). */
export function PnlPage() {
  usePageTitle("Прибыли и убытки");
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const { activeOrganization, activeBranch, isSuperAdmin } = usePermissions();
  const scope = useActiveScope();
  const needsOrg = isSuperAdmin() && !activeOrganization;

  const [period, setPeriod] = React.useState<PnlPeriod>(() => periodFor("year", dayjs()));
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(DEFAULT_EXPANDED));
  const [exporting, setExporting] = React.useState<"excel" | "form2" | null>(null);

  const dateFrom = toApiDate(period.from);
  const dateTo = toApiDate(period.to);
  const params: PnlParams = {
    dateFrom,
    dateTo,
    branchId: scope.branchId,
    organizationId: scope.organizationId,
    compare: true,
  };
  const query = useQuery({
    queryKey: djangoQueryKeys.pnl.report({ ...params }),
    queryFn: ({ signal }) => getPnlReport(params, signal),
    enabled: !needsOrg && scope.isReady && scope.orgReady,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
  const report = query.data;

  const organizationName = activeOrganization?.name ?? "";
  const branchLabel = activeBranch ? `Филиал: ${activeBranch.name}` : "Все филиалы";
  const rangeLabel = describeRange(period.from, period.to);
  const compareLabel = `к ${describeRange(period.from.subtract(1, "year"), period.to.subtract(1, "year"))}`;

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const fail = (message: string, error: unknown) =>
    notify?.({ type: "error", message, description: parseBackendError(error) });

  const handleExcel = async () => {
    if (!report) return;
    setExporting("excel");
    try {
      const blob = await buildPnlXlsx({
        report, organizationName, periodLabel: rangeLabel, branchLabel, generatedAt: new Date(),
      });
      downloadBlob(blob, `ОПиУ ${organizationName} ${rangeLabel}.xlsx`);
    } catch (error) {
      fail("Не удалось выгрузить Excel", error);
    } finally {
      setExporting(null);
    }
  };

  const handleForm2 = async () => {
    setExporting("form2");
    try {
      // Форма №2 — документ юрлица: всегда по всем доступным филиалам.
      const orgParams: PnlParams = { dateFrom, dateTo, organizationId: scope.organizationId, compare: true };
      const orgReport = await queryClient.fetchQuery({
        queryKey: djangoQueryKeys.pnl.report({ ...orgParams }),
        queryFn: ({ signal }) => getPnlReport(orgParams, signal),
        staleTime: DJANGO_LIST_STALE_TIME_MS,
      });
      // Реквизиты читает право organization.view; без него форма уйдёт с пустой шапкой.
      const requisites = activeOrganization
        ? await getOrganization(activeOrganization.id).then((org) => org.requisites).catch(() => EMPTY_REQUISITES)
        : EMPTY_REQUISITES;
      const blob = await buildForm2Xlsx({
        report: orgReport, organizationName, requisites, from: period.from, to: period.to,
      });
      downloadBlob(blob, `Форма №2 ОПиУ ${organizationName} ${rangeLabel}.xlsx`);
    } catch (error) {
      fail("Не удалось выгрузить форму №2", error);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Box sx={{ px: theme.appLayout.page.paddingX, py: 2, overflowY: "auto" }}>
      <Stack spacing={2}>
        <PnlHeader
          period={period}
          onPeriod={setPeriod}
          branchLabel={branchLabel}
          exporting={exporting}
          canExport={Boolean(report) && exporting === null}
          onExcel={() => void handleExcel()}
          onForm2={() => void handleForm2()}
        />
        {needsOrg && <Alert severity="info">Выберите организацию, чтобы увидеть отчёт.</Alert>}
        {query.isError && <Alert severity="error">{parseBackendError(query.error)}</Alert>}
        {!needsOrg && !report && !query.isError && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}
        {report && (
          <>
            <PnlHints warnings={report.warnings} />
            <PnlKpiCards kpis={buildKpis(report)} compareLabel={compareLabel} />
            <PnlWaterfall bars={buildWaterfall(report)} caption={`${rangeLabel}, сом`} />
            <PnlTable report={report} expanded={expanded} onToggle={toggle} />
          </>
        )}
      </Stack>
    </Box>
  );
}

export default PnlPage;
