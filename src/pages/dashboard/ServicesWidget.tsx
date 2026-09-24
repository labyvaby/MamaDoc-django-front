import React from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";

import { formatKGS } from "../../utility/format";
import { DashCard, WidgetError, type WidgetProps } from "./widgetKit";
import { num, othersOf } from "./widgetUtils";
import { useDashboardData } from "./DashboardData";
import { RankOthers, RankRow, type RankRowData } from "./RankRow";

/** Сколько строк: бэк отдаёт до 10, на сводке хватает половины. */
const TOP_SIZE = 5;

/**
 * «Что продаётся» — топ услуг по выручке за период (`appointments.topServices`
 * агрегата). Выручка — строки услуг полностью оплаченных визитов (цена ×
 * количество − скидка строки); частично оплаченные визиты, закрытые скидкой
 * целиком и отменённые строки не входят (ответ бэка 24.09.2026).
 *
 * Под топом — «прочие»: остаток от `topServicesTotal` (вся выручка периода).
 */
export const ServicesWidget: React.FC<WidgetProps> = ({ range }) => {
  const data = useDashboardData();
  const top = data.sections.appointments?.topServices;
  const others = othersOf(
    data.sections.appointments?.topServicesTotal,
    (top ?? []).slice(0, TOP_SIZE),
  );
  const loading = data.isLoading("appointments");
  const error = data.error("appointments");

  const rows = React.useMemo<RankRowData[]>(
    () =>
      (top ?? []).slice(0, TOP_SIZE).map((s) => ({
        id: s.serviceId,
        name: s.serviceName,
        weight: num(s.amount),
        main: formatKGS(num(s.amount)),
        mainTitle: `Выручка оплаченных визитов · ${Math.round(num(s.share))}% от всей`,
        side: String(s.count),
        sideTitle: "Оплаченных визитов с этой услугой",
      })),
    [top],
  );
  const best = rows.reduce((max, r) => Math.max(max, r.weight), 0);

  return (
    <DashCard
      title="Что продаётся"
      subheader={`${range.label} · по выручке`}
      href="/reports"
      linkLabel="Отчёты"
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
          За период нет оплаченных визитов
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
            <Box sx={{ width: 44, textAlign: "right" }}>визитов</Box>
            <Box sx={{ width: 100, textAlign: "right" }}>выручка</Box>
          </Stack>
          {rows.map((r, i) => (
            <RankRow key={r.id} row={r} index={i} best={best} />
          ))}
          {others && <RankOthers {...others} label="прочие услуги" />}
        </Stack>
      )}
    </DashCard>
  );
};

export default ServicesWidget;
