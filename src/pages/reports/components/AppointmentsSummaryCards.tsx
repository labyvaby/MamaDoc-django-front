import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SummaryCards, type SummaryCard } from './SummaryCards';
import { formatKGS } from '../../../utility/format';
import { getMonthlyReport } from '../../../api/reports';
import { usePermissions } from '../../../hooks/usePermissions';
import { useT } from '../../../i18n/VerticalProvider';

type ExtraCard = SummaryCard;

interface AppointmentsSummaryCardsProps {
    dateFrom: string;
    dateTo: string;
    employeeId?: string;
    /** Срез по филиалу (только Django-бэкенд); без него — вся организация. */
    branchId?: number;
    appointments?: any[];
    extraCards?: ExtraCard[];
    /** Не запрашивать и не показывать общую статистику приёмов. */
    showBaseCards?: boolean;
}

export const AppointmentsSummaryCards: React.FC<AppointmentsSummaryCardsProps> = ({
    dateFrom,
    dateTo,
    employeeId,
    branchId,
    appointments: providedAppointments,
    extraCards = [],
    showBaseCards = true,
}) => {
    const { t } = useT('appointments');
    const { activeOrganization } = usePermissions();

    const { data: rpcData, isFetching } = useQuery({
        queryKey: ['appointments-summary', dateFrom, dateTo, employeeId, activeOrganization?.id, branchId ?? null],
        queryFn: async () => {
            if (providedAppointments) return null;
            const monthStr = dateFrom.substring(0, 7);
            return getMonthlyReport({
                month: monthStr,
                employeeId: employeeId ? parseInt(employeeId, 10) : undefined,
                organizationId: activeOrganization?.id ?? undefined,
                branchId,
            });
        },
        enabled: !providedAppointments && showBaseCards,
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
            total:           Number((rpcData as any)?.summary?.apptTotalCount ?? 0) + Number((rpcData as any)?.summary?.procTotalCount ?? 0),
            paidCount:       Number((rpcData as any)?.summary?.paidCount ?? 0),
            paidSum:         0,
            waiting:         Number((rpcData as any)?.summary?.waitingCount ?? 0),
            cancelled:       Number((rpcData as any)?.summary?.cancelledCount ?? 0),
            discountedCount: Number((rpcData as any)?.summary?.discountedCount ?? 0),
            discountSum:     Number((rpcData as any)?.summary?.discountSum ?? 0),
            apptTotal:       Number((rpcData as any)?.summary?.apptTotalCount ?? 0),
            apptPaid:        Number((rpcData as any)?.summary?.apptPaidCount ?? 0),
            apptWaiting:     0,
            apptCancelled:   Number((rpcData as any)?.summary?.apptCancelledCount ?? 0),
            procTotal:       Number((rpcData as any)?.summary?.procTotalCount ?? 0),
            procPaid:        Number((rpcData as any)?.summary?.procPaidCount ?? 0),
          };

    // If RPC returned split data — show two separate cards instead of one combined
    const hasSplit = !providedAppointments && (rpcData as any)?.summary != null;

    const baseCards = !showBaseCards ? extraCards : hasSplit ? [
        {
            title: t('summaryCards.paidVisits'),
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

    return (
        <SummaryCards
            cards={baseCards}
            loading={!providedAppointments && isFetching}
        />
    );
};
