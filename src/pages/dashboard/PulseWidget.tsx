import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Link as RouterLink } from "react-router";

import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";

import { AppCard } from "../../components/ui";
import { formatKGS } from "../../utility/format";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { DeltaChip } from "./MetricTile";
import { WidgetError, type WidgetProps } from "./widgetKit";
import { PlanDialog } from "./PlanDialog";
import { planProgress, planScopeKey, readRevenuePlans, resolvePlan } from "./revenuePlan";
import { num } from "./widgetUtils";
import { previousRange, resolvePeriod, sumDayCounts, type PeriodRange } from "./period";
import {
  availabilityTodayQuery,
  cashboxSummaryQuery,
  dayCountsQuery,
  monthlyReportQuery,
} from "./queries";

const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Прошлый календарный месяц целиком — отметка на шкале темпа. */
function previousFullMonth(now = dayjs()): PeriodRange {
  const m = now.subtract(1, "month");
  return {
    dateFrom: m.startOf("month").format("YYYY-MM-DD"),
    dateTo: m.endOf("month").format("YYYY-MM-DD"),
    month: m.format("YYYY-MM"),
    label: m.format("MMMM"),
  };
}

/**
 * «к августу», «к июню», «к маю» — дательный падеж названия месяца. Все
 * русские месяцы кончаются на -ь/-й или на согласную: -ь/-й → -ю, иначе +у.
 */
const monthDative = (name: string) =>
  /[ьй]$/.test(name) ? name.slice(0, -1) + "ю" : name + "у";

// ── Ячейка-драйвер справа ─────────────────────────────────────────────────────

const DriverCell: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  hint?: React.ReactNode;
  /** Доля 0..1 — тонкая полоса под подписью (загрузка). */
  bar?: number | null;
  href?: string;
  loading?: boolean;
  title?: string;
  last?: boolean;
}> = ({ icon, label, value, delta, hint, bar, href, loading, title, last }) => {
  const linkProps = href ? ({ component: RouterLink, to: href } as const) : {};
  const cell = (
    <Box
      {...linkProps}
      sx={(t) => ({
        flex: 1,
        px: 2.25,
        py: 2,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0.5,
        color: "inherit",
        textDecoration: "none",
        borderBottom: last ? 0 : 1,
        borderColor: "divider",
        transition: "background-color .15s ease",
        "&:hover": href
          ? { bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.08 : 0.04) }
          : undefined,
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ color: "text.secondary", "& .MuiSvgIcon-root": { fontSize: 17 } }}
      >
        {icon}
        <Typography sx={{ fontSize: "0.8125rem" }}>{label}</Typography>
      </Stack>
      {loading ? (
        <Skeleton variant="text" width="60%" height={32} />
      ) : (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Typography
            sx={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              ...TABULAR,
            }}
          >
            {value}
          </Typography>
          {delta}
        </Stack>
      )}
      {hint && !loading && (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{hint}</Typography>
      )}
      {bar != null && !loading && (
        <Box
          sx={(t) => ({
            mt: 0.5,
            height: 4,
            borderRadius: "2px",
            overflow: "hidden",
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.2 : 0.12),
          })}
        >
          <Box
            sx={{
              height: "100%",
              width: `${Math.round(Math.min(1, Math.max(0, bar)) * 100)}%`,
              bgcolor: "primary.main",
              borderRadius: "2px",
            }}
          />
        </Box>
      )}
    </Box>
  );
  return title ? (
    <Tooltip title={title} placement="left" arrow>
      {cell}
    </Tooltip>
  ) : (
    cell
  );
};

/**
 * «Пульс» — первое, что владелец видит утром: сколько заработали, как это
 * против обычного, обгоняет ли месяц прошлый — и три цифры, которые объясняют
 * выручку (поток записей, чек, загрузка людей).
 *
 * Единственная крупная цифра на экране — выручка. «Осталось после расходов»
 * здесь намеренно нет: это итог «Движения денег», дубль размывал бы главное.
 *
 * Ключи запросов общие с остальными блоками (`queries.ts`), поэтому своих
 * обращений к бэку у «Пульса» почти нет — только прошлый месяц целиком.
 */
