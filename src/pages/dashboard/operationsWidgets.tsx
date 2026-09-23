import React from "react";
import { Box, Grid, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQueries, useQuery } from "@tanstack/react-query";

import BookOnlineOutlined from "@mui/icons-material/BookOnlineOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";

import { getBranches } from "../../api/organization";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { MetricTile } from "./MetricTile";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";
import { availabilityTodayQuery, cashboxSummaryQuery, pendingBookingsQuery } from "./queries";

// ── Свободны сегодня ──────────────────────────────────────────────────────────

/**
 * Загрузка специалистов прямо сейчас: сколько из них свободно на сегодня.
 * Источник — тот же агрегат `/scheduling/availability/summary/`, что кормит
 * бейджи «свободны N/M» в расписании, поэтому цифры на двух экранах сойдутся.
 *
 * Периода не имеет: вопрос всегда про сегодня — «кого можно занять сейчас».
 */
export const AvailabilityWidget: React.FC<WidgetProps> = ({ scope }) => {
  const query = useQuery(availabilityTodayQuery(scope));

  const s = query.data;
  const free = s?.overallFreeEmployeeCount ?? 0;
  const total = s?.overallEmployeeCount ?? 0;
  const busy = Math.max(0, total - free);
  const loadPercent = total > 0 ? Math.round((busy / total) * 100) : null;

  return (
    <DashCard title="Свободны сегодня" subheader="на текущий день" href="/schedule" linkLabel="Расписание">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6}>
            <MetricTile
              label="Свободных специалистов"
              href="/schedule"
              value={total ? `${free} из ${total}` : "—"}
              icon={<EventAvailableOutlined />}
              tone={total > 0 && free === 0 ? "warning" : "neutral"}
              loading={query.isLoading}
              hint={total === 0 ? "график на сегодня не заполнен" : undefined}
              title="Свободен — у специалиста есть хотя бы одно незанятое окно на сегодня"
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="Занятость"
              href="/schedule"
              value={loadPercent == null ? "—" : `${loadPercent}%`}
              icon={<TrendingUpOutlined />}
              tone={loadPercent != null && loadPercent >= 90 ? "warning" : "neutral"}
              loading={query.isLoading}
              hint={total ? `занято ${busy} из ${total}` : undefined}
              title="Доля специалистов, у которых на сегодня не осталось свободных окон"
            />
          </Grid>
        </Grid>
      )}
    </DashCard>
  );
};

// ── Заявки с витрины ──────────────────────────────────────────────────────────

/**
 * Брони, ожидающие подтверждения, — деньги, которые вот-вот утекут: заявка
 * пришла, но никто её не взял. Окно — как у бейджа сайдбара (см. queries.ts).
 * Прошедшие даты включены осознанно — pending на вчера это «висяк».
 */
export const BookingsWidget: React.FC<WidgetProps> = ({ scope }) => {
  const pendingQuery = useQuery(pendingBookingsQuery(scope, "pending"));
  const overdueQuery = useQuery(pendingBookingsQuery(scope, "overdue"));
  const pending = pendingQuery.data?.count ?? 0;
  const overdue = overdueQuery.data?.count ?? 0;

  return (
    <DashCard title="Заявки с витрины" subheader="ждут ответа" href="/bookings" linkLabel="Онлайн-запись">
      {pendingQuery.isError ? (
        <WidgetError error={pendingQuery.error} />
      ) : (
        <Grid container spacing={1.25}>
          <Grid item xs={6}>
            <MetricTile
              label="Ждут подтверждения"
              href="/bookings"
              value={pending}
              icon={<BookOnlineOutlined />}
              tone={pending > 0 ? "warning" : "neutral"}
              loading={pendingQuery.isLoading}
              title="Заявка с публичной витрины, которую ещё никто не подтвердил"
            />
          </Grid>
          <Grid item xs={6}>
            <MetricTile
              label="Из них просрочено"
              href="/bookings"
              value={overdue}
              icon={<EventAvailableOutlined />}
              tone={overdue > 0 ? "error" : "neutral"}
              loading={overdueQuery.isLoading}
              hint={overdue > 0 ? "дата визита уже прошла" : undefined}
              title="Заявка на прошедшую дату, которую так и не подтвердили — ответа никто не получил"
            />
          </Grid>
        </Grid>
      )}
    </DashCard>
  );
};

// ── Сравнение филиалов ────────────────────────────────────────────────────────

/**
 * Деньги по филиалам за период — где идёт, а где просело. Строки отсортированы
 * по выручке: лидер сверху, отстающий — внизу, его и надо разбирать.
 *
 * ⚠ Стоит по одному запросу на филиал: агрегата «все филиалы разом» на бэке
 * нет. Поэтому берём только текущий период, без базы сравнения, и не больше
 * восьми филиалов. Первый кандидат на серверную вьюху.
 */
