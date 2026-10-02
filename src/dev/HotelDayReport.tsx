/**
 * «Номера за день» — кто заселён на дату, по какой цене ночи и сколько
 * номеров свободно (GET /hotel/reports/daily/, считает бэкенд), выручка
 * занятых номеров по категориям и выгрузка в .xlsx
 * (exportHotelDailyReportXlsx.ts). Дата — из адреса (?date=), поэтому сюда
 * ведёт клик по дню на графике «Собственнику».
 */
import React from "react";
import { Box, Button, CircularProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { getDailyReport, type HotelDailyReportRow } from "../api/hotel";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { exportHotelDailyReportXlsx } from "./exportHotelDailyReportXlsx";
import { formatSellableSummary, HOTEL_OFF_SALE_LABEL, HOTEL_STAY_STATUS_LABELS, hotelStayStatusColor, mapStayDisplayStatus } from "./hotelDisplay";
import { fmtMoney } from "./hotelReportFormat";
import { ReportKpi, ReportLink, type ReportNav } from "./hotelReportUi";
import { DateStepper, SectionLabel, StatusPill, Surface, useHotelTableSx } from "./hotelUi";
import { formatHotelDateRange } from "./mockDemoData";

export const HotelDayReport: React.FC<{ propertyId: number; nav: ReportNav }> = ({ propertyId, nav }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const date = nav.param("date") ?? dayjs().format("YYYY-MM-DD");
  const [exporting, setExporting] = React.useState(false);

  const reportQuery = useQuery({
    queryKey: ["hotel", "reports", "daily", propertyId, date],
    queryFn: ({ signal }) => getDailyReport(propertyId, date, signal),
  });
  const report = reportQuery.data?.date === date ? reportQuery.data : undefined;

  const revenueByCategory = React.useMemo(() => {
    if (!report) return [];
    const map = new Map<string, number>();
    for (const row of report.rows) {
      if (row.occupancy !== "occupied" || !row.nightPrice) continue;
      map.set(row.roomTypeName, (map.get(row.roomTypeName) ?? 0) + Number(row.nightPrice));
    }
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [report]);

  const rowStatus = (row: HotelDailyReportRow) => {
    if (row.occupancy === "occupied" && row.stayStatus) {
      const status = mapStayDisplayStatus(row.stayStatus);
      return { label: HOTEL_STAY_STATUS_LABELS[status], color: hotelStayStatusColor(status, theme) };
    }
    if (row.occupancy === "blocked") return { label: HOTEL_OFF_SALE_LABEL, color: theme.palette.text.disabled };
    return { label: "Свободен", color: theme.palette.text.disabled };
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportHotelDailyReportXlsx(report);
    } finally {
      setExporting(false);
    }
  };

  const tooltipStyle = {
    borderRadius: 10,
    border: `1px solid ${subtleBorder(theme)}`,
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    fontSize: 13,
  };
  const axisTick = { fontSize: 12, fill: theme.palette.text.secondary };

  return (
    <Stack gap={2.5}>
      <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
        <DateStepper value={dayjs(date)} onChange={(d) => nav.setParams({ date: d.format("YYYY-MM-DD") })} />
        <Box sx={{ flex: 1 }} />
        <ReportLink label="Балансы заездов дня" onClick={() => nav.go("balances", { from: date, to: date })} />
        <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={() => void handleExport()} disabled={exporting || !report}>
          {exporting ? "Готовим…" : "Excel"}
        </Button>
      </Stack>

      {!report ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <ReportKpi
              tone="info"
              label="Загрузка"
              value={`${Number(report.occupancyPercent).toLocaleString("ru-RU")}%`}
              hint={`занято ${formatSellableSummary(report.occupiedRooms, report.totalRooms, report.blockedRooms)}`}
            />
            <ReportKpi tone="success" label="Свободно" value={report.freeRooms} hint="номеров в продаже" />
            <ReportKpi label="Заезды / выезды" value={`${report.arrivals} / ${report.departures}`} hint="за день" />
            <ReportKpi label="Выручка за ночь" value={fmtMoney(report.revenue, report.currency)} hint="по ценам занятых номеров" />
          </Box>

          {revenueByCategory.length > 0 && (
            <Surface>
              <SectionLabel>Выручка по категориям</SectionLabel>
              <Box sx={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByCategory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={subtleBorder(theme)} />
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} width={56} allowDecimals={false} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      cursor={{ fill: subtleBg(theme, true) }}
                      contentStyle={tooltipStyle}
                      formatter={(value?: number) => [fmtMoney(value ?? 0, report.currency), "Выручка"]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={theme.palette.primary.main} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Surface>
          )}

          <Box>
            <SectionLabel>Номера</SectionLabel>
            <Surface padded={false} sx={{ overflow: "hidden" }}>
              <Box sx={{ overflowX: "auto" }}>
                <Table sx={tableSx}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5 }}>Номер</TableCell>
                      <TableCell>Категория</TableCell>
                      <TableCell>Гость</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell>Даты</TableCell>
                      <TableCell align="right" sx={{ pr: 2.5 }}>
                        Цена / ночь
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.rows.map((row) => {
                      const status = rowStatus(row);
                      return (
                        <TableRow
                          key={row.roomId}
                          hover={row.reservationId != null}
                          onClick={row.reservationId != null ? () => nav.openReservation(row.reservationId as number) : undefined}
                          sx={{ cursor: row.reservationId != null ? "pointer" : "default" }}
                        >
                          <TableCell sx={{ pl: 2.5 }}>
                            <Typography sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.roomNumber}</Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" alignItems="center" gap={1}>
                              <Typography variant="body2">{row.roomTypeName}</Typography>
                              {row.isLuxury && (
                                <Box
                                  component="span"
                                  sx={{
                                    px: 0.75,
                                    borderRadius: "5px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    bgcolor: alpha("#d4af37", 0.16),
                                    color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a",
                                  }}
                                >
                                  Люкс
                                </Box>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {row.guestName ? (
                              <Typography variant="body2" fontWeight={600}>
                                {row.guestName}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.disabled">
                                —
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusPill color={status.color} label={status.label} />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap", color: row.checkIn ? "text.primary" : "text.disabled" }}>
                            {row.checkIn && row.checkOut ? formatHotelDateRange(row.checkIn, row.checkOut) : "—"}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ pr: 2.5, fontVariantNumeric: "tabular-nums", fontWeight: row.nightPrice ? 600 : 400, color: row.nightPrice ? "text.primary" : "text.disabled" }}
                          >
                            {row.nightPrice ? Number(row.nightPrice).toLocaleString("ru-RU") : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Surface>
          </Box>
        </>
      )}
    </Stack>
  );
};

export default HotelDayReport;
