import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Grid2,
    Card,
    CardContent,
    Typography,
    Skeleton,
    Stack,
    Box,
    alpha,
    useTheme
} from '@mui/material';
import { supabase } from '../../../utility/supabaseClient';
import { formatKGS } from '../../../utility/format';

interface ExtraCard {
    title: string;
    primaryValue: string;
    secondaryText: string;
    color: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
}

interface AppointmentsSummaryCardsProps {
    dateFrom: string;
    dateTo: string;
    employeeId?: string;
    appointments?: any[];
    extraCards?: ExtraCard[];
}

export const AppointmentsSummaryCards: React.FC<AppointmentsSummaryCardsProps> = ({
    dateFrom,
    dateTo,
    employeeId,
    appointments: providedAppointments,
    extraCards = [],
}) => {
    const theme = useTheme();

    const { data: rpcData, isFetching } = useQuery({
        queryKey: ['appointments-summary', dateFrom, dateTo, employeeId],
        queryFn: async () => {
            if (providedAppointments) return null;
            const { data, error } = await supabase.rpc('get_appointments_summary', {
                p_date_from:   dateFrom,
                p_date_to:     dateTo,
                p_employee_id: employeeId ?? null,
            });
            if (error) throw error;
            return (data as any[])?.[0] ?? null;
        },
        enabled: !providedAppointments,
        staleTime: Infinity,
    });

    // Legacy path: if providedAppointments is passed, compute metrics client-side
    const legacyMetrics = useMemo(() => {
        if (!providedAppointments) return null;
        let total = 0, waiting = 0, cancelled = 0, discountedCount = 0, discountSum = 0, paidCount = 0, paidSum = 0;
        providedAppointments.forEach((app: any) => {
            const isWaiting   = app.status === 'Ожидаем' || app.status === 'Пациент здесь';
            const isCancelled = app.status === 'Отменено' || app.status === 'Пациент не пришел';
            if (!isWaiting && !isCancelled) total++;
            if (isWaiting)   waiting++;
            if (isCancelled) cancelled++;
            if (app.status === 'Со скидкой' || app.status === 'Бесплатно') {
                discountedCount++;
                discountSum += Number(app.discount || 0);
            }
            if (['Оплачено','Частично оплачено','Со скидкой','Бесплатно'].includes(app.status)) {
                paidCount++;
                paidSum += Number(app.paid_cash || 0) + Number(app.paid_card || 0);
            }
        });
        return {
            total: providedAppointments.length, waiting, cancelled, discountedCount, discountSum, paidCount, paidSum,
            apptTotal: 0, apptPaid: 0, apptWaiting: 0, apptCancelled: 0, procTotal: 0, procPaid: 0,
        };
    }, [providedAppointments]);

    const metrics = providedAppointments
        ? legacyMetrics!
        : {
            total:           Number(rpcData?.total_count   ?? 0),
            paidCount:       Number(rpcData?.paid_count    ?? 0),
            paidSum:         Number(rpcData?.paid_sum      ?? 0),
            waiting:         Number(rpcData?.waiting_count ?? 0),
            cancelled:       Number(rpcData?.cancelled_count ?? 0),
            discountedCount: Number(rpcData?.discounted_count ?? 0),
            discountSum:     Number(rpcData?.discount_sum  ?? 0),
            apptTotal:       Number(rpcData?.appt_total_count   ?? 0),
            apptPaid:        Number(rpcData?.appt_paid_count    ?? 0),
            apptWaiting:     Number(rpcData?.appt_waiting_count ?? 0),
            apptCancelled:   Number(rpcData?.appt_cancelled_count ?? 0),
            procTotal:       Number(rpcData?.proc_total_count ?? 0),
            procPaid:        Number(rpcData?.proc_paid_count  ?? 0),
          };

    // If RPC returned split data — show two separate cards instead of one combined
    const hasSplit = !providedAppointments && rpcData?.appt_total_count != null;

    const baseCards = hasSplit ? [
        {
            title: 'Оплачено приёмов',
            primaryValue: metrics.apptPaid.toString(),
            secondaryText: `Всего: ${metrics.apptTotal} · Отменено: ${metrics.apptCancelled}`,
            color: 'success' as const,
        },
        {
            title: 'Оплачено процедур',
            primaryValue: metrics.procPaid.toString(),
            secondaryText: `Всего: ${metrics.procTotal} · Отменено: 0`,
            color: 'success' as const,
        },
        {
            title: 'Со скидкой',
            primaryValue: metrics.discountedCount.toString(),
            secondaryText: `Сумма скидок: ${formatKGS(metrics.discountSum)}`,
            color: 'info' as const,
        },
        {
            title: 'Ожидание',
            primaryValue: metrics.waiting.toString(),
            secondaryText: 'Ожидают или здесь',
            color: 'warning' as const,
        },
        {
            title: 'Отменены',
            primaryValue: metrics.cancelled.toString(),
            secondaryText: 'Не пришли или отменены',
            color: 'error' as const,
        },
        ...extraCards,
    ] : [
        {
            title: 'Оплачено',
            primaryValue: metrics.paidCount.toString(),
            secondaryText: `Всего: ${metrics.total} · Отменено: ${metrics.cancelled}`,
            color: 'success' as const,
        },
        {
            title: 'Со скидкой',
            primaryValue: metrics.discountedCount.toString(),
            secondaryText: `Сумма скидок: ${formatKGS(metrics.discountSum)}`,
            color: 'info' as const,
        },
        {
            title: 'Ожидание',
            primaryValue: metrics.waiting.toString(),
            secondaryText: 'Ожидают или здесь',
            color: 'warning' as const,
        },
        {
            title: 'Отменены',
            primaryValue: metrics.cancelled.toString(),
            secondaryText: 'Не пришли или отменены',
            color: 'error' as const,
        },
        ...extraCards,
    ];

    const totalCards = baseCards.length;
    const useFlex = totalCards > 6;
    const lgSize = useFlex ? undefined : Math.floor(12 / totalCards) as any;

    if (!providedAppointments && isFetching) {
        return (
            <Box sx={{ display: 'flex', gap: { xs: 1, md: 2 }, flexWrap: 'wrap' }}>
                {Array.from({ length: totalCards }).map((_, i) => (
                    <Box key={i} sx={{ flex: '1 1 140px', minWidth: 0 }}>
                        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: "10px" }} />
                    </Box>
                ))}
            </Box>
        );
    }

    if (useFlex) {
        return (
            <Box sx={{ display: 'flex', gap: { xs: 1, md: 1.5 }, flexWrap: { xs: 'wrap', lg: 'nowrap' } }}>
                {baseCards.map((card, idx) => (
                    <Box key={idx} sx={{ flex: '1 1 0', minWidth: { xs: 'calc(50% - 4px)', lg: 0 } }}>
                        <Card
                            variant="outlined"
                            sx={{
                                bgcolor: alpha(theme.palette[card.color].main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                                borderColor: alpha(theme.palette[card.color].main, 0.2),
                                height: '100%'
                            }}
                        >
                            <CardContent sx={{ p: { xs: 1, md: 1.5 }, '&:last-child': { pb: { xs: 1, md: 1.5 } } }}>
                                <Stack spacing={0}>
                                    <Typography
                                        sx={{
                                            color: `${card.color}.onSurface`,
                                            fontWeight: 700,
                                            fontSize: { xs: '0.6rem', md: '0.65rem' },
                                            letterSpacing: 0.5,
                                            lineHeight: 1.3
                                        }}
                                    >
                                        {card.title}
                                    </Typography>
                                    <Box>
                                        <Typography
                                            fontWeight={700}
                                            noWrap
                                            sx={{
                                                color: `${card.color}.onSurface`,
                                                fontSize: { xs: '1rem', sm: '1.1rem', md: '1.2rem' },
                                                lineHeight: 1.1
                                            }}
                                        >
                                            {card.primaryValue}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        variant="caption"
                                        noWrap
                                        sx={{
                                            color: 'text.secondary',
                                            fontWeight: 500,
                                            display: 'block',
                                            fontSize: { xs: '0.55rem', md: '0.6rem' },
                                            lineHeight: 1.3
                                        }}
                                    >
                                        {card.secondaryText}
                                    </Typography>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Box>
                ))}
            </Box>
        );
    }

    return (
        <Grid2 container spacing={{ xs: 1, md: 2 }}>
            {baseCards.map((card, idx) => (
                <Grid2 key={idx} size={{ xs: 6, lg: lgSize }}>
                    <Card
                        variant="outlined"
                        sx={{
                            bgcolor: alpha(theme.palette[card.color].main, 0.06),
                            border: `1px solid ${alpha(theme.palette[card.color].main, 0.2)}`,
                            height: '100%'
                        }}
                    >
                        <CardContent sx={{ p: { xs: 1, md: 1.5 }, '&:last-child': { pb: { xs: 1, md: 1.5 } } }}>
                            <Stack spacing={0}>
                                <Typography
                                    sx={{
                                        color: `${card.color}.main`,
                                        fontWeight: 700,
                                        fontSize: { xs: '0.6rem', md: '0.7rem' },
                                        letterSpacing: 0.5,
                                        
                                        lineHeight: 1.3
                                    }}
                                >
                                    {card.title}
                                </Typography>
                                <Box>
                                    <Typography
                                        fontWeight={700}
                                        noWrap
                                        sx={{
                                            color: `${card.color}.dark`,
                                            fontSize: { xs: '1.1rem', sm: '1.3rem', md: '1.5rem' },
                                            lineHeight: 1.1
                                        }}
                                    >
                                        {card.primaryValue}
                                    </Typography>
                                </Box>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        fontSize: { xs: '0.6rem', md: '0.7rem' },
                                        lineHeight: 1.3
                                    }}
                                >
                                    {card.secondaryText}
                                </Typography>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid2>
            ))}
        </Grid2>
    );
};
