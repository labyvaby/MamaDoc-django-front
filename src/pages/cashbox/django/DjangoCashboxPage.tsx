import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import dayjs, { type Dayjs } from "dayjs";
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
import CashFlowFeed from "./CashFlowFeed";

// ── Period presets ────────────────────────────────────────────────────────────

const RANGE_PRESETS: DateRangePreset[] = [
  { key: "today", label: "Сегодня", range: () => [dayjs().startOf("day"), dayjs().endOf("day")] },
  {
    key: "yesterday",
    label: "Вчера",
    range: () => [
      dayjs().subtract(1, "day").startOf("day"),
      dayjs().subtract(1, "day").endOf("day"),
    ],
  },
  { key: "7d", label: "Последние 7 дней", range: () => [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
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

// ── Summary math (нал / безнал) ───────────────────────────────────────────────

type FlowNumbers = {
  inflow: number;
  outflow: number;
  net: number;
  breakdown: FlowBreakdownRow[];
};

const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "0");
  return Number.isNaN(n) ? 0 : n;
};

function flowNumbers(s: CashboxSummary | undefined, kind: "cash" | "card"): FlowNumbers {
  const payments = num(kind === "cash" ? s?.cashIncome : s?.cardIncome);
  const sales = num(kind === "cash" ? s?.salesCashIncome : s?.salesCardIncome);
  const refunds = num(kind === "cash" ? s?.cashRefunds : s?.cardRefunds);
  const expenses = num(kind === "cash" ? s?.cashExpenses : s?.cardExpenses);
  const supplies = num(kind === "cash" ? s?.supplyCashExpenses : s?.supplyCardExpenses);

  const inflow = payments + sales;
  const outflow = refunds + expenses + supplies;
  return {
    inflow,
    outflow,
    net: inflow - outflow,
    breakdown: [
      { key: "payment", label: "Оплаты приёмов", amount: payments, direction: 1 },
      { key: "sale", label: "Продажи товаров", amount: sales, direction: 1 },
      { key: "refund", label: "Возвраты", amount: refunds, direction: -1 },
      { key: "expense", label: "Расходы", amount: expenses, direction: -1 },
      { key: "supply", label: "Закупки товара", amount: supplies, direction: -1 },
    ],
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

const DjangoCashboxPage: React.FC = () => {
  usePageTitle("Касса");
  const theme = useTheme();
  const canView = useCan("finance.view");
  const { isSuperAdmin, activeOrganization, activeBranch, memberships, loading: permLoading } =
    usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;

  const [range, setRange] = React.useState<DateRange>(() => ({
    from: dayjs().startOf("month"),
    to: dayjs().endOf("month"),
  }));

  const dateFrom = range.from.format("YYYY-MM-DD");
  const dateTo = range.to.format("YYYY-MM-DD");
  // Остатки считаем накопительно: всё с начала учёта по границу даты.
  const openingDateTo = range.from.subtract(1, "day").format("YYYY-MM-DD");

  const scopeFilters = React.useMemo(
    () => ({
      organizationId: isSuper ? (activeOrganization?.id ?? undefined) : undefined,
      branchId: activeBranch?.id ?? undefined,
    }),
    [isSuper, activeOrganization?.id, activeBranch?.id],
  );

  const queriesEnabled = !permLoading && canView && !needsOrg;

  const makeSummaryQuery = (key: string, filters: { dateFrom?: string; dateTo?: string }) => ({
    queryKey: djangoQueryKeys.cashbox.summary({ ...scopeFilters, ...filters, view: key }),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getCashboxSummary({ ...scopeFilters, ...filters }, signal),
    enabled: queriesEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: queriesEnabled ? 60_000 : (false as const),
  });

  // Поток за выбранный период.
  const periodQuery = useQuery(makeSummaryQuery("period", { dateFrom, dateTo }));
  // Остаток на начало периода (накопительно до dateFrom).
  const openingQuery = useQuery(makeSummaryQuery("opening", { dateTo: openingDateTo }));
  // Остаток на конец периода (накопительно до dateTo) — «сколько было в кассе на дату».
  const closingQuery = useQuery(makeSummaryQuery("closing", { dateTo }));

  if (!permLoading && !canView) return <AccessDenied />;

  const period = periodQuery.data;
  const loading = periodQuery.isLoading || openingQuery.isLoading || closingQuery.isLoading;

  const cashFlow = flowNumbers(period, "cash");
  const cardFlow = flowNumbers(period, "card");
  const cashOpening = openingQuery.data ? flowNumbers(openingQuery.data, "cash").net : null;
  const cardOpening = openingQuery.data ? flowNumbers(openingQuery.data, "card").net : null;
  const cashClosing = closingQuery.data ? flowNumbers(closingQuery.data, "cash").net : null;
  const cardClosing = closingQuery.data ? flowNumbers(closingQuery.data, "card").net : null;

  // Дата остатка: конец периода, но не позже сегодняшнего дня.
  const closingDate: Dayjs = range.to.isAfter(dayjs(), "day") ? dayjs() : range.to;
  const closingLabel = `на ${closingDate.locale("ru").format("D MMM YYYY")}`;

  const insuranceIncome = num(period?.insuranceIncome);
  const balancePayments = num(period?.balancePayments);

  const baseFeedFilters = React.useMemo(
    () => ({ ...scopeFilters, dateFrom, dateTo }),
    [scopeFilters, dateFrom, dateTo],
  );

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
          <Box sx={{ maxWidth: 1080, mx: "auto" }}>
            {/* Заголовок + период */}
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
                  Движение денежных средств за период
                </Typography>
              </Box>
              <DateRangeField
                value={range}
                onChange={(next) => setRange(next)}
                presets={RANGE_PRESETS}
                minWidth={220}
              />
            </Stack>

            {/* Карточки потоков: наличные / безнал */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <FlowCard
                kind="cash"
                closing={cashClosing}
                opening={cashOpening}
                inflow={cashFlow.inflow}
                outflow={cashFlow.outflow}
                breakdown={cashFlow.breakdown}
                closingLabel={closingLabel}
                loading={loading}
              />
              <FlowCard
                kind="card"
                closing={cardClosing}
                opening={cardOpening}
                inflow={cardFlow.inflow}
                outflow={cardFlow.outflow}
                breakdown={cardFlow.breakdown}
                closingLabel={closingLabel}
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
                  label="Покрыто страховкой за период (долг страховых, не касса)"
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

            {/* Лента движения средств */}
            <CashFlowFeed baseFilters={baseFeedFilters} enabled={queriesEnabled} />
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DjangoCashboxPage;
