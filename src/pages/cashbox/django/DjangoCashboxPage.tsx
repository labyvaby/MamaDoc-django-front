import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useQuery } from "@tanstack/react-query";

import {
  DateRangeField,
  InfoTile,
  PageHeader,
  type DateRange,
  type DateRangePreset,
} from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { getCashboxSummary, type CashboxSummary } from "../../../api/cashbox";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../api/queryKeys";
import FlowCard, { formatSom, type FlowBreakdownRow } from "./FlowCard";
import CashBalanceCard from "./CashBalanceCard";
import CashFlowFeed from "./CashFlowFeed";

// ── Period presets ────────────────────────────────────────────────────────────

// Day-режим (finance.view): только конкретный день.
const DAY_PRESETS: DateRangePreset[] = [
  { key: "today", label: "Сегодня", range: () => [dayjs().startOf("day"), dayjs().endOf("day")] },
  {
    key: "yesterday",
    label: "Вчера",
    range: () => [
      dayjs().subtract(1, "day").startOf("day"),
      dayjs().subtract(1, "day").endOf("day"),
    ],
  },
];

// Range-режим (finance.view_history): произвольные периоды.
const RANGE_PRESETS: DateRangePreset[] = [
  ...DAY_PRESETS,
  { key: "7d", label: "Последние 7 дней", range: () => [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  { key: "30d", label: "Последние 30 дней", range: () => [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")] },
  { key: "month", label: "Этот месяц", range: () => [dayjs().startOf("month"), dayjs().endOf("month")] },
  {
    key: "prevMonth",
    label: "Прошлый месяц",
    range: () => [
      dayjs().subtract(1, "month").startOf("month"),
      dayjs().subtract(1, "month").endOf("month"),
    ],
  },
];

// ── Summary math (безнал) ─────────────────────────────────────────────────────

type FlowNumbers = {
  inflow: number;
  outflow: number;
  breakdown: FlowBreakdownRow[];
};

const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "0");
  return Number.isNaN(n) ? 0 : n;
};

function cardFlowNumbers(s: CashboxSummary | undefined): FlowNumbers {
  const payments = num(s?.cardIncome);
  const sales = num(s?.salesCardIncome);
  const refunds = num(s?.cardRefunds);
  const expenses = num(s?.cardExpenses);
  const supplies = num(s?.supplyCardExpenses);

  return {
    inflow: payments + sales,
    outflow: refunds + expenses + supplies,
    breakdown: [
      { key: "payment", label: "Оплаты приёмов", amount: payments, direction: 1 },
      { key: "sale", label: "Продажи товаров", amount: sales, direction: 1 },
      { key: "refund", label: "Возвраты", amount: refunds, direction: -1 },
      { key: "expense", label: "Расходы", amount: expenses, direction: -1 },
      { key: "supply", label: "Закупки товара", amount: supplies, direction: -1 },
    ],
  };
}

function periodLabel(range: DateRange): string {
  const f = range.from.locale("ru");
  const t = range.to.locale("ru");
  if (f.isSame(t, "day")) {
    return t.isSame(dayjs(), "day") ? "за сегодня" : `за ${t.format("D MMMM")}`;
  }
  if (f.isSame(t, "month")) return `за ${f.format("D")} – ${t.format("D MMM")}`;
  return `за ${f.format("D MMM")} – ${t.format("D MMM")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Касса. Два независимых смысловых блока:
 *  - «Наличные» — операционное состояние кассового ящика (открытая смена
 *    филиала). От фильтра периода НЕ зависит.
 *  - «Безнал» + лента — отчёт за выбранный день; произвольный период
 *    доступен только с правом finance.view_history (day-picker ↔ range-picker).
 */
const DjangoCashboxPage: React.FC = () => {
  usePageTitle("Касса");
  const theme = useTheme();
  const canView = useCan("finance.view");
  const canViewHistory = useCan("finance.view_history");
  const { isSuperAdmin, activeOrganization, activeBranch, memberships, loading: permLoading } =
    usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;

  // Касса — рабочий инструмент «на сегодня»; история — по явному выбору.
  const [range, setRange] = React.useState<DateRange>(() => ({
    from: dayjs().startOf("day"),
    to: dayjs().endOf("day"),
  }));

  const dateFrom = range.from.format("YYYY-MM-DD");
  const dateTo = range.to.format("YYYY-MM-DD");

  const scopeFilters = React.useMemo(
    () => ({
      organizationId: isSuper ? (activeOrganization?.id ?? undefined) : undefined,
      branchId: activeBranch?.id ?? undefined,
    }),
    [isSuper, activeOrganization?.id, activeBranch?.id],
  );

  const queriesEnabled = !permLoading && canView && !needsOrg;

  // Единственный summary-запрос — поток за выбранное окно. Накопительных
  // запросов «с начала учёта» больше нет: остаток наличных живёт в смене.
  const periodQuery = useQuery({
    queryKey: djangoQueryKeys.cashbox.summary({ ...scopeFilters, dateFrom, dateTo, view: "period" }),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getCashboxSummary({ ...scopeFilters, dateFrom, dateTo }, signal),
    enabled: queriesEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled ? 60_000 : (false as const),
  });

  const baseFeedFilters = React.useMemo(
    () => ({ ...scopeFilters, dateFrom, dateTo }),
    [scopeFilters, dateFrom, dateTo],
  );

  // После всех хуков — ранний выход не ломает их порядок между рендерами.
  if (!permLoading && !canView) return <AccessDenied />;

  const period = periodQuery.data;
  const loading = periodQuery.isLoading;

  const cardFlow = cardFlowNumbers(period);
  const windowLabel = periodLabel(range);

  const insuranceIncome = num(period?.insuranceIncome);
  const balancePayments = num(period?.balancePayments);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Касса" showTitle={false} showSearch={false} />

      {needsOrg && (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы просмотреть данные кассы.</Alert>
        </Box>
      )}

      {!needsOrg && (
        <Box
          sx={{
            px: theme.appLayout.page.paddingX,
            pb: 4,
            flex: 1,
            overflowY: "auto",
          }}
        >
          <Box sx={{ width: "100%", pt: 1 }}>
            {/* Заголовок + выбор дня/периода (влияет на безнал и ленту) */}
            <Stack
              direction="row"
              alignItems="flex-end"
              justifyContent="space-between"
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 2, rowGap: 1.5 }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.2 }}>
                  Касса
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Наличные — остаток на сейчас · безнал и лента — {windowLabel}
                </Typography>
              </Box>
              <DateRangeField
                value={range}
                onChange={(next) => setRange(next)}
                presets={canViewHistory ? RANGE_PRESETS : DAY_PRESETS}
                mode={canViewHistory ? "range" : "day"}
                minWidth={200}
              />
            </Stack>

            {/* Наличные (смена, без периода) / Безнал (за окно) */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 1.5,
                mb: 1.5,
                alignItems: "start",
              }}
            >
              <CashBalanceCard
                branchId={activeBranch?.id ?? undefined}
                branchName={activeBranch?.name ?? undefined}
                organizationId={orgRequired ? (activeOrganization?.id ?? undefined) : undefined}
                enabled={queriesEnabled}
              />
              <FlowCard
                periodLabel={windowLabel}
                inflow={cardFlow.inflow}
                outflow={cardFlow.outflow}
                breakdown={cardFlow.breakdown}
                loading={loading}
              />
            </Box>

            {/* Не-денежные потоки — информационно, в кассу не входят */}
            {(insuranceIncome > 0 || balancePayments > 0) && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 1.5,
                  mb: 1.5,
                }}
              >
                <InfoTile
                  icon={<ShieldOutlined />}
                  label={`Покрыто страховкой ${windowLabel} (долг страховых, не касса)`}
                  value={formatSom(insuranceIncome)}
                  active={insuranceIncome > 0}
                />
                <InfoTile
                  icon={<AccountBalanceWalletOutlined />}
                  label="Оплачено с баланса пациентов (внутренние операции)"
                  value={formatSom(balancePayments)}
                  active={balancePayments > 0}
                />
              </Box>
            )}

            {/* Лента движения средств — то же окно, что и безнал */}
            <CashFlowFeed baseFilters={baseFeedFilters} enabled={queriesEnabled} />
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DjangoCashboxPage;
