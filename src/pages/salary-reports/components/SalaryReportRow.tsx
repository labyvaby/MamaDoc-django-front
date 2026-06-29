import React, { useState } from "react";
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
    Chip,
} from "@mui/material";
import NightsStayIcon from '@mui/icons-material/NightsStayOutlined';
import PercentIcon from '@mui/icons-material/PercentOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ReportProblemIcon from '@mui/icons-material/ReportProblemOutlined';
import { motion, AnimatePresence } from "framer-motion";
import dayjs from "dayjs";
import 'dayjs/locale/ru';

import { formatKGS } from "../../../utility/format";
import type { SalaryRules } from "../../../features/employees/utils";
import type { PayrollMonthSettings } from "../../../features/payroll/types";
import { supabase } from "../../../utility/supabaseClient";

dayjs.locale('ru');

export interface ColumnConfig {
    hours: boolean;        // Дневные / Ночные / Сумма часов
    appointments: boolean; // Все приёмы
    distributed: boolean;  // Распределённые (регистраторы)
    createdBy: boolean;    // Создал (регистраторы)
    statusWaiting: boolean;   // Ожидание
    statusCancelled: boolean; // Отменены
    statusDiscount: boolean;  // Со скидкой
    bonuses: boolean;         // Бонусы
    percent: boolean;      // Зарплата (%)
    appointmentsLabel?: string; // Название колонки приёмов
}

export const COLUMNS_REGISTRATOR: ColumnConfig = { hours: true, appointments: false, distributed: true, createdBy: true, statusWaiting: false, statusCancelled: false, statusDiscount: false, bonuses: true, percent: true, appointmentsLabel: 'Все приёмы' };
export const COLUMNS_DOCTOR: ColumnConfig = { hours: true, appointments: true, distributed: false, createdBy: false, statusWaiting: true, statusCancelled: true, statusDiscount: true, bonuses: false, percent: true, appointmentsLabel: 'Все приёмы' };
export const COLUMNS_NURSE: ColumnConfig = { hours: true, appointments: true, distributed: false, createdBy: false, statusWaiting: false, statusCancelled: true, statusDiscount: false, bonuses: true, percent: true, appointmentsLabel: 'Все приёмы' };
export const COLUMNS_ADMIN: ColumnConfig = { hours: true, appointments: false, distributed: false, createdBy: false, statusWaiting: false, statusCancelled: false, statusDiscount: false, bonuses: false, percent: false };

interface SalaryReportRowProps {
    row: any;
    selectedDate: string;
    salaryRules?: SalaryRules;
    allAppointments?: any[];
    allSalaryData?: any[];
    isMobile?: boolean;
    columns?: ColumnConfig;
    periodSettings?: PayrollMonthSettings;
}

