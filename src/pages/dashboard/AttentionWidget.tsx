import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import ErrorOutlineOutlined from "@mui/icons-material/ErrorOutlineOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import LightbulbOutlined from "@mui/icons-material/LightbulbOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import { DEALS_MODULE_ENABLED } from "../../api/deals";
import { PAGE_PERMISSIONS } from "../../config/accessPermissions";
import { useCanChecker } from "../../hooks/useCan";
import { subtleBg } from "../../theme/uiHelpers";
import { DashCard, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";
import { resolvePeriod } from "./period";
import { buildAttentionItems, type AttentionSeverity } from "./attention";
import {
  availabilityTodayQuery,
  cashboxSummaryQuery,
  dealsSummaryQuery,
  monthlyReportQuery,
  pendingBookingsQuery,
  reviewStatsQuery,
  tasksSummaryQuery,
} from "./queries";

const SEVERITY_VIEW: Record<
  AttentionSeverity,
  { color: "error" | "warning" | "info"; icon: React.ReactNode; label: string }
> = {
  critical: { color: "error", icon: <ErrorOutlineOutlined />, label: "Срочно" },
  warning: { color: "warning", icon: <WarningAmberOutlined />, label: "Сегодня" },
  info: { color: "info", icon: <LightbulbOutlined />, label: "Возможность" },
};

/** Сколько строк без прокрутки: длинный список — это уже не «внимание», а шум. */
const MAX_ROWS = 7;

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

  const urgent = items.filter((i) => i.severity !== "info").length;
  const shown = items.slice(0, MAX_ROWS);

  return (
    <DashCard
      title="Требует внимания"
      subheader={
        items.length > 0 ? (urgent > 0 ? `${urgent} к решению` : "только возможности") : undefined
      }
    >
      {items.length === 0 && loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={40} sx={{ borderRadius: "10px" }} />
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
          <Typography sx={{ fontWeight: 600, color: "text.primary" }}>
            Всё под контролем
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", px: 2 }}>
            Просрочек, заявок без ответа и минуса в кассе нет
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={0.5}>
          {shown.map((item) => {
            const view = SEVERITY_VIEW[item.severity];
            return (
              <Box
                key={item.id}
                component={RouterLink}
                to={item.href}
                sx={(t) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  px: 1,
                  py: 0.875,
                  borderRadius: "10px",
                  color: "inherit",
                  textDecoration: "none",
                  transition: "background-color .15s ease",
                  bgcolor:
                    item.severity === "critical"
                      ? alpha(t.palette.error.main, t.palette.mode === "dark" ? 0.1 : 0.05)
                      : "transparent",
                  "&:hover": { bgcolor: subtleBg(t, true) },
                  "&:hover .attention-go": { opacity: 1 },
                })}
              >
                <Box
                  title={view.label}
                  sx={(t) => ({
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: "7px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: `${view.color}.main`,
                    bgcolor: alpha(
                      t.palette[view.color].main,
                      t.palette.mode === "dark" ? 0.18 : 0.12,
                    ),
                    "& .MuiSvgIcon-root": { fontSize: 16 },
                  })}
                >
                  {view.icon}
                </Box>
                <Typography variant="body2" sx={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                      color: item.severity === "info" ? "text.primary" : `${view.color}.main`,
                      mr: 0.5,
                    }}
                  >
                    {item.value}
                  </Box>
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {item.text}
                  </Box>
                </Typography>
                <ChevronRightOutlined
                  className="attention-go"
                  sx={{
                    fontSize: 18,
                    color: "text.secondary",
                    opacity: 0.35,
                    transition: "opacity .15s ease",
                  }}
                />
              </Box>
            );
          })}
          {items.length > MAX_ROWS && (
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1, pt: 0.5 }}>
              и ещё {items.length - MAX_ROWS}
            </Typography>
          )}
        </Stack>
      )}
    </DashCard>
  );
};

export default AttentionWidget;
