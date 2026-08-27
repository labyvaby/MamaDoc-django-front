import React from "react";
import { Box, Grid, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router";

import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";

import { AppCard, AppButton } from "../../components/ui";
import { getDayCounts } from "../../api/appointments";
import { getCashboxSummary } from "../../api/cashbox";
import { getMonthlyReport } from "../../api/reports";
import { getReviewStats } from "../../api/reviews";
import { getTasksSummary } from "../../api/tasks";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { MetricTile } from "./MetricTile";
import { Sparkline } from "./Sparkline";
import { WidgetError, type WidgetProps } from "./widgetKit";
import { delta, num } from "./widgetUtils";
import { previousRange, sumDayCounts, toDailySeries, type PeriodRange } from "./period";

// ── Приёмы ────────────────────────────────────────────────────────────────────

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
  // Куда ведёт плитка: первое доступное рабочее пространство приёмов. Общую
  // «главную по правам» (resolveHomeRoute) здесь брать нельзя — она может
  // вернуть /cleaning или /profile, и плитка «Всего записей» уводила бы не
  // туда. Нет ни одного из трёх прав — плитка остаётся без перехода.
  const { can } = useCanChecker();
  const workspacePath = can(PAGE_PERMISSIONS.appointmentsRegistry)
    ? "/appointments"
    : can(PAGE_PERMISSIONS.doctorRoom)
    ? "/doctor"
    : can(PAGE_PERMISSIONS.nurseRoom)
    ? "/nurse"
    : undefined;

  const useCounts = (r: PeriodRange) =>
    useQuery({
      queryKey: djangoQueryKeys.appointments.list({
        view: "dashboardDayCounts",
        organizationId: scope.organizationId ?? null,
        branchId: scope.branchId ?? null,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
      }),
      queryFn: ({ signal }) =>
        getDayCounts({ dateFrom: r.dateFrom, dateTo: r.dateTo, branchId: scope.branchId }, signal),
      enabled: scope.orgReady,
      staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    });

  const query = useCounts(range);
  const prevQuery = useCounts(prev);

  const total = sumDayCounts(query.data);
  const prevTotal = prevQuery.data ? sumDayCounts(prevQuery.data) : undefined;
  const series = toDailySeries(query.data, range);
  const peak = series.reduce((max, d) => Math.max(max, d.count), 0);
  const busiest = series.find((d) => d.count === peak && peak > 0);
  const perDay = series.length ? total / series.length : 0;
  const prevPerDay =
    prevQuery.data && prev.dateFrom
      ? (prevTotal ?? 0) / Math.max(1, toDailySeries(prevQuery.data, prev).length)
      : undefined;

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return (
    <AppCard variant="outlined" elevation={0} title="Записи" subheader={range.label}>
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Stack spacing={2}>
          <Grid container spacing={1.5}>
            <Grid item xs={6}>
              <MetricTile
                label="Всего записей"
                // Не «Регистратура» жёстко: у врача её нет, клик по плитке
                // приводил на «Нет доступа».
                href={workspacePath}
                value={total}
                icon={<EventAvailableOutlined />}
                loading={query.isLoading}
                delta={delta(total, prevTotal, prev.label)}
                title="Приёмы и процедуры вместе — day-counts их не различает"
              />
            </Grid>
            <Grid item xs={6}>
              <MetricTile
                label="В среднем за день"
                value={round1(perDay)}
                icon={<TrendingUpOutlined />}
                loading={query.isLoading}
                delta={delta(
                  round1(perDay),
                  prevPerDay === undefined ? undefined : round1(prevPerDay),
                  prev.label,
                )}
                hint={
                  busiest
                    ? `пик — ${peak} (${dayjs(busiest.date).format("D MMMM")})`
                    : undefined
                }
              />
            </Grid>
          </Grid>

          {/* Мини-график по дням: столбики от пика периода. Без библиотек — их
              в проекте нет, а ради тридцати прямоугольников тянуть графическую
              зависимость незачем. Выходные приглушены, пик выделен. */}
          {series.length > 1 && !query.isLoading && (
            <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: 72 }}>
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
                      sx={(t) => ({
                        display: "block",
                        flex: 1,
                        minWidth: 4,
                        height: `${peak ? Math.max(5, (d.count / peak) * 100) : 5}%`,
                        borderRadius: "4px 4px 2px 2px",
                        transition: "background-color .15s ease",
                        bgcolor: !d.count
                          ? subtleBg(t, true)
                          : alpha(
                              t.palette.primary.main,
                              isPeak
                                ? t.palette.mode === "dark"
                                  ? 0.85
                                  : 0.65
                                : isWeekend
                                  ? t.palette.mode === "dark"
                                    ? 0.3
                                    : 0.18
                                  : t.palette.mode === "dark"
                                    ? 0.55
                                    : 0.35,
                            ),
                        "&:hover": {
                          bgcolor: alpha(t.palette.primary.main, 0.95),
                        },
                      })}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          )}
        </Stack>
      )}
    </AppCard>
  );
};

