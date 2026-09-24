import React from "react";
import { Box, Grid, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router";

import { AppButton } from "../../components/ui";
import type { DashboardMoneyScalars } from "../../api/dashboard";
import { formatKGS } from "../../utility/format";
import { pluralRu } from "../../utility/amountInWords";
import { subtleBg } from "../../theme/uiHelpers";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { DeltaChip, MetricTile } from "./MetricTile";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { delta, num } from "./widgetUtils";
import { TODAY_CHART_DAYS, toDailySeries } from "./period";
import { useDashboardData } from "./DashboardData";

// ── Записи ────────────────────────────────────────────────────────────────────

/**
 * Записи за период по дням — раздел `appointments` агрегата: `daily` за окно
 * графика и `weekdayBaseline` — «обычно в этот день недели» (среднее по тому
 * же дню недели за 4 прошлые недели), его считает бэк.
 *
 * График зависит от периода:
 * - «Сегодня» — последние 14 дней с выделенным сегодня (число — за сегодня);
 * - «Неделя» — 7 дней периода с днём недели в подписи;
 * - «Месяц» — дни с 1-го по сегодня, подписи через день, без чисел над
 *   столбиками (на 30 столбиках они слипаются).
 *
 * ⚠ Главное число — ВСЕ записи периода, независимо от статуса и вида: приёмы и
 * процедуры вместе (как day-counts). Под ним — из чего оно сложилось: визиты,
 * отмены, неявки, повторные.
 */
export const AppointmentsWidget: React.FC<WidgetProps> = ({ range, periodKey }) => {
  const data = useDashboardData();
  const { prev, chartRange } = data;
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

  const a = data.sections.appointments;
  const loading = data.isLoading("appointments");
  const error = data.error("appointments");

  const total = a?.total ?? 0;
  const prevTotal = a?.baseline?.total;
  // Ряд — по календарю окна: пропуск пустого дня превратил бы провал в ровную линию.
  const series = React.useMemo(
    () =>
      a?.daily
        ? toDailySeries(Object.fromEntries(a.daily.map((d) => [d.date, d.count])), chartRange)
        : [],
    [a?.daily, chartRange],
  );
  // На «Неделе» и «Месяце» окно графика совпадает с периодом.
  const periodSeries = periodKey === "today" ? [] : series;
  const peak = periodSeries.reduce((max, d) => Math.max(max, d.count), 0);
  const busiest = periodSeries.find((d) => d.count === peak && peak > 0);
  const perDay = periodSeries.length ? Math.round((total / periodSeries.length) * 10) / 10 : 0;
  const usualByDate = new Map((a?.weekdayBaseline ?? []).map((w) => [w.date, num(w.average)]));
  const hasBaseline = usualByDate.size > 0;
  const baselines = series.map((d) => (hasBaseline ? (usualByDate.get(d.date) ?? 0) : null));
  const chartMax = Math.max(
    series.reduce((max, d) => Math.max(max, d.count), 0),
    ...baselines.map((b) => b ?? 0),
  );
  const barPx = (v: number) => (chartMax ? Math.max(4, (v / chartMax) * 72) : 4);

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
      {error ? (
        <WidgetError error={error} />
      ) : (
        <Stack spacing={1.75} sx={{ height: "100%" }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: "wrap" }}>
            {loading ? (
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
            {prevTotal !== undefined && !loading && (
              <DeltaChip
                size="md"
                delta={{ current: total, previous: prevTotal, baselineLabel: prev.label }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{hint}</Typography>
          </Stack>
          {/* Разбивка слева, легенда засечки справа — одной строкой под числом. */}
          {((a && a.visits != null) || (hasBaseline && series.length > 1)) && (
            <Stack
              direction="row"
              alignItems="center"
              sx={{ mt: "-6px !important", columnGap: 1.5, rowGap: 0.5, flexWrap: "wrap" }}
            >
              {a && a.visits != null && <AppointmentsBreakdown a={a} />}
              <Box sx={{ flex: 1 }} />
              {hasBaseline && series.length > 1 && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.75}
                  sx={{ fontSize: "0.6875rem", color: "text.secondary" }}
                >
                  <Box sx={{ width: 12, height: 2, borderRadius: "1px", bgcolor: "text.secondary", opacity: 0.7 }} />
                  <span>обычно в этот день недели</span>
                </Stack>
              )}
            </Stack>
          )}

          {loading ? (
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
                  const usual = baselines[i];
                  return (
                    <Tooltip
                      key={d.date}
                      arrow
                      placement="top"
                      title={`${day.format("dd, D MMMM")} — ${d.count}${
                        usual != null ? ` · обычно ≈ ${(Math.round(usual * 10) / 10).toLocaleString("ru-RU")}` : ""
                      }`}
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
                              position: "relative",
                              width: "100%",
                              height: barPx(d.count),
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
                        >
                          {/* Засечка «обычно в этот день недели»: столбик ниже
                              неё — день слабее обычного, выше — сильнее. */}
                          {usual != null && usual > 0 && (
                            <Box
                              sx={{
                                position: "absolute",
                                left: -1,
                                right: -1,
                                bottom: barPx(usual) - 1,
                                height: 2,
                                borderRadius: "1px",
                                bgcolor: "text.secondary",
                                opacity: 0.7,
                                pointerEvents: "none",
                              }}
                            />
                          )}
                        </Box>
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
function refundSourcesHint(s: DashboardMoneyScalars): string | undefined {
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
 * покрытие в gross/net НЕ входит и показано отдельной подписью. Итог —
 * `netCashFlow` бэка: это формула (netIncome + товары − расходы − закупки),
 * а не совпадение, движения баланса в неё не входят (ответ бэка 24.09.2026).
 *
 * Внизу — деньги, которые заработали, но не получили: недоплата по прошедшим
 * визитам периода и остаток долга на сейчас.
 */
export const MoneyWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const s = data.sections.money;
  const loading = data.isLoading("money");
  const error = data.error("money");

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
      {error ? (
        <WidgetError error={error} />
      ) : loading || !s ? (
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

          {(s.unpaidPastCount != null || s.debtOutstanding != null) && (
            <UnpaidFooter
              unpaidCount={s.unpaidPastCount}
              unpaidAmount={s.unpaidPastAmount}
              outstanding={s.debtOutstanding}
            />
          )}
        </Stack>
      )}
    </DashCard>
  );
};

// ── Из чего сложились записи ─────────────────────────────────────────────────

/** Строка под числом записей: визиты, отмены, неявки, повторные. */
const AppointmentsBreakdown: React.FC<{
  a: { visits?: number; canceled?: number; noShow?: number; repeatShare?: string };
}> = ({ a }) => {
  const parts = [
    `визитов ${a.visits ?? 0}`,
    a.canceled ? `отмен ${a.canceled}` : null,
    a.noShow ? `неявок ${a.noShow}` : null,
    a.visits ? `повторных ${Math.round(num(a.repeatShare))}%` : null,
  ].filter(Boolean);
  return (
    <Typography
      sx={{
        fontSize: "0.75rem",
        color: "text.secondary",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {parts.join(" · ")}
    </Typography>
  );
};

// ── Не получено ───────────────────────────────────────────────────────────────

/**
 * Подвал «Движения денег»: недоплата по прошедшим визитам периода и остаток
 * долга на сейчас. Это разные числа: первое — про выбранный период, второе —
 * по всем прошедшим визитам, от периода не зависит.
 */
const UnpaidFooter: React.FC<{
  unpaidCount?: number;
  unpaidAmount?: string;
  outstanding?: string;
}> = ({ unpaidCount, unpaidAmount, outstanding }) => {
  const unpaid = num(unpaidAmount);
  const debt = num(outstanding);
  if (!unpaid && !debt) return null;
  return (
    <Stack
      direction="row"
      sx={{
        pt: 1,
        borderTop: 1,
        borderColor: "divider",
        fontSize: "0.75rem",
        color: "text.secondary",
        columnGap: 1,
        rowGap: 0.25,
        flexWrap: "wrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {unpaid > 0 && (
        <Tooltip
          arrow
          title="Визит уже прошёл, не отменён и не неявка, а по журналу платежей за вычетом возвратов оплачено меньше, чем к оплате. Статус приёма не учитывается."
        >
          <Box>
            не получено за {unpaidCount}{" "}
            {pluralRu(unpaidCount ?? 0, ["визит", "визита", "визитов"])} —{" "}
            <Box component="span" sx={{ color: "warning.onSurface", fontWeight: 600 }}>
              {formatKGS(unpaid)}
            </Box>
          </Box>
        </Tooltip>
      )}
      <Box sx={{ flex: 1 }} />
      {debt > 0 && (
        <Tooltip
          arrow
          title="Остаток непогашенного долга по всем прошедшим визитам на сейчас — от периода не зависит"
        >
          <Box>долг пациентов сейчас — {formatKGS(debt)}</Box>
        </Tooltip>
      )}
    </Stack>
  );
};

// ── Итоги периода ─────────────────────────────────────────────────────────────

const pct = (v: string | undefined) => `${Math.round(num(v))}%`;

/**
 * Итоги периода: чем закончились записи и сколько денег за ними осталось.
 *
 * Раньше блок стоял на месячном отчёте и потому жил только на «Месяце»; теперь
 * всё считает агрегат за любой период. Каждая плитка — из своего раздела, и
 * раздела без права просто нет (что пришло, то и показываем).
 *
 * - отмены и неявки — порознь, у отмен видно, кто отменил (у старых отмен
 *   инициатор неизвестен);
 * - повторные — визиты карт, у которых раньше уже был визит в организации
 *   (по карте пациента, не по семье — решение бэка, ответ 24.09.2026);
 * - конверсия — доля броней периода, дошедших до оплаченного приёма.
 */
export const ResultsWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const { prev } = data;
  const a = data.sections.appointments;
  const ab = a?.baseline ?? undefined;
  const money = data.sections.money;
  const bookings = data.sections.bookings;
  const loading = data.isLoading("appointments");
  const error = data.error("appointments");
  const label = prev.label;

  const visits = a?.visits ?? 0;
  const paidShare = a && visits > 0 ? Math.round(((a.paid ?? 0) / visits) * 100) : null;
  const by = a?.canceledBy;
  const canceledHint = by
    ? [
        by.patient ? `пациент ${by.patient}` : null,
        by.clinic ? `клиника ${by.clinic}` : null,
        by.unknown ? `неизвестно ${by.unknown}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined
    : undefined;

  const tiles: React.ReactNode[] = [];
  if (a?.visits != null || loading) {
    tiles.push(
      <MetricTile
        key="visits"
        label="Визитов"
        href="/appointments"
        value={visits}
        loading={loading}
        delta={delta(visits, ab?.visits, label)}
        hint={a?.total != null ? `из ${a.total} записей` : undefined}
        title="Записи периода без отменённых и неявок"
      />,
      <MetricTile
        key="paid"
        label="Оплачено"
        href="/appointments"
        value={a?.paid ?? 0}
        tone="success"
        loading={loading}
        delta={delta(a?.paid ?? 0, ab?.paid, label)}
        hint={paidShare != null ? `${paidShare}% визитов` : undefined}
        title="Оплачено полностью, со скидкой или хотя бы частично"
      />,
      <MetricTile
        key="canceled"
        label="Отмены"
        href="/appointments"
        value={a?.canceled ?? 0}
        tone={a?.canceled ? "warning" : "neutral"}
        loading={loading}
        delta={delta(a?.canceled ?? 0, ab?.canceled, label, true)}
        hint={canceledHint}
        title="Отменённые записи без неявок. Кто отменил, записывается с появления поля — у старых отмен неизвестно"
      />,
      <MetricTile
        key="noShow"
        label="Неявки"
        href="/appointments"
        value={a?.noShow ?? 0}
        tone={a?.noShow ? "warning" : "neutral"}
        loading={loading}
        delta={delta(a?.noShow ?? 0, ab?.noShow, label, true)}
      />,
      <MetricTile
        key="repeat"
        label="Повторные"
        href="/patients"
        value={pct(a?.repeatShare)}
        loading={loading}
        // Без дельты: относительное изменение доли (+588% при 12,5% → 86%)
        // читается как рост визитов, а не доли.
        hint={
          a?.repeatVisits != null
            ? `${a.repeatVisits} визитов${ab?.visits ? ` · ${prev.label} — ${pct(ab.repeatShare)}` : ""}`
            : undefined
        }
        title="Доля визитов пациентов, у которых раньше уже был визит в организации (в любом филиале)"
      />,
    );
  }
  if (money?.unpaidPastCount != null) {
    tiles.push(
      <MetricTile
        key="unpaid"
        label="Не получено"
        href="/reports"
        value={formatKGS(num(money.unpaidPastAmount))}
        tone={money.unpaidPastCount > 0 ? "warning" : "neutral"}
        hint={`${money.unpaidPastCount} ${pluralRu(money.unpaidPastCount, [
          "прошедший визит",
          "прошедших визита",
          "прошедших визитов",
        ])}`}
        title="Прошедшие визиты периода, оплаченные не полностью: сколько по ним осталось получить"
      />,
    );
  }
  if (money?.debtOutstanding != null) {
    tiles.push(
      <MetricTile
        key="debt"
        label="Долг сейчас"
        href="/reports"
        value={formatKGS(num(money.debtOutstanding))}
        tone={num(money.debtOutstanding) > 0 ? "warning" : "neutral"}
        hint="все прошедшие визиты"
        title="Остаток непогашенного долга на сейчас по всем прошедшим визитам — от периода не зависит"
      />,
    );
  }
  if (bookings?.conversionRate != null) {
    tiles.push(
      <MetricTile
        key="conversion"
        label="Брони → оплата"
        href="/bookings"
        value={bookings.total ? pct(bookings.conversionRate) : "—"}
        hint={
          bookings.total
            ? `${bookings.paid ?? 0} из ${bookings.total} · в приём ${bookings.materialized ?? 0}`
            : "броней на даты периода нет"
        }
        title="Брони на даты периода: сколько превратились в приём и сколько из них оплачено"
      />,
    );
  }

  return (
    <DashCard title="Итоги" subheader={range.label} href="/reports" linkLabel="Отчёты">
      {error ? (
        <WidgetError error={error} />
      ) : tiles.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Нет данных за период
        </Typography>
      ) : (
        <Grid container spacing={1.25}>
          {tiles.map((tile, i) => (
            <Grid item key={i} xs={6} sm={4} lg={3}>
              {tile}
            </Grid>
          ))}
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