export const PulseWidget: React.FC<WidgetProps> = ({ range, periodKey, scope }) => {
  const { can } = useCanChecker();
  const { activeOrganization, activeBranch } = usePermissions();
  const canEditPlan = can("organization.update");
  const [planOpen, setPlanOpen] = React.useState(false);
  const canAppointments = can(PAGE_PERMISSIONS.appointments);
  const canSchedule = can(PAGE_PERMISSIONS.schedule);
  const canReports = can(PAGE_PERMISSIONS.reports);

  const workspacePath = can(PAGE_PERMISSIONS.appointmentsRegistry)
    ? "/appointments"
    : can(PAGE_PERMISSIONS.doctorRoom)
      ? "/doctor"
      : can(PAGE_PERMISSIONS.nurseRoom)
        ? "/nurse"
        : undefined;

  const prev = React.useMemo(() => previousRange(range, periodKey), [range, periodKey]);
  // От даты периода, а не «один раз при монтировании»: после полуночи
  // страница пересчитывает range, и месяц должен переехать вместе с ним.
  const monthRange = React.useMemo(
    () => resolvePeriod("month", dayjs(range.dateTo)),
    [range.dateTo],
  );
  const lastMonth = React.useMemo(() => previousFullMonth(dayjs(range.dateTo)), [range.dateTo]);

  const cash = useQuery(cashboxSummaryQuery(scope, range));
  const prevCash = useQuery(cashboxSummaryQuery(scope, prev));
  // Месяц нужен всегда — даже на «Сегодня» владелец хочет видеть, куда идёт
  // месяц. На периоде «Месяц» это тот же запрос, что и основной: кэш.
  const monthCash = useQuery(cashboxSummaryQuery(scope, monthRange));
  const lastMonthCash = useQuery(cashboxSummaryQuery(scope, lastMonth));
  const counts = useQuery(dayCountsQuery(scope, range, canAppointments));
  const prevCounts = useQuery(dayCountsQuery(scope, prev, canAppointments));
  const availability = useQuery(availabilityTodayQuery(scope, canSchedule));
  const report = useQuery(monthlyReportQuery(scope, monthRange.month, canReports));

  const s = cash.data;
  const p = prevCash.data;
  const income = num(s?.netIncome);
  const avgCheck = s && s.paymentCount > 0 ? income / s.paymentCount : 0;
  const prevAvgCheck = p && p.paymentCount > 0 ? num(p.netIncome) / p.paymentCount : undefined;

  // ── Темп месяца ──
  const today = dayjs(monthRange.dateTo);
  const elapsed = today.date();
  const inMonth = today.daysInMonth();
  const monthIncome = num(monthCash.data?.netIncome);
  const lastMonthIncome = lastMonthCash.data ? num(lastMonthCash.data.netIncome) : null;
  /**
   * Оценка по темпу: сколько выйдет к концу месяца, если дальше пойдёт как
   * шло. Не «прогноз» — линейная экстраполяция не знает про выходные и сезон,
   * поэтому в первые два дня (мало данных) её не показываем. Ноль выручки —
   * не темп, а отсутствие данных.
   */
  const pace = elapsed >= 3 && monthIncome > 0 ? (monthIncome / elapsed) * inMonth : null;
  const paceVsLast =
    pace != null && lastMonthIncome
      ? Math.round(((pace - lastMonthIncome) / lastMonthIncome) * 100)
      : null;
  // Шкала — до большего из «оценка к концу месяца» и «прошлый месяц целиком»:
  // заливка = сколько уже набрали, отметка = где финишировал прошлый месяц.
  // ── План месяца (themeConfig.dashboard.plans, см. revenuePlan.ts) ──
  const scopeKey = planScopeKey(scope.branchId);
  const plan = resolvePlan(
    readRevenuePlans(activeOrganization?.themeConfig),
    scopeKey,
    monthRange.month,
  );
  const progress = plan ? planProgress(plan.amount, monthIncome, elapsed, inMonth, pace) : null;

  // Шкала — до большего из «план», «оценка к концу месяца» и «прошлый месяц
  // целиком»: заливка = сколько уже набрали, отметки — цель и прошлый месяц.
  const scaleMax = Math.max(plan?.amount ?? 0, pace ?? 0, lastMonthIncome ?? 0, monthIncome, 1);
  const filled = monthIncome / scaleMax;
  const marker = lastMonthIncome ? lastMonthIncome / scaleMax : null;
  const planMarker = plan ? plan.amount / scaleMax : null;

  // ── Приход по дням месяца ──
  // ⚠ Бэк отдаёт daily[] от 31-го к 1-му (см. reports-monthly-api-quirks):
  // строим карту по дате и идём по календарю сами — порядок ответа не важен,
  // а дни без строки становятся нулём, а не пропадают.
  const monthBars = React.useMemo(() => {
    if (!report.data) return [];
    const byDate = new Map(
      (report.data.daily ?? []).map((d) => [d.date, num(d.cashSum) + num(d.cardSum)]),
    );
    const start = dayjs(monthRange.dateFrom);
    return Array.from({ length: start.daysInMonth() }, (_, i) => {
      const day = start.add(i, "day");
      const key = day.format("YYYY-MM-DD");
      return {
        key,
        day,
        value: byDate.get(key) ?? 0,
        isToday: key === monthRange.dateTo,
        isFuture: key > monthRange.dateTo,
        isWeekend: day.day() === 0 || day.day() === 6,
      };
    });
  }, [report.data, monthRange.dateFrom, monthRange.dateTo]);
  const barMax = monthBars.reduce((m, b) => Math.max(m, b.value), 0);

  const records = sumDayCounts(counts.data);
  const prevRecords = prevCounts.data ? sumDayCounts(prevCounts.data) : undefined;

  const av = availability.data;
  const staffTotal = av?.overallEmployeeCount ?? 0;
  const staffFree = av?.overallFreeEmployeeCount ?? 0;
  const load = staffTotal > 0 ? (staffTotal - staffFree) / staffTotal : null;

  const monthName = today.format("MMMM");
  const lastMonthName = lastMonth.label;

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      disableContentPadding
      sx={{ height: "100%", display: "flex" }}
    >
      {cash.isError ? (
        <Box sx={{ p: 2 }}>
          <WidgetError error={cash.error} />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) 260px" },
            minWidth: 0,
          }}
        >
          {/* ── Главная цифра и темп месяца ─────────────────────────────── */}
          <Stack spacing={1.75} sx={{ px: { xs: 2, md: 2.75 }, py: 2.5, minWidth: 0 }}>
            <Box>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.secondary" }}>
                Выручка · {range.label}
              </Typography>
              {cash.isLoading ? (
                <Skeleton variant="text" width="60%" height={56} />
              ) : (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ flexWrap: "wrap", rowGap: 0.5, mt: 0.5 }}
                >
                  <Typography
                    component="div"
                    sx={{
                      fontSize: { xs: 36, sm: 44 },
                      fontWeight: 700,
                      lineHeight: 1.05,
                      letterSpacing: "-0.036em",
                      ...TABULAR,
                    }}
                  >
                    {formatKGS(income)}
                  </Typography>
                  {p && (
                    <DeltaChip
                      size="md"
                      delta={{ current: income, previous: num(p.netIncome), baselineLabel: prev.label }}
                    />
                  )}
                </Stack>
              )}
              {p && (
                <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 0.5 }}>
                  {capitalize(prev.label)}: {formatKGS(num(p.netIncome))}
                </Typography>
              )}
            </Box>

            {/* Темп месяца — шкала, а не две цифры: сразу видно, обгоняем ли
                прошлый месяц. Показывается на любом периоде: «сегодня хорошо»
                мало значит, если месяц идёт ниже прошлого. */}
            {monthCash.data && (
              <Stack
                spacing={1}
                sx={(t) => ({
                  px: 1.75,
                  py: 1.5,
                  borderRadius: "10px",
                  bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.1 : 0.05),
                })}
              >
                <Stack
                  direction="row"
                  alignItems="baseline"
                  spacing={1}
                  sx={{ flexWrap: "wrap", rowGap: 0.25 }}
                >
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                    {capitalize(monthName)}, день {elapsed} из {inMonth}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  {pace != null && (
                    <>
                      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                        по темпу к {inMonth}-му
                      </Typography>
                      <Tooltip
                        arrow
                        title="Линейная оценка: выручка с начала месяца ÷ прошедшие дни × дни в месяце. Не учитывает выходные и сезон."
                      >
                        <Typography
                          sx={{
                            fontSize: "0.9375rem",
                            fontWeight: 700,
                            color: "primary.onSurface",
                            ...TABULAR,
                          }}
                        >
                          ≈ {formatKGS(pace)}
                        </Typography>
                      </Tooltip>
                      {paceVsLast != null && (
                        <Typography
                          sx={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: paceVsLast >= 0 ? "success.onSurface" : "error.onSurface",
                            ...TABULAR,
                          }}
                        >
                          {paceVsLast >= 0 ? "+" : "−"}
                          {Math.abs(paceVsLast)}% к {monthDative(lastMonthName)}
                        </Typography>
                      )}
                    </>
                  )}
                </Stack>

                <Box
                  sx={(t) => ({
                    position: "relative",
                    height: 8,
                    borderRadius: "4px",
                    bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.2 : 0.12),
                  })}
                >
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: `${Math.round(filled * 100)}%`,
                      borderRadius: "4px",
                      bgcolor: "primary.main",
                    }}
                  />
                  {marker != null && lastMonthIncome != null && (
                    <Tooltip
                      arrow
                      title={`${capitalize(lastMonthName)} целиком — ${formatKGS(lastMonthIncome)}`}
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          left: `calc(${(marker * 100).toFixed(1)}% - 2px)`,
                          top: -4,
                          bottom: -4,
                          width: 2,
                          borderRadius: "1px",
                          bgcolor: "text.secondary",
                        }}
                      />
                    </Tooltip>
                  )}
                  {planMarker != null && plan && (
                    <Tooltip arrow title={`План — ${formatKGS(plan.amount)}`}>
                      <Box
                        sx={{
                          position: "absolute",
                          left: `calc(${(planMarker * 100).toFixed(1)}% - 3px)`,
                          top: -5,
                          bottom: -5,
                          width: 3,
                          borderRadius: "2px",
                          bgcolor: "primary.onSurface",
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>

                <Stack
                  direction="row"
                  sx={{
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    flexWrap: "wrap",
                    columnGap: 1,
                    ...TABULAR,
                  }}
                >
                  <Box>
                    <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                      {formatKGS(monthIncome)}
                    </Box>{" "}
                    с начала месяца
                  </Box>
                  <Box sx={{ flex: 1 }} />
                  {lastMonthIncome != null && (
                    <Box>
                      {lastMonthName} целиком — {formatKGS(lastMonthIncome)}
                    </Box>
                  )}
                </Stack>

                {/* План: главный вопрос владельца — «успеваем?». Ответ одной
                    строкой: сколько нужно в день до конца месяца. */}
                {(progress || canEditPlan) && (
                  <Stack
                    direction="row"
                    alignItems="baseline"
                    sx={{
                      pt: 1,
                      borderTop: 1,
                      borderColor: "divider",
                      columnGap: 1,
                      rowGap: 0.25,
                      flexWrap: "wrap",
                      fontSize: "0.8125rem",
                      ...TABULAR,
                    }}
                  >
                    {progress ? (
                      <>
                        <Box sx={{ color: "text.secondary" }}>
                          План {formatKGS(progress.plan)}
                          {plan?.source === "month" ? ` на ${monthName}` : ""} ·{" "}
                          <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                            {Math.round(progress.done * 100)}%
                          </Box>
                        </Box>
                        <Box sx={{ flex: 1 }} />
                        <Box
                          sx={{
                            fontWeight: 600,
                            color:
                              progress.remaining === 0 || progress.onTrack
                                ? "success.onSurface"
                                : progress.onTrack === false
                                  ? "warning.onSurface"
                                  : "text.primary",
                          }}
                        >
                          {progress.remaining === 0
                            ? "план выполнен"
                            : progress.perDayNeeded == null
                              ? `не хватает ${formatKGS(progress.remaining)}`
                              : `нужно ≈ ${formatKGS(progress.perDayNeeded)} в день`}
                        </Box>
                      </>
                    ) : (
                      <Box sx={{ color: "text.secondary", flex: 1 }}>
                        Плана на месяц нет — задайте цель, и здесь будет видно, сколько нужно в день.
                      </Box>
                    )}
                    {canEditPlan && activeOrganization && (
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setPlanOpen(true)}
                        sx={{
                          border: 0,
                          p: 0,
                          bgcolor: "transparent",
                          cursor: "pointer",
                          font: "inherit",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          color: "text.secondary",
                          "&:hover": { color: "primary.onSurface" },
                        }}
                      >
                        {progress ? "изменить" : "задать план"}
                      </Box>
                    )}
                  </Stack>
                )}
              </Stack>
            )}

            {/* Приход по дням месяца: выходные светлее, сегодня выделено,
                будущие дни — пунктирная рамка. */}
            {monthBars.length > 0 && barMax > 0 && (
              <Stack spacing={0.75} sx={{ mt: "auto !important" }}>
                <Box sx={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 56 }}>
                  {monthBars.map((b) => (
                    <Tooltip
                      key={b.key}
                      arrow
                      placement="top"
                      title={
                        b.isFuture
                          ? b.day.format("D MMMM")
                          : `${b.day.format("dd, D MMMM")} — ${formatKGS(b.value)}`
                      }
                    >
                      <Box
                        sx={(t) => {
                          const dark = t.palette.mode === "dark";
                          return {
                            flex: 1,
                            minWidth: 2,
                            borderRadius: "3px 3px 1px 1px",
                            height: b.isFuture
                              ? "18%"
                              : `${Math.max(6, (b.value / barMax) * 100)}%`,
                            bgcolor: b.isFuture
                              ? "transparent"
                              : b.isToday
                                ? t.palette.primary.main
                                : alpha(
                                    t.palette.primary.main,
                                    b.isWeekend ? (dark ? 0.3 : 0.18) : dark ? 0.55 : 0.34,
                                  ),
                            border: b.isFuture
                              ? `1px dashed ${alpha(t.palette.primary.main, 0.25)}`
                              : "none",
                            boxSizing: "border-box",
                          };
                        }}
                      />
                    </Tooltip>
                  ))}
                </Box>
                <Stack direction="row" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                  <Box>приход по дням, {monthName}</Box>
                  <Box sx={{ flex: 1 }} />
                  <Box sx={{ display: { xs: "none", md: "block" } }}>
                    выходные светлее · сегодня выделено
                  </Box>
                </Stack>
              </Stack>
            )}
          </Stack>

          {/* ── Что объясняет выручку ───────────────────────────────────── */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              borderLeft: { md: 1 },
              borderTop: { xs: 1, md: 0 },
              borderColor: { xs: "divider", md: "divider" },
            }}
          >
            {canAppointments && (
              <DriverCell
                icon={<EventAvailableOutlined />}
                label="Записи"
                href={workspacePath}
                value={records}
                loading={counts.isLoading}
                delta={
                  prevRecords !== undefined ? (
                    <DeltaChip
                      size="md"
                      delta={{ current: records, previous: prevRecords, baselineLabel: prev.label }}
                    />
                  ) : undefined
                }
                hint="приёмы и процедуры"
                title="Все записи периода — приёмы и процедуры вместе, в любом статусе"
              />
            )}
            <DriverCell
              icon={<ReceiptLongOutlined />}
              label="Средний чек"
              href="/cashbox"
              value={formatKGS(avgCheck)}
              loading={cash.isLoading}
              delta={
                prevAvgCheck !== undefined ? (
                  <DeltaChip
                    size="md"
                    delta={{ current: avgCheck, previous: prevAvgCheck, baselineLabel: prev.label }}
                  />
                ) : undefined
              }
              hint={s ? `${s.paymentCount} оплат` : undefined}
              title="Выручка ÷ число оплат. Чек на оплату, а не на визит: визит бывает оплачен частями."
              last={!canSchedule}
            />
            {canSchedule && (
              <DriverCell
                icon={<GroupsOutlined />}
                label="Загрузка сегодня"
                href="/schedule"
                value={load == null ? "—" : `${Math.round(load * 100)}%`}
                loading={availability.isLoading}
                bar={load}
                hint={
                  staffTotal
                    ? staffFree > 0
                      ? `свободны ${staffFree} из ${staffTotal} специалистов`
                      : "свободных окон нет"
                    : "график не заполнен"
                }
                title="Доля специалистов, у которых на сегодня не осталось свободных окон"
                last
              />
            )}
          </Box>
        </Box>
      )}
      {activeOrganization && canEditPlan && (
        <PlanDialog
          open={planOpen}
          onClose={() => setPlanOpen(false)}
          organizationId={activeOrganization.id}
          scopeKey={scopeKey}
          scopeLabel={
            scope.branchId != null && activeBranch
              ? `Филиал «${activeBranch.name}»`
              : `Вся организация «${activeOrganization.name}»`
          }
          month={monthRange.month}
          themeConfig={activeOrganization.themeConfig as Record<string, unknown> | null}
        />
      )}
    </AppCard>
  );
};

export default PulseWidget;