const SalaryReportRow: React.FC<SalaryReportRowProps> = ({ row, selectedDate, isMobile, columns, periodSettings }) => {
    const theme = useTheme();
    const [open, setOpen] = useState(false);
    const [dailyData, setDailyData] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const isRegistrator = row.role_name === 'registrator' || row.role_name === 'receptionist';
    const isNurse = row.role_name === 'nurse' || row.role_name === 'procedure';
    const cols = columns ?? (isRegistrator ? COLUMNS_REGISTRATOR : COLUMNS_DOCTOR);

    const nightDisabled = !!periodSettings?.disable_night_hours;
    const mergeNight = !!periodSettings?.merge_night_into_day;
    const percentDisabled = !!periodSettings?.disable_dynamic_rules;

    const grossEarnings = row.hours_sum + row.percent_sum;
    const isPaid = Math.round(row.total_salary) <= 0 && Math.round(grossEarnings) > 0;

    const aggregateStatus: 'success' | 'info' | 'error' = 'info';
    const hasWarningShifts = false;

    // Fetch per-day breakdown from SQL on expand
    const detailFetchedRef = React.useRef<string>('');
    React.useEffect(() => {
        if (!open) return;
        const myMonth = dayjs(selectedDate).format('YYYY-MM');
        const key = `${row.id}-${myMonth}-${JSON.stringify(periodSettings ?? {})}`;
        if (detailFetchedRef.current === key) return;
        detailFetchedRef.current = key;

        setDetailLoading(true);
        setDailyData([]);

        supabase.rpc('get_salary_employee_details', {
            p_employee_id: row.id,
            p_month:       `${myMonth}-01`,
            p_settings:    periodSettings ?? {},
        }).then(({ data, error }) => {
            setDetailLoading(false);
            if (error) {
                console.warn('[detail] RPC error:', error.message);
                return;
            }
            if (!data || data.length === 0) return;

            const mapped = (data as any[]).map(d => {
                const wd = dayjs(d.work_date);
                const dayHours    = Number(d.day_hours);
                const nightHours  = Number(d.night_hours);
                const dayHoursSum = Number(d.day_hours_sum);
                const nightHoursSum = Number(d.night_hours_sum);
                const hoursSum    = Number(d.hours_sum);
                const appts       = Number(d.appointments_count);
                const distAppts   = Number(d.distributed_appointments);
                const createdCnt  = Number(d.created_by_count);
                const percentSum  = Number(d.percent_sum);
                const expensesSum = Number(d.expenses_sum);
                const totalSalary = Number(d.total_salary);
                const isWeekend   = !!d.is_weekend;

                const dayBonusSum = isRegistrator
                    ? (hoursSum - dayHoursSum - nightHoursSum)
                    : isNurse ? percentSum : 0;

                return {
                    date:                 wd.locale('ru').format('DD.MM (dd)'),
                    isWeekend,
                    status:               'info' as const,
                    dayHours,
                    nightHours,
                    dayHoursSum,
                    nightHoursSum,
                    hoursSum,
                    totalCount:           appts,
                    waitingCount:         0,
                    cancelledCount:       0,
                    discountedCount:      0,
                    distributedAppointments: distAppts,
                    dayCreatedByCount:    createdCnt,
                    percentSum,
                    expensesSum,
                    totalSalary,
                    dayBonusSum,
                    hasWarning:           false,
                };
            });
            setDailyData(mapped);
        });
    }, [open, row.id, selectedDate, periodSettings, isRegistrator, isNurse]);

    const statusLabel = {
        'error': 'Аномалия в часах (>36ч)',
        'success': 'Сотрудник на смене',
        'info': 'Все смены завершены'
    };

    const cardRef = React.useRef<HTMLDivElement>(null);
    const collapseRef = React.useRef<HTMLDivElement>(null);

    const handleToggle = () => {
        setOpen(!open);
    };

    // Scroll into view when collapse content appears
    React.useEffect(() => {
        if (open && collapseRef.current) {
            setTimeout(() => {
                collapseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 350);
        }
    }, [open]);

    // Mobile/tablet card layout
    if (isMobile) {
        return (
            <Card ref={cardRef} variant="outlined" sx={{ transition: 'border-color .15s ease', border: open ? `1px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}` }}>
                <Box sx={{ p: 1.25, cursor: 'pointer' }} onClick={handleToggle}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                                <Tooltip title={statusLabel[aggregateStatus]}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${aggregateStatus}.main`, flexShrink: 0 }} />
                                </Tooltip>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.85rem', color: 'text.primary' }}>
                                    {row.full_name}
                                </Typography>
                                {isPaid && (
                                    <Box sx={{ px: 0.75, py: 0.15, borderRadius: 1, bgcolor: alpha(theme.palette.success.main, 0.12), color: 'success.dark', fontSize: '0.6rem', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Выплачено</Box>
                                )}
                                <Box sx={{ display: 'inline-block', px: 0.75, py: 0.1, borderRadius: 0.75, bgcolor: alpha(theme.palette.primary.main, 0.08) }}>
                                    <Typography variant="caption" fontWeight={700} color="primary.onSurface" sx={{ fontSize: '0.6rem', letterSpacing: 0.3 }}>
                                        {row.role}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, fontSize: '0.55rem', lineHeight: 1.2 }}>Итого ЗП</Typography>
                                <Typography fontWeight={700} color="primary.onSurface" sx={{ fontSize: '0.95rem', lineHeight: 1.1 }}>
                                    {formatKGS(row.total_salary)}
                                </Typography>
                            </Box>
                            {open ? <KeyboardArrowUpIcon sx={{ fontSize: '1rem', color: 'text.disabled' }} /> : <KeyboardArrowDownIcon sx={{ fontSize: '1rem', color: 'text.disabled' }} />}
                        </Stack>
                    </Stack>

                    {(nightDisabled || mergeNight || percentDisabled) && (
                        <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                            {mergeNight && (
                                <Chip
                                    icon={<NightsStayIcon sx={{ fontSize: '0.7rem !important' }} />}
                                    label="Ночные объединены"
                                    size="small"
                                    sx={(t) => ({ height: 18, fontSize: '0.6rem', fontWeight: 700, borderRadius: '7px', bgcolor: alpha(t.palette.purple.main, 0.1), color: 'purple.onSurface', border: 'none' })}
                                />
                            )}
                            {nightDisabled && !mergeNight && (
                                <Chip
                                    icon={<NightsStayIcon sx={{ fontSize: '0.7rem !important' }} />}
                                    label="Ночные отключены"
                                    size="small"
                                    sx={(t) => ({ height: 18, fontSize: '0.6rem', fontWeight: 700, borderRadius: '7px', bgcolor: alpha(t.palette.purple.main, 0.1), color: 'purple.onSurface', border: 'none' })}
                                />
                            )}
                            {percentDisabled && (
                                <Chip
                                    icon={<PercentIcon sx={{ fontSize: '0.7rem !important' }} />}
                                    label="% отключён"
                                    size="small"
                                    sx={(t) => ({ height: 18, fontSize: '0.6rem', fontWeight: 700, borderRadius: '7px', bgcolor: alpha(t.palette.success.main, 0.1), color: 'success.onSurface', border: 'none' })}
                                />
                            )}
                        </Stack>
                    )}
                    <Grid2 container spacing={0.5}>
                        {cols.hours && (
                            <Grid2 size={4}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.2 }}>Часы</Typography>
                                <Typography sx={{ fontSize: '0.78rem' }} fontWeight={700}>{Math.round((row.day_hours + row.night_hours) * 10) / 10} ч</Typography>
                            </Grid2>
                        )}
                        {cols.createdBy && isRegistrator && (
                            <Grid2 size={4}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.2 }}>Создал</Typography>
                                <Typography sx={{ fontSize: '0.78rem' }} fontWeight={700} color="success.main">{row.created_by_count ?? 0}</Typography>
                            </Grid2>
                        )}
                        {cols.distributed && isRegistrator && (
                            <Grid2 size={4}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.2 }}>Распред.</Typography>
                                <Typography sx={{ fontSize: '0.78rem' }} fontWeight={700} color="info.main">{row.distributed_appointments ?? 0}</Typography>
                            </Grid2>
                        )}
                        {cols.appointments && !isRegistrator && (
                            <Grid2 size={4}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.2 }}>Все приёмы</Typography>
                                <Typography sx={{ fontSize: '0.78rem' }} fontWeight={700}>{row.total_count}</Typography>
                            </Grid2>
                        )}
                        <Grid2 size={4}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block', lineHeight: 1.2 }}>Аванс</Typography>
                            <Typography sx={{ fontSize: '0.78rem' }} fontWeight={700} color="error.main">{formatKGS(row.expenses_sum)}</Typography>
                        </Grid2>
                    </Grid2>
                </Box>

                <Collapse in={open}>
                    <Divider />
                    <Box ref={collapseRef} sx={{ p: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary" gutterBottom sx={{ display: 'block', mb: 1 }}>
                            По дням
                        </Typography>
                        {detailLoading ? (
                            <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : dailyData.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Нет данных за месяц</Typography>
                        ) : (
                            <Stack spacing={1.5} sx={{ pr: 0.5 }}>
                                {dailyData.map((day, idx) => (
                                    <Box
                                        key={idx}
                                        sx={{
                                            p: 2,
                                            borderRadius: '10px',
                                            bgcolor: day.isWeekend ? alpha(theme.palette.info.main, 0.08) : theme.palette.background.paper,
                                            border: `1px solid ${theme.palette.divider}`,
                                        }}
                                    >
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                            <Typography variant="body2" fontWeight={700} color={day.isWeekend ? 'info.main' : 'text.primary'}>
                                                {day.date}
                                            </Typography>
                                            <Typography variant="body1" fontWeight={700} color="primary.onSurface">
                                                {formatKGS(day.totalSalary)}
                                            </Typography>
                                        </Stack>

                                        <Grid2 container spacing={2}>
                                            <Grid2 size={4}>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>Часы</Typography>
                                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                                    <Typography variant="body2" fontWeight={700}>{Math.round(day.dayHours * 10) / 10} / {Math.round(day.nightHours * 10) / 10}</Typography>
                                                    {day.hasWarning && (
                                                        <Tooltip title="Аномальная длительность (> 36ч)">
                                                            <ReportProblemIcon sx={{ color: 'error.main', fontSize: '0.85rem' }} />
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </Grid2>
                                            {isRegistrator ? (
                                                <>
                                                    <Grid2 size={4}>
                                                        <Typography variant="caption" color="success.main" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>Создал</Typography>
                                                        <Typography variant="body2" fontWeight={700} color="success.main">{day.dayCreatedByCount ?? 0}</Typography>
                                                    </Grid2>
                                                    <Grid2 size={4}>
                                                        <Typography variant="caption" color="info.main" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>Распред.</Typography>
                                                        <Typography variant="body2" fontWeight={700} color="info.main">{day.distributedAppointments ?? 0}</Typography>
                                                    </Grid2>
                                                </>
                                            ) : (
                                                <Grid2 size={4}>
                                                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>Приемы</Typography>
                                                    <Typography variant="body2" fontWeight={700}>{day.totalCount}</Typography>
                                                </Grid2>
                                            )}
                                            <Grid2 size={4}>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>Процент</Typography>
                                                <Typography variant="body2" fontWeight={700}>{formatKGS(day.percentSum)}</Typography>
                                            </Grid2>
                                            {day.expensesSum > 0 && (
                                                <Grid2 size={12}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                                        <Typography variant="caption" color="error.main" fontWeight={700} sx={{ fontSize: '0.7rem' }}>
                                                            ВЫПЛАЧЕНО: {formatKGS(day.expensesSum)}
                                                        </Typography>
                                                    </Box>
                                                </Grid2>
                                            )}
                                        </Grid2>
                                    </Box>
                                ))}

                                {/* Сводка: сумма по дням + месячный коэффициент = итог */}
                                <Box sx={{
                                    mt: 1,
                                    p: 1.5,
                                    borderRadius: "10px",
                                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                                    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                                }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                        <Typography variant="caption" color="text.secondary">Сумма по дням</Typography>
                                        <Typography variant="body2" fontWeight={700}>{formatKGS(row.base_salary)}</Typography>
                                    </Stack>
                                    {row.month_bonus_amount !== 0 && (
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                Месячный коэффициент
                                                {row.base_salary > 0 && (
                                                    <> ({row.month_bonus_amount > 0 ? '+' : ''}{Math.round((row.month_bonus_amount / row.base_salary) * 100)}%)</>
                                                )}
                                            </Typography>
                                            <Typography variant="body2" fontWeight={700} color={row.month_bonus_amount > 0 ? 'success.main' : 'error.main'}>
                                                {row.month_bonus_amount > 0 ? '+' : ''}{formatKGS(row.month_bonus_amount)}
                                            </Typography>
                                        </Stack>
                                    )}
                                    <Divider sx={{ my: 0.75 }} />
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2" fontWeight={700}>Итого к выплате</Typography>
                                        <Typography variant="body1" fontWeight={700} color="primary.onSurface">{formatKGS(row.total_salary)}</Typography>
                                    </Stack>
                                </Box>

                                <Box sx={{ pt: 1, pb: 0.5, display: 'flex', justifyContent: 'center' }}>
                                    <Typography
                                        variant="caption"
                                        fontWeight={700}
                                        color="primary.onSurface"
                                        sx={{
                                            cursor: 'pointer',
                                            
                                            letterSpacing: 1,
                                            p: 1,
                                            '&:hover': { opacity: 0.8 }
                                        }}
                                        onClick={handleToggle}
                                    >
                                        Свернуть
                                    </Typography>
                                </Box>
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
                    cursor: 'pointer',
                    '&:last-child td': { border: 0 },
                    bgcolor: open ? alpha(theme.palette.primary.main, 0.02) : 'inherit'
                }}
            >
                <TableCell sx={{ py: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <IconButton size="small">
                            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                        <Typography component="div" variant="body2" fontWeight={700} sx={{ display: 'flex', alignItems: 'center' }}>
                            <Tooltip title={statusLabel[aggregateStatus]}>
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${aggregateStatus}.main`, mr: 1.5, flexShrink: 0 }} />
                            </Tooltip>
                            {row.full_name}
                            {hasWarningShifts && (
                                <Tooltip title="Внимание: обнаружены аномально долгие смены, часы были ограничены">
                                    <ReportProblemIcon sx={{ ml: 1, color: 'error.main', fontSize: '1rem' }} />
                                </Tooltip>
                            )}
                        </Typography>
                        {isPaid && (
                            <Box sx={{ ml: 1, px: 0.75, py: 0.2, borderRadius: 1, bgcolor: alpha(theme.palette.success.main, 0.12), color: 'success.dark', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Выплачено</Box>
                        )}
                    </Stack>
                </TableCell>
                {cols.hours && !mergeNight && <TableCell align="center">{Math.round(row.day_hours * 10) / 10}</TableCell>}
                {cols.hours && !mergeNight && (
                    <TableCell align="center">
                        {nightDisabled ? (
                            <Tooltip title="Ночные часы отключены настройками месяца" placement="top">
                                <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                                    <Typography variant="body2" color="text.disabled">
                                        {Math.round(row.night_hours * 10) / 10}
                                    </Typography>
                                    <NightsStayIcon sx={{ fontSize: '0.85rem', color: 'text.disabled' }} />
                                </Stack>
                            </Tooltip>
                        ) : (
                            Math.round(row.night_hours * 10) / 10
                        )}
                    </TableCell>
                )}
                {cols.hours && mergeNight && (
                    <TableCell align="center" colSpan={2}>
                        <Tooltip title="Ночные часы объединены с дневными" placement="top">
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                                <Typography variant="body2" fontWeight={700}>
                                    {Math.round((row.day_hours + row.night_hours) * 10) / 10}
                                </Typography>
                                <NightsStayIcon sx={{ fontSize: '0.85rem', color: 'purple.onSurface' }} />
                            </Stack>
                        </Tooltip>
                    </TableCell>
                )}
                {cols.hours && <TableCell align="right">{formatKGS(isRegistrator ? (row.day_hours_sum + row.night_hours_sum) : row.hours_sum)}</TableCell>}
                {cols.appointments && (
                    <TableCell align="center">
                        <Tooltip title={`Оплачено: ${row.paid_count} · Отменено: ${row.cancelled_count} · Ожидание: ${row.waiting_count}`} placement="top">
                            <Typography variant="body2" sx={{ cursor: 'default' }}>{row.total_count}</Typography>
                        </Tooltip>
                    </TableCell>
                )}
                {cols.distributed && (
                    <TableCell align="center">
                        <Typography variant="body2" fontWeight={700} color="info.main">
                            {row.distributed_appointments ?? 0}
                        </Typography>
                    </TableCell>
                )}
                {cols.createdBy && (
                    <TableCell align="center">
                        <Typography variant="body2" fontWeight={700} color="success.main">
                            {row.created_by_count ?? 0}
                        </Typography>
                    </TableCell>
                )}
                {cols.statusWaiting && <TableCell align="center">{row.waiting_count}</TableCell>}
                {cols.statusCancelled && <TableCell align="center">{row.cancelled_count}</TableCell>}
                {cols.statusDiscount && <TableCell align="center">{row.discounted_count}</TableCell>}
                {cols.bonuses && <TableCell align="right">{formatKGS(isRegistrator ? (row.hours_sum - row.day_hours_sum - row.night_hours_sum) : row.percent_sum)}</TableCell>}
                {cols.percent && (
                    <TableCell align="right">
                        {percentDisabled ? (
                            <Tooltip title="% за услуги отключён настройками месяца" placement="top">
                                <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                                    <Typography variant="body2" color="text.disabled">
                                        {formatKGS(isRegistrator ? row.hours_sum : isNurse ? (row.hours_sum + row.percent_sum) : row.percent_sum)}
                                    </Typography>
                                    <PercentIcon sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />
                                </Stack>
                            </Tooltip>
                        ) : (
                            formatKGS(isRegistrator ? row.hours_sum : isNurse ? (row.hours_sum + row.percent_sum) : row.percent_sum)
                        )}
                    </TableCell>
                )}
                <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="error.main">{formatKGS(row.expenses_sum)}</Typography>
                </TableCell>
                <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="primary.onSurface">{formatKGS(row.total_salary)}</Typography>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0, borderBottom: 'none' }} colSpan={
                    1 + (cols.hours ? (mergeNight ? 2 : 3) : 0) + (cols.appointments ? 1 : 0) + (cols.distributed ? 1 : 0) + (cols.createdBy ? 1 : 0) + (cols.statusWaiting ? 1 : 0) + (cols.statusCancelled ? 1 : 0) + (cols.statusDiscount ? 1 : 0) + (cols.bonuses ? 1 : 0) + (cols.percent ? 1 : 0) + 2
                }>
                    <AnimatePresence>
                        {open && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                style={{ overflow: 'hidden' }}
                            >
                                <Box sx={{ py: 2, pl: 6, pr: 2, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                                    <Typography variant="subtitle2" gutterBottom fontWeight={700} color="text.secondary">
                                        Детализация по дням
                                    </Typography>
                                    {detailLoading ? (
                                        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                                            <CircularProgress size={24} />
                                        </Box>
                                    ) : dailyData.length === 0 ? (
                                        <Typography variant="caption" color="text.secondary" sx={{ py: 2, display: 'block' }}>
                                            Нет данных за этот период
                                        </Typography>
                                    ) : (
                                        <Table size="small" sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: "14px", overflow: 'hidden' }}>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.15) }}>
                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Дата</TableCell>
                                                    {cols.hours && !mergeNight && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Дн. часы</TableCell>}
                                                    {cols.hours && !mergeNight && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Ноч. часы</TableCell>}
                                                    {cols.hours && mergeNight && <TableCell align="center" colSpan={2} sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'purple.onSurface' }}>Часы</TableCell>}
                                                    {cols.hours && <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Сумма ч.</TableCell>}
                                                    {cols.appointments && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Все</TableCell>}
                                                    {cols.distributed && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'info.main' }}>Распред.</TableCell>}
                                                    {cols.createdBy && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'success.main' }}>Создал</TableCell>}
                                                    {cols.statusWaiting && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Ожид.</TableCell>}
                                                    {cols.statusCancelled && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Отмен.</TableCell>}
                                                    {cols.statusDiscount && <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Скидка</TableCell>}
                                                    {cols.bonuses && <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Бонусы</TableCell>}
                                                    {cols.percent && <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Зарплата</TableCell>}
                                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'error.main' }}>Аванс</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'primary.onSurface' }}>К выплате</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {dailyData.map((day, idx) => (
                                                    <TableRow key={idx} sx={{ bgcolor: day.isWeekend ? alpha(theme.palette.info.main, 0.05) : 'inherit' }}>
                                                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: day.isWeekend ? 700 : 400 }}>{day.date}</TableCell>
                                                        {cols.hours && !mergeNight && (
                                                            <TableCell align="center" sx={{ fontSize: '0.75rem', color: day.status === 'error' ? 'error.main' : day.status === 'success' ? 'success.main' : 'inherit', fontWeight: day.status !== 'info' ? 700 : 400 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    {Math.round(day.dayHours * 10) / 10}
                                                                    {day.hasWarning && <Tooltip title="Аномальная длительность (> 36ч)"><ReportProblemIcon sx={{ ml: 0.5, color: 'error.main', fontSize: '0.9rem' }} /></Tooltip>}
                                                                </Box>
                                                            </TableCell>
                                                        )}
                                                        {cols.hours && !mergeNight && (
                                                            <TableCell align="center" sx={{ fontSize: '0.75rem', color: day.status === 'error' ? 'error.main' : day.status === 'success' ? 'success.main' : 'inherit', fontWeight: day.status !== 'info' ? 700 : 400 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    {Math.round(day.nightHours * 10) / 10}
                                                                    {day.hasWarning && <Tooltip title="Аномальная длительность (> 36ч)"><ReportProblemIcon sx={{ ml: 0.5, color: 'error.main', fontSize: '0.9rem' }} /></Tooltip>}
                                                                </Box>
                                                            </TableCell>
                                                        )}
                                                        {cols.hours && mergeNight && (
                                                            <TableCell align="center" colSpan={2} sx={{ fontSize: '0.75rem', color: 'purple.onSurface', fontWeight: 700 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    {Math.round((day.dayHours + day.nightHours) * 10) / 10}
                                                                    {day.hasWarning && <Tooltip title="Аномальная длительность (> 36ч)"><ReportProblemIcon sx={{ ml: 0.5, color: 'error.main', fontSize: '0.9rem' }} /></Tooltip>}
                                                                </Box>
                                                            </TableCell>
                                                        )}
                                                        {cols.hours && <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatKGS(isRegistrator ? (day.dayHoursSum + day.nightHoursSum) : day.hoursSum)}</TableCell>}
                                                        {cols.appointments && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>{day.totalCount}</TableCell>}
                                                        {cols.distributed && <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'info.main' }}>{day.distributedAppointments ?? 0}</TableCell>}
                                                        {cols.createdBy && <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'success.main' }}>{day.dayCreatedByCount ?? 0}</TableCell>}
                                                        {cols.statusWaiting && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>{day.waitingCount}</TableCell>}
                                                        {cols.statusCancelled && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>{day.cancelledCount}</TableCell>}
                                                        {cols.statusDiscount && <TableCell align="center" sx={{ fontSize: '0.75rem' }}>{day.discountedCount}</TableCell>}
                                                        {cols.bonuses && <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatKGS(day.dayBonusSum ?? 0)}</TableCell>}
                                                        {cols.percent && <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{formatKGS(isRegistrator ? day.hoursSum : isNurse ? (day.hoursSum + day.percentSum) : day.percentSum)}</TableCell>}
                                                        <TableCell align="right" sx={{ fontSize: '0.75rem', color: 'error.main' }}>{formatKGS(day.expensesSum)}</TableCell>
                                                        <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'primary.dark' }}>{formatKGS(day.totalSalary)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}

                                    {/* Сводка под детализацией */}
                                    {dailyData.length > 0 && (
                                        <Box sx={{
                                            mt: 1.5,
                                            p: 1.5,
                                            borderRadius: "10px",
                                            bgcolor: alpha(theme.palette.primary.main, 0.06),
                                            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                                            maxWidth: 420,
                                            ml: 'auto',
                                        }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                                <Typography variant="caption" color="text.secondary">Сумма по дням</Typography>
                                                <Typography variant="body2" fontWeight={700}>{formatKGS(row.base_salary)}</Typography>
                                            </Stack>
                                            {row.month_bonus_amount !== 0 && (
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Месячный коэффициент
                                                        {row.base_salary > 0 && (
                                                            <> ({row.month_bonus_amount > 0 ? '+' : ''}{Math.round((row.month_bonus_amount / row.base_salary) * 100)}%)</>
                                                        )}
                                                    </Typography>
                                                    <Typography variant="body2" fontWeight={700} color={row.month_bonus_amount > 0 ? 'success.main' : 'error.main'}>
                                                        {row.month_bonus_amount > 0 ? '+' : ''}{formatKGS(row.month_bonus_amount)}
                                                    </Typography>
                                                </Stack>
                                            )}
                                            <Divider sx={{ my: 0.75 }} />
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="body2" fontWeight={700}>Итого к выплате</Typography>
                                                <Typography variant="body1" fontWeight={700} color="primary.onSurface">{formatKGS(row.total_salary)}</Typography>
                                            </Stack>
                                        </Box>
                                    )}
                                </Box>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </TableCell>
            </TableRow>
        </>
    );
};

export default SalaryReportRow;
