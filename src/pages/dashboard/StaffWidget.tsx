import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";

import { formatKGS } from "../../utility/format";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { num, othersOf } from "./widgetUtils";
import { useDashboardData } from "./DashboardData";
import { RankOthers, RankRow, type RankRowData } from "./RankRow";

/** Сколько строк показываем: длинный список превращает сводку в отчёт. */
const TOP_SIZE = 5;

/**
 * Кто приносит деньги — топ сотрудников по выручке за период (`staff.topByRevenue`
 * агрегата, нужен finance.view). Выручка — сумма строк услуг полностью
 * оплаченных визитов (цена × количество − скидка строки); частично оплаченные
 * и закрытые скидкой целиком не входят (ответ бэка 24.09.2026).
 *
 * Без выручки (нет finance.view — сервер не отдаёт topByRevenue) — как раньше,
 * по ведомости зарплаты за месяц: приёмы исполнителем и начислено.
 *
 * ⚠ Выручка и «начислено» (`payroll.earnings`) — разные величины, бэк развёл
 * их по разным полям; подменять одно другим на экране владельца нельзя.
 */
export const StaffWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const staff = data.sections.staff;
  const loading = data.isLoading("staff");
  const error = data.error("staff");

  const byRevenue = staff?.topByRevenue;
  const others = byRevenue
    ? othersOf(staff?.topByRevenueTotal, byRevenue.slice(0, TOP_SIZE))
    : null;
  const payroll = staff?.payroll;

  const rows = React.useMemo<RankRowData[]>(() => {
    if (byRevenue) {
      return byRevenue.slice(0, TOP_SIZE).map((r) => ({
        id: r.employeeId,
        name: r.employeeName,
        weight: num(r.amount),
        main: formatKGS(num(r.amount)),
        mainTitle: `Выручка оплаченных визитов · ${Math.round(num(r.share))}% от всей`,
        side: String(r.count),
        sideTitle: "Оплаченных визитов с участием сотрудника",
      }));
    }
    return (payroll?.rows ?? [])
      .filter((r) => r.appointmentsCount > 0 || num(r.earnings) > 0)
      .sort((a, b) => b.appointmentsCount - a.appointmentsCount || num(b.earnings) - num(a.earnings))
      .slice(0, TOP_SIZE)
      .map((r) => ({
        id: r.employeeId,
        name: r.fullName,
        weight: r.appointmentsCount,
        main: formatKGS(num(r.earnings)),
        mainTitle: "Начислено за месяц: проценты, часы, надбавки",
        side: String(r.appointmentsCount),
        sideTitle: "Приёмов исполнителем",
      }));
  }, [byRevenue, payroll]);

  const best = rows.reduce((max, r) => Math.max(max, r.weight), 0);
  const payrollMonth = payroll
    ? dayjs(`${payroll.year}-${String(payroll.month).padStart(2, "0")}-01`)
    : dayjs(range.dateTo);

  return (
    <DashCard
      title="Сотрудники"
      subheader={
        byRevenue
          ? `${range.label} · по выручке`
          : `${payrollMonth.format("MMMM")} · по приёмам`
      }
      href="/salary-reports"
      linkLabel="Зарплата"
    >
      {error ? (
        <WidgetError error={error} />
      ) : loading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" height={28} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {byRevenue ? "За период нет оплаченных визитов" : "За месяц пока нет приёмов"}
        </Typography>
      ) : (
        <Stack spacing={0.25} sx={{ mx: -1 }}>
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ px: 1, fontSize: "0.6875rem", color: "text.secondary" }}
          >
            <Box sx={{ width: 16 }} />
            <Box sx={{ flex: 1 }} />
            <Box sx={{ width: 44, textAlign: "right" }}>{byRevenue ? "визитов" : "приёмы"}</Box>
            <Box sx={{ width: 100, textAlign: "right" }}>{byRevenue ? "выручка" : "начислено"}</Box>
          </Stack>
          {rows.map((r, i) => (
            <RankRow key={r.id} row={r} index={i} best={best} />
          ))}
          {others && <RankOthers {...others} label="остальные сотрудники" />}
        </Stack>
      )}
    </DashCard>
  );
};

export default StaffWidget;
