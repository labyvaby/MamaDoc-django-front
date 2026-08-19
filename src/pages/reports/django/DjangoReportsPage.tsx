import React, { useMemo, useState } from "react";
import {
  Box,
  Grid2,
  useMediaQuery,
  useTheme,
  Paper,
  Typography,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  alpha,
} from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import PaymentsIcon from "@mui/icons-material/Payments";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import WalletIcon from "@mui/icons-material/Wallet";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import AnalyticsOutlined from "@mui/icons-material/AnalyticsOutlined";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import { PageHeader, MonthNavigation } from "../../../components/ui";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { usePermissions } from "../../../hooks/usePermissions";
import { useCan } from "../../../hooks/useCan";
import { AccessDenied } from "../../../components/rbac/AccessDenied";
import { formatKGS } from "../../../utility/format";
import { useT } from "../../../i18n/VerticalProvider";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { getActiveMonths, getMonthlyReport } from "../../../api/reports";
import { SummaryCards, type SummaryCardGroup } from "../components/SummaryCards";
import CashlessMethodBreakdown from "../../../components/finance/CashlessMethodBreakdown";
import { ReportTableCard } from "../components/ReportTableCard";
import { compactTableSx } from "../components/reportTableStyles";

dayjs.locale("ru");

const num = (value: string | undefined): number => Number(value ?? 0);

