import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Box,
    useMediaQuery,
    useTheme,
    Paper,
    Typography,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    alpha,
    Skeleton,
    keyframes,
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";
import RefreshIcon from '@mui/icons-material/RefreshOutlined';

import { PageHeader, MonthNavigation } from "../../components/ui";
import { AppointmentsSummaryCards } from "../reports/components/AppointmentsSummaryCards";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useActiveMonths } from "../../hooks/useActiveMonths";
import { formatKGS } from "../../utility/format";
import { supabase } from "../../utility/supabaseClient";
import dayjs from "dayjs";
import SalaryReportRow, { COLUMNS_REGISTRATOR, COLUMNS_DOCTOR, COLUMNS_NURSE, COLUMNS_ADMIN, ColumnConfig } from "./components/SalaryReportRow";
import { useSalaryPeriod } from "../../features/payroll/hooks/useSalaryPeriod";
import { usePayrollSnapshots } from "../../features/payroll/hooks/usePayrollSnapshots";
import { useLockPeriod } from "../../features/payroll/hooks/useLockPeriod";
import { useRecalculatePeriod } from "../../features/payroll/hooks/useRecalculatePeriod";
import { PeriodStatusBadge } from "../../features/payroll/components/PeriodStatusBadge";
import { LockPeriodDialog } from "../../features/payroll/components/LockPeriodDialog";
import { RecalculateDialog } from "../../features/payroll/components/RecalculateDialog";
import LockIcon from "@mui/icons-material/LockOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import NightsStayIcon from "@mui/icons-material/NightsStayOutlined";
import { Button, Tooltip } from "@mui/material";
import { PeriodSettingsDialog } from "../../features/payroll/components/PeriodSettingsDialog";
import type { PayrollMonthSettings } from "../../features/payroll/types";

interface EmployeeSalaryData {
    id: string;
    full_name: string;
    role: string;
    role_name: string;
    day_hours: number;
    night_hours: number;
    hours_sum: number;
    day_hours_sum: number;
    night_hours_sum: number;
    appointments_count: number;
    distributed_appointments: number;
    created_by_count: number;
    percent_sum: number;
    expenses_sum: number;
    base_salary: number;          // ЗП до месячного коэффициента (сумма по дням)
    month_bonus_amount: number;   // дельта от множителя месяца (total_salary - base_salary)
    total_salary: number;         // итог к выплате (base_salary * multiplier)
    salary_rules: any;
    total_count: number;
    waiting_count: number;
    cancelled_count: number;
    discounted_count: number;
    paid_count: number;
    raw_shifts: any[];
    raw_appointments: any[];
    raw_expenses: any[];
}

