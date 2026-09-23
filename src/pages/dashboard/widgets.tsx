import React from "react";
import { Box, Grid, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router";

import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";

import { AppButton } from "../../components/ui";
import type { CashboxSummary } from "../../api/cashbox";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { DeltaChip, MetricTile } from "./MetricTile";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { delta, num } from "./widgetUtils";
import { previousRange, sumDayCounts, toDailySeries } from "./period";
import {
  cashboxSummaryQuery,
  dayCountsQuery,
  dealsSummaryQuery,
  monthlyReportQuery,
  reviewStatsQuery,
  tasksSummaryQuery,
} from "./queries";

// ── Записи ────────────────────────────────────────────────────────────────────

/**
 * Записи за период по дням. Источник — `/appointments/day-counts/`: он отдаёт
 * ровно карту «дата → количество», поэтому окно любой длины стоит один запрос,
 * а не выгрузку самих приёмов (месяц списком — около 3 МБ).
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
  const workspacePath = can(PAGE_PERMISSIONS.appointmentsRegistry)
    ? "/appointments"
    : can(PAGE_PERMISSIONS.doctorRoom)
    ? "/doctor"
    : can(PAGE_PERMISSIONS.nurseRoom)
    ? "/nurse"
    : undefined;

  const query = useQuery(dayCountsQuery(scope, range));
  const prevQuery = useQuery(dayCountsQuery(scope, prev));

  const total = sumDayCounts(query.data);
  const prevTotal = prevQuery.data ? sumDayCounts(prevQuery.data) : undefined;
  const series = toDailySeries(query.data, range);
  const peak = series.reduce((max, d) => Math.max(max, d.count), 0);
  const busiest = series.find((d) => d.count === peak && peak > 0);
  const perDay = series.length ? Math.round((total / series.length) * 10) / 10 : 0;

  return (
    <DashCard title="Записи" subheader={range.label} href={workspacePath}>
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
            {query.isLoading ? (
              <Skeleton variant="text" width={80} height={36} />
            ) : (
              <Typography sx={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {total}
              </Typography>
            )}
            {prevTotal !== undefined && !query.isLoading && (
              <DeltaChip delta={{ current: total, previous: prevTotal, baselineLabel: prev.label }} />
            )}
            <Typography variant="caption" sx={{ color: "text.secondary", ml: "auto !important" }}>
              {series.length > 1 ? `≈ ${perDay} в день` : "приёмы и процедуры"}
              {busiest && series.length > 1
                ? ` · пик ${peak} — ${dayjs(busiest.date).format("D MMM")}`
                : ""}
            </Typography>
          </Stack>

          {/* Столбики по дням от пика периода. Выходные приглушены, пик выделен,
              клик — в регистратуру на этот день. */}
          {series.length > 1 && !query.isLoading && (
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 64 }}>
              {series.map((d) => {
                const day = dayjs(d.date);
                const isWeekend = day.day() === 0 || day.day() === 6;
                const isPeak = peak > 0 && d.count === peak;
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
                      sx={(t) => {
                        const dark = t.palette.mode === "dark";
                        return {
                          display: "block",
                          flex: 1,
                          minWidth: 3,
                          height: `${peak ? Math.max(5, (d.count / peak) * 100) : 5}%`,
                          borderRadius: "4px 4px 1px 1px",
                          transition: "background-color .15s ease",
                          bgcolor: !d.count
                            ? subtleBg(t, true)
                            : alpha(
                                t.palette.primary.main,
                                isPeak ? (dark ? 0.9 : 0.75) : isWeekend ? (dark ? 0.3 : 0.2) : dark ? 0.55 : 0.4,
                              ),
                          "&:hover": { bgcolor: t.palette.primary.main },
                        };
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
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
  sign: "+" | "−" | "=";
  hint?: string;
  share?: number;
  total?: boolean;
  tone?: "error" | "success";
}> = ({ label, amount, sign, hint, share, total = false, tone }) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={1}
    sx={{
      py: total ? 1 : 0.625,
      borderTop: total ? 1 : 0,
      borderColor: "divider",
      mt: total ? 0.5 : 0,
    }}
  >
    <Typography
      sx={{
        width: 14,
        flexShrink: 0,
        color: "text.disabled",
        fontWeight: 600,
        fontSize: "0.85rem",
        textAlign: "center",
      }}
    >
      {sign}
    </Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={{ fontWeight: total ? 650 : 400, color: total ? "text.primary" : "text.secondary" }}
        noWrap
      >
        {label}
        {hint && (
          <Box component="span" sx={{ color: "text.disabled", ml: 0.75, fontSize: "0.75rem" }}>
            {hint}
          </Box>
        )}
      </Typography>
      {share != null && share > 0 && (
        <Box
          sx={(t) => ({
            mt: 0.375,
            height: 3,
            borderRadius: "3px",
            width: `${Math.min(100, Math.max(2, share * 100))}%`,
            bgcolor: alpha(
              sign === "−" ? t.palette.text.secondary : t.palette.primary.main,
              t.palette.mode === "dark" ? 0.45 : 0.3,
            ),
          })}
        />
      )}
    </Box>
    <Typography
      sx={{
        fontWeight: total ? 700 : 600,
        fontSize: total ? "1.05rem" : "0.875rem",
        fontVariantNumeric: "tabular-nums",
        color: tone ? `${tone}.main` : "text.primary",
        whiteSpace: "nowrap",
      }}
    >
      {formatKGS(amount)}
    </Typography>
  </Stack>
);

/** Доля наличных и безнала одной полосой — структура прихода без круговых диаграмм. */
const PaymentMix: React.FC<{ cash: number; card: number }> = ({ cash, card }) => {
  const total = cash + card;
  if (total <= 0) return null;
  const cashShare = Math.round((cash / total) * 100);

  return (
    <Box>
      <Box sx={{ display: "flex", height: 6, borderRadius: "6px", overflow: "hidden", gap: "2px" }}>
        <Tooltip title={`Наличные — ${formatKGS(cash)}`} arrow>
          <Box
            sx={(t) => ({
              width: `${cashShare}%`,
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.85 : 0.65),
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
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        наличные {cashShare}% · безнал {100 - cashShare}%
      </Typography>
    </Box>
  );
};

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
export const MoneyWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);
  const query = useQuery(cashboxSummaryQuery(scope, range));
  const prevQuery = useQuery(cashboxSummaryQuery(scope, prev));

  const s = query.data;
  const p = prevQuery.data;

  const gross = num(s?.grossIncome);
  const refunds = num(s?.refundedTotal);
  const sales = num(s?.salesTotal);
  const expenses = num(s?.totalExpenses);
  const supply = num(s?.supplyTotal);
  const flow = num(s?.netCashFlow);
  // Полосы — от самой крупной строки, чтобы пропорции читались глазом.
  const scale = Math.max(gross, sales, expenses, supply, refunds, 1);

  return (
    <DashCard
      title="Движение денег"
      subheader={range.label}
      href="/cashbox"
      action={
        p && s ? (
          <DeltaChip
            delta={{ current: flow, previous: num(p.netCashFlow), baselineLabel: prev.label }}
          />
        ) : undefined
      }
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : query.isLoading || !s ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="text" height={26} />
          ))}
        </Stack>
      ) : (
        <Stack spacing={1.25}>
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
            <FlowRow
              sign="="
              label="Осталось"
              amount={flow}
              total
              tone={flow < 0 ? "error" : undefined}
            />
          </Box>
          <PaymentMix cash={num(s.cashIncome)} card={num(s.cardIncome)} />
          {num(s.insuranceIncome) > 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              страховые {formatKGS(num(s.insuranceIncome))} — вне итогов
            </Typography>
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
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.25}>
          {/* Приёмы и процедуры разведены намеренно: карточка «Записи» считает
              и то и другое (day-counts не различает), а месячный отчёт даёт их
              порознь. */}
          <Grid item xs={6} sm={4}>
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
          <Grid item xs={6} sm={4}>
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
          <Grid item xs={6} sm={4}>
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
          <Grid item xs={6} sm={4}>
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
          <Grid item xs={6} sm={4}>
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
          <Grid item xs={6} sm={4}>
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

// ── Задачи ────────────────────────────────────────────────────────────────────

/** Сводка задач организации. Периода не имеет: это состояние «прямо сейчас». */
export const TasksWidget: React.FC<WidgetProps> = ({ scope }) => {
  const query = useQuery(tasksSummaryQuery(scope));
  const s = query.data;
  const loading = query.isLoading;

  return (
    <DashCard title="Задачи" subheader="сейчас" href="/tasks">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6}>
            <MetricTile
              label="Просрочено"
              href="/tasks"
              value={s?.overdue ?? 0}
              icon={<WarningAmberOutlined />}
              tone={s && s.overdue > 0 ? "error" : "neutral"}
              loading={loading}
              hint={s && s.awaitingApproval > 0 ? `ждут приёмки — ${s.awaitingApproval}` : undefined}
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="В работе"
              href="/tasks"
              value={s?.inProgress ?? 0}
              icon={<AssignmentOutlined />}
              loading={loading}
              hint={s?.new ? `новых — ${s.new}` : undefined}
            />
          </Grid>
        </Grid>
      )}
    </DashCard>
  );
};

