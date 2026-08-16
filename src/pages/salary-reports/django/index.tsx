import React, { useEffect, useState, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  alpha,
  Tooltip,
} from "@mui/material";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import { useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import BonusDialog from "./BonusDialog";
import BonusDrawer from "./BonusDrawer";
import SalaryReportRow, {
  COLUMNS_DOCTOR,
  COLUMNS_NURSE,
  COLUMNS_REGISTRATOR,
  COLUMNS_ADMIN,
  getVisibleSalaryColumns,
  isEmptyPayrollRow,
  type ColumnConfig,
} from "./components/SalaryReportRow";

import { DjangoAddExpenseDrawer } from "../../../components/expenses/DjangoAddExpenseDrawer";
import { PageHeader, MonthNavigation } from "../../../components/ui";
import { AppointmentsSummaryCards } from "../../reports/components/AppointmentsSummaryCards";
import { ReportTableCard } from "../../reports/components/ReportTableCard";
import { compactTableSx } from "../../reports/components/reportTableStyles";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useT } from "../../../i18n/VerticalProvider";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import { PeriodSettingsDialog } from "../../../features/payroll/components/PeriodSettingsDialog";
import { PayrollStatementDrawer } from "../../../features/payroll/components/PayrollStatementDrawer";
import {
  getPayrollActiveMonths,
  getPayrollReport,
  lockPeriod,
  recalculatePeriod,
  unlockPeriod,
  type PayrollRow,
} from "../../../api/payroll";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { formatKGS } from "../../../utility/format";