const SalaryReportsPage: React.FC = () => {
    usePageTitle("Отчет по ЗП");
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
    const { open: notify } = useNotification();
    const { isSuperAdmin, hasRole, isRegistrator, employeeId, loading: permissionsLoading, activeOrganization } = usePermissions();
    const queryClient = useQueryClient();

    const canSeeAll = useMemo(() => isSuperAdmin() || hasRole(['accountant', 'admin']), [isSuperAdmin, hasRole]);

    const canLock = useMemo(() => isSuperAdmin() || hasRole(['accountant']), [isSuperAdmin, hasRole]);

    const pulse = keyframes`
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(0.96); }
        100% { opacity: 1; transform: scale(1); }
    `;

    // State
    const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
    const [loading, setLoading] = useState(true);
    const [salaryData, setSalaryData] = useState<EmployeeSalaryData[]>([]);
    const [lockDialogOpen, setLockDialogOpen] = useState(false);
    const [recalcDialogOpen, setRecalcDialogOpen] = useState(false);
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [periodSettings, setPeriodSettings] = useState<PayrollMonthSettings>({});
    const activeMonths = useActiveMonths('AppointmentsAggregated', 'appointment_at');

    // Payroll period — determines draft vs locked display mode
    const selectedMonth = dayjs(selectedDate).startOf('month').format('YYYY-MM-DD');
    const { period, loading: periodLoading } = useSalaryPeriod(selectedMonth);
    const { snapshots, loading: snapshotsLoading } = usePayrollSnapshots(
        period?.status === 'locked' ? period.id : null
    );
    const { lock, locking } = useLockPeriod();
    const { recalculate, recalculating } = useRecalculatePeriod();

    // Keep periodSettings in sync with loaded period (may be updated via PeriodSettingsDialog)
    useEffect(() => {
        setPeriodSettings(period?.settings ?? {});
    }, [period]);

    const activeMonthRef = React.useRef<string>('');
    const cache = React.useRef(new Map<string, EmployeeSalaryData[]>());

    const fetchData = useCallback(async (forceRefresh = false, settingsOverride?: PayrollMonthSettings) => {
        if (permissionsLoading || periodLoading) return;

        const myMonth = dayjs(selectedDate).format('YYYY-MM');
        activeMonthRef.current = myMonth;
        const isStillActive = () => activeMonthRef.current === myMonth;

        // Cache hit — только для тех кто видит всех (canSeeAll), и только для черновиков
        if (!forceRefresh && canSeeAll && period?.status !== 'locked') {
            const cached = cache.current.get(myMonth);
            if (cached) {
                setSalaryData(cached);
                setLoading(false);
                return;
            }
        }

        // Locked period — читаем из снимков, SQL не вызываем
        if (period?.status === 'locked' && snapshots.length > 0 && !snapshotsLoading) {
            const fromSnapshots: EmployeeSalaryData[] = snapshots.map(s => {
                const b = s.payload.breakdown;
                return {
                    id:                       s.employee_id,
                    full_name:                (s as any).full_name ?? s.employee_id,
                    role:                     (s as any).role ?? '',
                    role_name:                (s as any).role_name ?? '',
                    day_hours:                b.dayHours,
                    night_hours:              b.nightHours,
                    hours_sum:                b.hoursSum,
                    day_hours_sum:            b.dayHoursSum,
                    night_hours_sum:          b.nightHoursSum,
                    appointments_count:       b.appointmentsCount,
                    distributed_appointments: b.distributedAppointments,
                    created_by_count:         b.createdByCount,
                    percent_sum:              b.percentSum,
                    expenses_sum:             b.expensesSum,
                    base_salary:              (b as any).totalSalary ?? s.total_salary,
                    month_bonus_amount:       s.total_salary - ((b as any).totalSalary ?? s.total_salary),
                    total_salary:             s.total_salary,
                    salary_rules:             s.payload.rules_used,
                    total_count:              b.totalCount,
                    waiting_count:            b.waitingCount,
                    cancelled_count:          b.cancelledCount,
                    discounted_count:         b.discountedCount,
                    paid_count:               b.paidCount,
                    raw_shifts:               [],
                    raw_appointments:         [],
                    raw_expenses:             [],
                };
            });
            if (!isStillActive()) return;
            setSalaryData(canSeeAll ? fromSnapshots : fromSnapshots.filter(r => r.id === employeeId));
            setLoading(false);
            return;
        }

        setLoading(true);
        setSalaryData([]);

        try {
            const monthDate = `${myMonth}-01`;

            const { data: sqlRows, error } = await supabase.rpc('calculate_payroll_month', {
                p_month:    monthDate,
                p_settings: settingsOverride ?? periodSettings,
            });

            if (error) throw error;

            if (!isStillActive()) return;

            const finalData: EmployeeSalaryData[] = (sqlRows || []).map((r: any) => ({
                id:                       r.employee_id,
                full_name:                r.full_name,
                role:                     r.role_display,
                role_name:                r.role_name,
                day_hours:                Number(r.day_hours),
                night_hours:              Number(r.night_hours),
                hours_sum:                Number(r.hours_sum),
                day_hours_sum:            Number(r.day_hours_sum),
                night_hours_sum:          Number(r.night_hours_sum),
                appointments_count:       Number(r.appointments_count),
                distributed_appointments: Number(r.distributed_appointments),
                created_by_count:         Number(r.created_by_count),
                percent_sum:              Number(r.percent_sum),
                expenses_sum:             Number(r.expenses_sum),
                base_salary:              Number(r.total_salary),
                month_bonus_amount:       0,
                total_salary:             Number(r.total_salary),
                salary_rules:             {},
                total_count:              Number(r.total_count),
                waiting_count:            Number(r.waiting_count),
                cancelled_count:          Number(r.cancelled_count),
                discounted_count:         Number(r.discounted_count),
                paid_count:               Number(r.paid_count),
                raw_shifts:               [],
                raw_appointments:         [],
                raw_expenses:             [],
            }));

            if (!isStillActive()) return;
            if (canSeeAll) cache.current.set(myMonth, finalData);
            setSalaryData(canSeeAll ? finalData : finalData.filter(r => r.id === employeeId));
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки данных отчета" });
        } finally {
            if (isStillActive()) setLoading(false);
        }
    }, [selectedDate, notify, permissionsLoading, period, periodLoading, snapshots, snapshotsLoading, periodSettings]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const invalidateSummaryCards = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['appointments-summary'] });
    }, [queryClient]);

    useEffect(() => {
        const invalidateAndRefresh = () => {
            const myMonth = dayjs(selectedDate).format('YYYY-MM');
            cache.current.delete(myMonth);
            fetchData(true);
            invalidateSummaryCards();
        };
        const channel = supabase
            .channel('salary-reports-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'WorkShifts' }, invalidateAndRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Appointments' }, invalidateAndRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Expenses' }, invalidateAndRefresh)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData, selectedDate, invalidateSummaryCards]);

    const summary = useMemo(() => ({
        total_salary:  salaryData.reduce((acc, r) => acc + r.total_salary, 0),
        total_hours:   salaryData.reduce((acc, r) => acc + r.day_hours + r.night_hours, 0),
        total_appts:   salaryData.reduce((acc, r) => acc + r.appointments_count, 0),
        total_advance: salaryData.reduce((acc, r) => acc + r.expenses_sum, 0),
    }), [salaryData]);

    const handleLockConfirm = async (notes: string) => {
        const periodId = await lock({
            month:       selectedDate,
            notes,
            salaryData,
            calculatedAt: new Date().toISOString(),
        });
        if (periodId) {
            setLockDialogOpen(false);
            cache.current.delete(dayjs(selectedDate).format('YYYY-MM'));
            fetchData(true);
            invalidateSummaryCards();
            notify?.({ type: 'success', message: `Период ${dayjs(selectedDate).format('MMMM YYYY')} закрыт` });
        } else {
            notify?.({ type: 'error', message: 'Не удалось закрыть период' });
        }
    };

    const handleRecalcConfirm = async (reason: string) => {
        if (!period?.id) return;
        const ok = await recalculate({ periodId: period.id, reason, salaryData });
        if (ok) {
            setRecalcDialogOpen(false);
            cache.current.delete(dayjs(selectedDate).format('YYYY-MM'));
            fetchData(true);
            invalidateSummaryCards();
            notify?.({ type: 'success', message: 'Период пересчитан' });
        } else {
            notify?.({ type: 'error', message: 'Ошибка пересчёта' });
        }
    };

    const isLocked = period?.status === 'locked';


    return (
        <Box sx={{ height: { xs: "calc(100vh - 56px)", md: "calc(100vh - 64px)" }, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <PageHeader
                title="Отчет по зарплате"
                showTitle={false}
                showSearch={false}
                dateNavigation={<MonthNavigation date={selectedDate} setDate={setSelectedDate} activeMonths={activeMonths} />}
                actions={
                    <Stack direction="row" spacing={1} alignItems="center">
                        <PeriodStatusBadge period={period} loading={periodLoading} />
                        {canLock && !isLocked && (
                            <Tooltip title="Настройки месяца: ночные часы, коэффициент, ставки по ролям">
                                <Button
                                    variant="outlined"
                                    size="small"
                                    color="secondary"
                                    startIcon={<SettingsIcon />}
                                    onClick={() => setSettingsDialogOpen(true)}
                                    sx={{ whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.75rem' }}
                                >
                                    Настройки месяца
                                </Button>
                            </Tooltip>
                        )}
                        {canLock && !isLocked && salaryData.length > 0 && (
                            <Tooltip title="Заморозить расчёт зарплаты за этот месяц">
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<LockIcon />}
                                    onClick={() => setLockDialogOpen(true)}
                                    sx={{ whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.75rem' }}
                                >
                                    Закрыть месяц
                                </Button>
                            </Tooltip>
                        )}
                        {canLock && isLocked && (
                            <Tooltip title="Пересчитать закрытый период (старый снимок сохранится в истории)">
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    size="small"
                                    startIcon={<RefreshIcon />}
                                    onClick={() => setRecalcDialogOpen(true)}
                                    sx={{ whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.75rem' }}
                                >
                                    Пересчитать
                                </Button>
                            </Tooltip>
                        )}
                    </Stack>
                }
            />

            <LockPeriodDialog
                open={lockDialogOpen}
                month={dayjs(selectedDate).format('MMMM YYYY')}
                totalSalary={summary.total_salary}
                employeeCount={salaryData.length}
                locking={locking}
                onConfirm={handleLockConfirm}
                onClose={() => setLockDialogOpen(false)}
            />
            <RecalculateDialog
                open={recalcDialogOpen}
                month={dayjs(selectedDate).format('MMMM YYYY')}
                recalculating={recalculating}
                onConfirm={handleRecalcConfirm}
                onClose={() => setRecalcDialogOpen(false)}
            />
            <PeriodSettingsDialog
                open={settingsDialogOpen}
                onClose={() => setSettingsDialogOpen(false)}
                month={selectedMonth}
                monthLabel={dayjs(selectedDate).format('MMMM YYYY')}
                initialSettings={periodSettings}
                organizationId={isSuperAdmin() ? activeOrganization?.id ?? undefined : undefined}
                onSaved={(newSettings) => {
                    setPeriodSettings(newSettings);
                    cache.current.delete(dayjs(selectedDate).format('YYYY-MM'));
                    fetchData(true, newSettings);
                    invalidateSummaryCards();
                }}
            />

            <Box sx={(theme) => ({
                px: theme.appLayout.page.paddingX,
                pb: { xs: 15, md: theme.appLayout.page.paddingY },
                pt: 2,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                minHeight: 0
            })}>
                <Stack spacing={{ xs: 1, md: 3 }} sx={{ display: 'flex', flexDirection: 'column' }}>

                    {/* All summary cards in one row — скрыты для регистраторов */}
                    {!isRegistrator() && <AppointmentsSummaryCards
                        dateFrom={dayjs(selectedDate).startOf('month').toISOString()}
                        dateTo={dayjs(selectedDate).endOf('month').toISOString()}
                        employeeId={canSeeAll ? undefined : (employeeId || undefined)}
                        extraCards={[
                            {
                                title: 'Аванс',
                                primaryValue: formatKGS(summary.total_advance),
                                secondaryText: 'Выплачено авансом',
                                color: 'primary' as const,
                            },
                            {
                                title: 'К выплате',
                                primaryValue: formatKGS(summary.total_salary),
                                secondaryText: 'Итого за месяц',
                                color: 'info' as const,
                            },
                        ]}
                    />}

                    {/* Salary List/Table */}
                    {loading ? (
                        <Box sx={{ minHeight: 400 }}>
                            <Stack spacing={1}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Skeleton key={i} variant="rectangular" height={isMobile ? 120 : 60} sx={{ borderRadius: "14px" }} />
                                ))}
                            </Stack>
                        </Box>
                    ) : !canSeeAll && salaryData.length > 0 && salaryData[0].total_count === 0 && salaryData[0].day_hours === 0 && salaryData[0].night_hours === 0 && salaryData[0].expenses_sum === 0 ? (
                        /* Сотрудник без активности за месяц */
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                            <Box sx={{
                                textAlign: 'center',
                                maxWidth: 380,
                                px: 3,
                                py: 4,
                                borderRadius: "14px",
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
                            }}>
                                <Typography variant="h2" sx={{ mb: 2, lineHeight: 1 }}>📋</Typography>
                                <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                                    В этом месяце активности нет
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                                    За выбранный период данных о приёмах и сменах не найдено.
                                    Если вы работали в этом месяце — обратитесь к администратору для проверки.
                                </Typography>
                            </Box>
                        </Box>
                    ) : salaryData.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                            <Typography color="text.secondary">Нет данных за выбранный месяц</Typography>
                        </Box>
                    ) : isMobile ? (
                        /* Mobile/tablet: grouped card list by role */
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {(() => {
                                const roleGroups: { label: string; roleNames: string[] }[] = [
                                    { label: 'Врачи', roleNames: ['doctor'] },
                                    { label: 'Медсёстры / Процедуры', roleNames: ['nurse', 'procedure'] },
                                    { label: 'Регистраторы', roleNames: ['registrator', 'receptionist'] },
                                    { label: 'Администраторы', roleNames: ['admin', 'accountant', 'superadmin'] },
                                    { label: 'Техперсонал / Санитарки', roleNames: ['cleaner', 'сleaner'] },
                                ];

                                const rendered: React.ReactNode[] = [];
                                const seen = new Set<string>();

                                roleGroups.forEach(group => {
                                    const rows = salaryData.filter(r => group.roleNames.includes(r.role_name));
                                    rows.forEach(r => seen.add(r.id));
                                    if (rows.length === 0) return;

                                    rendered.push(
                                        <Box key={group.label}>
                                            <Box sx={{ px: 1, py: 0.75, mb: 0.75, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: "10px", border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}` }}>
                                                <Typography variant="caption" fontWeight={700} color="primary.onSurface" sx={{ letterSpacing: 0.5, fontSize: '0.65rem' }}>
                                                    {group.label}
                                                </Typography>
                                            </Box>
                                            <Stack spacing={0.75}>
                                                {rows.map((row) => (
                                                    <SalaryReportRow
                                                        key={row.id}
                                                        row={row}
                                                        selectedDate={selectedDate}
                                                        periodSettings={periodSettings}
                                                        isMobile
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    );
                                });

                                // Remaining employees not in any group
                                const rest = salaryData.filter(r => !seen.has(r.id));
                                if (rest.length > 0) {
                                    rendered.push(
                                        <Box key="other">
                                            <Box sx={{ px: 1, py: 0.75, mb: 0.75, bgcolor: alpha(theme.palette.grey[500], 0.08), borderRadius: "10px", border: `1px solid ${theme.palette.divider}` }}>
                                                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ letterSpacing: 0.5, fontSize: '0.65rem' }}>
                                                    Прочие
                                                </Typography>
                                            </Box>
                                            <Stack spacing={0.75}>
                                                {rest.map((row) => (
                                                    <SalaryReportRow
                                                        key={row.id}
                                                        row={row}
                                                        selectedDate={selectedDate}
                                                        periodSettings={periodSettings}
                                                        isMobile
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
                        /* Desktop: grouped tables by role */
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {(() => {
                                // Define role groups: order, label, column config, matching role_names
                                const roleGroups: { label: string; roleNames: string[]; cols: ColumnConfig }[] = [
                                    { label: 'Врачи', roleNames: ['doctor'], cols: COLUMNS_DOCTOR },
                                    { label: 'Медсёстры / Процедуры', roleNames: ['nurse', 'procedure'], cols: COLUMNS_NURSE },
                                    { label: 'Регистраторы', roleNames: ['registrator', 'receptionist'], cols: COLUMNS_REGISTRATOR },
                                    { label: 'Администраторы', roleNames: ['admin', 'accountant', 'superadmin'], cols: COLUMNS_ADMIN },
                                    { label: 'Техперсонал / Санитарки', roleNames: ['cleaner', 'сleaner'], cols: COLUMNS_ADMIN },
                                ];

                                const rendered: React.ReactNode[] = [];
                                const seen = new Set<string>();

                                roleGroups.forEach(group => {
                                    const rows = salaryData.filter(r => group.roleNames.includes(r.role_name));
                                    rows.forEach(r => seen.add(r.id));
                                    if (rows.length === 0) return;

                                    const cols = group.cols;
                                    rendered.push(
                                        <Paper key={group.label} variant="outlined" sx={{ borderRadius: "14px", border: `1px solid ${theme.palette.divider}`, overflow: 'hidden' }}>
                                            <Box sx={{ px: 2, py: 1, bgcolor: alpha(theme.palette.primary.main, 0.05), borderBottom: `1px solid ${theme.palette.divider}` }}>
                                                <Typography variant="subtitle2" fontWeight={700} color="primary.onSurface">{group.label}</Typography>
                                            </Box>
                                            <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { fontSize: '0.75rem', py: 0.6, px: 1 } }}>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Сотрудник</TableCell>
                                                        {cols.hours && !periodSettings?.merge_night_into_day && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Дневные</TableCell>}
                                                        {cols.hours && !periodSettings?.merge_night_into_day && (
                                                            <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                                                                {periodSettings?.disable_night_hours ? (
                                                                    <Tooltip title="Ночные часы отключены настройками месяца">
                                                                        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} component="span">
                                                                            <Box component="span" sx={{ color: 'text.disabled', opacity: 0.5 }}>Ночные</Box>
                                                                            <NightsStayIcon sx={{ fontSize: '0.85rem', color: 'warning.main' }} />
                                                                        </Stack>
                                                                    </Tooltip>
                                                                ) : 'Ночные'}
                                                            </TableCell>
                                                        )}
                                                        {cols.hours && periodSettings?.merge_night_into_day && (
                                                            <TableCell align="center" colSpan={2} sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'purple.onSurface' }}>
                                                                <Tooltip title="Ночные часы объединены с дневными по настройке месяца">
                                                                    <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} component="span">
                                                                        <span>Часы</span>
                                                                        <NightsStayIcon sx={{ fontSize: '0.85rem' }} />
                                                                    </Stack>
                                                                </Tooltip>
                                                            </TableCell>
                                                        )}
                                                        {cols.hours && <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Часы</TableCell>}
                                                        {cols.appointments && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>{cols.appointmentsLabel ?? 'Все приёмы'}</TableCell>}
                                                        {cols.distributed && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'info.main' }}>Распределённые</TableCell>}
                                                        {cols.createdBy && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'success.main' }}>Создал</TableCell>}
                                                        {cols.statusWaiting && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Ожидание</TableCell>}
                                                        {cols.statusCancelled && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Отменены</TableCell>}
                                                        {cols.statusDiscount && <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Со скидкой</TableCell>}
                                                        {cols.bonuses && <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Бонусы</TableCell>}
                                                        {cols.percent && <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Зарплата</TableCell>}
                                                        <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'error.main' }}>Аванс</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'primary.onSurface' }}>К выплате</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {rows.map((row) => (
                                                        <SalaryReportRow
                                                            key={row.id}
                                                            row={row}
                                                            selectedDate={selectedDate}
                                                            columns={cols}
                                                            periodSettings={periodSettings}
                                                        />
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </Paper>
                                    );
                                });

                                // Remaining employees not in any group
                                const rest = salaryData.filter(r => !seen.has(r.id));
                                if (rest.length > 0) {
                                    rendered.push(
                                        <Paper key="other" variant="outlined" sx={{ borderRadius: "14px", border: `1px solid ${theme.palette.divider}`, overflow: 'hidden' }}>
                                            <Box sx={{ px: 2, py: 1, bgcolor: alpha(theme.palette.grey[500], 0.08), borderBottom: `1px solid ${theme.palette.divider}` }}>
                                                <Typography variant="subtitle2" fontWeight={700} color="text.secondary">Прочие</Typography>
                                            </Box>
                                            <Table size="small" sx={{ fontSize: '0.75rem', '& .MuiTableCell-root': { fontSize: '0.75rem', py: 0.6, px: 1 } }}>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Сотрудник</TableCell>
                                                        <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Дневные</TableCell>
                                                        <TableCell align="center" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Ночные</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>Часы</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'error.main' }}>Аванс</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper', color: 'primary.onSurface' }}>К выплате</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {rest.map((row) => (
                                                        <SalaryReportRow
                                                            key={row.id}
                                                            row={row}
                                                            selectedDate={selectedDate}
                                                            columns={COLUMNS_ADMIN}
                                                            periodSettings={periodSettings}
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
                    )}
                </Stack>
            </Box>
        </Box>
    );
};

export default SalaryReportsPage;
