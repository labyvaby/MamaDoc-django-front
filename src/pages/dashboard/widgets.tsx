import React from "react";
import { Box, Grid, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router";

import { AppButton } from "../../components/ui";
import type { CashboxSummary } from "../../api/cashbox";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { DeltaChip, MetricTile } from "./MetricTile";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { delta, num } from "./widgetUtils";
import { previousRange, sumDayCounts, toDailySeries, type PeriodRange } from "./period";
import { cashboxSummaryQuery, dayCountsQuery, monthlyReportQuery } from "./queries";

// ── Записи ────────────────────────────────────────────────────────────────────

/** Окно графика на «Сегодня»: один столбик ничего не говорит, нужен фон. */
const TODAY_CHART_DAYS = 14;

/**
 * Записи за период по дням. Источник — `/appointments/day-counts/`: он отдаёт
 * ровно карту «дата → количество», поэтому окно любой длины стоит один запрос,
 * а не выгрузку самих приёмов (месяц списком — около 3 МБ).
 *
 * График зависит от периода:
 * - «Сегодня» — последние 14 дней с выделенным сегодня (число — за сегодня);
 * - «Неделя» — 7 дней периода с днём недели в подписи;
 * - «Месяц» — дни с 1-го по сегодня, подписи через день, без чисел над
 *   столбиками (на 30 столбиках они слипаются).
 *
 * ⚠ Считаются ВСЕ записи периода, независимо от статуса и вида: приёмы и
 * процедуры здесь вместе. Разделение даёт месячный отчёт (виджет «Месяц»).
 */
export const AppointmentsWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);
  // Куда ведёт карточка: первое доступное рабочее пространство приёмов. Общую
  // «главную по правам» (resolveHomeRoute) здесь брать нельзя — она может
  // вернуть /cleaning или /profile. Нет ни одного из трёх прав — без перехода.
  const { can } = useCanChecker();
  const workspace = can(PAGE_PERMISSIONS.appointmentsRegistry)
    ? { href: "/appointments", label: "Регистратура" }
    : can(PAGE_PERMISSIONS.doctorRoom)
      ? { href: "/doctor", label: "Кабинет врача" }
      : can(PAGE_PERMISSIONS.nurseRoom)
        ? { href: "/nurse", label: "Процедурный" }
        : undefined;

  const chartRange = React.useMemo<PeriodRange>(
    () =>
      periodKey === "today"
        ? {
            ...range,
            dateFrom: dayjs(range.dateTo)
              .subtract(TODAY_CHART_DAYS - 1, "day")
              .format("YYYY-MM-DD"),
          }
        : range,
    [range, periodKey],
  );

  const query = useQuery(dayCountsQuery(scope, range));
  const prevQuery = useQuery(dayCountsQuery(scope, prev));
  // На «Неделе» и «Месяце» окно графика совпадает с периодом — тот же запрос.
  const chartQuery = useQuery(dayCountsQuery(scope, chartRange));

  const total = sumDayCounts(query.data);
  const prevTotal = prevQuery.data ? sumDayCounts(prevQuery.data) : undefined;
  const periodSeries = toDailySeries(query.data, range);
  const series = toDailySeries(chartQuery.data, chartRange);
  const peak = periodSeries.reduce((max, d) => Math.max(max, d.count), 0);
  const busiest = periodSeries.find((d) => d.count === peak && peak > 0);
  const perDay = periodSeries.length ? Math.round((total / periodSeries.length) * 10) / 10 : 0;
  const chartMax = series.reduce((max, d) => Math.max(max, d.count), 0);

  const hint =
    periodKey === "today"
      ? "приёмы и процедуры, все статусы"
      : `≈ ${perDay.toLocaleString("ru-RU")} в день${busiest ? ` · пик ${peak} — ${dayjs(busiest.date).format(periodKey === "week" ? "dd" : "D MMM")}` : ""}`;

  const barLabel = (date: string, index: number) => {
    const day = dayjs(date);
    if (date === range.dateTo && periodKey === "today") return "сегодня";
    if (periodKey === "week") return day.format("dd D");
    if (periodKey === "month") return index % 2 === 0 ? day.format("D") : "";
    return day.format("D");
  };

  return (
    <DashCard
      title="Записи"
      subheader={periodKey === "today" ? `последние ${TODAY_CHART_DAYS} дней` : range.label}
      href={workspace?.href}
      linkLabel={workspace?.label}
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Stack spacing={1.75} sx={{ height: "100%" }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: "wrap" }}>
            {query.isLoading ? (
              <Skeleton variant="text" width={80} height={38} />
            ) : (
              <Typography
                sx={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {total}
              </Typography>
            )}
            {prevTotal !== undefined && !query.isLoading && (
              <DeltaChip
                size="md"
                delta={{ current: total, previous: prevTotal, baselineLabel: prev.label }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{hint}</Typography>
          </Stack>

          {chartQuery.isLoading ? (
            <Skeleton variant="rounded" height={110} sx={{ borderRadius: "10px" }} />
          ) : (
            series.length > 1 && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: periodKey === "month" ? "3px" : "4px",
                  flex: 1,
                  minHeight: 110,
                }}
              >
                {series.map((d, i) => {
                  const day = dayjs(d.date);
                  const isWeekend = day.day() === 0 || day.day() === 6;
                  const isToday = d.date === range.dateTo;
                  const label = barLabel(d.date, i);
                  return (
                    <Tooltip
                      key={d.date}
                      arrow
                      placement="top"
                      title={`${day.format("dd, D MMMM")} — ${d.count}`}
                    >
                      <Box
                        component={RouterLink}
                        to={`/appointments?date=${d.date}`}
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: "5px",
                          textDecoration: "none",
                          "&:hover .appt-bar": { opacity: 0.8 },
                        }}
                      >
                        {periodKey !== "month" && (
                          <Typography
                            sx={{
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              color: "text.secondary",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {d.count}
                          </Typography>
                        )}
                        <Box
                          className="appt-bar"
                          sx={(t) => {
                            const dark = t.palette.mode === "dark";
                            return {
                              width: "100%",
                              height: chartMax ? Math.max(4, (d.count / chartMax) * 72) : 4,
                              borderRadius: "4px 4px 1px 1px",
                              transition: "opacity .15s ease",
                              bgcolor: isToday
                                ? t.palette.primary.main
                                : d.count === 0
                                  ? subtleBg(t, true)
                                  : alpha(
                                      t.palette.primary.main,
                                      isWeekend ? (dark ? 0.3 : 0.18) : dark ? 0.6 : 0.38,
                                    ),
                            };
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: "0.6875rem",
                            lineHeight: 1.2,
                            minHeight: "1.2em",
                            whiteSpace: "nowrap",
                            fontWeight: isToday ? 700 : 400,
                            color: isToday ? "primary.onSurface" : "text.secondary",
                          }}
                        >
                          {label}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            )
          )}
        </Stack>
      )}
    </DashCard>
  );
};

// ── Движение денег ────────────────────────────────────────────────────────────

/** Одна строка разбора «откуда пришло и куда ушло». */
const FlowRow: React.FC<{
  label: string;
  amount: number;
  sign: "+" | "−";
  hint?: string;
  /** Доля от самой крупной строки, 0..1. */
  share: number;
}> = ({ label, amount, sign, hint, share }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "16px minmax(0,1fr) auto",
      alignItems: "center",
      columnGap: 1.25,
      py: 0.75,
    }}
  >
    <Typography
      sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.disabled", textAlign: "center" }}
    >
      {sign}
    </Typography>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }} noWrap>
        {label}
        {hint && (
          <Box component="span" sx={{ color: "text.disabled", ml: 0.75, fontSize: "0.75rem" }}>
            {hint}
          </Box>
        )}
      </Typography>
      <Box
        sx={(t) => ({
          mt: 0.5,
          height: 4,
          borderRadius: "2px",
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.07),
        })}
      >
        <Box
          sx={(t) => ({
            height: "100%",
            borderRadius: "2px",
            width: `${Math.min(100, Math.max(2, share * 100))}%`,
            // Приход — акцентом, расход — нейтральным: расход не «плохой
            // цвет», это просто другая сторона движения.
            bgcolor:
              sign === "−"
                ? alpha(t.palette.text.primary, 0.28)
                : alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.7 : 0.5),
          })}
        />
      </Box>
    </Box>
    <Typography
      sx={{
        minWidth: 110,
        textAlign: "right",
        fontSize: "0.875rem",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {formatKGS(amount)}
    </Typography>
  </Box>
);

/** Откуда ушли возвраты: «нал 1 000 с · безнал 300 с» — нулевые источники не пишем. */
function refundSourcesHint(s: CashboxSummary): string | undefined {
  const parts = [
    ["нал", num(s.cashRefunds)],
    ["безнал", num(s.cardRefunds)],
    ["на баланс", num(s.balanceRefunds)],
  ] as const;
  const text = parts
    .filter(([, amount]) => amount > 0)
    .map(([label, amount]) => `${label} ${formatKGS(amount)}`)
    .join(" · ");
  return text || undefined;
}

/**
 * «Куда ушли деньги» — разбор кассы за период как маленький отчёт о движении:
 * оплаты − возвраты + товары − расходы − закупки = осталось. Главная цифра
 * (выручка) уже в «Пульсе», здесь владелец видит, из чего сложился остаток и
 * что его съело.
 *
 * Все суммы приходят строками-decimal — считаем через Number. Страховое
 * покрытие в gross/net НЕ входит и показано отдельной подписью.
 */
export const MoneyWidget: React.FC<WidgetProps> = ({ range, scope }) => {
  const query = useQuery(cashboxSummaryQuery(scope, range));
  const s = query.data;

  const gross = num(s?.grossIncome);
  const refunds = num(s?.refundedTotal);
  const sales = num(s?.salesTotal);
  const expenses = num(s?.totalExpenses);
  const supply = num(s?.supplyTotal);
  const flow = num(s?.netCashFlow);
  // Полосы — от самой крупной строки, чтобы пропорции читались глазом.
  const scale = Math.max(gross, sales, expenses, supply, refunds, 1);

  const cash = num(s?.cashIncome);
  const card = num(s?.cardIncome);
  const cashShare = cash + card > 0 ? Math.round((cash / (cash + card)) * 100) : null;
  const insurance = num(s?.insuranceIncome);

  return (
    <DashCard title="Движение денег" subheader={range.label} href="/cashbox" linkLabel="Касса">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : query.isLoading || !s ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="text" height={28} />
          ))}
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Box>
            <FlowRow
              sign="+"
              label="Оплаты"
              amount={gross}
              share={gross / scale}
              hint={`${s.paymentCount} оплат`}
            />
            {refunds > 0 && (
              <FlowRow
                sign="−"
                label="Возвраты"
                amount={refunds}
                share={refunds / scale}
                hint={refundSourcesHint(s)}
              />
            )}
            {sales > 0 && (
              <FlowRow
                sign="+"
                label="Продажи товаров"
                amount={sales}
                share={sales / scale}
                hint={`${s.saleCount} продаж`}
              />
            )}
            <FlowRow
              sign="−"
              label="Расходы"
              amount={expenses}
              share={expenses / scale}
              hint={s.expenseCount ? `${s.expenseCount} шт.` : undefined}
            />
            {supply > 0 && (
              <FlowRow sign="−" label="Закупки" amount={supply} share={supply / scale} />
            )}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "16px minmax(0,1fr) auto",
                alignItems: "center",
                columnGap: 1.25,
                pt: 1.25,
                mt: 0.5,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "text.disabled",
                  textAlign: "center",
                }}
              >
                =
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 650 }}>Осталось</Typography>
              <Typography
                sx={{
                  fontSize: 18,
                  fontWeight: 700,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: flow < 0 ? "error.onSurface" : "text.primary",
                }}
              >
                {formatKGS(flow)}
              </Typography>
            </Box>
          </Box>

          {(cashShare != null || insurance > 0) && (
            <Stack spacing={0.75}>
              {cashShare != null && (
                <Box sx={{ display: "flex", height: 6, gap: "2px", borderRadius: "3px", overflow: "hidden" }}>
                  <Tooltip title={`Наличные — ${formatKGS(cash)}`} arrow>
                    <Box
                      sx={(t) => ({
                        width: `${cashShare}%`,
                        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.85 : 0.7),
                      })}
                    />
                  </Tooltip>
                  <Tooltip title={`Безнал — ${formatKGS(card)}`} arrow>
                    <Box
                      sx={(t) => ({
                        flex: 1,
                        bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.32 : 0.22),
                      })}
                    />
                  </Tooltip>
                </Box>
              )}
              <Stack
                direction="row"
                sx={{ fontSize: "0.75rem", color: "text.secondary", flexWrap: "wrap", columnGap: 1 }}
              >
                {cashShare != null && (
                  <Box>
                    наличные {cashShare}% · безнал {100 - cashShare}%
                  </Box>
                )}
                <Box sx={{ flex: 1 }} />
                {insurance > 0 && <Box>страховые {formatKGS(insurance)} — вне итогов</Box>}
              </Stack>
            </Stack>
          )}
        </Stack>
      )}
    </DashCard>
  );
};

