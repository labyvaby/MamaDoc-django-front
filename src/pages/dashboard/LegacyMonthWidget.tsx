import React from "react";
import { Grid } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { formatKGS } from "../../utility/format";
import { MetricTile } from "./MetricTile";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { delta, num } from "./widgetUtils";
import { previousRange } from "./period";
import { monthlyReportQuery } from "./queries";

/*
 * ⚠ Временный блок: показывается вместо «Итогов периода», пока на сервере нет
 * агрегата `/dashboard/summary/` v2 (прод на 24.09.2026). Удаляется вместе с
 * legacyData.ts и queries.ts.
 */

/**
 * Месячный отчёт: единственный источник, который делит записи по статусам
 * (оплачено / отменено / ожидает) и отделяет приёмы от процедур. Показывается
 * только на периоде «Месяц» — эндпоинт умеет считать лишь календарный месяц.
 */
export const LegacyMonthWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);

  const query = useQuery(monthlyReportQuery(scope, range.month));
  const prevQuery = useQuery(monthlyReportQuery(scope, prev.month));

  const sum = query.data?.summary;
  const prevSum = prevQuery.data?.summary;
  const loading = query.isLoading;
  const paidShare =
    sum && sum.apptTotalCount > 0
      ? Math.round((sum.apptPaidCount / sum.apptTotalCount) * 100)
      : null;
  const cancelShare =
    sum && sum.apptTotalCount > 0
      ? Math.round((sum.apptCancelledCount / sum.apptTotalCount) * 100)
      : null;
  const debt = (query.data?.daily ?? []).reduce((acc, d) => acc + num(d.debtSum), 0);
  const prevLabel = "прошлый месяц целиком";

  return (
    <DashCard
      title="Месяц целиком"
      subheader={dayjs(range.month + "-01").format("MMMM YYYY")}
      href="/reports"
      linkLabel="Отчёты"
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.25}>
          {/* Приёмы и процедуры разведены намеренно: карточка «Записи» считает
              и то и другое (day-counts не различает), а месячный отчёт даёт их
              порознь. */}
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Приёмов"
              href="/reports"
              value={sum?.apptTotalCount ?? 0}
              loading={loading}
              delta={delta(sum?.apptTotalCount ?? 0, prevSum?.apptTotalCount, prevLabel)}
              title="Месячный отчёт считает приёмы и процедуры раздельно; карточка «Записи» — вместе"
            />
          </Grid>
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Оплачено"
              href="/reports"
              value={sum?.apptPaidCount ?? 0}
              tone="success"
              loading={loading}
              delta={delta(sum?.apptPaidCount ?? 0, prevSum?.apptPaidCount, prevLabel)}
              hint={paidShare != null ? `${paidShare}% приёмов` : undefined}
              title="Оплаченными считаются приёмы в статусе paid или discounted"
            />
          </Grid>
          {/* «Ждут оплаты» (summary.waitingCount) здесь было и убрано: на проде
              статус приёма почти не переходит в «оплачен», и плитка считала
              неоплаченными почти все записи месяца. См. тикет по сводке. */}
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Процедур"
              href="/reports"
              value={sum?.procTotalCount ?? 0}
              loading={loading}
              delta={delta(sum?.procTotalCount ?? 0, prevSum?.procTotalCount, prevLabel)}
            />
          </Grid>
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Отменено"
              href="/reports"
              value={sum?.apptCancelledCount ?? 0}
              tone={sum && sum.apptCancelledCount > 0 ? "warning" : "neutral"}
              loading={loading}
              delta={delta(
                sum?.apptCancelledCount ?? 0,
                prevSum?.apptCancelledCount,
                prevLabel,
                true,
              )}
              hint={cancelShare != null ? `${cancelShare}% приёмов` : undefined}
              title="Отмены и неявки — разные статусы; здесь только отмены"
            />
          </Grid>
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Скидки"
              href="/reports"
              value={formatKGS(num(sum?.discountSum))}
              loading={loading}
              delta={delta(
                num(sum?.discountSum),
                prevSum ? num(prevSum.discountSum) : undefined,
                prevLabel,
                true,
              )}
              hint={sum?.discountedCount ? `${sum.discountedCount} приёмов` : undefined}
            />
          </Grid>
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Долги"
              href="/reports"
              value={formatKGS(debt)}
              tone={debt > 0 ? "warning" : "neutral"}
              loading={loading}
              title="Сумма колонки «Долг» месячного отчёта по всем дням месяца"
            />
          </Grid>
        </Grid>
      )}
    </DashCard>
  );
};

export default LegacyMonthWidget;
