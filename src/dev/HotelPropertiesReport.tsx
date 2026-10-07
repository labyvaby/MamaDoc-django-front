/**
 * «Сравнение объектов» (r4 §16): загрузка, выручка, ADR и RevPAR всех объектов
 * организации рядом — по тем же правилам, что «Собственнику» (ночи, которые
 * гости прожили). Итоги — отдельно по каждой валюте: деньги разных валют не
 * складываются. Сервер считает «по» исключительно — к выбранной дате +1 день.
 */
import React from "react";
import { Alert, Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getPropertyComparison, type HotelPropertyComparisonRow } from "../api/hotel";
import { fmtInt, fmtMoney } from "./hotelReportFormat";
import { ReportControls, ReportEmpty, ReportSection, ReportSkeleton, type ReportNav } from "./hotelReportUi";
import { useHotelTableSx } from "./hotelUi";
import { formatHotelDateRange } from "./mockDemoData";
import { ReportPeriodPicker } from "./ReportPeriodPicker";

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

/**
 * Незаезды строки: закрытые (noShows — ночной аудит или ресепшен; у старого сервера поля
 * нет, они внутри «Отмен») плюс ещё не закрытые (notArrived). Раньше колонка показывала
 * только не закрытые — после ночного аудита незаезды из отчёта пропадали.
 */
const noShowCount = (r: { noShows?: number; notArrived: number }) => (r.noShows ?? 0) + r.notArrived;
const noShowMoney = (r: { noShowRevenue?: string; notArrivedRevenue: string }) => Number(r.noShowRevenue ?? 0) + Number(r.notArrivedRevenue);

type Row = Omit<HotelPropertyComparisonRow, "propertyId" | "propertyName"> & { key: string; name: string; total?: boolean };

const OccupancyBar: React.FC<{ percent: number }> = ({ percent }) => {
  const theme = useTheme();
  return (
    <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 120 }}>
      <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.12), overflow: "hidden" }}>
        <Box sx={{ width: `${Math.min(100, percent)}%`, height: "100%", bgcolor: "primary.main" }} />
      </Box>
      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", width: 52, textAlign: "right" }}>
        {percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
      </Typography>
    </Stack>
  );
};

export const HotelPropertiesReport: React.FC<{ nav: ReportNav }> = ({ nav }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const tableSx = useHotelTableSx();
  const today = dayjs();
  const from = nav.param("from") ?? D(today.startOf("month"));
  const to = nav.param("to") ?? D(today);
  const query = useQuery({
    queryKey: ["hotel", "reports", "properties", from, to],
    queryFn: ({ signal }) => getPropertyComparison({ from, to: D(dayjs(to).add(1, "day")) }, signal),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const rows: Row[] = data
    ? [
        ...[...data.results].sort((a, b) => Number(b.roomRevenue) - Number(a.roomRevenue)).map((r) => ({ ...r, key: `p${r.propertyId}`, name: r.propertyName })),
        ...(data.results.length > 1 ? data.totals.map((t) => ({ ...t, key: `t${t.currency}`, name: data.totals.length > 1 ? `Итого, ${t.currency}` : "Итого", total: true })) : []),
      ]
    : [];

  return (
    <Stack gap={2.5}>
      <ReportControls nav={nav} summary={formatHotelDateRange(from, to)}>
        <ReportPeriodPicker from={from} to={to} onChange={(f, t) => nav.setParams({ from: f, to: t })} />
      </ReportControls>

      {query.isError ? (
        <Alert severity="error" variant="outlined">
          Не удалось загрузить сравнение объектов
        </Alert>
      ) : !data ? (
        <ReportSkeleton kpis={0} block={260} />
      ) : data.results.length === 0 ? (
        <ReportEmpty>Нет объектов, доступных вам.</ReportEmpty>
      ) : (
        <ReportSection
          title="Объекты рядом"
          subtitle="Считаются ночи, которые гости прожили; незаезды — отдельно. Сверху — у кого больше выручка."
          padded={false}
        >
          {phone ? (
            rows.map((r, i) => (
              <Box key={r.key} sx={{ px: 2, py: 1.5, borderTop: i > 0 ? 1 : 0, borderColor: "divider", bgcolor: r.total ? alpha(theme.palette.primary.main, 0.04) : undefined }}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1.5}>
                  <Typography variant="body2" fontWeight={700}>
                    {r.name}
                  </Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(r.roomRevenue, r.currency)}
                  </Typography>
                </Stack>
                <Box sx={{ mt: 0.75 }}>
                  <OccupancyBar percent={Number(r.occupancyPercent)} />
                </Box>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  ADR {fmtMoney(r.adr, r.currency)} · RevPAR {fmtMoney(r.revpar, r.currency)} · {fmtInt(r.soldRoomNights)} из {fmtInt(r.availableRoomNights)} ночей
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  заездов {fmtInt(r.arrivals)} · отмен {fmtInt(r.cancellations)}
                  {noShowCount(r) > 0 ? ` · незаездов ${fmtInt(noShowCount(r))} на ${fmtMoney(noShowMoney(r), r.currency)}` : ""}
                </Typography>
              </Box>
            ))
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 2.5 }}>Объект</TableCell>
                    <TableCell>Загрузка</TableCell>
                    <TableCell align="right">Ночей продано</TableCell>
                    <TableCell align="right">Выручка</TableCell>
                    <TableCell align="right">ADR</TableCell>
                    <TableCell align="right">RevPAR</TableCell>
                    <TableCell align="right">Заезды</TableCell>
                    <TableCell align="right">Отмены</TableCell>
                    <TableCell align="right" sx={{ pr: 2.5 }} title="Не приехавшие гости с заездом в периоде: закрытые ночным аудитом или ресепшеном и ещё не закрытые. В выручку и загрузку не входят.">
                      Незаезды
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} sx={r.total ? { bgcolor: alpha(theme.palette.primary.main, 0.04), "& td": { fontWeight: 700 } } : undefined}>
                      <TableCell sx={{ pl: 2.5, fontWeight: 600, whiteSpace: "nowrap" }}>{r.name}</TableCell>
                      <TableCell>
                        <OccupancyBar percent={Number(r.occupancyPercent)} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {fmtInt(r.soldRoomNights)}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {" "}
                          из {fmtInt(r.availableRoomNights)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: 700 }}>
                        {fmtMoney(r.roomRevenue, r.currency)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {fmtMoney(r.adr, r.currency)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {fmtMoney(r.revpar, r.currency)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtInt(r.arrivals)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtInt(r.cancellations)}
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 2.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: noShowCount(r) > 0 ? "warning.main" : "text.disabled" }}>
                        {noShowCount(r) > 0 ? `${fmtInt(noShowCount(r))} · ${fmtMoney(noShowMoney(r), r.currency)}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </ReportSection>
      )}
    </Stack>
  );
};

export default HotelPropertiesReport;