// ── Месяц ─────────────────────────────────────────────────────────────────────

/**
 * Месячный отчёт: единственный источник, который делит записи по статусам
 * (оплачено / отменено / ожидает) и отделяет приёмы от процедур. Показывается
 * только на периоде «Месяц» — эндпоинт умеет считать лишь календарный месяц.
 */
export const MonthWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
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
              hint={sum ? `процедур — ${sum.procTotalCount}` : undefined}
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
          <Grid item xs={6} sm={4} lg={2}>
            <MetricTile
              label="Ждут оплаты"
              href="/reports"
              value={sum?.waitingCount ?? 0}
              tone={sum && sum.waitingCount > 0 ? "warning" : "neutral"}
              loading={loading}
              delta={delta(sum?.waitingCount ?? 0, prevSum?.waitingCount, prevLabel, true)}
              title="Записи месяца в статусе ожидания оплаты — незакрытые чеки"
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

/**
 * Пустой экран: у пользователя нет прав ни на один блок — либо он спрятал всё
 * сам, и тогда предлагаем вернуться в настройки, а не оставляем в тупике.
 */
export const EmptyDashboard: React.FC<{ hasHidden?: boolean; onShowAll?: () => void }> = ({
  hasHidden = false,
  onShowAll,
}) => (
  <Box sx={{ py: 6, textAlign: 'center' }}>
    <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
      {hasHidden ? 'Все блоки спрятаны' : 'Показывать пока нечего'}
    </Typography>
    <Typography variant='body2' sx={{ color: 'text.secondary', mb: hasHidden ? 2 : 0 }}>
      {hasHidden
        ? 'Верните нужные блоки в настройках состава.'
        : 'Сводка собирается из разделов, к которым у вас есть доступ. Попросите администратора выдать права на кассу, отчёты или задачи.'}
    </Typography>
    {hasHidden && onShowAll && (
      <AppButton variant='outlined' onClick={onShowAll}>
        Настроить состав
      </AppButton>
    )}
  </Box>
);
