import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { DEALS_MODULE_ENABLED } from "../../api/deals";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { DashCard, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";
import { resolvePeriod } from "./period";
import { ATTENTION_GROUPS, buildAttentionItems, type AttentionSeverity } from "./attention";
import {
  availabilityTodayQuery,
  cashboxSummaryQuery,
  dealsSummaryQuery,
  monthlyReportQuery,
  pendingBookingsQuery,
  reviewStatsQuery,
  tasksSummaryQuery,
} from "./queries";

/**
 * Цвет группы как ТЕКСТ — `onSurface` из темы: тот же статус, но с
 * гарантированным контрастом на карточке в обеих темах (мелкий капс в основном
 * тоне на светлом фоне читался бы плохо).
 */
const groupInk = (t: Theme, severity: AttentionSeverity): string =>
  severity === "urgent"
    ? t.palette.error.onSurface
    : severity === "today"
      ? t.palette.warning.onSurface
      : t.palette.primary.onSurface;

/** Сколько строк без прокрутки: длинный список — это уже не «внимание», а шум. */
const MAX_ROWS = 8;

/**
 * «Требует внимания» — одна лента того, что владелец должен решить сегодня,
 * собранная из всех разделов: брони, касса, задачи, отзывы, отчёт, воронка,
 * загрузка. Вместо того чтобы обходить десять плиток и самому искать красные,
 * он читает готовый список, отсортированный по срочности, и кликает в раздел.
 *
 * Правила «что считать проблемой» — в `attention.ts` (с тестами). Раздел без
 * прав или ещё не загруженный молчит, а не рисует ложный ноль.
 */
export const AttentionWidget: React.FC<WidgetProps> = ({ range, scope }) => {
  const { can } = useCanChecker();
  const canBookings = can(PAGE_PERMISSIONS.bookings);
  const canTasks = can(PAGE_PERMISSIONS.tasks);
  const canDeals = DEALS_MODULE_ENABLED && can(PAGE_PERMISSIONS.deals);
  const canReviews = can(PAGE_PERMISSIONS.reviews);
  const canCash = can(PAGE_PERMISSIONS.cashbox);
  const canReports = can(PAGE_PERMISSIONS.reports);
  const canSchedule = can(PAGE_PERMISSIONS.schedule);

  const month = React.useMemo(() => resolvePeriod("month").month, []);

  const pending = useQuery(pendingBookingsQuery(scope, "pending", canBookings));
  const overdue = useQuery(pendingBookingsQuery(scope, "overdue", canBookings));
  const tasks = useQuery(tasksSummaryQuery(scope, canTasks));
  const deals = useQuery(dealsSummaryQuery(scope, canDeals));
  const reviews = useQuery(reviewStatsQuery(scope, range, canReviews));
  const cash = useQuery(cashboxSummaryQuery(scope, range, canCash));
  const report = useQuery(monthlyReportQuery(scope, month, canReports));
  const availability = useQuery(availabilityTodayQuery(scope, canSchedule));

  const all = [pending, overdue, tasks, deals, reviews, cash, report, availability];
  // Пока грузится хоть что-то из разрешённого и лента пуста — скелет, а не
  // преждевременное «всё под контролем».
  const loading = all.some((q) => q.isLoading);

  const items = React.useMemo(
    () =>
      buildAttentionItems({
        periodLabel: range.label,
        bookings:
          pending.data && overdue.data
            ? { pending: pending.data.count ?? 0, overdue: overdue.data.count ?? 0 }
            : undefined,
        tasks: tasks.data
          ? { overdue: tasks.data.overdue, awaitingApproval: tasks.data.awaitingApproval }
          : undefined,
        deals: deals.data
          ? {
              overdueActions: deals.data.overdueActionsCount,
              todayActions: deals.data.todayActionsCount,
            }
          : undefined,
        reviews: reviews.data ? { negative: reviews.data.negativeCount } : undefined,
        cash: cash.data
          ? {
              netCashFlow: num(cash.data.netCashFlow),
              grossIncome: num(cash.data.grossIncome),
              refundedTotal: num(cash.data.refundedTotal),
              refundCount: cash.data.refundCount,
            }
          : undefined,
        month: report.data
          ? {
              waitingCount: report.data.summary?.waitingCount ?? 0,
              debtSum: (report.data.daily ?? []).reduce((acc, d) => acc + num(d.debtSum), 0),
            }
          : undefined,
        staff: availability.data
          ? {
              total: availability.data.overallEmployeeCount,
              free: availability.data.overallFreeEmployeeCount,
            }
          : undefined,
      }),
    [
      range.label,
      pending.data,
      overdue.data,
      tasks.data,
      deals.data,
      reviews.data,
      cash.data,
      report.data,
      availability.data,
    ],
  );

  const toDecide = items.filter((i) => i.severity !== "opportunity").length;
  // Лимит строк — на весь блок, а не на группу: срочное идёт первым и не
  // вытесняется возможностями.
  const shown = items.slice(0, MAX_ROWS);
  const groups = ATTENTION_GROUPS.map((g) => ({
    ...g,
    items: shown.filter((i) => i.severity === g.severity),
    total: items.filter((i) => i.severity === g.severity).length,
  })).filter((g) => g.items.length > 0);

  return (
    <DashCard
      title="Требует внимания"
      subheader={
        items.length > 0
          ? toDecide > 0
            ? `${toDecide} к решению`
            : "только возможности"
          : undefined
      }
    >
      {items.length === 0 && loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={36} sx={{ borderRadius: "9px" }} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <Stack
          alignItems="center"
          justifyContent="center"
          spacing={0.75}
          sx={(t) => ({
            py: 3,
            height: "100%",
            borderRadius: "10px",
            bgcolor: alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.1 : 0.06),
            color: "success.main",
            textAlign: "center",
          })}
        >
          <TaskAltOutlined />
          <Typography sx={{ fontWeight: 600, color: "text.primary" }}>Всё под контролем</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", px: 2 }}>
            Просрочек, заявок без ответа и минуса в кассе нет
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={1.5} sx={{ mx: -0.75 }}>
          {groups.map((g) => (
            <Box key={g.severity}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={(t) => ({
                  px: 1,
                  pb: 0.5,
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: groupInk(t, g.severity),
                })}
              >
                <Box
                  sx={(t) => ({
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: groupInk(t, g.severity),
                  })}
                />
                <span>{g.label}</span>
                <Box component="span" sx={{ color: "text.disabled" }}>
                  {g.total}
                </Box>
              </Stack>
              {g.items.map((item) => (
                <Box
                  key={item.id}
                  component={RouterLink}
                  to={item.href}
                  sx={(t) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    p: 1,
                    borderRadius: "9px",
                    color: "inherit",
                    textDecoration: "none",
                    transition: "background-color .15s ease",
                    "&:hover": {
                      bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06),
                    },
                  })}
                >
                  <Typography
                    sx={(t) => ({
                      minWidth: 44,
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      color:
                        item.severity === "opportunity"
                          ? "text.primary"
                          : groupInk(t, item.severity),
                    })}
                  >
                    {item.value}
                  </Typography>
                  <Typography
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: "0.8125rem",
                      lineHeight: 1.35,
                      color: "text.secondary",
                    }}
                  >
                    {item.text}
                  </Typography>
                  <ChevronRightOutlined sx={{ fontSize: 18, color: "text.disabled" }} />
                </Box>
              ))}
            </Box>
          ))}
          {items.length > MAX_ROWS && (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
              и ещё {items.length - MAX_ROWS}
            </Typography>
          )}
        </Stack>
      )}
    </DashCard>
  );
};

export default AttentionWidget;
