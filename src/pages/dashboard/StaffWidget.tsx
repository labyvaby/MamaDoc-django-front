import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { AppCard } from "../../components/ui";
import { getPayrollReport } from "../../api/payroll";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { WidgetError, type WidgetProps } from "./widgetKit";
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
 * заполнены. Поэтому считаем по приёмам исполнителя: сортировка по `paidCount`
 * дала бы случайный порядок и пустые полосы.
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

  const rows = React.useMemo(() => {
    const all = query.data?.rows ?? [];
    return [...all]
      .filter((r) => r.appointmentsCount > 0 || num(r.earnings) > 0)
      .sort(
        (a, b) =>
          b.appointmentsCount - a.appointmentsCount || num(b.earnings) - num(a.earnings),
      )
      .slice(0, TOP_SIZE);
  }, [query.data]);

  const best = rows.reduce((max, r) => Math.max(max, r.appointmentsCount), 0);

  return (
    <AppCard
      variant="outlined"
      elevation={0}
      title="Сотрудники"
      subheader={`${month.format("MMMM YYYY")} · по приёмам исполнителя`}
    >
      {query.isError ? (
        <WidgetError error={query.error} />
      ) : rows.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {query.isLoading ? "Загружаем…" : "За месяц пока нет приёмов"}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {rows.map((r) => (
            <Box
              key={r.employeeId}
              sx={(t) => ({
                p: 1.25,
                borderRadius: "10px",
                border: 1,
                borderColor: "divider",
                bgcolor: subtleBg(t),
              })}
            >
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
                <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                  {r.fullName}
                </Typography>
                <Tooltip title="Приёмы, где сотрудник указан исполнителем" arrow>
                  <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {r.appointmentsCount}
                  </Typography>
                </Tooltip>
                <Tooltip title="Начислено за месяц: проценты, часы, надбавки" arrow>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {formatKGS(num(r.earnings))}
                  </Typography>
                </Tooltip>
              </Stack>
              <Box
                sx={(t) => ({
                  height: 5,
                  borderRadius: "6px",
                  bgcolor: subtleBg(t, true),
                  overflow: "hidden",
                })}
              >
                <Box
                  sx={(t) => ({
                    width: `${best > 0 ? Math.round((r.appointmentsCount / best) * 100) : 0}%`,
                    height: "100%",
                    bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.8 : 0.55),
                    transition: "width .3s ease",
                  })}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </AppCard>
  );
};

export default StaffWidget;
