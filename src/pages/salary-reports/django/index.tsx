import React, { useState, useMemo } from "react";
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
  Paper,
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
  IconButton,
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
  type ColumnConfig,
} from "./components/SalaryReportRow";

import { DjangoAddExpenseDrawer } from "../../../components/expenses/DjangoAddExpenseDrawer";
import { PageHeader, MonthNavigation } from "../../../components/ui";
import { AppointmentsSummaryCards } from "../../reports/components/AppointmentsSummaryCards";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useCan } from "../../../hooks/useCan";
import { usePermissions } from "../../../hooks/usePermissions";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import { PeriodSettingsDialog } from "../../../features/payroll/components/PeriodSettingsDialog";
import {
  getPayrollReport,
  lockPeriod,
  recalculatePeriod,
  type PayrollRow,
} from "../../../api/payroll";
import { getActiveMonths } from "../../../api/reports";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { formatKGS } from "../../../utility/format";

// Clinical roles (staff.ClinicalRole): doctor / nurse / other.
const ROLE_ORDER = ["doctor", "nurse", "other"] as const;
const ROLE_LABELS: Record<string, string> = {
  doctor: "Врачи",
  nurse: "Медсёстры",
  other: "Прочие",
};

function groupByRole(rows: PayrollRow[]): Record<string, PayrollRow[]> {
  const groups: Record<string, PayrollRow[]> = {};
  for (const row of rows) {
    const key = ROLE_LABELS[row.clinicalRole] ? row.clinicalRole : "other";
    (groups[key] ??= []).push(row);
  }
  return groups;
}

const COLUMNS: {
  key: keyof PayrollRow;
  label: string;
  money?: boolean;
  render?: (row: PayrollRow) => React.ReactNode;
}[] = [
  { key: "fullName", label: "Сотрудник" },
  { key: "appointmentsCount", label: "Приёмы" },
  { key: "servicePercentPay", label: "Услуги %", money: true },
  { key: "serviceFixedPay", label: "Фикс", money: true },
  { key: "appointmentPay", label: "За приёмы", money: true },
  {
    key: "dayHours",
    label: "Часы (д/н)",
    render: (r) => `${r.dayHours} / ${r.nightHours}`,
  },
  { key: "hourlyPay", label: "Почасовая", money: true },
  {
    key: "bonus",
    label: "Надбавка",
    render: (r) => {
      const v = Number(r.bonus ?? 0);
      return v > 0 ? formatKGS(r.bonus as string) : "—";
    },
  },
  { key: "earnings", label: "Начислено", money: true },
  { key: "advances", label: "Авансы", money: true },
  { key: "netSalary", label: "К выплате", money: true },
];

/**
 * Payout state of a salary row:
 *  - "payable": there is a positive remainder to pay out (net > 0)
 *  - "paid":    something was earned and advances already cover it (net ≤ 0)
 *  - "none":    nothing earned this month — no action, no badge
 */
function payoutState(row: PayrollRow): "payable" | "paid" | "none" {
  const net = Math.round(Number(row.netSalary || 0));
  if (net > 0) return "payable";
  return Number(row.earnings || 0) > 0 ? "paid" : "none";
}

const RoleTable: React.FC<{
  title: string;
  rows: PayrollRow[];
  onManageBonus: (row: PayrollRow) => void;
  /** Show the "Выплатить" action / "Выплачено" badge (nurses & non-doctors). */
  canPayout: boolean;
  onPayout: (row: PayrollRow) => void;
}> = ({ title, rows, onManageBonus, canPayout, onPayout }) => {
  const groupNet = rows.reduce((sum, r) => sum + parseFloat(r.netSalary || "0"), 0);
  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: "hidden" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1, bgcolor: "action.hover" }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Chip label={`${rows.length} · ${formatKGS(groupNet)}`} size="small" />
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableCell key={c.key} align={c.key === "fullName" ? "left" : "right"}>
                {c.label}
              </TableCell>
            ))}
            <TableCell align="right" padding="checkbox" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.employeeId} hover>
              {COLUMNS.map((c) => (
                <TableCell
                  key={c.key}
                  align={c.key === "fullName" ? "left" : "right"}
                  sx={c.key === "netSalary" ? { fontWeight: 700 } : undefined}
                >
                  {c.render
                    ? c.render(row)
                    : c.money
                      ? formatKGS(row[c.key] as string)
                      : String(row[c.key])}
                </TableCell>
              ))}
              <TableCell align="right" padding="checkbox">
                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                  {canPayout &&
                    (() => {
                      const state = payoutState(row);
                      if (state === "payable") {
                        return (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            onClick={() => onPayout(row)}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            Выплатить
                          </Button>
                        );
                      }
                      if (state === "paid") {
                        return (
                          <Chip
                            size="small"
                            color="success"
                            variant="outlined"
                            label="✓ Выплачено"
                            sx={{ fontWeight: 700 }}
                          />
                        );
                      }
                      return null;
                    })()}
                  <Tooltip title="Надбавки">
                    <IconButton size="small" onClick={() => onManageBonus(row)}>
                      <PaidOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};