// ── Воронка продаж ────────────────────────────────────────────────────────────

/**
 * Обращения в работе и то, что мешает им двигаться.
 *
 * Периода не имеет: вопрос всегда про «сейчас» — сколько денег в воронке и
 * кому надо позвонить сегодня. Ретроспектива живёт во вкладке аналитики.
 */
export const DealsWidget: React.FC<WidgetProps> = ({ scope }) => {
  const query = useQuery(dealsSummaryQuery(scope));
  const s = query.data;
  const loading = query.isLoading;

  return (
    <DashCard title="Воронка продаж" subheader="сейчас" href="/deals">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6}>
            <MetricTile
              label="В работе"
              href="/deals"
              value={s?.openCount ?? 0}
              icon={<FilterAltOutlined />}
              hint={s ? formatKGS(s.openAmount) : undefined}
              loading={loading}
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="Выиграно"
              href="/deals?tab=analytics"
              value={s?.wonCount ?? 0}
              icon={<TrendingUpOutlined />}
              tone={s && s.wonCount > 0 ? "success" : "neutral"}
              hint={s ? formatKGS(s.wonAmount) : undefined}
              loading={loading}
            />
          </Grid>
          <Grid item xs={6}>
            {/* Просроченное касание — то, из-за чего лиды умирают молча. */}
            <MetricTile
              label="Просрочено касаний"
              href="/deals?action=overdue"
              value={s?.overdueActionsCount ?? 0}
              icon={<WarningAmberOutlined />}
              tone={s && s.overdueActionsCount > 0 ? "error" : "neutral"}
              loading={loading}
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="На сегодня"
              href="/deals?action=today"
              value={s?.todayActionsCount ?? 0}
              icon={<AccessTimeOutlined />}
              loading={loading}
            />
          </Grid>
        </Grid>
      )}
    </DashCard>
  );
};

