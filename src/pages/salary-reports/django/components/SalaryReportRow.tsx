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
  TableFooter,
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
  getBonuses,
  getEmployeeDailyDetails,
  type PayrollBonus,
  type PayrollRow,
  type EmployeeDailyDetailRow,
} from "../../../../api/payroll";
import { useT } from "../../../../i18n/VerticalProvider";
import type { PayrollMonthSettings } from "../../../../features/payroll/types";

dayjs.locale("ru");

export interface ColumnConfig {
  hours: boolean;
  appointments: boolean;
  distributed: boolean;
  createdBy: boolean;
  statusWaiting: boolean;
  statusCancelled: boolean;
  statusDiscount: boolean;
  appointmentPay: boolean;
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
  appointmentPay: true,
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
  appointmentPay: false,
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
  appointmentPay: false,
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
  appointmentPay: false,
  bonuses: false,
  // Начисленное показываем и здесь: иначе у санитарок/администраторов видны
  // только аванс и «К выплате», и минус в остатке ничем не объяснён.
  percent: true,
};

const toNumber = (value: string | number | null | undefined): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const hasValue = (value: number): boolean => Math.abs(value) > Number.EPSILON;

/**
 * Hides configured columns that contain only zeroes for the current report.
 * Desktop tables calculate this for the whole role group so every row keeps
 * the same number of cells; mobile cards pass one row and hide metrics alone.
 */
export function getVisibleSalaryColumns(
  rows: readonly PayrollRow[],
  baseColumns: ColumnConfig,
): ColumnConfig {
  if (rows.length === 0) return baseColumns;

  const hasAny = (getValue: (row: PayrollRow) => number): boolean =>
    rows.some((row) => hasValue(getValue(row)));

  return {
    ...baseColumns,
    hours: baseColumns.hours && hasAny((row) => toNumber(row.dayHours) + toNumber(row.nightHours)),
    appointments: baseColumns.appointments && hasAny((row) => row.appointmentsCount),
    distributed: baseColumns.distributed && hasAny((row) => toNumber(row.distributedAppointments)),
    createdBy: baseColumns.createdBy && hasAny((row) => row.createdByCount),
    statusWaiting: baseColumns.statusWaiting && hasAny((row) => row.waitingCount),
    statusCancelled: baseColumns.statusCancelled && hasAny((row) => row.cancelledCount),
    statusDiscount: baseColumns.statusDiscount && hasAny((row) => row.discountedCount),
    appointmentPay: baseColumns.appointmentPay && hasAny((row) => toNumber(row.appointmentPay)),
    bonuses: baseColumns.bonuses && hasAny((row) => toNumber(row.bonus)),
    percent: baseColumns.percent && hasAny((row) => toNumber(row.earnings)),
  };
}

/**
 * Сотрудник без единой цифры за месяц: ни часов, ни приёмов, ни начислений,
 * ни авансов. Такие строки — сплошные нули во всех колонках, читать в них
 * нечего, поэтому в отчёте они не показываются (решение заказчика 17.08.2026).
 * Достаточно одного ненулевого значения, чтобы строка вернулась в таблицу.
 */
export function isEmptyPayrollRow(row: PayrollRow): boolean {
  const counters = [
    row.appointmentsCount,
    row.createdByCount,
    row.totalCount,
    row.waitingCount,
    row.cancelledCount,
    row.discountedCount,
    row.paidCount,
  ];
  const amounts = [
    row.distributedAppointments,
    row.servicePercentPay,
    row.serviceFixedPay,
    row.appointmentPay,
    row.dayHours,
    row.nightHours,
    row.hourlyPay,
    row.bonus,
    row.productPay,
    row.cleaningEarnings,
    row.earnings,
    row.advances,
    row.netSalary,
  ];
  return (
    !counters.some((value) => hasValue(toNumber(value))) &&
    !amounts.some((value) => hasValue(toNumber(value)))
  );
}

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

