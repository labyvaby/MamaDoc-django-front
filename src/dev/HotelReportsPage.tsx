/**
 * «Отчёты» — отчёт по отелю за один день: кто заселён, на сколько ночей,
 * сколько заплатит по тарифу номера и сколько номеров было свободно.
 * Реальный бэкенд — GET /hotel/reports/daily/ (см. src/api/hotel.ts),
 * считает бэкенд, не витрина. Выгрузка в .xlsx — реальный файл на диск
 * (exportHotelDailyReportXlsx.ts).
 */
import React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PieChartOutlined from "@mui/icons-material/PieChartOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatHotelDate } from "./mockDemoData";
import { mapStayDisplayStatus, hotelStayStatusColor, HOTEL_STAY_STATUS_LABELS } from "./hotelDisplay";
import { useHotelProperty } from "./useHotelProperty";
import { getDailyReport, type HotelDailyReportRow } from "../api/hotel";
import { exportHotelDailyReportXlsx } from "./exportHotelDailyReportXlsx";
import { HotelStatCard } from "./HotelStatCard";

export const HotelReportsPage: React.FC = () => {
  usePageTitle("Отчёты");
  const theme = useTheme();
  const { property } = useHotelProperty();

  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [exporting, setExporting] = React.useState(false);

  const dateStr = date.format("YYYY-MM-DD");
  const isToday = dateStr === dayjs().format("YYYY-MM-DD");

  const reportQuery = useQuery({
    queryKey: ["hotel", "reports", "daily", property?.id, dateStr],
    queryFn: ({ signal }) => getDailyReport(property!.id, dateStr, signal),
    enabled: property != null,
  });
  const report = reportQuery.data;

  // Выручка занятых номеров за день, сгруппированная по категории — те же строки
  // report.rows, что уже в таблице ниже, без дополнительного запроса.
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
    if (row.occupancy === "blocked") {
      return { label: row.blockReason ? `Блок: ${row.blockReason}` : "Блок", color: theme.palette.warning.main };
    }
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

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Отчёты
        </Typography>

        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton size="small" onClick={() => setDate((d) => d.subtract(1, "day"))}>
            <ChevronLeftOutlined fontSize="small" />
          </IconButton>
          <CustomDatePicker
            label="Дата отчёта"
            value={date}
            onChange={(v) => v && setDate(v)}
            disableFuture
            slotProps={{ textField: { size: "small" } }}
            sx={{ width: 160 }}
          />
          <IconButton size="small" onClick={() => setDate((d) => d.add(1, "day"))} disabled={isToday}>
            <ChevronRightOutlined fontSize="small" />
          </IconButton>
          {!isToday && (
            <Button size="small" onClick={() => setDate(dayjs())}>
              Сегодня
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            startIcon={<FileDownloadOutlined />}
            onClick={() => void handleExport()}
            disabled={exporting || !report}
          >
            {exporting ? "Готовим файл…" : "Скачать .xlsx"}
          </Button>
        </Stack>
      </Stack>

      {!report ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
              gap: 1.5,
              mb: 2.5,
            }}
          >
            <HotelStatCard
              label="Загрузка"
              value={`${report.occupancyPercent}%`}
              hint={`${report.occupiedRooms} занято из ${report.totalRooms}`}
              icon={<PieChartOutlined fontSize="small" />}
              tint="info"
            />
            <HotelStatCard
              label="Свободно номеров"
              value={report.freeRooms}
              icon={<MeetingRoomOutlined fontSize="small" />}
              tint="success"
            />
            <HotelStatCard
              label="Заездов / выездов"
              value={`${report.arrivals} / ${report.departures}`}
              icon={<SwapHorizOutlined fontSize="small" />}
              tint="warning"
            />
            <HotelStatCard
              label="Выручка за ночь"
              value={`${Number(report.revenue).toLocaleString("ru-RU")} ${report.currency}`}
              hint="по тарифам занятых номеров"
              icon={<PaymentsOutlined fontSize="small" />}
              tint="primary"
            />
          </Box>

          {revenueByCategory.length > 0 && (
            <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 2.5 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                Выручка по категориям номеров
              </Typography>
              <Box sx={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByCategory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
                    <YAxis tick={{ fontSize: 12, fill: theme.palette.text.secondary }} width={56} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                        color: theme.palette.text.primary,
                      }}
                      formatter={(value?: number) => [`${(value ?? 0).toLocaleString("ru-RU")} ${report.currency}`, "Выручка"]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={theme.palette.primary.main} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          )}

          <Paper elevation={0} variant="outlined" sx={{ overflow: "hidden" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Номер</TableCell>
                    <TableCell>Категория</TableCell>
                    <TableCell>Гость</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Заезд</TableCell>
                    <TableCell>Выезд</TableCell>
                    <TableCell align="right">Цена/ночь</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.rows.map((row) => {
                    const status = rowStatus(row);
                    return (
                      <TableRow key={row.roomId} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{row.roomNumber}</TableCell>
                        <TableCell>
                          {row.roomTypeName}
                          {row.isLuxury && (
                            <Chip
                              label="Люкс"
                              size="small"
                              sx={{ ml: 1, height: 18, fontSize: "0.65rem", fontWeight: 700 }}
                            />
                          )}
                        </TableCell>
                        <TableCell>{row.guestName || <Typography color="text.disabled">—</Typography>}</TableCell>
                        <TableCell>
                          <Chip
                            label={status.label}
                            size="small"
                            sx={{
                              bgcolor: alpha(status.color, theme.palette.mode === "dark" ? 0.25 : 0.14),
                              color: status.color,
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>{row.checkIn ? formatHotelDate(row.checkIn) : "—"}</TableCell>
                        <TableCell>{row.checkOut ? formatHotelDate(row.checkOut) : "—"}</TableCell>
                        <TableCell align="right">{row.nightPrice ? Number(row.nightPrice).toLocaleString("ru-RU") : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default HotelReportsPage;