export const BranchesWidget: React.FC<WidgetProps> = ({ range, scope }) => {
  const branchesQuery = useQuery({
    queryKey: [...djangoQueryKeys.organization.branches, scope.organizationId ?? null],
    queryFn: () => getBranches(scope.organizationId),
    enabled: scope.orgReady,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const branches = React.useMemo(
    () => (branchesQuery.data ?? []).slice(0, 8),
    [branchesQuery.data],
  );

  const summaries = useQueries({
    // Строка активного филиала совпадает по ключу с «Пульсом» — это тот же
    // запрос, react-query отдаёт его из кэша.
    queries: branches.map((b) => cashboxSummaryQuery({ ...scope, branchId: b.id }, range)),
  });

  const rows = branches
    .map((b, i) => {
      const s = summaries[i]?.data;
      const income = num(s?.netIncome);
      return {
        id: b.id,
        name: b.name,
        income,
        payments: s?.paymentCount ?? 0,
        avgCheck: s && s.paymentCount > 0 ? income / s.paymentCount : 0,
        flow: num(s?.netCashFlow),
        loading: summaries[i]?.isLoading ?? true,
      };
    })
    .sort((a, b) => b.income - a.income);

  const best = rows.reduce((max, r) => Math.max(max, r.income), 0);
  const totalIncome = rows.reduce((acc, r) => acc + r.income, 0);

  return (
    <DashCard
      title="Филиалы"
      subheader={`${range.label} · всего ${formatKGS(totalIncome)}`}
      href="/cashbox"
      linkLabel="Касса"
    >
      {branchesQuery.isError ? (
        <WidgetError error={branchesQuery.error} />
      ) : (
        <Box>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              px: 1,
              pb: 0.75,
              color: "text.disabled",
              fontSize: "0.7rem",
              fontWeight: 600,
              display: { xs: "none", sm: "flex" },
            }}
          >
            <Box sx={{ flex: 1 }}>Филиал</Box>
            <Box sx={{ width: 64, textAlign: "right" }}>Доля</Box>
            <Box sx={{ width: 96, textAlign: "right" }}>Средний чек</Box>
            <Box sx={{ width: 120, textAlign: "right" }}>Выручка</Box>
          </Stack>
          {rows.map((r) => {
            const share = totalIncome > 0 ? Math.round((r.income / totalIncome) * 100) : 0;
            return (
              <Box
                key={r.id}
                sx={(t) => ({
                  px: 1,
                  py: 0.875,
                  borderRadius: "8px",
                  "&:hover": { bgcolor: subtleBg(t) },
                })}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {r.name}
                    </Typography>
                    {/* Полоса от лучшего филиала: соотношение читается глазом
                        быстрее колонки чисел. */}
                    <Box
                      sx={(t) => ({
                        mt: 0.5,
                        height: 4,
                        borderRadius: "4px",
                        bgcolor: subtleBg(t, true),
                        overflow: "hidden",
                      })}
                    >
                      <Box
                        sx={(t) => ({
                          width: `${best > 0 ? Math.round((r.income / best) * 100) : 0}%`,
                          height: "100%",
                          borderRadius: "4px",
                          bgcolor: alpha(
                            t.palette.primary.main,
                            t.palette.mode === "dark" ? 0.8 : 0.6,
                          ),
                          transition: "width .3s ease",
                        })}
                      />
                    </Box>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      width: 64,
                      textAlign: "right",
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      display: { xs: "none", sm: "block" },
                    }}
                  >
                    {r.loading ? "…" : `${share}%`}
                  </Typography>
                  <Tooltip title={`${r.payments} оплат`} arrow>
                    <Typography
                      variant="caption"
                      sx={{
                        width: 96,
                        textAlign: "right",
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                        display: { xs: "none", sm: "block" },
                      }}
                    >
                      {r.loading ? "…" : formatKGS(r.avgCheck)}
                    </Typography>
                  </Tooltip>
                  <Tooltip
                    title={r.loading ? "" : `Осталось после расходов: ${formatKGS(r.flow)}`}
                    arrow
                  >
                    <Typography
                      sx={{
                        width: 120,
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        fontVariantNumeric: "tabular-nums",
                        color: !r.loading && r.flow < 0 ? "error.main" : "text.primary",
                      }}
                    >
                      {r.loading ? "…" : formatKGS(r.income)}
                    </Typography>
                  </Tooltip>
                </Stack>
              </Box>
            );
          })}

          {branchesQuery.data && branchesQuery.data.length > 8 && (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              показаны первые 8 из {branchesQuery.data.length} филиалов
            </Typography>
          )}
        </Box>
      )}
    </DashCard>
  );
};
