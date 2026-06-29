import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Box,
    Grid2,
    useTheme,
    Paper,
    Typography,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Card,
    CardContent,
    alpha,
    CircularProgress,
    Avatar
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardIcon from '@mui/icons-material/CreditCardOutlined';
import WalletIcon from '@mui/icons-material/WalletOutlined';

import { PageHeader, MonthNavigation } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useActiveMonths } from "../../hooks/useActiveMonths";
import { formatKGS } from "../../utility/format";
import { supabase } from "../../utility/supabaseClient";
import dayjs from "dayjs";
import 'dayjs/locale/ru';

dayjs.locale('ru');

interface DailyFinancialData {
    date: string;
    services_sum: number;
    products_sum: number;
    cash_sum: number;
    card_sum: number;
    discount_sum: number;
    debt_sum: number;
    appointments_count: number;
}

const FinancialReportsPage: React.FC = () => {
    usePageTitle("Финансовый отчет");
    const theme = useTheme();
    const { open: notify } = useNotification();
    const { isSuperAdmin, hasRole, loading: permissionsLoading } = usePermissions();

    const canSee = useMemo(() => isSuperAdmin() || hasRole(['accountant', 'admin']), [isSuperAdmin, hasRole]);

    // State
    const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
    const [loading, setLoading] = useState(true);
    const [dailyData, setDailyData] = useState<DailyFinancialData[]>([]);
    const activeMonths = useActiveMonths('Appointments', 'appointment_at');

    const fetchData = useCallback(async () => {
        if (permissionsLoading) return;
        if (!canSee) return;

        try {
            setLoading(true);
            const startOfMonth = dayjs(selectedDate).startOf('month');
            const endOfMonth = dayjs(selectedDate).endOf('month');

            const { data: appointments, error } = await supabase
                .from("Appointments")
                .select("appointment_at, total_amount, paid_cash, paid_card, discount, debt, status")
                .gte("appointment_at", startOfMonth.toISOString())
                .lte("appointment_at", endOfMonth.toISOString())
                .neq("status", "Отменено")
                .order("appointment_at", { ascending: true });

            if (error) throw error;

            // Group by day
            const groupedMap = new Map<string, DailyFinancialData>();

            // Initialize every day of the month to zero
            let current = startOfMonth;
            while (current.isBefore(endOfMonth) || current.isSame(endOfMonth, 'day')) {
                const dateStr = current.format('YYYY-MM-DD');
                groupedMap.set(dateStr, {
                    date: dateStr,
                    services_sum: 0,
                    products_sum: 0,
                    cash_sum: 0,
                    card_sum: 0,
                    discount_sum: 0,
                    debt_sum: 0,
                    appointments_count: 0
                });
                current = current.add(1, 'day');
            }

            // Fill data
            (appointments || []).forEach(app => {
                const day = dayjs(app.appointment_at).tz('Asia/Bishkek').format('YYYY-MM-DD');
                const existing = groupedMap.get(day);
                if (existing) {
                    existing.services_sum += Number(app.total_amount || 0);
                    existing.cash_sum += Number(app.paid_cash || 0);
                    existing.card_sum += Number(app.paid_card || 0);
                    existing.discount_sum += Number(app.discount || 0);
                    existing.debt_sum += Number(app.debt || 0);
                    existing.appointments_count += 1;
                }
            });

            // Fetch products within appointments
            // Join with Appointments to ensure we respect the same filters (no cancelled)
            // Join with Products to ensure we only count actual products (not services with null performer)
            const { data: allProducts } = await supabase
                .from("Products")
                .select("sellable_item_id");

            const productSellableIds = (allProducts || []).map(p => p.sellable_item_id).filter(Boolean);

            // Fetch current prices for all products (fallback for records before Feb 16 when price column didn't exist)
            const { data: currentPrices } = productSellableIds.length === 0 ? { data: [] } : await supabase
                .from("Prices")
                .select("sellable_item_id, price")
                .in("sellable_item_id", productSellableIds)
                .eq("is_current", true);

            const priceByItemId = new Map<string, number>();
            (currentPrices || []).forEach((p: any) => {
                if (p.sellable_item_id) priceByItemId.set(p.sellable_item_id, Number(p.price || 0));
            });

            const { data: productSales, error: productsError } = productSellableIds.length === 0 ? { data: [], error: null } : await supabase
                .from("AppointmentServices")
                .select(`
                    performed_at,
                    price,
                    quantity,
                    sellable_item_id,
                    Appointments!inner(status)
                `)
                .in("sellable_item_id", productSellableIds)
                .in("Appointments.status", ["Оплачено", "Со скидкой", "Частично оплачено", "Бесплатно"])
                .gte("performed_at", startOfMonth.toISOString())
                .lte("performed_at", endOfMonth.toISOString());

            if (productsError) {
                console.error("Error fetching product sales:", productsError);
            } else {
                (productSales || []).forEach((sale: any) => {
                    if (!sale.performed_at) return;
                    const day = dayjs(sale.performed_at).format('YYYY-MM-DD');
                    const existing = groupedMap.get(day);
                    if (existing) {
                        // price column added Feb 16 — for older records fall back to current Prices table
                        const unitPrice = sale.price != null
                            ? Number(sale.price)
                            : (priceByItemId.get(sale.sellable_item_id) ?? 0);
                        existing.products_sum += unitPrice * Number(sale.quantity || 1);
                    }
                });
            }

            setDailyData(Array.from(groupedMap.values()));
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки финансового отчета" });
        } finally {
            setLoading(false);
        }
    }, [selectedDate, notify, canSee, permissionsLoading]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totals = useMemo(() => {
        return dailyData.reduce((acc, curr) => ({
            services: acc.services + (curr.services_sum - curr.products_sum),
            products: acc.products + curr.products_sum,
            cash: acc.cash + curr.cash_sum,
            card: acc.card + curr.card_sum,
            discount: acc.discount + curr.discount_sum,
            debt: acc.debt + curr.debt_sum,
            count: acc.count + curr.appointments_count
        }), { services: 0, products: 0, cash: 0, card: 0, discount: 0, debt: 0, count: 0 });
    }, [dailyData]);

    if (permissionsLoading) return <CircularProgress />;
    if (!canSee) return <Typography sx={{ p: 3 }}>Доступ ограничен</Typography>;

    return (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
            <PageHeader
                title="Финансовый отчет"
                showTitle={false}
                showSearch={false}
                dateNavigation={<MonthNavigation date={selectedDate} setDate={setSelectedDate} activeMonths={activeMonths} />}
            />

            <Box sx={(theme) => ({ px: theme.appLayout.page.paddingX, pb: theme.appLayout.page.paddingY, flex: 1, display: 'flex', flexDirection: 'column' })}>
                <Stack spacing={{ xs: 1.5, md: 3 }} sx={{ flex: 1, minHeight: 0 }}>
                    {/* Summary Cards */}
                    <Grid2 container spacing={{ xs: 1, md: 2 }}>
                        <Grid2 size={{ xs: 12, sm: 3 }}>
                            <Card variant="outlined" sx={{ borderRadius: "14px", bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                                <CardContent sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" color="primary">Мед. услуги</Typography>
                                            <Typography variant="h5" fontWeight={700}>{formatKGS(totals.services)}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.onSurface' }}>
                                            <AssessmentOutlined />
                                        </Avatar>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid2>
                        <Grid2 size={{ xs: 12, sm: 3 }}>
                            <Card variant="outlined" sx={{ borderRadius: "14px", bgcolor: alpha(theme.palette.secondary.main, 0.05) }}>
                                <CardContent sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" color="secondary.main">Товары в приемах</Typography>
                                            <Typography variant="h5" fontWeight={700}>{formatKGS(totals.products)}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: alpha(theme.palette.secondary.main, 0.1), color: 'secondary.main' }}>
                                            <AssessmentOutlined />
                                        </Avatar>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid2>
                        <Grid2 size={{ xs: 6, sm: 3 }}>
                            <Card variant="outlined" sx={{ borderRadius: "14px", bgcolor: alpha(theme.palette.success.main, 0.05) }}>
                                <CardContent sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" color="success.main">Наличные</Typography>
                                            <Typography variant="h5" fontWeight={700} color="success.dark">{formatKGS(totals.cash)}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main' }}>
                                            <WalletIcon />
                                        </Avatar>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid2>
                        <Grid2 size={{ xs: 6, sm: 3 }}>
                            <Card variant="outlined" sx={{ borderRadius: "14px", bgcolor: alpha(theme.palette.info.main, 0.05) }}>
                                <CardContent sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" color="info.main">Безнал</Typography>
                                            <Typography variant="h5" fontWeight={700} color="info.dark">{formatKGS(totals.card)}</Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main' }}>
                                            <CreditCardIcon />
                                        </Avatar>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid2>
                        <Grid2 size={{ xs: 12, sm: 3 }}>
                            <Card variant="outlined" sx={{ borderRadius: "14px", bgcolor: alpha(theme.palette.error.main, 0.05) }}>
                                <CardContent sx={{ p: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Box>
                                            <Typography variant="caption" color="error.main">Долги / Скидки</Typography>
                                            <Typography variant="h6" fontWeight={700} color="error.dark">
                                                {formatKGS(totals.debt)} / {formatKGS(totals.discount)}
                                            </Typography>
                                        </Box>
                                        <Avatar sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), color: 'error.main' }}>
                                            <PaymentsOutlined />
                                        </Avatar>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid2>
                    </Grid2>

                    {/* Table */}
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
                    ) : (
                        <Paper variant="outlined" sx={{ borderRadius: "14px", overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <TableContainer sx={{ flex: 1 }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>Дата</TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 700 }}>Приемы</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Мед. услуги</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Товары</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Скидки</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Наличные</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Безнал</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>Долг</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {dailyData.map((day) => (
                                            <TableRow key={day.date} hover sx={{
                                                bgcolor: day.appointments_count > 0 ? 'inherit' : alpha(theme.palette.action.disabled, 0.02),
                                                opacity: day.appointments_count > 0 ? 1 : 0.6
                                            }}>
                                                <TableCell sx={{ fontWeight: 600 }}>
                                                    {dayjs(day.date).format('DD.MM')} ({dayjs(day.date).format('ddd')})
                                                </TableCell>
                                                <TableCell align="center">{day.appointments_count}</TableCell>
                                                <TableCell align="right">{formatKGS(day.services_sum - day.products_sum)}</TableCell>
                                                <TableCell align="right" sx={{ color: 'secondary.main' }}>
                                                    {day.products_sum > 0 ? formatKGS(day.products_sum) : '-'}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'error.main' }}>
                                                    {day.discount_sum > 0 ? `-${formatKGS(day.discount_sum)}` : '-'}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                                                    {formatKGS(day.cash_sum)}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'info.main', fontWeight: 600 }}>
                                                    {formatKGS(day.card_sum)}
                                                </TableCell>
                                                <TableCell align="right" sx={{ color: 'warning.main' }}>
                                                    {day.debt_sum > 0 ? formatKGS(day.debt_sum) : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {/* Total Row */}
                                        <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                                            <TableCell sx={{ fontWeight: 700 }}>Итого</TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 700 }}>{totals.count}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{formatKGS(totals.services)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: 'secondary.main' }}>{formatKGS(totals.products)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>-{formatKGS(totals.discount)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>{formatKGS(totals.cash)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: 'info.main' }}>{formatKGS(totals.card)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: 'warning.main' }}>{formatKGS(totals.debt)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}
                </Stack>
            </Box>
        </Box>
    );
};

export default FinancialReportsPage;