const DjangoReportsPage: React.FC = () => {
  const { t } = useT("reports");
  usePageTitle("Отчеты");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  const canView = useCan("reports.view");
  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const orgRequired = isSuper || isMultiOrg;
  const needsOrg = orgRequired && !activeOrganization;

  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const month = useMemo(() => dayjs(selectedDate).format("YYYY-MM"), [selectedDate]);

  const orgId = isSuper ? activeOrganization?.id ?? undefined : undefined;
  const branchId = activeBranch?.id ?? undefined;

  const enabled = !permLoading && canView && !needsOrg;

  const reportQuery = useQuery({
    queryKey: djangoQueryKeys.reports.monthly({ month, orgId: orgId ?? null, branchId: branchId ?? null }),
    queryFn: ({ signal }) =>
      getMonthlyReport({ month, organizationId: orgId, branchId }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // organizationId шлём всегда: для обычного мульти-орг пользователя он сужает
  // месяцы до активной организации (иначе бэк собирает по всем членствам).
  const orgIdForMonths = activeOrganization?.id ?? undefined;
  const activeMonthsQuery = useQuery({
    queryKey: djangoQueryKeys.reports.activeMonths(orgIdForMonths ?? null),
    queryFn: ({ signal }) => getActiveMonths({ organizationId: orgIdForMonths }, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const activeMonths = useMemo(
    () => (activeMonthsQuery.data ? new Set(activeMonthsQuery.data.months) : null),
    [activeMonthsQuery.data],
  );

  const report = reportQuery.data;
  const summary = report?.summary;
  const totals = report?.totals;
  // Пустые дни (без приёмов/процедур/ожиданий и без денег) в таблице не
  // показываем — бэк отдаёт весь месяц zero-filled.
  const daily = useMemo(() => {
    const all = report?.daily ?? [];
    return all.filter(
      (d) =>
        d.appointmentsCount + d.proceduresCount + d.waitingCount > 0 ||
        num(d.servicesSum) > 0 ||
        num(d.productsSum) > 0 ||
        num(d.cashSum) > 0 ||
        num(d.cardSum) > 0 ||
        num(d.balanceSum) > 0 ||
        num(d.bonusesSum) > 0 ||
        num(d.insuranceSum) > 0 ||
        num(d.discountSum) > 0 ||
        num(d.debtSum) > 0,
    );
  }, [report?.daily]);

  // Две смысловые группы: количества и деньги. Цвет оставлен только тому, что
  // требует реакции (ожидание, отмены, долги) — остальные плитки нейтральные.
  //
  // Плитки «Приёмы / Процедуры» и «День / Ночь» убраны: `totals.appointmentsCount`
  // / `proceduresCount` дублируют `summary.apptPaidCount` / `procPaidCount`, а
  // `dayCount + nightCount` совпадает с `apptPaidCount` — то есть это разбивка
  // оплаченных приёмов по времени, и она ушла в подпись плитки оплаченных
  // (совпадение проверено на данных за фев–июль 2026, бэком не задокументировано).
  const groups: SummaryCardGroup[] = useMemo(() => {
    if (!summary || !totals) return [];
    return [
      {
        title: t("groups.flow"),
        cards: [
          {
            title: t("cards.paidVisits"),
            primaryValue: String(summary.apptPaidCount),
            secondaryText: t("cards.paidVisitsHint", {
              total: summary.apptTotalCount,
              day: totals.dayCount,
              night: totals.nightCount,
            }),
          },
          {
            title: t("cards.paidProcedures"),
            primaryValue: String(summary.procPaidCount),
            // Числа отменённых процедур бэк не отдаёт, поэтому показываем
            // «не оплачено» = всего − оплачено (раньше здесь был литерал «0»).
            secondaryText: t("cards.paidProceduresHint", {
              total: summary.procTotalCount,
              unpaid: Math.max(summary.procTotalCount - summary.procPaidCount, 0),
            }),
          },
          {
            title: t("cards.discounted"),
            primaryValue: String(summary.discountedCount),
            secondaryText: t("cards.discountedHint", { sum: formatKGS(summary.discountSum) }),
          },
          // Цвет — сигнал «здесь есть на что смотреть», поэтому нулевые
          // ожидание/отмены/долги остаются нейтральными.
          {
            title: t("cards.waiting"),
            primaryValue: String(summary.waitingCount),
            secondaryText: t("cards.waitingHint"),
            color: summary.waitingCount > 0 ? "warning" : undefined,
          },
          {
            title: t("cards.cancelled"),
            primaryValue: String(summary.cancelledCount),
            secondaryText: t("cards.cancelledHint"),
            color: summary.cancelledCount > 0 ? "error" : undefined,
          },
        ],
      },
      {
        title: t("groups.money"),
        cards: [
          {
            title: t("cards.medServices"),
            primaryValue: formatKGS(totals.services),
            secondaryText: t("cards.medServicesHint"),
          },
          {
            title: t("productsInVisits"),
            primaryValue: formatKGS(totals.products),
            secondaryText: t("soldInVisits"),
          },
          {
            title: t("cards.received"),
            primaryValue: formatKGS(num(totals.cash) + num(totals.card)),
            secondaryText: t("cards.receivedHint", {
              cash: formatKGS(totals.cash),
              card: formatKGS(totals.card),
            }),
          },
          {
            title: t("cards.insurance"),
            primaryValue: formatKGS(totals.insurance),
            secondaryText: t("cards.insuranceHint"),
          },
          {
            title: t("cards.debt"),
            primaryValue: formatKGS(totals.debt),
            secondaryText: t("cards.debtHint"),
            color: num(totals.debt) > 0 ? "warning" : undefined,
          },
        ],
      },
    ];
  }, [summary, totals, t]);

  /**
   * Безнал за месяц в разрезе способов. В отчёте нет колонок расходов и
   * закупок, поэтому бэк отдаёт только сумму карты и число операций — и за
   * период целиком, не по дням. Продаж товаров в разрезе нет: терминал у них
   * не сохраняется.
   */
  const cashlessRows = (report?.byCashlessMethod ?? []).map((r) => ({
    key: String(r.cashlessMethodId ?? "none"),
    name: r.cashlessMethodName ?? "Без способа",
    amount: num(r.cardSum),
    count: r.count,
    muted: r.cashlessMethodId == null,
  }));

  if (!permLoading && !canView) return <AccessDenied />;

  const loading = reportQuery.isLoading || (reportQuery.isFetching && !report);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Отчеты"
        showTitle={false}
        showSearch={false}
        dateNavigation={
          <MonthNavigation date={selectedDate} setDate={setSelectedDate} activeMonths={activeMonths} />
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию для просмотра отчёта.</Alert>
        </Box>
      ) : (
        <Box
          sx={(t) => ({
            px: t.appLayout.page.paddingX,
            pt: 2,
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
          })}
        >
          <Stack
            spacing={3}
            sx={(t) => ({
              pb: { xs: 15, md: t.appLayout.page.paddingY },
            })}
          >
            <SummaryCards groups={groups} loading={loading && groups.length === 0} />

            {!loading && cashlessRows.length > 0 && (
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <CashlessMethodBreakdown
                    items={cashlessRows}
                    title="Безнал по способам"
                    divider={false}
                    formatAmount={formatKGS}
                  />
                </CardContent>
              </Card>
            )}

            {reportQuery.isError ? (
              <Alert severity="error">
                {reportQuery.error instanceof Error
                  ? reportQuery.error.message
                  : "Ошибка загрузки отчёта"}
              </Alert>
            ) : loading ? (
              <Box sx={{ textAlign: "center", py: 5 }}>
                <CircularProgress />
              </Box>
            ) : isMobile ? (
              <Stack spacing={1.5}>
                {daily
                  .map((day) => (
                    <Card
                      key={day.date}
                      variant="outlined"
                      sx={{
                        borderRadius: 3,
                        "&:hover": { borderColor: "primary.main", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" },
                      }}
                    >
                      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                          <Avatar
                            sx={{
                              bgcolor: alpha(theme.palette.primary.main, 0.1),
                              color: "primary.onSurface",
                              width: 40,
                              height: 40,
                            }}
                          >
                            <AnalyticsOutlined />
                          </Avatar>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" fontWeight={800}>
                              {dayjs(day.date).format("DD MMMM")}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {dayjs(day.date).format("dddd")} • {t("dayVisitsCount", { count: day.appointmentsCount })} | Процедуры:{" "}
                              {day.proceduresCount}
                            </Typography>
                          </Box>
                        </Stack>

                        <Grid2 container spacing={2}>
                          <Grid2 size={6}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                            >
                              <PaymentsIcon sx={{ fontSize: 14, color: "primary.onSurface" }} /> Услуги
                            </Typography>
                            <Typography variant="subtitle1" fontWeight={800}>
                              {formatKGS(day.servicesSum)}
                            </Typography>
                          </Grid2>
                          <Grid2 size={6}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                            >
                              <AnalyticsOutlined sx={{ fontSize: 14, color: "secondary.main" }} /> Товары
                            </Typography>
                            <Typography variant="subtitle1" color="secondary.main" fontWeight={800}>
                              {formatKGS(day.productsSum)}
                            </Typography>
                          </Grid2>
                          <Grid2 size={6}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                            >
                              <WalletIcon sx={{ fontSize: 14, color: "success.main" }} /> Наличные
                            </Typography>
                            <Typography variant="subtitle1" color="success.main" fontWeight={800}>
                              {formatKGS(day.cashSum)}
                            </Typography>
                          </Grid2>
                          <Grid2 size={6}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                            >
                              <CreditCardIcon sx={{ fontSize: 14, color: "info.main" }} /> Безнал
                            </Typography>
                            <Typography variant="subtitle1" color="info.main" fontWeight={800}>
                              {formatKGS(day.cardSum)}
                            </Typography>
                          </Grid2>
                          {num(day.insuranceSum) > 0 && (
                            <Grid2 size={6}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                              >
                                <HealthAndSafetyOutlined sx={{ fontSize: 14, color: "info.main" }} /> Страховка
                              </Typography>
                              <Typography variant="subtitle1" color="info.main" fontWeight={800}>
                                {formatKGS(day.insuranceSum)}
                              </Typography>
                            </Grid2>
                          )}
                          {num(day.debtSum) > 0 && (
                            <Grid2 size={12}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                              >
                                <TrendingDownIcon sx={{ fontSize: 14, color: "warning.main" }} /> Долг
                              </Typography>
                              <Typography variant="subtitle1" color="warning.main" fontWeight={800}>
                                {formatKGS(day.debtSum)}
                              </Typography>
                            </Grid2>
                          )}
                        </Grid2>
                      </CardContent>
                    </Card>
                  ))}
                {daily.length === 0 && (
                  <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
                    <Typography color="text.secondary">Нет данных за этот период</Typography>
                  </Paper>
                )}
              </Stack>
            ) : (
              <ReportTableCard
                title={t("table.byDays")}
                headerActions={
                  totals ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t("table.summaryChip", {
                        days: daily.length,
                        sum: formatKGS(num(totals.cash) + num(totals.card)),
                      })}
                    />
                  ) : undefined
                }
              >
                <TableContainer>
                  <Table size="small" sx={compactTableSx}>
                    <TableHead>
                      <TableRow>
                        {(
                          [
                            { key: "date", label: t("tableHeaders.date"), align: "left" as const },
                            { key: "visits", label: t("tableHeaders.visits"), align: "center" as const },
                            { key: "procedures", label: t("tableHeaders.procedures"), align: "center" as const },
                            { key: "waiting", label: t("tableHeaders.waiting"), align: "center" as const },
                            { key: "medServices", label: t("tableHeaders.medServices"), align: "right" as const },
                            { key: "products", label: t("tableHeaders.products"), align: "right" as const },
                            { key: "cash", label: t("tableHeaders.cash"), align: "right" as const },
                            { key: "cashless", label: t("tableHeaders.cashless"), align: "right" as const },
                            { key: "insurance", label: t("tableHeaders.insurance"), align: "right" as const },
                            { key: "debt", label: t("tableHeaders.debt"), align: "right" as const },
                          ]
                        ).map(
                          (h) => (
                            <TableCell
                              key={h.key}
                              align={h.align}
                              // Цветом помечаем только колонки-сигналы, как в отчёте по ЗП
                              // (там так подсвечены «Аванс» и «К выплате»).
                              sx={
                                h.key === "waiting"
                                  ? { color: "error.onSurface" }
                                  : h.key === "debt"
                                    ? { color: "warning.onSurface" }
                                    : undefined
                              }
                            >
                              {h.label}
                            </TableCell>
                          ),
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {daily.map((day) => (
                        <TableRow
                          key={day.date}
                          hover
                          sx={{ opacity: day.appointmentsCount + day.proceduresCount > 0 ? 1 : 0.6 }}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>{dayjs(day.date).format("DD.MM (ddd)")}</TableCell>
                          <TableCell align="center">{day.appointmentsCount > 0 ? day.appointmentsCount : "-"}</TableCell>
                          <TableCell align="center">{day.proceduresCount > 0 ? day.proceduresCount : "-"}</TableCell>
                          <TableCell
                            align="center"
                            sx={{
                              fontWeight: day.waitingCount > 0 ? 700 : 400,
                              color:
                                day.waitingCount > 0 && dayjs(day.date).isBefore(dayjs(), "day")
                                  ? "error.main"
                                  : "text.secondary",
                            }}
                          >
                            {day.waitingCount > 0 ? day.waitingCount : "-"}
                          </TableCell>
                          <TableCell align="right">{formatKGS(day.servicesSum)}</TableCell>
                          <TableCell align="right">
                            {num(day.productsSum) > 0 ? formatKGS(day.productsSum) : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatKGS(day.cashSum)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatKGS(day.cardSum)}
                          </TableCell>
                          <TableCell align="right">
                            {num(day.insuranceSum) > 0 ? formatKGS(day.insuranceSum) : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ color: "warning.onSurface" }}>
                            {num(day.debtSum) > 0 ? formatKGS(day.debtSum) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {totals && (
                        <TableRow
                          sx={(t) => ({
                            "& .MuiTableCell-root": {
                              fontWeight: 700,
                              borderTop: `2px solid ${alpha(t.palette.primary.main, 0.35)}`,
                            },
                          })}
                        >
                          <TableCell>{t("table.totalRow")}</TableCell>
                          <TableCell align="center">{totals.appointmentsCount}</TableCell>
                          <TableCell align="center">{totals.proceduresCount}</TableCell>
                          <TableCell align="center" sx={{ color: "error.onSurface" }}>
                            {totals.waitingCount > 0 ? totals.waitingCount : "-"}
                          </TableCell>
                          <TableCell align="right">{formatKGS(totals.services)}</TableCell>
                          <TableCell align="right">{formatKGS(totals.products)}</TableCell>
                          <TableCell align="right">{formatKGS(totals.cash)}</TableCell>
                          <TableCell align="right">{formatKGS(totals.card)}</TableCell>
                          <TableCell align="right">
                            {num(totals.insurance) > 0 ? formatKGS(totals.insurance) : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ color: "warning.onSurface" }}>
                            {formatKGS(totals.debt)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </ReportTableCard>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default DjangoReportsPage;