// ── Деньги ────────────────────────────────────────────────────────────────────

/** Доля наличных и безнала одной полосой — структура прихода без круговых диаграмм. */
const PaymentMix: React.FC<{ cash: number; card: number }> = ({ cash, card }) => {
  const total = cash + card;
  if (total <= 0) return null;
  const cashShare = Math.round((cash / total) * 100);

  return (
    <Box>
      <Box
        sx={{ display: "flex", height: 8, borderRadius: "6px", overflow: "hidden", mb: 0.75 }}
      >
        <Tooltip title={`Наличные — ${formatKGS(cash)}`} arrow>
          <Box
            sx={(t) => ({
              width: `${cashShare}%`,
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.85 : 0.6),
            })}
          />
        </Tooltip>
        <Tooltip title={`Безнал — ${formatKGS(card)}`} arrow>
          <Box
            sx={(t) => ({
              flex: 1,
              bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.32 : 0.2),
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

/**
 * Касса за период. Все суммы приходят строками-decimal, поэтому считаем через
 * Number, а не складываем строки.
 *
 * `netIncome` — приход за вычетом возвратов; `netCashFlow` — он же плюс продажи
 * товаров и минус расходы и закупки, то есть «сколько реально осталось».
 * Страховое покрытие в gross/net НЕ входит и показано отдельной подписью.
 */
export const MoneyWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const { can } = useCanChecker();
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);

  const useSummary = (r: PeriodRange) =>
    useQuery({
      queryKey: djangoQueryKeys.cashbox.summary({
        view: "dashboard",
        organizationId: scope.organizationId ?? null,
        branchId: scope.branchId ?? null,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
      }),
      queryFn: ({ signal }) =>
        getCashboxSummary(
          {
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            dateFrom: r.dateFrom,
            dateTo: r.dateTo,
          },
          signal,
        ),
      enabled: scope.orgReady,
      staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    });

  const query = useSummary(range);
  const prevQuery = useSummary(prev);

  const s = query.data;
  const p = prevQuery.data;
  const loading = query.isLoading;

  /** Средний чек: приход, поделённый на число оплат. В CRM его нет нигде — считаем здесь. */
  const avgCheck = s && s.paymentCount > 0 ? num(s.netIncome) / s.paymentCount : 0;
  const prevAvgCheck = p && p.paymentCount > 0 ? num(p.netIncome) / p.paymentCount : undefined;

  // Деньги по дням берём из месячного отчёта: касса умеет только итог за
  // период, а дневную разбивку пришлось бы собирать по запросу на день.
  // Ключ тот же, что у виджета «Месяц целиком», — react-query отдаёт кэш, а не
  // делает второй запрос. Право на отчёты есть не у всех, поэтому кривая
  // необязательная: без неё карточка просто короче.
  const canReports = can(PAGE_PERMISSIONS.reports);
  const dailyQuery = useQuery({
    queryKey: djangoQueryKeys.reports.monthly({
      view: "dashboard",
      organizationId: scope.organizationId ?? null,
      branchId: scope.branchId ?? null,
      month: range.month,
    }),
    queryFn: ({ signal }) =>
      getMonthlyReport(
        { month: range.month, branchId: scope.branchId, organizationId: scope.organizationId },
        signal,
      ),
    enabled: scope.orgReady && canReports && periodKey === "month",
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const daily = React.useMemo(() => {
    const rows = dailyQuery.data?.daily ?? [];
    return (
      rows
        .filter((d) => d.date <= range.dateTo)
        // ⚠ Бэк отдаёт дни в обратном порядке — от 31-го к 1-му (проверено на
        // /reports/monthly/ 25.08.2026). Без сортировки кривая читалась справа
        // налево: рост выглядел падением.
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          label: dayjs(d.date).format("D MMMM"),
          value: num(d.cashSum) + num(d.cardSum),
        }))
    );
  }, [dailyQuery.data, range.dateTo]);

  /**
   * Оценка по темпу: сколько выйдет к концу месяца, если дальше пойдёт как
   * шло. Намеренно не называется прогнозом — это линейная экстраполяция, она
   * не знает ни про выходные впереди, ни про сезон.
   */
  const pace = React.useMemo(() => {
    if (periodKey !== "month" || !s) return null;
    const elapsed = dayjs(range.dateTo).date();
    const inMonth = dayjs(range.dateTo).daysInMonth();
    if (elapsed < 3 || elapsed >= inMonth) return null;
    return (num(s.netIncome) / elapsed) * inMonth;
  }, [periodKey, s, range.dateTo]);

  return (
    <AppCard variant="outlined" elevation={0} title="Деньги" subheader={range.label}>
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Stack spacing={2}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <MetricTile
                label="Приход за вычетом возвратов"
              href="/cashbox"
                value={formatKGS(num(s?.netIncome))}
                icon={<PaymentsOutlined />}
                tone="success"
                loading={loading}
                delta={delta(num(s?.netIncome), p ? num(p.netIncome) : undefined, prev.label)}
                hint={pace != null ? `по темпу к концу месяца ≈ ${formatKGS(pace)}` : undefined}
                title="netIncome: оплаты минус возвраты. Страховое покрытие сюда не входит."
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <MetricTile
                label="Средний чек"
              href="/cashbox"
                value={formatKGS(avgCheck)}
                icon={<ReceiptLongOutlined />}
                loading={loading}
                delta={delta(avgCheck, prevAvgCheck, prev.label)}
                hint={s ? `${s.paymentCount} оплат` : undefined}
                title="Приход ÷ число оплат. Это чек на оплату, а не на пациента: один визит может быть оплачен несколькими платежами."
              />
            </Grid>
            <Grid item xs={6}>
              <MetricTile
                label="Остаток движения"
              href="/cashbox"
                value={formatKGS(num(s?.netCashFlow))}
                icon={<TrendingUpOutlined />}
                tone={num(s?.netCashFlow) < 0 ? "error" : "neutral"}
                loading={loading}
                delta={delta(num(s?.netCashFlow), p ? num(p.netCashFlow) : undefined, prev.label)}
                hint={
                  s
                    ? `продажи ${formatKGS(num(s.salesTotal))} · расходы ${formatKGS(num(s.totalExpenses))}`
                    : undefined
                }
                title="netCashFlow = приход + продажи товаров − расходы − закупки"
              />
            </Grid>
            <Grid item xs={6}>
              <MetricTile
                label="Возвраты"
              href="/cashbox"
                value={formatKGS(num(s?.refundedTotal))}
                icon={<ReplayOutlined />}
                tone={num(s?.refundedTotal) > 0 ? "warning" : "neutral"}
                loading={loading}
                delta={delta(
                  num(s?.refundedTotal),
                  p ? num(p.refundedTotal) : undefined,
                  prev.label,
                  true,
                )}
                hint={
                  s && num(s.insuranceIncome) > 0
                    ? `страховые ${formatKGS(num(s.insuranceIncome))} — вне итогов`
                    : s?.refundCount
                      ? `${s.refundCount} операций`
                      : undefined
                }
              />
            </Grid>
          </Grid>

          {!loading && s && <PaymentMix cash={num(s.cashIncome)} card={num(s.cardIncome)} />}

          {daily.length > 1 && (
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Приход по дням
              </Typography>
              <Sparkline points={daily} format={formatKGS} />
            </Box>
          )}
        </Stack>
      )}
    </AppCard>
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

  const useReport = (month: string) =>
    useQuery({
      queryKey: djangoQueryKeys.reports.monthly({
        view: "dashboard",
        organizationId: scope.organizationId ?? null,
        branchId: scope.branchId ?? null,
        month,
      }),
      queryFn: ({ signal }) =>
        getMonthlyReport(
          { month, branchId: scope.branchId, organizationId: scope.organizationId },
          signal,
        ),
      enabled: scope.orgReady,
      staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    });

  const query = useReport(range.month);
  const prevQuery = useReport(prev.month);

  const sum = query.data?.summary;
  const prevSum = prevQuery.data?.summary;
  const loading = query.isLoading;
  const paidShare =
    sum && sum.apptTotalCount > 0
      ? Math.round((sum.apptPaidCount / sum.apptTotalCount) * 100)
      : null;
  const prevLabel = "прошлый месяц целиком";

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      title="Месяц целиком"
      subheader={dayjs(range.month + "-01").format("MMMM YYYY")}
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.5}>
          {/* Приёмы и процедуры разведены намеренно: карточка «Записи» выше
              считает и то и другое (day-counts не различает), а месячный отчёт
              даёт их порознь. Без этой подписи числа выглядят противоречиво —
              «290 записей» против «231 приёма». */}
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
              title="Отмены и неявки — разные статусы; здесь только отмены"
            />
          </Grid>
          <Grid item xs={6} sm={4}>
            <MetricTile
              label="Скидки"
              href="/reports"
              value={formatKGS(num(sum?.discountSum))}
              loading={loading}
              delta={delta(num(sum?.discountSum), prevSum ? num(prevSum.discountSum) : undefined, prevLabel)}
              hint={sum?.discountedCount ? `${sum.discountedCount} приёмов` : undefined}
            />
          </Grid>
        </Grid>
      )}
    </AppCard>
  );
};