/**
 * Части «Начислено», которые бэк считает за месяц целиком и по дням не
 * раскладывает (в `/employees/<id>/details/` их нет вовсе): заработок за
 * распределённые приёмы, товары, уборки, надбавка. Без них итог дневной
 * таблицы не сходится с месячным — особенно у регистраторов, у которых «за
 * приёмы» и есть основной заработок.
 *
 * ⚠ По дням с 05.08.2026 раскладывается только СЧЁТЧИК распределённых приёмов
 * (`distributedAppointments`), но не деньги за них (`appointmentPay`) — их в
 * дневном ответе по-прежнему нет.
 */
function monthlyOnlyBreakdown(row: PayrollRow, t: TFunc): { label: string; value: string }[] {
  const parts: [string, string | undefined][] = [
    [t("row.breakdown.forAppointments"), row.appointmentPay],
    [t("row.breakdown.products"), row.productPay],
    [t("row.breakdown.cleaning"), row.cleaningEarnings],
    [t("row.breakdown.bonus"), row.bonus],
  ];
  return parts
    .filter(([, v]) => parseFloat(v || "0") > 0)
    .map(([label, v]) => ({ label, value: v as string }));
}

const sumBy = (rows: EmployeeDailyDetailRow[], pick: (d: EmployeeDailyDetailRow) => string) =>
  rows.reduce((s, d) => s + parseFloat(pick(d) || "0"), 0);

/**
 * Распределённые приёмы — доля, а не штука: один приём делится между
 * регистраторами смены, и по дням выходит «1,5». Целое показываем без хвоста,
 * дробное — с одним знаком, иначе округление до штук врало бы в сумме.
 */
