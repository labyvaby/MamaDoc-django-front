import React, { useState, useEffect, useRef } from "react";
import {
  TableRow,
  TableCell,
  Typography,
  IconButton,
  Box,
  Table,
  TableBody,
  TableHead,
  CircularProgress,
  alpha,
  useTheme,
  Stack,
  Card,
  Divider,
  Collapse,
  Grid2,
  Tooltip,
  Button,
  Chip,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import { formatKGS } from "../../../../utility/format";
import {
  getEmployeeDailyDetails,
  type PayrollRow,
  type EmployeeDailyDetailRow,
} from "../../../../api/payroll";
import { useT } from "../../../../i18n/VerticalProvider";

dayjs.locale("ru");

export interface ColumnConfig {
  hours: boolean;
  appointments: boolean;
  distributed: boolean;
  createdBy: boolean;
  statusWaiting: boolean;
  statusCancelled: boolean;
  statusDiscount: boolean;
  bonuses: boolean;
  percent: boolean;
  appointmentsLabel?: string;
}

export const COLUMNS_REGISTRATOR: ColumnConfig = {
  hours: true,
  appointments: false,
  distributed: true,
  createdBy: true,
  statusWaiting: false,
  statusCancelled: false,
  statusDiscount: false,
  bonuses: true,
  percent: true,
};

export const COLUMNS_DOCTOR: ColumnConfig = {
  hours: true,
  appointments: true,
  distributed: false,
  createdBy: false,
  statusWaiting: true,
  statusCancelled: true,
  statusDiscount: true,
  bonuses: false,
  percent: true,
};

export const COLUMNS_NURSE: ColumnConfig = {
  hours: true,
  appointments: true,
  distributed: false,
  createdBy: false,
  statusWaiting: false,
  statusCancelled: true,
  statusDiscount: false,
  bonuses: true,
  percent: true,
};

export const COLUMNS_ADMIN: ColumnConfig = {
  hours: true,
  appointments: false,
  distributed: false,
  createdBy: false,
  statusWaiting: false,
  statusCancelled: false,
  statusDiscount: false,
  bonuses: false,
  // Начисленное показываем и здесь: иначе у санитарок/администраторов видны
  // только аванс и «К выплате», и минус в остатке ничем не объяснён.
  percent: true,
};

/**
 * Из чего сложилось «Начислено» за месяц. Показываем только ненулевые части:
 * состав зависит от роли (у врача — процент/фикс по услугам, у регистратора —
 * почасовая и заработок за распределённые приёмы, у санитарки — уборки).
 */
type TFunc = (key: string, options?: Record<string, unknown>) => string;

function earningsBreakdown(row: PayrollRow, t: TFunc): { label: string; value: string }[] {
  const parts: [string, string | undefined][] = [
    [t("row.breakdown.servicePercent"), row.servicePercentPay],
    [t("row.breakdown.serviceFixed"), row.serviceFixedPay],
    [t("row.breakdown.forAppointments"), row.appointmentPay],
    [t("row.breakdown.products"), row.productPay],
    [t("row.breakdown.hourly"), row.hourlyPay],
    [t("row.breakdown.cleaning"), row.cleaningEarnings],
    [t("row.breakdown.bonus"), row.bonus],
  ];
  return parts
    .filter(([, v]) => parseFloat(v || "0") > 0)
    .map(([label, v]) => ({ label, value: v as string }));
}

interface SalaryReportRowProps {
  row: PayrollRow;
  year: number;
  month: number;
  organizationId?: number;
  /** Филиальный срез — дневная детализация фильтруется тем же филиалом. */
  branchId?: number;
  isMobile?: boolean;
  columns?: ColumnConfig;
  periodSettings?: any;
  /** Открыть дравер создания расхода с префиллом (сотрудник + остаток к выплате). */
  onPayout?: (row: PayrollRow) => void;
}

const SalaryReportRow: React.FC<SalaryReportRowProps> = ({
  row,
  year,
  month,
  organizationId,
  branchId,
  isMobile,
  columns,
  periodSettings,
  onPayout,
}) => {
  const { t } = useT("salaryReports");
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [dailyData, setDailyData] = useState<EmployeeDailyDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const isRegistrator = row.roleName === "registrator" || row.roleName === "receptionist";
  const isNurse = row.roleName === "nurse" || row.roleName === "procedure";
  const cols = columns ?? (isRegistrator ? COLUMNS_REGISTRATOR : COLUMNS_DOCTOR);

  const totalHours = parseFloat(row.dayHours || "0") + parseFloat(row.nightHours || "0");
  const hasHours = parseFloat(row.dayHours || "0") > 0 || parseFloat(row.nightHours || "0") > 0;
  const breakdown = earningsBreakdown(row, t);

  // payable — есть остаток к выплате; paid — начислено, но авансы всё покрыли; none — начислений нет.
  const netPayable = Math.round(parseFloat(row.netSalary || "0"));
  const payState: "payable" | "paid" | "none" =
    netPayable > 0 ? "payable" : parseFloat(row.earnings || "0") > 0 ? "paid" : "none";

  // Detail loading on expand
  const detailFetchedRef = useRef<string>("");
  useEffect(() => {
    if (!open) return;
    const cacheKey = `${row.employeeId}-${year}-${month}-${branchId ?? "all"}`;
    if (detailFetchedRef.current === cacheKey) return;
    detailFetchedRef.current = cacheKey;

    setDetailLoading(true);
    setDailyData([]);

    getEmployeeDailyDetails(row.employeeId, { year, month, organizationId, branchId })
      .then((data) => {
        // Пустые дни (без часов, приёмов, начислений и выплат) не показываем.
        setDailyData(
          data.filter(
            (d) =>
              parseFloat(d.dayHours || "0") > 0 ||
              parseFloat(d.nightHours || "0") > 0 ||
              d.appointmentsCount > 0 ||
              d.createdByCount > 0 ||
              parseFloat(d.percentSum || "0") > 0 ||
              parseFloat(d.expensesSum || "0") > 0 ||
              parseFloat(d.totalSalary || "0") > 0,
          ),
        );
      })
      .catch((err) => {
        console.warn("Failed to load daily details:", err);
      })
      .finally(() => {
        setDetailLoading(false);
      });
  }, [open, row.employeeId, year, month, organizationId, branchId]);

  const collapseRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    setOpen(!open);
  };

  // Scroll details into view
  useEffect(() => {
    if (open && collapseRef.current) {
      setTimeout(() => {
        collapseRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 350);
    }
  }, [open]);

  // Mobile layout
  if (isMobile) {
    return (
      <Card
        variant="outlined"
        sx={{
          borderRadius: 1.5,
          transition: "all 0.2s",
          boxShadow: open ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
          border: open
            ? `1px solid ${theme.palette.primary.main}`
            : `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ p: 1.25, cursor: "pointer" }} onClick={handleToggle}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "info.main", flexShrink: 0 }} />
                <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: "0.85rem", color: "text.primary" }}>
                  {row.fullName}
                </Typography>
              </Stack>
            </Box>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", fontWeight: 700, textTransform: "uppercase", fontSize: "0.55rem", lineHeight: 1.2 }}
                >
                  {t("row.total")}
                </Typography>
                <Typography fontWeight={800} color="primary.main" sx={{ fontSize: "0.95rem", lineHeight: 1.1 }}>
                  {formatKGS(row.netSalary)}
                </Typography>
              </Box>
              {open ? (
                <KeyboardArrowUpIcon sx={{ fontSize: "1rem", color: "text.disabled" }} />
              ) : (
                <KeyboardArrowDownIcon sx={{ fontSize: "1rem", color: "text.disabled" }} />
              )}
            </Stack>
          </Stack>

          <Grid2 container spacing={0.5}>
            {cols.hours && (
              <Grid2 size={4}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", lineHeight: 1.2 }}>
                  {t("row.hoursShort")}
                </Typography>
                <Typography sx={{ fontSize: "0.78rem" }} fontWeight={700}>
                  {t("row.hoursUnit", { hours: totalHours.toFixed(1) })}
                </Typography>
              </Grid2>
            )}
            {cols.createdBy && isRegistrator && (
              <Grid2 size={4}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", lineHeight: 1.2 }}>
                  {t("row.created")}
                </Typography>
                <Typography sx={{ fontSize: "0.78rem" }} fontWeight={700} color="success.main">
                  {row.createdByCount}
                </Typography>
              </Grid2>
            )}
            {cols.distributed && isRegistrator && (
              <Grid2 size={4}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", lineHeight: 1.2 }}>
                  {t("row.distributedShort")}
                </Typography>
                <Typography sx={{ fontSize: "0.78rem" }} fontWeight={700} color="info.main">
                  {parseFloat(row.distributedAppointments || "0").toFixed(0)}
                </Typography>
              </Grid2>
            )}
            {cols.appointments && !isRegistrator && (
              <Grid2 size={4}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", lineHeight: 1.2 }}>
                  {t("row.allAppointments")}
                </Typography>
                <Typography sx={{ fontSize: "0.78rem" }} fontWeight={700}>
                  {row.totalCount}
                </Typography>
              </Grid2>
            )}
            <Grid2 size={4}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", lineHeight: 1.2 }}>
                {t("row.earnings")}
              </Typography>
              <Typography sx={{ fontSize: "0.78rem" }} fontWeight={700}>
                {formatKGS(row.earnings)}
              </Typography>
            </Grid2>
            <Grid2 size={4}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem", display: "block", lineHeight: 1.2 }}>
                {t("row.advance")}
              </Typography>
              <Typography sx={{ fontSize: "0.78rem" }} fontWeight={700} color="error.main">
                {formatKGS(row.advances)}
              </Typography>
            </Grid2>
          </Grid2>
        </Box>

        <Collapse in={open}>
          <Divider />
          <Box ref={collapseRef} sx={{ p: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" gutterBottom sx={{ display: "block", mb: 1 }}>
              {t("row.byDay")}
            </Typography>
            {detailLoading ? (
              <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Stack spacing={1.5}>
                {dailyData.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    {parseFloat(row.cleaningEarnings || "0") > 0
                      ? t("row.noAccrualsCleaningOnly")
                      : t("row.noDataMonth")}
                  </Typography>
                ) : (
                  dailyData.map((day, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      p: 2,
                      borderRadius: 1.5,
                      bgcolor: day.isWeekend
                        ? alpha(theme.palette.info.main, 0.08)
                        : theme.palette.background.paper,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="body2" fontWeight={800} color={day.isWeekend ? "info.main" : "text.primary"}>
                        {dayjs(day.workDate).format("DD.MM (dd)")}
                      </Typography>
                      <Typography variant="body1" fontWeight={800} color="primary.main">
                        {formatKGS(day.totalSalary)}
                      </Typography>
                    </Stack>

                    <Grid2 container spacing={2}>
                      <Grid2 size={4}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem", display: "block", mb: 0.5 }}>
                          {t("row.hoursShort")}
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" fontWeight={700}>
                            {parseFloat(day.dayHours).toFixed(1)} / {parseFloat(day.nightHours).toFixed(1)}
                          </Typography>
                          {day.hasWarning && (
                            <Tooltip title={t("row.anomalyDuration")}>
                              <ReportProblemIcon sx={{ color: "error.main", fontSize: "0.85rem" }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </Grid2>
                      {isRegistrator ? (
                        <Grid2 size={4}>
                          <Typography variant="caption" color="success.main" sx={{ fontSize: "0.65rem", display: "block", mb: 0.5 }}>
                            {t("row.createdShort")}
                          </Typography>
                          <Typography variant="body2" fontWeight={700} color="success.main">
                            {day.createdByCount}
                          </Typography>
                        </Grid2>
                      ) : (
                        <Grid2 size={4}>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem", display: "block", mb: 0.5 }}>
                            {t("row.appointmentsShort")}
                          </Typography>
                          <Typography variant="body2" fontWeight={700}>
                            {day.appointmentsCount}
                          </Typography>
                        </Grid2>
                      )}
                      <Grid2 size={4}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem", display: "block", mb: 0.5 }}>
                          {t("row.percent")}
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {formatKGS(day.percentSum)}
                        </Typography>
                      </Grid2>
                      {parseFloat(day.expensesSum) > 0 && (
                        <Grid2 size={12}>
                          <Typography variant="caption" color="error.main" fontWeight={700} sx={{ fontSize: "0.7rem" }}>
                            {t("row.paidOut", { amount: formatKGS(day.expensesSum) })}
                          </Typography>
                        </Grid2>
                      )}
                    </Grid2>
                  </Box>
                ))
                )}

                {/* Summary — показываем при любых начислениях (в т.ч. только уборки) */}
                {parseFloat(row.earnings || "0") > 0 && (
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t("row.earnings")}
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatKGS(row.earnings)}
                    </Typography>
                  </Stack>
                  {breakdown.map((p) => (
                    <Stack key={p.label} direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5, pl: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                        {t("row.inclLower", { label: p.label.toLowerCase() })}
                      </Typography>
                      <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.7rem" }}>
                        {formatKGS(p.value)}
                      </Typography>
                    </Stack>
                  ))}
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t("row.totalAdvances")}
                    </Typography>
                    <Typography variant="body2" fontWeight={700} color="error.main">
                      {formatKGS(row.advances)}
                    </Typography>
                  </Stack>
                  <Divider sx={{ my: 0.75 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={800}>
                      {t("row.totalPayable")}
                    </Typography>
                    <Typography variant="body1" fontWeight={800} color="primary.main">
                      {formatKGS(row.netSalary)}
                    </Typography>
                  </Stack>
                  {onPayout && payState === "payable" && (
                    <Button
                      fullWidth
                      size="small"
                      variant="contained"
                      color="success"
                      disableElevation
                      startIcon={<PaymentsOutlinedIcon />}
                      onClick={() => onPayout(row)}
                      sx={{ mt: 1.25, borderRadius: 1.5, fontWeight: 700 }}
                    >
                      {t("row.payoutAmount", { amount: formatKGS(row.netSalary) })}
                    </Button>
                  )}
                  {onPayout && payState === "paid" && (
                    <Chip
                      size="small"
                      color="success"
                      variant="outlined"
                      label={t("actions.paidBadge")}
                      sx={{ mt: 1.25, fontWeight: 700, alignSelf: "flex-start" }}
                    />
                  )}
                </Box>
                )}
              </Stack>
            )}
          </Box>
        </Collapse>
      </Card>
    );
  }

  // Desktop table row layout
  return (
    <>
      <TableRow
        hover
        onClick={handleToggle}
        sx={{
          cursor: "pointer",
          "&:last-child td": { border: 0 },
          bgcolor: open ? alpha(theme.palette.primary.main, 0.02) : "inherit",
        }}
      >
        <TableCell sx={{ py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton size="small">
              {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
            <Typography component="div" variant="body2" fontWeight={700} sx={{ display: "flex", alignItems: "center" }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "info.main", mr: 1.5, flexShrink: 0 }} />
              {row.fullName}
            </Typography>
          </Stack>
        </TableCell>
        
        {cols.hours && !periodSettings?.merge_night_into_day && (
          <>
            <TableCell align="center">{parseFloat(row.dayHours || "0").toFixed(1)}</TableCell>
            <TableCell align="center">{parseFloat(row.nightHours || "0").toFixed(1)}</TableCell>
          </>
        )}
        {cols.hours && (
          <TableCell align="right" sx={{ fontWeight: 700 }}>
            {totalHours.toFixed(1)}
          </TableCell>
        )}

        {cols.appointments && (
          <TableCell align="center">
            {row.appointmentsCount}
          </TableCell>
        )}

        {cols.distributed && (
          <TableCell align="center" sx={{ color: "info.main", fontWeight: 700 }}>
            {parseFloat(row.distributedAppointments || "0").toFixed(0)}
          </TableCell>
        )}

        {cols.createdBy && (
          <TableCell align="center" sx={{ color: "success.main", fontWeight: 700 }}>
            {row.createdByCount}
          </TableCell>
        )}

        {cols.statusWaiting && (
          <TableCell align="center">{row.waitingCount}</TableCell>
        )}

        {cols.statusCancelled && (
          <TableCell align="center">{row.cancelledCount}</TableCell>
        )}

        {cols.statusDiscount && (
          <TableCell align="center">{row.discountedCount}</TableCell>
        )}

        {cols.bonuses && (
          <TableCell align="right">
            {parseFloat(row.bonus || "0") > 0 ? formatKGS(row.bonus as string) : "—"}
          </TableCell>
        )}

        {/* «Зарплата» = всё начисленное за месяц: у врача это процент/фикс по
            услугам, у регистратора — почасовая + заработок за распределённые
            приёмы. Раньше здесь стоял только servicePercentPay, из-за чего у
            регистраторов колонка всегда была 0. */}
        {cols.percent && (
          <TableCell align="right">
            {breakdown.length > 0 ? (
              <Tooltip
                title={
                  <Box>
                    {breakdown.map((p) => (
                      <Stack key={p.label} direction="row" spacing={2} justifyContent="space-between">
                        <span>{p.label}</span>
                        <span>{formatKGS(p.value)}</span>
                      </Stack>
                    ))}
                  </Box>
                }
              >
                <span>{formatKGS(row.earnings)}</span>
              </Tooltip>
            ) : (
              formatKGS(row.earnings)
            )}
          </TableCell>
        )}

        <TableCell align="right" sx={{ color: "error.main", fontWeight: 700 }}>
          {formatKGS(row.advances)}
        </TableCell>

        <TableCell align="right" sx={{ color: "primary.main", fontWeight: 700 }}>
          {formatKGS(row.netSalary)}
        </TableCell>

        {onPayout && (
          <TableCell
            align="right"
            onClick={(e) => e.stopPropagation()}
            sx={{ whiteSpace: "nowrap", width: 0, cursor: "default" }}
          >
            {payState === "payable" ? (
              <Tooltip title={t("tooltips.createExpensePayout", { amount: formatKGS(row.netSalary), name: row.fullName })}>
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  onClick={() => onPayout(row)}
                  startIcon={<PaymentsOutlinedIcon sx={{ fontSize: "1rem !important" }} />}
                  sx={{
                    borderRadius: 1.5,
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    lineHeight: 1.4,
                    py: 0.25,
                    px: 1,
                    minWidth: "auto",
                    whiteSpace: "nowrap",
                    bgcolor: alpha(theme.palette.success.main, 0.06),
                    "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.14) },
                  }}
                >
                  {t("actions.payout")}
                </Button>
              </Tooltip>
            ) : payState === "paid" ? (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={t("actions.paidBadge")}
                sx={{ fontWeight: 700, height: 22, fontSize: "0.65rem" }}
              />
            ) : null}
          </TableCell>
        )}
      </TableRow>

      <TableRow sx={{ bgcolor: alpha(theme.palette.background.default, 0.4) }}>
        <TableCell colSpan={14} style={{ paddingBottom: 0, paddingTop: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box ref={collapseRef} sx={{ margin: 2 }}>
              <Typography variant="subtitle2" fontWeight={800} gutterBottom component="div">
                {t("row.dailyDetail")}
              </Typography>
              {detailLoading ? (
                <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Stack spacing={2}>
                  {dailyData.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                      {parseFloat(row.cleaningEarnings || "0") > 0
                        ? t("row.noAccrualsCleaningOnly")
                        : t("row.noDataMonthAlt")}
                    </Typography>
                  ) : (
                  <Table size="small" sx={{ "& .MuiTableCell-root": { py: 0.75 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>{t("row.date")}</TableCell>
                        {!periodSettings?.merge_night_into_day && (
                          <>
                            <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.dayHoursFull")}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.nightHoursFull")}</TableCell>
                          </>
                        )}
                        {periodSettings?.merge_night_into_day && (
                          <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.hoursShort")}</TableCell>
                        )}
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{t("row.hourlyPay")}</TableCell>
                        {isRegistrator ? (
                          <TableCell align="center" sx={{ fontWeight: 800, color: "success.main" }}>{t("row.createdAppointments")}</TableCell>
                        ) : (
                          <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.allAppointmentsFull")}</TableCell>
                        )}
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{t("row.servicesSum")}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: "error.main" }}>{t("row.advancesPaid")}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: "primary.main" }}>{t("row.totalPerDay")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dailyData.map((day, idx) => (
                        <TableRow
                          key={idx}
                          sx={{
                            bgcolor: day.isWeekend ? alpha(theme.palette.info.main, 0.04) : "inherit",
                          }}
                        >
                          <TableCell sx={{ fontWeight: day.isWeekend ? 700 : "inherit" }}>
                            {dayjs(day.workDate).format("DD.MM (dd)")}
                          </TableCell>
                          {!periodSettings?.merge_night_into_day && (
                            <>
                              <TableCell align="center">{parseFloat(day.dayHours).toFixed(1)}</TableCell>
                              <TableCell align="center">{parseFloat(day.nightHours).toFixed(1)}</TableCell>
                            </>
                          )}
                          {periodSettings?.merge_night_into_day && (
                            <TableCell align="center">{(parseFloat(day.dayHours) + parseFloat(day.nightHours)).toFixed(1)}</TableCell>
                          )}
                          <TableCell align="right">{formatKGS(day.hoursSum)}</TableCell>
                          {isRegistrator ? (
                            <TableCell align="center" sx={{ color: "success.main", fontWeight: 700 }}>
                              {day.createdByCount}
                            </TableCell>
                          ) : (
                            <TableCell align="center">{day.appointmentsCount}</TableCell>
                          )}
                          <TableCell align="right">{formatKGS(day.percentSum)}</TableCell>
                          <TableCell align="right" sx={{ color: parseFloat(day.expensesSum) > 0 ? "error.main" : "inherit" }}>
                            {parseFloat(day.expensesSum) > 0 ? formatKGS(day.expensesSum) : "—"}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatKGS(day.totalSalary)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}

                  {/* Summary Box — показываем при любых начислениях (в т.ч. только уборки, без дневных строк) */}
                  {parseFloat(row.earnings || "0") > 0 && (
                  <Box
                    sx={{
                      ml: "auto",
                      width: 320,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">{t("row.accruedMonth")}</Typography>
                        <Typography variant="body2" fontWeight={700}>{formatKGS(row.earnings)}</Typography>
                      </Stack>
                      {/* Часть начислений (за распределённые приёмы, уборки,
                          надбавки) считается за месяц целиком и по дням не
                          раскладывается — поэтому показываем состав. */}
                      {breakdown.map((p) => (
                        <Stack key={p.label} direction="row" justifyContent="space-between" sx={{ pl: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">{t("row.inclLowerColon", { label: p.label.toLowerCase() })}</Typography>
                          <Typography variant="caption" fontWeight={700}>{formatKGS(p.value)}</Typography>
                        </Stack>
                      ))}
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">{t("row.advancesPaidColon")}</Typography>
                        <Typography variant="body2" fontWeight={700} color="error.main">{formatKGS(row.advances)}</Typography>
                      </Stack>
                      <Divider />
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={800}>{t("row.totalPayableColon")}</Typography>
                        <Typography variant="body2" fontWeight={800} color="primary.main">{formatKGS(row.netSalary)}</Typography>
                      </Stack>
                    </Stack>
                  </Box>
                  )}
                </Stack>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

export default SalaryReportRow;
