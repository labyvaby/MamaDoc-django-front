import React from "react";
import { Box, Grid, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQueries, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import BookOnlineOutlined from "@mui/icons-material/BookOnlineOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";

import { AppCard } from "../../components/ui";
import { getAvailabilitySummary } from "../../api/scheduling";
import { getBookings } from "../../api/bookings";
import { getBranches } from "../../api/organization";
import { getCashboxSummary } from "../../api/cashbox";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { MetricTile } from "./MetricTile";
import { WidgetError, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";

// ── Свободны сегодня ──────────────────────────────────────────────────────────

/**
 * Загрузка специалистов прямо сейчас: сколько из них свободно на сегодня.
 * Источник — тот же агрегат `/scheduling/availability/summary/`, что кормит
 * бейджи «свободны N/M» в расписании, поэтому цифры на двух экранах сойдутся.
 *
 * Периода не имеет: вопрос всегда про сегодня — «кого можно занять сейчас».
 */
export const AvailabilityWidget: React.FC<WidgetProps> = ({ scope }) => {
  const today = dayjs().format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: djangoQueryKeys.scheduling.availabilitySummary({
      view: "dashboard",
      organizationId: scope.organizationId ?? null,
      branchId: scope.branchId ?? null,
      date: today,
    }),
    queryFn: ({ signal }) =>
      getAvailabilitySummary(
        { date: today, branchId: scope.branchId, organizationId: scope.organizationId },
        signal,
      ),
    enabled: scope.orgReady,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const s = query.data;
  const free = s?.overallFreeEmployeeCount ?? 0;
  const total = s?.overallEmployeeCount ?? 0;
  const busy = Math.max(0, total - free);
  const loadPercent = total > 0 ? Math.round((busy / total) * 100) : null;

  return (
    <AppCard variant="outlined" elevation={0} title="Свободны сегодня" subheader="на текущий день">
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : (
        <Grid container spacing={1.5}>
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
    </AppCard>
  );
};

// ── Заявки с витрины ──────────────────────────────────────────────────────────

/**
 * Брони, ожидающие подтверждения, — деньги, которые вот-вот утекут: заявка
 * пришла, но никто её не взял.
 *
 * ⚠ Окно ровно то же, что у бейджа «Брони» в сайдбаре (месяц назад — 90 дней
 * вперёд), и это важно: сначала было «сегодня + 30 дней», и дашборд показывал
 * 0 при бейдже 1. Прошедшие даты включены осознанно — pending на вчера это
 * «висяк», по которому никто не связался с пациентом.
 */
export const BookingsWidget: React.FC<WidgetProps> = ({ scope }) => {
  const window = React.useMemo(() => {
    const today = dayjs();
    return {
      pastFrom: today.subtract(30, "day").format("YYYY-MM-DD"),
      yesterday: today.subtract(1, "day").format("YYYY-MM-DD"),
      futureTo: today.add(90, "day").format("YYYY-MM-DD"),
    };
  }, []);

  const results = useQueries({
    queries: (["pending", "overdue"] as const).map((kind) => {
      const dateFrom = window.pastFrom;
      const dateTo = kind === "pending" ? window.futureTo : window.yesterday;
      return {
        queryKey: djangoQueryKeys.bookings.list({
          view: `dashboard-${kind}`,
          organizationId: scope.organizationId ?? null,
          branchId: scope.branchId ?? null,
          dateFrom,
          dateTo,
        }),
        queryFn: ({ signal }: { signal?: AbortSignal }) =>
          getBookings(
            {
              dateFrom,
              dateTo,
              status: "pending",
              organizationId: scope.organizationId,
              branchId: scope.branchId,
              page: 1,
              // Нужен только счётчик: список не забираем, чтобы не тянуть заявки целиком.
              pageSize: 1,
            },
            signal,
          ),
        enabled: scope.orgReady,
        staleTime: DJANGO_DETAIL_STALE_TIME_MS,
      };
    }),
  });

  const [pendingQuery, overdueQuery] = results;
  const pending = pendingQuery?.data?.count ?? 0;
  const overdue = overdueQuery?.data?.count ?? 0;

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      title="Заявки с витрины"
      subheader="ждут ответа"
    >
      {pendingQuery?.isError ? (
        <WidgetError error={pendingQuery.error} />
      ) : (
        <Grid container spacing={1.5}>
          <Grid item xs={6}>
            <MetricTile
              label="Ждут подтверждения"
              href="/bookings"
              value={pending}
              icon={<BookOnlineOutlined />}
              tone={pending > 0 ? "warning" : "neutral"}
              loading={pendingQuery?.isLoading ?? true}
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
              loading={overdueQuery?.isLoading ?? true}
              hint={overdue > 0 ? "дата визита уже прошла" : undefined}
              title="Заявка на прошедшую дату, которую так и не подтвердили — пациенту никто не ответил"
            />
          </Grid>
        </Grid>
      )}
    </AppCard>
  );
};

// ── Сравнение филиалов ────────────────────────────────────────────────────────

/**
 * Деньги по филиалам за период — то, ради чего владелец и открывает сводку:
 * где идёт, а где просело.
 *
 * ⚠ Стоит по одному запросу на филиал: агрегата «все филиалы разом» на бэке
 * нет. Поэтому берём только текущий период, без базы сравнения, и не больше
 * восьми филиалов — иначе экран превращается в два десятка запросов. Первый
 * кандидат на серверную вьюху.
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
    queries: branches.map((b) => ({
      queryKey: djangoQueryKeys.cashbox.summary({
        view: "dashboardBranch",
        organizationId: scope.organizationId ?? null,
        branchId: b.id,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        getCashboxSummary(
          {
            organizationId: scope.organizationId,
            branchId: b.id,
            dateFrom: range.dateFrom,
            dateTo: range.dateTo,
          },
          signal,
        ),
      staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    })),
  });

  const rows = branches.map((b, i) => {
    const s = summaries[i]?.data;
    const income = num(s?.netIncome);
    const cash = num(s?.cashIncome);
    const card = num(s?.cardIncome);
    return {
      id: b.id,
      name: b.name,
      income,
      payments: s?.paymentCount ?? 0,
      avgCheck: s && s.paymentCount > 0 ? income / s.paymentCount : 0,
      cardShare: cash + card > 0 ? Math.round((card / (cash + card)) * 100) : null,
      loading: summaries[i]?.isLoading ?? true,
    };
  });

  const best = rows.reduce((max, r) => Math.max(max, r.income), 0);
  const totalIncome = rows.reduce((acc, r) => acc + r.income, 0);

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      title="Сравнение филиалов"
      subheader={`${range.label} · всего ${formatKGS(totalIncome)}`}
    >
      {branchesQuery.isError ? (
        <WidgetError error={branchesQuery.error} />
      ) : (
        <Stack spacing={1}>
          {rows.map((r) => (
            <Box
              key={r.id}
              sx={(t) => ({
                p: 1.5,
                borderRadius: "10px",
                border: 1,
                borderColor: "divider",
                bgcolor: subtleBg(t),
              })}
            >
              <Stack
                direction="row"
                alignItems="baseline"
                spacing={1.5}
                sx={{ mb: 0.75, flexWrap: "wrap" }}
              >
                <Typography sx={{ fontWeight: 600, minWidth: 0, flex: 1 }}>{r.name}</Typography>
                <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {r.loading ? "…" : formatKGS(r.income)}
                </Typography>
                {!r.loading && (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {r.payments} оплат · чек {formatKGS(r.avgCheck)}
                  </Typography>
                )}
              </Stack>

              {/* Полоса от лучшего филиала: соотношение читается глазом быстрее,
                  чем колонка чисел. */}
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={(t) => ({
                    flex: 1,
                    height: 6,
                    borderRadius: "6px",
                    bgcolor: subtleBg(t, true),
                    overflow: "hidden",
                  })}
                >
                  <Box
                    sx={(t) => ({
                      width: `${best > 0 ? Math.round((r.income / best) * 100) : 0}%`,
                      height: "100%",
                      bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.8 : 0.55),
                      transition: "width .3s ease",
                    })}
                  />
                </Box>
                {r.cardShare != null && (
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", width: 88, textAlign: "right" }}
                  >
                    безнал {r.cardShare}%
                  </Typography>
                )}
              </Stack>
            </Box>
          ))}

          {branchesQuery.data && branchesQuery.data.length > 8 && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              показаны первые 8 из {branchesQuery.data.length} филиалов
            </Typography>
          )}
        </Stack>
      )}
    </AppCard>
  );
};