// ── Отзывы ────────────────────────────────────────────────────────────────────

/** Оценки за период: средняя, отклик и число негативных — их разбирают вручную. */
export const ReviewsWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);
  const query = useQuery(reviewStatsQuery(scope, range));
  const prevQuery = useQuery(reviewStatsQuery(scope, prev));

  const s = query.data;
  const p = prevQuery.data;
  const loading = query.isLoading;
  const responsePercent = s ? Math.round(num(s.responseRate) * 100) : null;
  // Без единого отправленного запроса бэк отдаёт avgRating "0.0". Показать
  // ноль значило бы соврать: это не плохая оценка, а отсутствие оценок.
  const hasReviews = !!s && s.sent > 0;
  const prevHasReviews = !!p && p.sent > 0;

  return (
    <DashCard title="Отзывы" subheader={range.label} href="/reviews">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6}>
            <MetricTile
              label="Средняя оценка"
              href="/reviews"
              value={hasReviews ? s!.avgRating : "—"}
              icon={<StarBorderOutlined />}
              tone={hasReviews ? (num(s!.avgRating) < 4 ? "warning" : "success") : "neutral"}
              loading={loading}
              delta={
                hasReviews && prevHasReviews
                  ? { current: num(s!.avgRating), previous: num(p!.avgRating), baselineLabel: prev.label }
                  : undefined
              }
              hint={hasReviews ? `${s!.answered} из ${s!.sent}` : "запросов не было"}
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="Негативных"
              href="/reviews"
              value={s?.negativeCount ?? 0}
              tone={s && s.negativeCount > 0 ? "error" : "neutral"}
              loading={loading}
              delta={delta(s?.negativeCount ?? 0, p?.negativeCount, prev.label, true)}
              hint={hasReviews && responsePercent != null ? `отклик ${responsePercent}%` : undefined}
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