const DjangoSalaryReportsPage: React.FC = () => {
  usePageTitle("Отчёт по зарплате");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  
  const canView = useCan("payroll.view");
  const canManage = useCan("payroll.manage");
  const canCreateExpense = useCan("finance.expense.manage");
  // Компактная шапка: на узких экранах кнопки «Расход»/«Надбавка» — только иконки.
  const compactHeader = useMediaQuery(theme.breakpoints.down("md"));
  const { open: notify } = useNotification();
  
  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    employeeId,
    isRegistrator: isRegistratorRole,
    loading: permLoading,
  } = usePermissions();
  
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;

  const [date, setDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const parsed = dayjs(date);
  const year = parsed.year();
  const month = parsed.month() + 1;
  const selectedMonth = parsed.startOf("month").format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: djangoQueryKeys.payroll.report({
      year,
      month,
      orgId: isSuper ? activeOrganization?.id ?? null : null,
    }),
    queryFn: ({ signal }) =>
      getPayrollReport(
        {
          year,
          month,
          organizationId: isSuper ? activeOrganization?.id ?? undefined : undefined,
        },
        signal,
      ),
    enabled: !permLoading && (canView || employeeId != null) && !needsOrg,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // Месяцы, в которых есть приёмы, — пустые месяцы в навигации не показываем.
  const orgIdForMonths = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const activeMonthsQuery = useQuery({
    queryKey: djangoQueryKeys.reports.activeMonths(orgIdForMonths ?? null),
    queryFn: ({ signal }) => getActiveMonths({ organizationId: orgIdForMonths }, signal),
    enabled: !permLoading && (canView || employeeId != null) && !needsOrg,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const activeMonths = useMemo(
    () => (activeMonthsQuery.data ? new Set(activeMonthsQuery.data.months) : null),
    [activeMonthsQuery.data],
  );

  const [busy, setBusy] = React.useState(false);
  const [recalcOpen, setRecalcOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);
  const [bonusRow, setBonusRow] = React.useState<PayrollRow | null>(null);
  const [payoutRow, setPayoutRow] = React.useState<PayrollRow | null>(null);
  // Страничный дравер «Единоразовая надбавка».
  const [bonusDrawerOpen, setBonusDrawerOpen] = React.useState(false);

  const handleLock = async () => {
    setBusy(true);
    try {
      await lockPeriod(year, month);
      await query.refetch();
      notify?.({ type: "success", message: "Месяц заморожен" });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
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
      notify?.({ type: "success", message: "Пересчитано" });
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  // Authorization Guard: Either has view permission or has active employee ID to see own data
  if (!permLoading && !canView && employeeId == null) {
    return <AccessDenied />;
  }

  const report = query.data;
  const hasRows = (report?.rows.length ?? 0) > 0;

  // Totals calculations
  const totalAdvances = report?.rows.reduce((sum, r) => sum + parseFloat(r.advances || "0"), 0) ?? 0;
  const totalNet = report?.totalNet ?? "0.00";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Отчёт по зарплате"
        showTitle={false}
        showSearch={false}
        dateNavigation={<MonthNavigation date={date} setDate={setDate} activeMonths={activeMonths} />}
        actions={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {report && (
              <Chip
                size="small"
                label={report.status === "locked" ? "Заморожен" : "Черновик"}
                color={report.status === "locked" ? "success" : "default"}
                variant={report.status === "locked" ? "filled" : "outlined"}
              />
            )}
            {canManage && report?.status === "draft" && (
              <Tooltip title="Единоразовая надбавка сотруднику">
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  onClick={() => setBonusDrawerOpen(true)}
                  startIcon={compactHeader ? undefined : <PaidOutlinedIcon />}
                  sx={compactHeader ? { minWidth: "auto", px: 1 } : undefined}
                >
                  {compactHeader ? <PaidOutlinedIcon fontSize="small" /> : "Надбавка"}
                </Button>
              </Tooltip>
            )}
            {canManage && report?.status === "draft" && (
              <Tooltip title="Настройки месяца">
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={compactHeader ? undefined : <SettingsIcon />}
                  disabled={busy}
                  onClick={() => setSettingsDialogOpen(true)}
                  sx={compactHeader ? { minWidth: "auto", px: 1 } : undefined}
                >
                  {compactHeader ? <SettingsIcon fontSize="small" /> : "Настройки месяца"}
                </Button>
              </Tooltip>
            )}
            {canManage && report?.status === "draft" && (
              <Button size="small" variant="outlined" disabled={busy} onClick={handleLock}>
                Заморозить
              </Button>
            )}
            {canManage && report?.status === "locked" && (
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => setRecalcOpen(true)}
              >
                Пересчитать
              </Button>
            )}
          </Stack>
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы увидеть отчёт.</Alert>
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
          {!isRegistratorRole() && (
            <Box sx={{ my: 2 }}>
              <AppointmentsSummaryCards
                dateFrom={dayjs(date).startOf("month").toISOString()}
                dateTo={dayjs(date).endOf("month").toISOString()}
                employeeId={canView ? undefined : (employeeId || undefined)}
                extraCards={[
                  {
                    title: "Аванс",
                    primaryValue: formatKGS(totalAdvances),
                    secondaryText: "Выплачено авансом",
                    color: "primary",
                  },
                  {
                    title: "К выплате",
                    primaryValue: formatKGS(totalNet),
                    secondaryText: "Итого за месяц",
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
              {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
            </Alert>
          )}

          {!query.isLoading && !hasRows && !query.error && (
            <Typography variant="body2" color="text.disabled" sx={{ py: 4, textAlign: "center" }}>
              За выбранный месяц начислений нет.
            </Typography>
          )}


          {/* Grouped Lists/Tables */}
          {!query.isLoading && hasRows && (
            isMobile ? (
              /* Mobile card list grouping */
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {(() => {
                  const roleGroups = [
                    { label: "Врачи", roleNames: ["doctor"] },
                    { label: "Медсёстры / Процедуры", roleNames: ["nurse", "procedure"] },
                    { label: "Регистраторы", roleNames: ["registrator", "receptionist"] },
                    { label: "Администраторы", roleNames: ["admin", "accountant", "superadmin"] },
                    { label: "Техперсонал / Санитарки", roleNames: ["cleaner", "сleaner"] },
                  ];

                  const rendered: React.ReactNode[] = [];
                  const seen = new Set<number>();

                  roleGroups.forEach((group) => {
                    const rows = (report?.rows ?? []).filter((r) =>
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
                              isMobile
                              onPayout={canCreateExpense ? setPayoutRow : undefined}
                            />
                          ))}
                        </Stack>
                      </Box>
                    );
                  });

                  // Rest
                  const rest = (report?.rows ?? []).filter((r) => !seen.has(r.employeeId));
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
                            Прочие
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
                    { label: "Врачи", roleNames: ["doctor"], cols: COLUMNS_DOCTOR },
                    { label: "Медсёстры / Процедуры", roleNames: ["nurse", "procedure"], cols: COLUMNS_NURSE },
                    { label: "Регистраторы", roleNames: ["registrator", "receptionist"], cols: COLUMNS_REGISTRATOR },
                    { label: "Администраторы", roleNames: ["admin", "accountant", "superadmin"], cols: COLUMNS_ADMIN },
                    { label: "Техперсонал / Санитарки", roleNames: ["cleaner", "сleaner"], cols: COLUMNS_ADMIN },
                  ];

                  const rendered: React.ReactNode[] = [];
                  const seen = new Set<number>();

                  roleGroups.forEach((group) => {
                    const rows = (report?.rows ?? []).filter((r) =>
                      group.roleNames.includes(r.roleName)
                    );
                    rows.forEach((r) => seen.add(r.employeeId));
                    if (rows.length === 0) return;

                    const cols = group.cols;
                    rendered.push(
                      <Paper
                        key={group.label}
                        variant="outlined"
                        sx={{
                          borderRadius: 3,
                          border: `1px solid ${theme.palette.divider}`,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            bgcolor: alpha(theme.palette.primary.main, 0.05),
                            borderBottom: `1px solid ${theme.palette.divider}`,
                          }}
                        >
                          <Typography variant="subtitle2" fontWeight={800} color="primary.main">
                            {group.label}
                          </Typography>
                        </Box>
                        <Table size="small" sx={{ fontSize: "0.75rem", "& .MuiTableCell-root": { fontSize: "0.75rem", py: 0.6, px: 1 } }}>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Сотрудник</TableCell>
                              {cols.hours && !report?.settings?.merge_night_into_day && (
                                <>
                                  <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Дневные</TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Ночные</TableCell>
                                </>
                              )}
                              {cols.hours && (
                                <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Часы</TableCell>
                              )}
                              {cols.appointments && <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>{cols.appointmentsLabel ?? "Все приёмы"}</TableCell>}
                              {cols.distributed && <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper", color: "info.main" }}>Распределённые</TableCell>}
                              {cols.createdBy && <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper", color: "success.main" }}>Создал</TableCell>}
                              {cols.statusWaiting && <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Ожидание</TableCell>}
                              {cols.statusCancelled && <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Отменены</TableCell>}
                              {cols.statusDiscount && <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Со скидкой</TableCell>}
                              {cols.bonuses && <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Бонусы</TableCell>}
                              {cols.percent && <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Зарплата</TableCell>}
                              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper", color: "error.main" }}>Аванс</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper", color: "primary.main" }}>К выплате</TableCell>
                              {canCreateExpense && <TableCell sx={{ bgcolor: "background.paper", width: 0 }} />}
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
                                columns={cols}
                                periodSettings={report?.settings}
                                onPayout={canCreateExpense ? setPayoutRow : undefined}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </Paper>
                    );
                  });

                  // Rest
                  const rest = (report?.rows ?? []).filter((r) => !seen.has(r.employeeId));
                  if (rest.length > 0) {
                    rendered.push(
                      <Paper
                        key="other"
                        variant="outlined"
                        sx={{
                          borderRadius: 3,
                          border: `1px solid ${theme.palette.divider}`,
                          overflow: "hidden",
                        }}
                      >
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            bgcolor: alpha(theme.palette.grey[500], 0.08),
                            borderBottom: `1px solid ${theme.palette.divider}`,
                          }}
                        >
                          <Typography variant="subtitle2" fontWeight={800} color="text.secondary">
                            Прочие
                          </Typography>
                        </Box>
                        <Table size="small" sx={{ fontSize: "0.75rem", "& .MuiTableCell-root": { fontSize: "0.75rem", py: 0.6, px: 1 } }}>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Сотрудник</TableCell>
                              {!report?.settings?.merge_night_into_day && (
                                <>
                                  <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Дневные</TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Ночные</TableCell>
                                </>
                              )}
                              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper" }}>Часы</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper", color: "error.main" }}>Аванс</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "background.paper", color: "primary.main" }}>К выплате</TableCell>
                              {canCreateExpense && <TableCell sx={{ bgcolor: "background.paper", width: 0 }} />}
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
                                columns={COLUMNS_ADMIN}
                                periodSettings={report?.settings}
                                onPayout={canCreateExpense ? setPayoutRow : undefined}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </Paper>
                    );
                  }

                  return rendered;
                })()}
              </Box>
            )
          )}
        </Box>
      )}

      <Dialog open={recalcOpen} onClose={() => (busy ? undefined : setRecalcOpen(false))}>
        <DialogTitle>Пересчитать месяц</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Снимки будут пересчитаны заново. Укажите причину (для истории).
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Причина"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecalcOpen(false)} disabled={busy} color="inherit">
            Отмена
          </Button>
          <Button
            onClick={handleRecalc}
            disabled={busy || !reason.trim()}
            variant="contained"
          >
            Пересчитать
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
            name: `Зарплата — ${payoutRow.fullName}`,
          }}
          onCreated={() => {
            setPayoutRow(null);
            void query.refetch();
            notify?.({ type: "success", message: "Выплата проведена" });
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
