import React from "react";
import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getPayrollReport } from "../../api/payroll";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { num } from "./widgetUtils";

/** Сколько строк показываем: длинный список превращает сводку в отчёт. */
const TOP_SIZE = 5;

/**
 * Кто сколько сделал за месяц — по данным ведомости зарплаты.
 *
 * ⚠ Здесь НЕ «сколько денег принёс сотрудник»: такой метрики в CRM нет.
 * `appointmentsCount` — приёмы, где он исполнитель, `earnings` — что ему
 * начислено. Второе связано с первым, но это разные величины, и подменять
 * одно другим на экране владельца нельзя.
 *
 * ⚠ Поле `paidCount` в этом отчёте бэк НЕ заполняет — приходит 0 у всех строк
 * (проверено на живом API 25.08.2026), хотя `totalCount` и `appointmentsCount`
 * заполнены. Поэтому считаем по приёмам исполнителя.
 *
 * Отчёт месячный по своей природе, поэтому виджет не зависит от выбранного
 * периода и всегда показывает текущий месяц — это написано в подзаголовке.
 */
export const StaffWidget: React.FC<WidgetProps> = ({ range, scope }) => {
  const month = dayjs(range.month + "-01");

  const query = useQuery({
    queryKey: djangoQueryKeys.payroll.report({
      view: "dashboard",
      organizationId: scope.organizationId ?? null,
      branchId: scope.branchId ?? null,
      month: range.month,
    }),
    queryFn: ({ signal }) =>
      getPayrollReport(
        {
          year: month.year(),
          month: month.month() + 1,
          organizationId: scope.organizationId,
          branchId: scope.branchId,
        },
        signal,
      ),
    enabled: scope.orgReady,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const active = React.useMemo(
    () =>
      (query.data?.rows ?? []).filter((r) => r.appointmentsCount > 0 || num(r.earnings) > 0),
    [query.data],
  );

  const rows = React.useMemo(
    () =>
      [...active]
        .sort(
          (a, b) =>
            b.appointmentsCount - a.appointmentsCount || num(b.earnings) - num(a.earnings),
        )
        .slice(0, TOP_SIZE),
    [active],
  );

  const best = rows.reduce((max, r) => Math.max(max, r.appointmentsCount), 0);
  const totalAppointments = active.reduce((acc, r) => acc + r.appointmentsCount, 0);

  return (
    <DashCard
      title="Сотрудники"
      subheader={`${month.format("MMMM")} · топ по приёмам`}
      href="/salary-reports"
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : query.isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" height={28} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          За месяц пока нет приёмов
        </Typography>
      ) : (
        <Stack spacing={0.25}>
          {rows.map((r, i) => (
            <Stack
              key={r.employeeId}
              direction="row"
              alignItems="center"
              spacing={1.25}
              sx={(t) => ({
                px: 1,
                py: 0.75,
                borderRadius: "8px",
                "&:hover": { bgcolor: subtleBg(t) },
              })}
            >
              <Typography
                sx={{
                  width: 16,
                  flexShrink: 0,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: i === 0 ? "primary.onSurface" : "text.disabled",
                  textAlign: "center",
                }}
              >
                {i + 1}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {r.fullName}
                </Typography>
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
                      width: `${best > 0 ? Math.round((r.appointmentsCount / best) * 100) : 0}%`,
                      height: "100%",
                      borderRadius: "4px",
                      bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.8 : 0.6),
                      transition: "width .3s ease",
                    })}
                  />
                </Box>
              </Box>
              <Tooltip
                title={
                  totalAppointments > 0
                    ? `Приёмов исполнителем · ${Math.round((r.appointmentsCount / totalAppointments) * 100)}% от всех`
                    : "Приёмов исполнителем"
                }
                arrow
              >
                <Typography
                  sx={{
                    width: 44,
                    textAlign: "right",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {r.appointmentsCount}
                </Typography>
              </Tooltip>
              <Tooltip title="Начислено за месяц: проценты, часы, надбавки" arrow>
                <Typography
                  variant="caption"
                  sx={{
                    width: 92,
                    textAlign: "right",
                    color: "text.secondary",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  noWrap
                >
                  {formatKGS(num(r.earnings))}
                </Typography>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      )}
    </DashCard>
  );
};

export default StaffWidget;
