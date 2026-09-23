import React from "react";
import { Box, Grid, Skeleton, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";

import { AppCard } from "../../components/ui";
import { formatKGS } from "../../utility/format";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { DeltaChip, MetricTile } from "./MetricTile";
import { Sparkline } from "./Sparkline";
import { WidgetError, type WidgetProps } from "./widgetKit";
import { delta, num } from "./widgetUtils";
import { previousRange, resolvePeriod, sumDayCounts } from "./period";
import {
  availabilityTodayQuery,
  cashboxSummaryQuery,
  dayCountsQuery,
  monthlyReportQuery,
} from "./queries";

/**
 * «Пульс» — первое, что владелец видит утром: сколько заработали, как это
 * против обычного, куда идёт месяц — и четыре цифры, которые объясняют выручку
 * (поток записей, чек, что осталось после расходов, загрузка людей).
 *
 * Единственная крупная цифра на экране — выручка. Остальные блоки сводки
 * намеренно тише: иерархия и есть «подчёркивание важного».
 *
 * Ключи запросов общие с остальными блоками (`queries.ts`), поэтому «Пульс»
 * не добавляет обращений к бэку, если «Движение денег» и «Записи» на экране.
 */
export const PulseWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const { can } = useCanChecker();
  const canAppointments = can(PAGE_PERMISSIONS.appointments);
  const canSchedule = can(PAGE_PERMISSIONS.schedule);
  const canReports = can(PAGE_PERMISSIONS.reports);

  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);
  const monthRange = React.useMemo(() => resolvePeriod("month"), []);

  const cash = useQuery(cashboxSummaryQuery(scope, range));
  const prevCash = useQuery(cashboxSummaryQuery(scope, prev));
  // Месяц нужен всегда — даже на «Сегодня» владелец хочет видеть, куда идёт
  // месяц. На периоде «Месяц» это тот же запрос, что и основной: кэш.
  const monthCash = useQuery(cashboxSummaryQuery(scope, monthRange));
  const counts = useQuery(dayCountsQuery(scope, range, canAppointments));
  const prevCounts = useQuery(dayCountsQuery(scope, prev, canAppointments));
  const availability = useQuery(availabilityTodayQuery(scope, canSchedule));
  const report = useQuery(monthlyReportQuery(scope, monthRange.month, canReports));

  const s = cash.data;
  const p = prevCash.data;
  const income = num(s?.netIncome);
  const avgCheck = s && s.paymentCount > 0 ? income / s.paymentCount : 0;
  const prevAvgCheck = p && p.paymentCount > 0 ? num(p.netIncome) / p.paymentCount : undefined;

  const monthIncome = num(monthCash.data?.netIncome);
  /**
   * Оценка по темпу: сколько выйдет к концу месяца, если дальше пойдёт как
   * шло. Не «прогноз» — линейная экстраполяция не знает про выходные и сезон,
   * поэтому в первые дни месяца (мало данных) и в последний день не считаем.
   */
  const pace = React.useMemo(() => {
    if (!monthCash.data) return null;
    const today = dayjs();
    const elapsed = today.date();
    const inMonth = today.daysInMonth();
    // Ноль выручки — не темп, а отсутствие данных: «≈ 0» только пугает.
    if (elapsed < 3 || elapsed >= inMonth || monthIncome <= 0) return null;
    return (monthIncome / elapsed) * inMonth;
  }, [monthCash.data, monthIncome]);

  const records = sumDayCounts(counts.data);
  const prevRecords = prevCounts.data ? sumDayCounts(prevCounts.data) : undefined;

  const av = availability.data;
  const staffTotal = av?.overallEmployeeCount ?? 0;
  const staffFree = av?.overallFreeEmployeeCount ?? 0;
  const loadPercent =
    staffTotal > 0 ? Math.round(((staffTotal - staffFree) / staffTotal) * 100) : null;

  // ⚠ Бэк отдаёт daily[] от 31-го к 1-му — без сортировки рост читался бы
  // падением (см. reports-monthly-api-quirks).
  const daily = React.useMemo(
    () =>
      (report.data?.daily ?? [])
        .filter((d) => d.date <= monthRange.dateTo)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          label: dayjs(d.date).format("D MMMM"),
          value: num(d.cashSum) + num(d.cardSum),
        })),
    [report.data, monthRange.dateTo],
  );

  const netFlow = num(s?.netCashFlow);

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      disableContentPadding
      sx={{ height: "100%" }}
    >
      {cash.isError ? (
        <Box sx={{ p: 2 }}>
          <WidgetError error={cash.error} />
        </Box>
      ) : (
        <Grid container>
          {/* ── Главная цифра ─────────────────────────────────────────────── */}
          <Grid
            item
            xs={12}
            md={6}
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRight: { md: 1 },
              borderBottom: { xs: 1, md: 0 },
              borderColor: { xs: "divider", md: "divider" },
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
              Выручка · {range.label}
            </Typography>

            {cash.isLoading ? (
              <Skeleton variant="text" width="70%" height={58} />
            ) : (
              <Stack
                direction="row"
                alignItems="center"
                spacing={1.25}
                sx={{ flexWrap: "wrap", rowGap: 0.5, mt: 0.25 }}
              >
                <Typography
                  component="div"
                  sx={{
                    fontSize: { xs: 34, sm: 42 },
                    fontWeight: 700,
                    lineHeight: 1.1,
                    letterSpacing: "-0.035em",
                    color: "text.primary",
                  }}
                >
                  {formatKGS(income)}
                </Typography>
                {p && (
                  <DeltaChip
                    size="md"
                    delta={{
                      current: income,
                      previous: num(p.netIncome),
                      baselineLabel: prev.label,
                    }}
                  />
                )}
              </Stack>
            )}

            {p && (
              <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                {prev.label}: {formatKGS(num(p.netIncome))}
              </Typography>
            )}

            {/* Месяц — контекст для любого периода: «сегодня хорошо» мало
                значит, если месяц идёт ниже плана. */}
            {monthCash.data && (
              <Stack
                direction="row"
                spacing={2.5}
                sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 0.5 }}
              >
                {periodKey !== "month" && (
                  <Box>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      С начала месяца
                    </Typography>
                    <Typography sx={{ fontWeight: 650, fontSize: "0.95rem" }}>
                      {formatKGS(monthIncome)}
                    </Typography>
                  </Box>
                )}
                {pace != null && (
                  <Box title="Линейная оценка: выручка с начала месяца ÷ прошедшие дни × дни в месяце. Не учитывает выходные и сезон.">
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      По темпу к концу месяца
                    </Typography>
                    <Typography
                      sx={{ fontWeight: 650, fontSize: "0.95rem", color: "primary.onSurface" }}
                    >
                      ≈ {formatKGS(pace)}
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}

            {daily.length > 1 && daily.some((d) => d.value > 0) && (
              <Box sx={{ mt: "auto", pt: 1.5 }}>
                <Sparkline points={daily} height={44} format={formatKGS} />
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  приход по дням, {dayjs(monthRange.dateFrom).format("MMMM")}
                </Typography>
              </Box>
            )}
          </Grid>

          {/* ── Что объясняет выручку ─────────────────────────────────────── */}
          <Grid item xs={12} md={6} sx={{ p: { xs: 1.5, md: 2 } }}>
            <Grid container spacing={1.25}>
              {canAppointments && (
                <Grid item xs={6}>
                  <MetricTile
                    label="Записи"
                    value={records}
                    icon={<EventAvailableOutlined />}
                    loading={counts.isLoading}
                    delta={delta(records, prevRecords, prev.label)}
                    hint={
                      range.dateFrom !== range.dateTo && records > 0
                        ? `≈ ${Math.round((records / (dayjs(range.dateTo).diff(range.dateFrom, "day") + 1)) * 10) / 10} в день`
                        : "приёмы и процедуры"
                    }
                    title="Все записи периода — приёмы и процедуры вместе, в любом статусе"
                  />
                </Grid>
              )}
              <Grid item xs={6}>
                <MetricTile
                  label="Средний чек"
                  href="/cashbox"
                  value={formatKGS(avgCheck)}
                  icon={<ReceiptLongOutlined />}
                  loading={cash.isLoading}
                  delta={delta(avgCheck, prevAvgCheck, prev.label)}
                  hint={s ? `${s.paymentCount} оплат` : undefined}
                  title="Выручка ÷ число оплат. Чек на оплату, а не на визит: визит бывает оплачен частями."
                />
              </Grid>
              <Grid item xs={6}>
                <MetricTile
                  label="Осталось после расходов"
                  href="/cashbox"
                  value={formatKGS(netFlow)}
                  icon={<AccountBalanceWalletOutlined />}
                  tone={s && netFlow < 0 ? "error" : "neutral"}
                  loading={cash.isLoading}
                  delta={delta(netFlow, p ? num(p.netCashFlow) : undefined, prev.label)}
                  hint={s ? `расходы ${formatKGS(num(s.totalExpenses) + num(s.supplyTotal))}` : undefined}
                  title="Выручка + продажи товаров − расходы − закупки (netCashFlow кассы)"
                />
              </Grid>
              {canSchedule && (
                <Grid item xs={6}>
                  <MetricTile
                    label="Загрузка сегодня"
                    href="/schedule"
                    value={loadPercent == null ? "—" : `${loadPercent}%`}
                    icon={<GroupsOutlined />}
                    tone={loadPercent != null && loadPercent < 40 ? "warning" : "neutral"}
                    loading={availability.isLoading}
                    hint={
                      staffTotal
                        ? staffFree > 0
                          ? `свободны ${staffFree} из ${staffTotal}`
                          : "свободных окон нет"
                        : "график не заполнен"
                    }
                    title="Доля специалистов, у которых на сегодня не осталось свободных окон. Низкая загрузка — незанятые окна, которые можно продать."
                  />
                </Grid>
              )}
            </Grid>
          </Grid>
        </Grid>
      )}
    </AppCard>
  );
};

export default PulseWidget;