// ── Задачи ────────────────────────────────────────────────────────────────────

/** Сводка задач организации. Периода не имеет: это состояние «прямо сейчас». */
export const TasksWidget: React.FC<WidgetProps> = ({ scope }) => {
  const query = useQuery({
    queryKey: djangoQueryKeys.tasks.summary(scope.organizationId),
    queryFn: ({ signal }) => getTasksSummary(scope.organizationId, signal),
    enabled: scope.orgReady,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const s = query.data;
  const loading = query.isLoading;

  return (
    <AppCard variant="outlined" elevation={0} title="Задачи" subheader="сейчас">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.5}>
          <Grid item xs={6}>
            <MetricTile
              label="Просрочено"
              href="/tasks"
              value={s?.overdue ?? 0}
              icon={<WarningAmberOutlined />}
              tone={s && s.overdue > 0 ? "error" : "neutral"}
              loading={loading}
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
          {s && s.awaitingApproval > 0 && (
            <Grid item xs={12}>
              <MetricTile label="Ждут приёмки"
              href="/tasks" value={s.awaitingApproval} tone="warning" />
            </Grid>
          )}
        </Grid>
      )}
    </AppCard>
  );
};

// ── Отзывы ────────────────────────────────────────────────────────────────────

/** Оценки за период: средняя, отклик и число негативных — их разбирают вручную. */
export const ReviewsWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);

  const useStats = (r: PeriodRange) =>
    useQuery({
      queryKey: djangoQueryKeys.reviews.stats({
        view: "dashboard",
        organizationId: scope.organizationId ?? null,
        from: r.dateFrom,
        to: r.dateTo,
      }),
      queryFn: ({ signal }) =>
        getReviewStats(
          { from: r.dateFrom, to: r.dateTo, organizationId: scope.organizationId },
          signal,
        ),
      enabled: scope.orgReady,
      staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    });

  const query = useStats(range);
  const prevQuery = useStats(prev);

  const s = query.data;
  const p = prevQuery.data;
  const loading = query.isLoading;
  const responsePercent = s ? Math.round(num(s.responseRate) * 100) : null;
  // Без единого отправленного запроса бэк отдаёт avgRating "0.0". Показать
  // ноль значило бы соврать: это не плохая оценка, а отсутствие оценок.
  const hasReviews = !!s && s.sent > 0;
  const prevHasReviews = !!p && p.sent > 0;

  return (
    <AppCard variant="outlined" elevation={0} title="Отзывы" subheader={range.label}>
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.5}>
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
    </AppCard>
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