const formatShare = (value: string | number): string => {
  const n = typeof value === "number" ? value : parseFloat(value || "0");
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

interface SalaryReportRowProps {
  row: PayrollRow;
  year: number;
  month: number;
  organizationId?: number;
  /** Филиальный срез — дневная детализация фильтруется тем же филиалом. */
  branchId?: number;
  isMobile?: boolean;
  columns?: ColumnConfig;
  periodSettings?: PayrollMonthSettings;
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
  const cols = columns ?? getVisibleSalaryColumns([row], isRegistrator ? COLUMNS_REGISTRATOR : COLUMNS_DOCTOR);

  const totalHours = parseFloat(row.dayHours || "0") + parseFloat(row.nightHours || "0");
  const hasHours = parseFloat(row.dayHours || "0") > 0 || parseFloat(row.nightHours || "0") > 0;
  const breakdown = earningsBreakdown(row, t);
  const monthlyOnly = monthlyOnlyBreakdown(row, t);

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
              parseFloat(d.distributedAppointments || "0") > 0 ||
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

  // Надбавки за месяц: в отчёте это одна сумма в колонке «Надбавка», а за что
  // она начислена — видно только в журнале /payroll/bonuses/. Тянем при
  // раскрытии, чтобы в детализации была причина, а не молчаливая цифра.
  const hasBonus = parseFloat(row.bonus || "0") > 0;
  const [bonuses, setBonuses] = useState<PayrollBonus[]>([]);
  const bonusesFetchedRef = useRef<string>("");
  useEffect(() => {
    if (!open || !hasBonus) return;
    const cacheKey = `${row.employeeId}-${year}-${month}`;
    if (bonusesFetchedRef.current === cacheKey) return;
    bonusesFetchedRef.current = cacheKey;

    getBonuses({ year, month, employeeId: row.employeeId, organizationId })
      .then(setBonuses)
      .catch((err) => {
        // Не критично: сумма надбавки и без журнала показана в сводке.
        console.warn("Failed to load bonuses:", err);
      });
  }, [open, hasBonus, row.employeeId, year, month, organizationId]);

  // Итоги дневной таблицы. Сверяются с месячными: Σ hoursSum = hourlyPay,
  // Σ percentSum = процент + фикс по услугам, Σ expensesSum = авансы.
  const dayTotals = {
    dayHours: sumBy(dailyData, (d) => d.dayHours),
    nightHours: sumBy(dailyData, (d) => d.nightHours),
    hoursSum: sumBy(dailyData, (d) => d.hoursSum),
    appointments: dailyData.reduce((s, d) => s + (d.appointmentsCount || 0), 0),
    createdBy: dailyData.reduce((s, d) => s + (d.createdByCount || 0), 0),
    distributed: sumBy(dailyData, (d) => d.distributedAppointments),
    percentSum: sumBy(dailyData, (d) => d.percentSum),
    expensesSum: sumBy(dailyData, (d) => d.expensesSum),
    totalSalary: sumBy(dailyData, (d) => d.totalSalary),
  };
  // Начислено по дням — до вычета авансов (в totalSalary дня аванс уже вычтен).
  const accruedByDays = dayTotals.hoursSum + dayTotals.percentSum;
  // Без дневных строк сверка «по дням + месячные» превратилась бы в «по дням 0
  // + всё прочее» — тогда показываем прежний состав начислений.
  const hasDaily = dailyData.length > 0;
  const monthlyOnlySum = monthlyOnly.reduce((s, p) => s + parseFloat(p.value || "0"), 0);
  // Счётчик приёмов в дневной разбивке расходится с месячным (проверено на
  // проде: у регистратора 36 по дням против 40 за месяц) — это расхождение
  // бэкенда, помечаем, чтобы не читалось как ошибка витрины.
  const countsByDays = isRegistrator ? dayTotals.createdBy : dayTotals.appointments;
  const countsInMonth = isRegistrator ? row.createdByCount : row.appointmentsCount;
  const countsMismatch = dailyData.length > 0 && countsByDays !== countsInMonth;
  // Распределяемую часть бэк раскладывает по дням с 05.08.2026 (раньше в днях
  // всегда лежал 0.00). Сумма должна сходиться с месячной «с учётом
  // округления» — расхождение больше половины приёма помечаем.
  const distributedMismatch =
    dailyData.length > 0 &&
    Math.abs(dayTotals.distributed - parseFloat(row.distributedAppointments || "0")) > 0.5;
  // Остаток, который не объясняется ни днями, ни месячными частями. Обычно 0;
  // показываем строкой, чтобы сводка не «не сходилась» молча.
  const unexplained =
    parseFloat(row.earnings || "0") - accruedByDays - monthlyOnlySum;
  const hasUnexplained = Math.abs(unexplained) >= 1;

  // Детальная таблица должна использовать ту же логику, что и сводная:
  // нулевые метрики конкретного сотрудника не занимают место. При этом
  // столбец возвращается автоматически, как только в дневных данных появится
  // ненулевое значение.
  const hasDailyValue = (getValue: (day: EmployeeDailyDetailRow) => number): boolean =>
    dailyData.some((day) => hasValue(getValue(day)));
  const detailHoursVisible =
    cols.hours &&
    (hasHours || hasDailyValue((day) => toNumber(day.dayHours) + toNumber(day.nightHours)));
  const detailHourlyPayVisible =
    detailHoursVisible &&
    (toNumber(row.hourlyPay) !== 0 || hasDailyValue((day) => toNumber(day.hoursSum)));
  const detailAppointmentsVisible =
    cols.appointments && hasDailyValue((day) => day.appointmentsCount);
  const detailDistributedVisible =
    cols.distributed && hasDailyValue((day) => toNumber(day.distributedAppointments));
  const detailCreatedByVisible =
    cols.createdBy && hasDailyValue((day) => day.createdByCount);
  const detailServicesVisible =
    cols.percent && hasDailyValue((day) => toNumber(day.percentSum));
  const detailAdvancesVisible =
    hasValue(toNumber(row.advances)) || hasDailyValue((day) => toNumber(day.expensesSum));

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
                        <>
                          <Grid2 size={4}>
                            <Typography variant="caption" color="success.main" sx={{ fontSize: "0.65rem", display: "block", mb: 0.5 }}>
                              {t("row.createdShort")}
                            </Typography>
                            <Typography variant="body2" fontWeight={700} color="success.main">
                              {day.createdByCount}
                            </Typography>
                          </Grid2>
                          <Grid2 size={4}>
                            <Typography variant="caption" color="info.main" sx={{ fontSize: "0.65rem", display: "block", mb: 0.5 }}>
                              {t("row.distributedShort")}
                            </Typography>
                            <Typography variant="body2" fontWeight={700} color="info.main">
                              {formatShare(day.distributedAppointments)}
                            </Typography>
                          </Grid2>
                        </>
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
                  {hasDaily ? (
                    <>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {t("row.accruedByDays")}
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {formatKGS(String(accruedByDays))}
                        </Typography>
                      </Stack>
                      {monthlyOnly.length > 0 && (
                        <>
                          <Typography variant="caption" color="text.disabled" sx={{ display: "block", fontSize: "0.6rem", mb: 0.5 }}>
                            {t("row.monthlyOnlyHint")}
                          </Typography>
                          {monthlyOnly.map((p) => (
                            <Stack key={p.label} direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5, pl: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                                {p.label}
                              </Typography>
                              <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.7rem" }}>
                                + {formatKGS(p.value)}
                              </Typography>
                            </Stack>
                          ))}
                        </>
                      )}
                      {hasBonus && bonuses.map((b) => (
                        <Stack key={b.id} direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 0.5, pl: 2 }}>
                          <Typography variant="caption" color="text.disabled" noWrap sx={{ fontSize: "0.6rem", minWidth: 0 }}>
                            {dayjs(b.createdAt).format("DD.MM")} · {b.reason || t("bonusDrawer.noReason")}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6rem", flexShrink: 0 }}>
                            {formatKGS(b.amount)}
                          </Typography>
                        </Stack>
                      ))}
                      {hasUnexplained && (
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5, pl: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                            {t("row.otherAccruals")}
                          </Typography>
                          <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.7rem" }}>
                            {unexplained > 0 ? "+ " : "− "}
                            {formatKGS(String(Math.abs(unexplained)))}
                          </Typography>
                        </Stack>
                      )}
                    </>
                  ) : (
                    breakdown.map((p) => (
                      <Stack key={p.label} direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5, pl: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                          {t("row.inclLower", { label: p.label.toLowerCase() })}
                        </Typography>
                        <Typography variant="caption" fontWeight={700} sx={{ fontSize: "0.7rem" }}>
                          {formatKGS(p.value)}
                        </Typography>
                      </Stack>
                    ))
                  )}
                  <Divider sx={{ my: 0.75 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t("row.earnings")}
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {formatKGS(row.earnings)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {t("row.totalAdvances")}
                    </Typography>
                    <Typography variant="body2" fontWeight={700} color="error.main">
                      − {formatKGS(row.advances)}
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

        {cols.appointmentPay && (
          <TableCell align="right" sx={{ fontWeight: 700 }}>
            {parseFloat(row.appointmentPay || "0") > 0 ? formatKGS(row.appointmentPay as string) : "—"}
          </TableCell>
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
                        {detailHoursVisible && !periodSettings?.merge_night_into_day && (
                          <>
                            <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.dayHoursFull")}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.nightHoursFull")}</TableCell>
                          </>
                        )}
                        {detailHoursVisible && periodSettings?.merge_night_into_day && (
                          <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.hoursShort")}</TableCell>
                        )}
                        {detailHourlyPayVisible && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>{t("row.hourlyPay")}</TableCell>
                        )}
                        {isRegistrator ? (
                          <>
                            {detailCreatedByVisible && (
                            <TableCell align="center" sx={{ fontWeight: 800, color: "success.main" }}>{t("row.createdAppointments")}</TableCell>
                            )}
                            {detailDistributedVisible && (
                            <TableCell align="center" sx={{ fontWeight: 800, color: "info.main" }}>{t("row.distributedShort")}</TableCell>
                            )}
                          </>
                        ) : detailAppointmentsVisible ? (
                          <TableCell align="center" sx={{ fontWeight: 800 }}>{t("row.allAppointmentsFull")}</TableCell>
                        ) : null}
                        {detailServicesVisible && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>{t("row.servicesSum")}</TableCell>
                        )}
                        {detailAdvancesVisible && (
                          <TableCell align="right" sx={{ fontWeight: 800, color: "error.main" }}>{t("row.advancesPaid")}</TableCell>
                        )}
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
                          {detailHoursVisible && !periodSettings?.merge_night_into_day && (
                            <>
                              <TableCell align="center">{parseFloat(day.dayHours).toFixed(1)}</TableCell>
                              <TableCell align="center">{parseFloat(day.nightHours).toFixed(1)}</TableCell>
                            </>
                          )}
                          {detailHoursVisible && periodSettings?.merge_night_into_day && (
                            <TableCell align="center">{(parseFloat(day.dayHours) + parseFloat(day.nightHours)).toFixed(1)}</TableCell>
                          )}
                          {detailHourlyPayVisible && (
                            <TableCell align="right">{formatKGS(day.hoursSum)}</TableCell>
                          )}
                          {isRegistrator ? (
                            <>
                              {detailCreatedByVisible && (
                                <TableCell align="center" sx={{ color: "success.main", fontWeight: 700 }}>
                                  {day.createdByCount}
                                </TableCell>
                              )}
                              {detailDistributedVisible && (
                                <TableCell align="center" sx={{ color: "info.main", fontWeight: 700 }}>
                                  {formatShare(day.distributedAppointments)}
                                </TableCell>
                              )}
                            </>
                          ) : detailAppointmentsVisible ? (
                            <TableCell align="center">{day.appointmentsCount}</TableCell>
                          ) : null}
                          {detailServicesVisible && (
                            <TableCell align="right">{formatKGS(day.percentSum)}</TableCell>
                          )}
                          {detailAdvancesVisible && (
                            <TableCell align="right" sx={{ color: parseFloat(day.expensesSum) > 0 ? "error.main" : "inherit" }}>
                              {parseFloat(day.expensesSum) > 0 ? formatKGS(day.expensesSum) : "—"}
                            </TableCell>
                          )}
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {formatKGS(day.totalSalary)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow
                        sx={{
                          bgcolor: alpha(theme.palette.primary.main, 0.06),
                          "& .MuiTableCell-root": {
                            fontWeight: 800,
                            color: "text.primary",
                            fontSize: "0.8125rem",
                            borderTop: `1px solid ${theme.palette.divider}`,
                          },
                        }}
                      >
                        <TableCell>{t("row.totalByDays")}</TableCell>
                        {detailHoursVisible && !periodSettings?.merge_night_into_day ? (
                          <>
                            <TableCell align="center">{dayTotals.dayHours.toFixed(1)}</TableCell>
                            <TableCell align="center">{dayTotals.nightHours.toFixed(1)}</TableCell>
                          </>
                        ) : detailHoursVisible ? (
                          <TableCell align="center">
                            {(dayTotals.dayHours + dayTotals.nightHours).toFixed(1)}
                          </TableCell>
                        ) : null}
                        {detailHourlyPayVisible && (
                          <TableCell align="right">{formatKGS(String(dayTotals.hoursSum))}</TableCell>
                        )}
                        {detailAppointmentsVisible && !isRegistrator && (
                          <TableCell align="center" sx={{ color: isRegistrator ? "success.main" : undefined }}>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                              <span>{countsByDays}</span>
                              {countsMismatch && (
                                <Tooltip
                                  title={t("row.countsMismatch", { days: countsByDays, month: countsInMonth })}
                                >
                                  <ReportProblemIcon sx={{ color: "warning.main", fontSize: "0.85rem" }} />
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        )}
                        {detailCreatedByVisible && isRegistrator && (
                          <TableCell align="center" sx={{ color: "success.main" }}>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                              <span>{countsByDays}</span>
                              {countsMismatch && (
                                <Tooltip
                                  title={t("row.countsMismatch", { days: countsByDays, month: countsInMonth })}
                                >
                                  <ReportProblemIcon sx={{ color: "warning.main", fontSize: "0.85rem" }} />
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        )}
                        {detailDistributedVisible && isRegistrator && (
                          <TableCell align="center" sx={{ color: "info.main" }}>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                              <span>{formatShare(dayTotals.distributed)}</span>
                              {distributedMismatch && (
                                <Tooltip
                                  title={t("row.countsMismatch", {
                                    days: formatShare(dayTotals.distributed),
                                    month: formatShare(row.distributedAppointments),
                                  })}
                                >
                                  <ReportProblemIcon sx={{ color: "warning.main", fontSize: "0.85rem" }} />
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        )}
                        {detailServicesVisible && (
                          <TableCell align="right">{formatKGS(String(dayTotals.percentSum))}</TableCell>
                        )}
                        {detailAdvancesVisible && (
                          <TableCell align="right" sx={{ color: dayTotals.expensesSum > 0 ? "error.main" : undefined }}>
                            {dayTotals.expensesSum > 0 ? formatKGS(String(dayTotals.expensesSum)) : "—"}
                          </TableCell>
                        )}
                        <TableCell align="right">{formatKGS(String(dayTotals.totalSalary))}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  )}

                  {/* Сверка: дневная таблица + месячные части = «Начислено за
                      месяц». Без неё итог по дням не сходится с месячным — у
                      регистраторов заработок за приёмы бэк по дням не даёт. */}
                  {parseFloat(row.earnings || "0") > 0 && (
                  <Box
                    sx={{
                      ml: "auto",
                      width: 380,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.05),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                    }}
                  >
                    <Stack spacing={1}>
                      {hasDaily ? (
                        <>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">{t("row.accruedByDaysColon")}</Typography>
                            <Typography variant="body2" fontWeight={700}>{formatKGS(String(accruedByDays))}</Typography>
                          </Stack>

                          {monthlyOnly.length > 0 && (
                            <>
                              <Typography variant="caption" color="text.disabled" sx={{ pt: 0.5 }}>
                                {t("row.monthlyOnlyHint")}
                              </Typography>
                              {monthlyOnly.map((p) => (
                                <Stack key={p.label} direction="row" justifyContent="space-between" sx={{ pl: 1.5 }}>
                                  <Typography variant="caption" color="text.secondary">{p.label}</Typography>
                                  <Typography variant="caption" fontWeight={700}>+ {formatKGS(p.value)}</Typography>
                                </Stack>
                              ))}
                            </>
                          )}

                          {/* За что именно начислена надбавка — из журнала надбавок. */}
                          {hasBonus && bonuses.length > 0 && (
                            <Stack spacing={0.25} sx={{ pl: 3 }}>
                              {bonuses.map((b) => (
                                <Stack key={b.id} direction="row" justifyContent="space-between" spacing={1}>
                                  <Typography variant="caption" color="text.disabled" noWrap sx={{ minWidth: 0 }}>
                                    {dayjs(b.createdAt).format("DD.MM")} · {b.reason || t("bonusDrawer.noReason")}
                                  </Typography>
                                  <Typography variant="caption" color="text.disabled" flexShrink={0}>
                                    {formatKGS(b.amount)}
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          )}

                          {hasUnexplained && (
                            <Stack direction="row" justifyContent="space-between" sx={{ pl: 1.5 }}>
                              <Typography variant="caption" color="text.secondary">{t("row.otherAccruals")}</Typography>
                              <Typography variant="caption" fontWeight={700}>
                                {unexplained > 0 ? "+ " : "− "}
                                {formatKGS(String(Math.abs(unexplained)))}
                              </Typography>
                            </Stack>
                          )}
                        </>
                      ) : (
                        breakdown.map((p) => (
                          <Stack key={p.label} direction="row" justifyContent="space-between" sx={{ pl: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">{t("row.inclLowerColon", { label: p.label.toLowerCase() })}</Typography>
                            <Typography variant="caption" fontWeight={700}>{formatKGS(p.value)}</Typography>
                          </Stack>
                        ))
                      )}

                      <Divider />
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">{t("row.accruedMonth")}</Typography>
                        <Typography variant="body2" fontWeight={700}>{formatKGS(row.earnings)}</Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">{t("row.advancesPaidColon")}</Typography>
                        <Typography variant="body2" fontWeight={700} color="error.main">− {formatKGS(row.advances)}</Typography>
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
