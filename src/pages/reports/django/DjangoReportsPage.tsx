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
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { getActiveMonths, getMonthlyReport } from "../../../api/reports";
import { ReportsSummaryCards, type SummaryCard } from "./ReportsSummaryCards";

dayjs.locale("ru");

const num = (value: string | undefined): number => Number(value ?? 0);

const DjangoReportsPage: React.FC = () => {
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

  const activeMonthsQuery = useQuery({
    queryKey: djangoQueryKeys.reports.activeMonths(orgId ?? null),
    queryFn: ({ signal }) => getActiveMonths({ organizationId: orgId }, signal),
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

  const cards: SummaryCard[] = useMemo(() => {
    if (!summary || !totals) return [];
    return [
      {
        title: "Оплачено приёмов",
        primaryValue: String(summary.apptPaidCount),
        secondaryText: `Всего: ${summary.apptTotalCount} · Отменено: ${summary.apptCancelledCount}`,
        color: "success",
      },
      {
        title: "Оплачено процедур",
        primaryValue: String(summary.procPaidCount),
        secondaryText: `Всего: ${summary.procTotalCount} · Отменено: 0`,
        color: "success",
      },
      {
        title: "Со скидкой",
        primaryValue: String(summary.discountedCount),
        secondaryText: `Сумма скидок: ${formatKGS(summary.discountSum)}`,
        color: "info",
      },
      {
        title: "Ожидание",
        primaryValue: String(summary.waitingCount),
        secondaryText: "Ожидают или здесь",
        color: "warning",
      },
      {
        title: "Отменены",
        primaryValue: String(summary.cancelledCount),
        secondaryText: "Не пришли или отменены",
        color: "error",
      },
      {
        title: "Приёмы / Процедуры",
        primaryValue: `${totals.appointmentsCount} / ${totals.proceduresCount}`,
        secondaryText: "Приёмы / Процедуры",
        color: "primary",
      },
      {
        title: "День / Ночь",
        primaryValue: `${totals.dayCount} / ${totals.nightCount}`,
        secondaryText: "до 18:00 / с 18:00",
        color: "info",
      },
      {
        title: "Мед. услуги",
        primaryValue: formatKGS(totals.services),
        secondaryText: "Без товаров",
        color: "primary",
      },
      {
        title: "Товары в приёмах",
        primaryValue: formatKGS(totals.products),
        secondaryText: "Продано в приёмах",
        color: "secondary",
      },
      {
        title: "Нал + Безнал",
        primaryValue: formatKGS(num(totals.cash) + num(totals.card)),
        secondaryText:
          `Нал: ${formatKGS(totals.cash)} · Безнал: ${formatKGS(totals.card)}` +
          (num(totals.insurance) > 0 ? ` · Страховка: ${formatKGS(totals.insurance)}` : ""),
        color: "success",
      },
      {
        title: "Долги",
        primaryValue: formatKGS(totals.debt),
        secondaryText: "Не оплачено",
        color: "warning",
      },
    ];
  }, [summary, totals]);

  if (!permLoading && !canView) return <AccessDenied />;

  const loading = reportQuery.isLoading || (reportQuery.isFetching && !report);

  return (
    <Box
      sx={{
        height: { xs: "calc(100dvh - 56px)", md: "calc(100vh - 64px)" },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
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
            display: "flex",
            flexDirection: "column",
            overflow: { xs: "auto", lg: "hidden" },
            minHeight: 0,
          })}
        >
          <Stack
            spacing={3}
            sx={(t) => ({
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              pb: { xs: 15, md: t.appLayout.page.paddingY },
            })}
          >
            <ReportsSummaryCards cards={cards} loading={loading && cards.length === 0} />

            {reportQuery.isError ? (
              <Alert severity="error">
                {reportQuery.error instanceof Error
                  ? reportQuery.error.message
                  : "Ошибка загрузки отчёта"}
              </Alert>
            ) : loading ? (
              <Box sx={{ textAlign: "center", py: 5, flex: 1 }}>
                <CircularProgress />
              </Box>
            ) : isMobile ? (
              <Stack spacing={1.5} sx={{ flex: 1 }}>
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
                              {dayjs(day.date).format("dddd")} • Приемы: {day.appointmentsCount} | Процедуры:{" "}
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
              <Paper
                variant="outlined"
                sx={{ borderRadius: 3, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
              >
                <TableContainer sx={{ flex: 1, overflowY: "auto" }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {["Дата", "Приемы", "Процедуры", "В ожидании", "Мед. услуги", "Товары", "Наличные", "Безнал", "Страховка", "Долг"].map(
                          (h) => (
                            <TableCell
                              key={h}
                              align={
                                h === "Дата"
                                  ? "left"
                                  : h === "Приемы" || h === "Процедуры" || h === "В ожидании"
                                  ? "center"
                                  : "right"
                              }
                              sx={{ fontWeight: 800, ...(h === "В ожидании" ? { color: "error.main" } : {}) }}
                            >
                              {h}
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
                          <TableCell align="right" sx={{ color: "secondary.main" }}>
                            {num(day.productsSum) > 0 ? formatKGS(day.productsSum) : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ color: "success.main", fontWeight: 600 }}>
                            {formatKGS(day.cashSum)}
                          </TableCell>
                          <TableCell align="right" sx={{ color: "info.main", fontWeight: 600 }}>
                            {formatKGS(day.cardSum)}
                          </TableCell>
                          <TableCell align="right" sx={{ color: "info.dark" }}>
                            {num(day.insuranceSum) > 0 ? formatKGS(day.insuranceSum) : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ color: "warning.main" }}>
                            {num(day.debtSum) > 0 ? formatKGS(day.debtSum) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {totals && (
                        <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                          <TableCell sx={{ fontWeight: 800 }}>ИТОГО</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 800 }}>
                            {totals.appointmentsCount}
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 800 }}>
                            {totals.proceduresCount}
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 800, color: "error.main" }}>
                            {totals.waitingCount > 0 ? totals.waitingCount : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatKGS(totals.services)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: "secondary.main" }}>
                            {formatKGS(totals.products)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: "success.main" }}>
                            {formatKGS(totals.cash)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: "info.main" }}>
                            {formatKGS(totals.card)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: "info.dark" }}>
                            {num(totals.insurance) > 0 ? formatKGS(totals.insurance) : "-"}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: "warning.main" }}>
                            {formatKGS(totals.debt)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default DjangoReportsPage;