const DjangoSalaryReportsPage: React.FC = () => {
  const { t } = useT("salaryReports");
  usePageTitle(t("page.title"));
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  
  const canView = useCan("payroll.view");
  const canViewOwn = useCan("payroll.view_own");
  const canManage = useCan("payroll.manage");
  const canViewReports = useCan("reports.view");
  const canCreateExpense = useCan("finance.expense.manage");
  // Компактная шапка: на узких экранах кнопки «Расход»/«Надбавка» — только иконки.
  const compactHeader = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  
  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    activeEmployee,
    loading: permLoading,
  } = usePermissions();
  
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  // payroll.view_own + активная карточка сотрудника — персональный режим
  // (видны только свои цифры), не общий отчёт.
  const canOwnView = canViewOwn && activeEmployee != null;

  const [date, setDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const parsed = dayjs(date);
  const year = parsed.year();
  const month = parsed.month() + 1;
  const selectedMonth = parsed.startOf("month").format("YYYY-MM-DD");

  // Филиальный срез следует за выбранным в сайдбаре филиалом (как остальные
  // страницы): «Все филиалы» — полный org-wide расчёт (участвует в заморозке),
  // конкретный филиал — живой срез (приёмы и авансы филиала, без часов СКУД —
  // у смен нет филиала). Заморозка в срезе недоступна.
  const branchFilterId = activeBranch?.id ?? undefined;

  const query = useQuery({
    queryKey: djangoQueryKeys.payroll.report({
      year,
      month,
      orgId: isSuper ? activeOrganization?.id ?? null : null,
      branchId: branchFilterId ?? null,
    }),
    queryFn: ({ signal }) =>
      getPayrollReport(
        {
          year,
          month,
          organizationId: isSuper ? activeOrganization?.id ?? undefined : undefined,
          branchId: branchFilterId,
        },
        signal,
      ),
    enabled: !permLoading && (canView || canOwnView) && !needsOrg,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // Навигация строится по источникам расчёта ЗП, а не по всем записям на
  // приём. Поэтому будущие неоплаченные записи и месяцы других филиалов сюда
  // не попадают.
  const orgIdForMonths = activeOrganization?.id ?? undefined;
  const activeMonthsQuery = useQuery({
    queryKey: djangoQueryKeys.payroll.activeMonths({
      orgId: orgIdForMonths ?? null,
      branchId: branchFilterId ?? null,
    }),
    queryFn: ({ signal }) =>
      getPayrollActiveMonths(
        { organizationId: orgIdForMonths, branchId: branchFilterId },
        signal,
      ),
    enabled: !permLoading && (canView || canOwnView) && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const activeMonthKeys = activeMonthsQuery.data?.months ?? null;
  const activeMonths = useMemo(
    () => (activeMonthKeys ? new Set(activeMonthKeys) : null),
    [activeMonthKeys],
  );

  // Смена организации/филиала может сделать выбранный месяц пустым. В этом
  // случае сразу переходим к последнему месяцу с данными, чтобы пустой пункт
  // не оставался единственным видимым элементом навигации.
  useEffect(() => {
    if (!activeMonthKeys?.length) return;
    const currentKey = dayjs(date).format("YYYY-MM");
    if (!activeMonthKeys.includes(currentKey)) {
      setDate(`${activeMonthKeys[0]}-01`);
    }
  }, [activeMonthKeys, date]);

  // Сотрудники без единой цифры за месяц (нули во всех колонках) в таблицах не
  // показываются — они только удлиняют отчёт. На итоги это не влияет: нулевая
  // строка ничего не добавляет ни в авансы, ни в «К выплате».
  const reportRows = query.data?.rows;
  const rowsWithData = useMemo(
    () => (reportRows ?? []).filter((r) => !isEmptyPayrollRow(r)),
    [reportRows],
  );
  const hiddenEmptyCount = (reportRows?.length ?? 0) - rowsWithData.length;

  const [busy, setBusy] = React.useState(false);
  const [recalcOpen, setRecalcOpen] = React.useState(false);
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [bonusRow, setBonusRow] = React.useState<PayrollRow | null>(null);
  const [payoutRow, setPayoutRow] = React.useState<PayrollRow | null>(null);
  // Страничный дравер «Единоразовая надбавка».
  const [bonusDrawerOpen, setBonusDrawerOpen] = React.useState(false);
  // Платёжная ведомость (.xlsx) по строкам месяца.
  const [statementOpen, setStatementOpen] = React.useState(false);

  const handleLock = async () => {
    setBusy(true);
    try {
      await lockPeriod(year, month);
      await query.refetch();
      notify?.({ type: "success", message: t("notify.monthFrozen") });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : t("notify.genericError") });
    } finally {
      setBusy(false);
    }
  };

  const handleRecalc = async () => {
    setBusy(true);
    try {
      await recalculatePeriod(year, month, reason);
      await query.refetch();
      setRecalcOpen(false);
      setReason("");
      notify?.({ type: "success", message: t("notify.recalculated") });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : t("notify.genericError") });
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setBusy(true);
    try {
      await unlockPeriod(year, month);
      await query.refetch();
      setUnlockOpen(false);
      notify?.({ type: "success", message: t("notify.unfrozen") });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : t("notify.genericError") });
    } finally {
      setBusy(false);
    }
  };

  // Authorization Guard: either the general view permission, or payroll.view_own
  // with an active employee card to see own data.
  if (!permLoading && !canView && !canOwnView) {
    return <AccessDenied />;
  }

  const report = query.data;
  const hasRows = rowsWithData.length > 0;

  // Totals calculations
  const totalAdvances = report?.rows.reduce((sum, r) => sum + parseFloat(r.advances || "0"), 0) ?? 0;
  const totalNet = report?.totalNet ?? "0.00";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={t("page.title")}
        showTitle={false}
        showSearch={false}
        dateNavigation={
          activeMonthsQuery.isLoading || activeMonthKeys?.length === 0 ? null : (
            <MonthNavigation
              date={date}
              setDate={setDate}
              activeMonths={activeMonthsQuery.isError ? null : activeMonths}
            />
          )
        }
        actions={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {report && (
              <Chip
                size="small"
                label={report.status === "locked" ? t("status.locked") : t("status.draft")}
                color={report.status === "locked" ? "success" : "default"}
                variant={report.status === "locked" ? "filled" : "outlined"}
              />
            )}
            {canManage && hasRows && (
              <Tooltip title={t("statement.title")}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setStatementOpen(true)}
                  startIcon={compactHeader ? undefined : <DescriptionIcon />}
                  sx={compactHeader ? { minWidth: "auto", px: 1 } : undefined}
                >
                  {compactHeader ? <DescriptionIcon fontSize="small" /> : t("actions.statement")}
                </Button>
              </Tooltip>
            )}
            {canManage && report?.status === "draft" && (
              <Tooltip title={t("tooltips.bonusPerEmployee")}>
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  onClick={() => setBonusDrawerOpen(true)}
                  startIcon={compactHeader ? undefined : <PaidOutlinedIcon />}
                  sx={compactHeader ? { minWidth: "auto", px: 1 } : undefined}
                >
                  {compactHeader ? <PaidOutlinedIcon fontSize="small" /> : t("actions.bonusButton")}
                </Button>
              </Tooltip>
            )}
            {canManage && report?.status === "draft" && (
              <Tooltip title={t("tooltips.monthSettings")}>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={compactHeader ? undefined : <SettingsIcon />}
                  disabled={busy}
                  onClick={() => setSettingsDialogOpen(true)}
                  sx={compactHeader ? { minWidth: "auto", px: 1 } : undefined}
                >
                  {compactHeader ? <SettingsIcon fontSize="small" /> : t("actions.monthSettings")}
                </Button>
              </Tooltip>
            )}
            {/* Срез по филиалу — всегда живой расчёт; заморозка (org-wide
                снимки) доступна только в режиме «Все филиалы». */}
            {branchFilterId != null && (
              <Tooltip title={t("branchSlice.tooltip")}>
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={t("branchSlice.label", { name: activeBranch?.name ?? t("branchSlice.labelFallback") })}
                />
              </Tooltip>
            )}
            {canManage && branchFilterId == null && report?.status === "draft" && (
              <Button size="small" variant="outlined" disabled={busy} onClick={handleLock}>
                {t("actions.freeze")}
              </Button>
            )}
            {canManage && branchFilterId == null && report?.status === "locked" && (
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => setRecalcOpen(true)}
              >
                {t("actions.recalculate")}
              </Button>
            )}
            {canManage && branchFilterId == null && report?.status === "locked" && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={busy}
                onClick={() => setUnlockOpen(true)}
              >
                {t("actions.unfreeze")}
              </Button>
            )}
          </Stack>
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">{t("emptyStates.selectOrg")}</Alert>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            px: theme.appLayout.page.paddingX,
            pb: 2,
          }}
        >
          {/* Summary Cards Row */}
          {(canView || canOwnView) && (
            <Box sx={{ my: 2 }}>
              <AppointmentsSummaryCards
                dateFrom={selectedMonth}
                dateTo={dayjs(date).endOf("month").format("YYYY-MM-DD")}
                employeeId={canView ? undefined : String(activeEmployee?.id)}
                branchId={branchFilterId}
                showBaseCards={canViewReports}
                extraCards={[
                  {
                    title: t("summaryCards.advanceTitle"),
                    primaryValue: formatKGS(totalAdvances),
                    secondaryText: t("summaryCards.advanceSubtitle"),
                    color: "primary",
                  },
                  {
                    title: t("summaryCards.netTitle"),
                    primaryValue: formatKGS(totalNet),
                    secondaryText: t("summaryCards.netSubtitle"),
                    color: "info",
                  },
                ]}
              />
            </Box>
          )}

          {query.isLoading && (
            <Stack alignItems="center" sx={{ py: 6 }}>
              <CircularProgress />
            </Stack>
          )}

          {query.error && (
            <Alert severity="error">
              {query.error instanceof Error ? query.error.message : t("emptyStates.loadError")}
            </Alert>
          )}

          {!query.isLoading && !hasRows && !query.error && (
            <Typography variant="body2" color="text.disabled" sx={{ py: 4, textAlign: "center" }}>
              {t("emptyStates.noAccrualsMonth")}
            </Typography>
          )}


          {/* Grouped Lists/Tables */}
          {!query.isLoading && hasRows && (
            isMobile ? (
              /* Mobile card list grouping */
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {(() => {
                  const roleGroups = [
                    { label: t("roleGroups.doctors"), roleNames: ["doctor"] },
                    { label: t("roleGroups.nursesProcedure"), roleNames: ["nurse", "procedure"] },
                    { label: t("roleGroups.registrators"), roleNames: ["registrator", "receptionist"] },
                    { label: t("roleGroups.admins"), roleNames: ["admin", "accountant", "superadmin"] },
                    { label: t("roleGroups.technical"), roleNames: ["cleaner", "сleaner"] },
                  ];

                  const rendered: React.ReactNode[] = [];
                  const seen = new Set<number>();

                  roleGroups.forEach((group) => {
                    const rows = rowsWithData.filter((r) =>
                      group.roleNames.includes(r.roleName)
                    );
                    rows.forEach((r) => seen.add(r.employeeId));
                    if (rows.length === 0) return;

                    rendered.push(
                      <Box key={group.label}>
                        <Box
                          sx={{
                            px: 1,
                            py: 0.75,
                            mb: 0.75,
                            bgcolor: alpha(theme.palette.primary.main, 0.05),
                            borderRadius: 1.5,
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                          }}
                        >
                          <Typography
                            variant="caption"
                            fontWeight={800}
                            color="primary.main"
                            sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.65rem" }}
                          >
                            {group.label}
                          </Typography>
                        </Box>
                        <Stack spacing={0.75}>
                          {rows.map((row) => (
                            <SalaryReportRow
                              key={row.employeeId}
                              row={row}
                              year={year}
                              month={month}
                              organizationId={isSuper ? activeOrganization?.id ?? undefined : undefined}
                              branchId={branchFilterId}
                              isMobile
                              onPayout={canCreateExpense ? setPayoutRow : undefined}
                            />
                          ))}
                        </Stack>
                      </Box>
                    );
                  });

                  // Rest
                  const rest = rowsWithData.filter((r) => !seen.has(r.employeeId));
                  if (rest.length > 0) {
                    rendered.push(
                      <Box key="other">
                        <Box
                          sx={{
                            px: 1,
                            py: 0.75,
                            mb: 0.75,
                            bgcolor: alpha(theme.palette.grey[500], 0.08),
                            borderRadius: 1.5,
                            border: `1px solid ${theme.palette.divider}`,
                          }}
                        >
                          <Typography
                            variant="caption"
                            fontWeight={800}
                            color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.65rem" }}
                          >
                            {t("roleGroups.other")}
                          </Typography>
                        </Box>
                        <Stack spacing={0.75}>
                          {rest.map((row) => (
                            <SalaryReportRow
                              key={row.employeeId}
                              row={row}
                              year={year}
                              month={month}
                              organizationId={isSuper ? activeOrganization?.id ?? undefined : undefined}
                              branchId={branchFilterId}
                              isMobile
                              onPayout={canCreateExpense ? setPayoutRow : undefined}
                            />
                          ))}
                        </Stack>
                      </Box>
                    );
                  }

                  return rendered;
                })()}
              </Box>
            ) : (
              /* Desktop table grouping */
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {(() => {
                  const roleGroups: { label: string; roleNames: string[]; cols: ColumnConfig }[] = [
                    { label: t("roleGroups.doctors"), roleNames: ["doctor"], cols: COLUMNS_DOCTOR },
                    { label: t("roleGroups.nursesProcedure"), roleNames: ["nurse", "procedure"], cols: COLUMNS_NURSE },
                    { label: t("roleGroups.registrators"), roleNames: ["registrator", "receptionist"], cols: COLUMNS_REGISTRATOR },
                    { label: t("roleGroups.admins"), roleNames: ["admin", "accountant", "superadmin"], cols: COLUMNS_ADMIN },
                    { label: t("roleGroups.technical"), roleNames: ["cleaner", "сleaner"], cols: COLUMNS_ADMIN },
                  ];

                  const rendered: React.ReactNode[] = [];
                  const seen = new Set<number>();

                  roleGroups.forEach((group) => {
                    const rows = rowsWithData.filter((r) =>
                      group.roleNames.includes(r.roleName)
                    );
                    rows.forEach((r) => seen.add(r.employeeId));
                    if (rows.length === 0) return;

                    const cols = getVisibleSalaryColumns(rows, group.cols);
                    const groupNet = rows.reduce((sum, r) => sum + parseFloat(r.netSalary || "0"), 0);
                    rendered.push(
                      <ReportTableCard
                        key={group.label}
                        title={group.label}
                        headerActions={
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${rows.length} · ${formatKGS(groupNet)}`}
                          />
                        }
                      >
                        <Table size="small" sx={compactTableSx}>
                          <TableHead>
                            <TableRow>
                              <TableCell>{t("columns.employee")}</TableCell>
                              {cols.hours && !report?.settings?.merge_night_into_day && (
                                <>
                                  <TableCell align="center">{t("columns.dayHours")}</TableCell>
                                  <TableCell align="center">{t("columns.nightHours")}</TableCell>
                                </>
                              )}
                              {cols.hours && (
                                <TableCell align="right">{t("columns.hours")}</TableCell>
                              )}
                              {cols.appointments && <TableCell align="center">{cols.appointmentsLabel ?? t("columns.allAppointments")}</TableCell>}
                              {cols.distributed && <TableCell align="center" sx={{ color: "info.onSurface" }}>{t("columns.distributed")}</TableCell>}
                              {cols.createdBy && <TableCell align="center" sx={{ color: "success.onSurface" }}>{t("columns.createdBy")}</TableCell>}
                              {cols.statusWaiting && <TableCell align="center">{t("columns.waiting")}</TableCell>}
                              {cols.statusCancelled && <TableCell align="center">{t("columns.cancelled")}</TableCell>}
                              {cols.statusDiscount && <TableCell align="center">{t("columns.discount")}</TableCell>}
                              {cols.appointmentPay && <TableCell align="right">{t("columns.forAppointments")}</TableCell>}
                              {cols.bonuses && <TableCell align="right">{t("columns.bonusesColumn")}</TableCell>}
                              {cols.percent && <TableCell align="right">{t("columns.salary")}</TableCell>}
                              <TableCell align="right" sx={{ color: "error.onSurface" }}>{t("columns.advance")}</TableCell>
                              <TableCell align="right" sx={{ color: "primary.onSurface" }}>{t("columns.netSalary")}</TableCell>
                              {canCreateExpense && <TableCell sx={{ width: 0 }} />}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.map((row) => (
                              <SalaryReportRow
                                key={row.employeeId}
                                row={row}
                                year={year}
                                month={month}
                                organizationId={isSuper ? activeOrganization?.id ?? undefined : undefined}
                              branchId={branchFilterId}
                                columns={cols}
                                periodSettings={report?.settings}
                                onPayout={canCreateExpense ? setPayoutRow : undefined}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </ReportTableCard>
                    );
                  });

                  // Rest
                  const rest = rowsWithData.filter((r) => !seen.has(r.employeeId));
                  if (rest.length > 0) {
                    const restCols = getVisibleSalaryColumns(rest, COLUMNS_ADMIN);
                    const restNet = rest.reduce((sum, r) => sum + parseFloat(r.netSalary || "0"), 0);
                    rendered.push(
                      <ReportTableCard
                        key="other"
                        title={t("roleGroups.other")}
                        muted
                        headerActions={
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${rest.length} · ${formatKGS(restNet)}`}
                          />
                        }
                      >
                        <Table size="small" sx={compactTableSx}>
                          <TableHead>
                            <TableRow>
                              <TableCell>{t("columns.employee")}</TableCell>
                              {restCols.hours && !report?.settings?.merge_night_into_day && (
                                <>
                                  <TableCell align="center">{t("columns.dayHours")}</TableCell>
                                  <TableCell align="center">{t("columns.nightHours")}</TableCell>
                                </>
                              )}
                              {restCols.hours && <TableCell align="right">{t("columns.hours")}</TableCell>}
                              <TableCell align="right">{t("columns.salary")}</TableCell>
                              <TableCell align="right" sx={{ color: "error.onSurface" }}>{t("columns.advance")}</TableCell>
                              <TableCell align="right" sx={{ color: "primary.onSurface" }}>{t("columns.netSalary")}</TableCell>
                              {canCreateExpense && <TableCell sx={{ width: 0 }} />}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rest.map((row) => (
                              <SalaryReportRow
                                key={row.employeeId}
                                row={row}
                                year={year}
                                month={month}
                                organizationId={isSuper ? activeOrganization?.id ?? undefined : undefined}
                              branchId={branchFilterId}
                                columns={restCols}
                                periodSettings={report?.settings}
                                onPayout={canCreateExpense ? setPayoutRow : undefined}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </ReportTableCard>
                    );
                  }

                  return rendered;
                })()}
              </Box>
            )
          )}

          {/* Сотрудник без цифр не исчезает молча: сноской видно, сколько строк
              скрыто, иначе «где мой сотрудник?» — первый вопрос к отчёту. */}
          {!query.isLoading && hasRows && hiddenEmptyCount > 0 && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ display: "block", mt: 1.5, textAlign: "right" }}
            >
              {t("emptyStates.hiddenEmptyRows", { count: hiddenEmptyCount })}
            </Typography>
          )}
        </Box>
      )}

      <Dialog open={recalcOpen} onClose={() => (busy ? undefined : setRecalcOpen(false))}>
        <DialogTitle>{t("dialogs.recalcTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t("dialogs.recalcDescription")}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label={t("dialogs.reasonLabel")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecalcOpen(false)} disabled={busy} color="inherit">
            {t("common:actions.cancel")}
          </Button>
          <Button
            onClick={handleRecalc}
            disabled={busy || !reason.trim()}
            variant="contained"
          >
            {t("actions.recalculate")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={unlockOpen} onClose={() => (busy ? undefined : setUnlockOpen(false))}>
        <DialogTitle>{t("dialogs.unlockTitle")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t("dialogs.unlockDescription")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlockOpen(false)} disabled={busy} color="inherit">
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleUnlock} disabled={busy} variant="contained" color="warning">
            {t("actions.unfreeze")}
          </Button>
        </DialogActions>
      </Dialog>

      {bonusRow && (
        <BonusDialog
          open
          onClose={() => setBonusRow(null)}
          employeeId={bonusRow.employeeId}
          employeeName={bonusRow.fullName}
          year={year}
          month={month}
          organizationId={report?.organizationId}
          readOnly={!canManage || report?.status === "locked"}
        />
      )}

      {payoutRow && (
        <DjangoAddExpenseDrawer
          open
          onClose={() => setPayoutRow(null)}
          organizationId={report?.organizationId}
          branchId={activeBranch?.id ?? undefined}
          prefill={{
            employee: { id: payoutRow.employeeId, fullName: payoutRow.fullName },
            // Текущий месяц — аванс (зачтётся в него же); закрытый месяц — зарплата
            // (kind=salary зачитывается в предыдущий месяц относительно даты расхода).
            categoryKind: dayjs().isSame(parsed, "month") ? "advance" : "salary",
            cardAmount: payoutRow.netSalary,
            name: t("payoutExpenseName", { name: payoutRow.fullName }),
          }}
          onCreated={() => {
            setPayoutRow(null);
            void query.refetch();
            notify?.({ type: "success", message: t("notify.payoutDone") });
          }}
        />
      )}

      {/* Страничная «Единоразовая надбавка» с выбором сотрудника */}
      <BonusDrawer
        open={bonusDrawerOpen}
        onClose={() => setBonusDrawerOpen(false)}
        year={year}
        month={month}
        organizationId={report?.organizationId}
      />


      {/* Платёжная ведомость: ФИО, счёт, сумма, рабочие дни — в .xlsx */}
      <PayrollStatementDrawer
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        rows={rowsWithData}
        year={year}
        month={month}
        monthLabel={dayjs(date).format("MMMM YYYY")}
        fileName={t("statement.fileName", { month: dayjs(date).format("MM.YYYY") })}
        defaultExecutorName={activeEmployee?.fullName ?? ""}
        organizationId={report?.organizationId}
        branchId={branchFilterId}
      />

      <PeriodSettingsDialog
        open={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
        month={selectedMonth}
        monthLabel={dayjs(date).format('MMMM YYYY')}
        initialSettings={report?.settings ?? {}}
        organizationId={isSuper ? activeOrganization?.id ?? undefined : undefined}
        onSaved={() => {
          query.refetch();
        }}
      />
    </Box>
  );
};

export default DjangoSalaryReportsPage;
