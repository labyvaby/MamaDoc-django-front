/**
 * «Отчёты» — два режима переключателем сверху. «День» — кто заселён, на
 * сколько ночей, сколько заплатит по тарифу номера и сколько номеров было
 * свободно (реальный бэкенд GET /hotel/reports/daily/, считает бэкенд, не
 * витрина; выгрузка в .xlsx — exportHotelDailyReportXlsx.ts). «Период» — ADR/
 * RevPAR/загрузка/выручка за произвольный диапазон дат и разбивка по
 * источникам брони (GET /hotel/reports/occupancy/, getOccupancyReport в
 * src/api/hotel.ts) — тот же эндпоинт, что уже отдаёт adr/revpar/bySource,
 * просто раньше ничего его не вызывало.
 */
import React from "react";
import {
  Alert,
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
  ToggleButton,
  ToggleButtonGroup,
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
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatHotelDate } from "./mockDemoData";
import { mapStayDisplayStatus, hotelStayStatusColor, HOTEL_STAY_STATUS_LABELS } from "./hotelDisplay";
import { useHotelProperty } from "./useHotelProperty";
import { getDailyReport, getOccupancyReport, type HotelDailyReportRow } from "../api/hotel";
import { exportHotelDailyReportXlsx } from "./exportHotelDailyReportXlsx";
import { HotelStatCard } from "./HotelStatCard";

type ReportMode = "day" | "period";

const SOURCE_LABELS: Record<string, string> = {
  direct: "Напрямую",
  phone: "Телефон",
  walk_in: "С улицы",
  website: "Сайт",
  booking_com: "Booking.com",
  ostrovok: "Островок",
  channex: "Channex (каналы)",
  agency: "Агентство",
  corporate: "Юрлицо",
  other: "Другое",
};

const sourceLabel = (key: string) => SOURCE_LABELS[key] ?? key;

export const HotelReportsPage: React.FC = () => {
  usePageTitle("Отчёты");
  const theme = useTheme();
  const { property } = useHotelProperty();

  const [mode, setMode] = React.useState<ReportMode>("day");
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [exporting, setExporting] = React.useState(false);

  const dateStr = date.format("YYYY-MM-DD");
  const isToday = dateStr === dayjs().format("YYYY-MM-DD");

  const reportQuery = useQuery({
    queryKey: ["hotel", "reports", "daily", property?.id, dateStr],
    queryFn: ({ signal }) => getDailyReport(property!.id, dateStr, signal),
    enabled: property != null && mode === "day",
  });
  const report = reportQuery.data;

  // Период отчёта ADR/RevPAR — по умолчанию текущий месяц с начала до сегодня.
  const [periodFrom, setPeriodFrom] = React.useState<Dayjs>(dayjs().startOf("month"));
  const [periodTo, setPeriodTo] = React.useState<Dayjs>(dayjs());
  const periodFromStr = periodFrom.format("YYYY-MM-DD");
  const periodToStr = periodTo.format("YYYY-MM-DD");

  const occupancyQuery = useQuery({
    queryKey: ["hotel", "reports", "occupancy", property?.id, periodFromStr, periodToStr],
    queryFn: ({ signal }) => getOccupancyReport(property!.id, periodFromStr, periodToStr, signal),
    enabled: property != null && mode === "period" && !periodTo.isBefore(periodFrom),
  });
  const occupancy = occupancyQuery.data;

  const bySourceRows = React.useMemo(() => {
    if (!occupancy) return [];
    return Object.entries(occupancy.bySource)
      .map(([source, count]) => ({ name: sourceLabel(source), value: count }))
      .sort((a, b) => b.value - a.value);
  }, [occupancy]);

  const applyPreset = (preset: "thisMonth" | "last30" | "lastMonth") => {
    if (preset === "thisMonth") {
      setPeriodFrom(dayjs().startOf("month"));
      setPeriodTo(dayjs());
    } else if (preset === "last30") {
      setPeriodFrom(dayjs().subtract(29, "day"));
      setPeriodTo(dayjs());
    } else {
      setPeriodFrom(dayjs().subtract(1, "month").startOf("month"));
      setPeriodTo(dayjs().subtract(1, "month").endOf("month"));
    }
  };

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
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography variant="h6" fontWeight={700}>
            Отчёты
          </Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            size="small"
            onChange={(_, v: ReportMode | null) => v && setMode(v)}
          >
            <ToggleButton value="day">День</ToggleButton>
            <ToggleButton value="period">Период (ADR/RevPAR)</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {mode === "day" ? (
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
        ) : (
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <CustomDatePicker
              label="С"
              value={periodFrom}
              onChange={(v) => v && setPeriodFrom(v)}
              disableFuture
              slotProps={{ textField: { size: "small" } }}
              sx={{ width: 150 }}
            />
            <CustomDatePicker
              label="По"
              value={periodTo}
              onChange={(v) => v && setPeriodTo(v)}
              disableFuture
              minDate={periodFrom}
              slotProps={{ textField: { size: "small" } }}
              sx={{ width: 150 }}
            />
            <Button size="small" onClick={() => applyPreset("thisMonth")}>
              Этот месяц
            </Button>
            <Button size="small" onClick={() => applyPreset("lastMonth")}>
              Прошлый месяц
            </Button>
            <Button size="small" onClick={() => applyPreset("last30")}>
              30 дней
            </Button>
          </Stack>
        )}
      </Stack>

      {mode === "period" ? (
        periodTo.isBefore(periodFrom) ? (
          <Alert severity="warning" variant="outlined">
            Дата «По» раньше даты «С»
          </Alert>
        ) : !occupancy ? (
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
                label="Загрузка за период"
                value={`${occupancy.occupancyPercent}%`}
                hint={`${occupancy.soldRoomNights} из ${occupancy.availableRoomNights} номере-ночей`}
                icon={<PieChartOutlined fontSize="small" />}
                tint="info"
              />
              <HotelStatCard
                label="ADR"
                value={`${Number(occupancy.adr).toLocaleString("ru-RU")} ${occupancy.currency}`}
                hint="средняя цена проданной ночи"
                icon={<TrendingUpOutlined fontSize="small" />}
                tint="primary"
              />
              <HotelStatCard
                label="RevPAR"
                value={`${Number(occupancy.revpar).toLocaleString("ru-RU")} ${occupancy.currency}`}
                hint="выручка на доступный номер"
                icon={<PaymentsOutlined fontSize="small" />}
                tint="success"
              />
              <HotelStatCard
                label="Выручка номеров"
                value={`${Number(occupancy.roomRevenue).toLocaleString("ru-RU")} ${occupancy.currency}`}
                icon={<PaymentsOutlined fontSize="small" />}
                tint="warning"
              />
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
                gap: 1.5,
                mb: 2.5,
              }}
            >
              <HotelStatCard
                label="Заезды"
                value={occupancy.arrivals}
                icon={<SwapHorizOutlined fontSize="small" />}
                tint="info"
              />
              <HotelStatCard
                label="Выезды"
                value={occupancy.departures}
                icon={<SwapHorizOutlined fontSize="small" />}
                tint="info"
              />
              <HotelStatCard
                label="Отмены"
                value={occupancy.cancellations}
                icon={<EventBusyOutlined fontSize="small" />}
                tint="error"
              />
            </Box>

            {bySourceRows.length > 0 && (
              <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 2.5 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                  Брони по источникам
                </Typography>
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bySourceRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
                      <YAxis tick={{ fontSize: 12, fill: theme.palette.text.secondary }} width={40} allowDecimals={false} />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: `1px solid ${theme.palette.divider}`,
                          backgroundColor: theme.palette.background.paper,
                          color: theme.palette.text.primary,
                        }}
                        formatter={(value?: number) => [`${value ?? 0} броней`, "Источник"]}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                        {bySourceRows.map((row, i) => (
                          <Cell
                            key={row.name}
                            fill={
                              [theme.palette.primary.main, theme.palette.info.main, theme.palette.success.main, theme.palette.warning.main][
                                i % 4
                              ]
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            )}
          </>
        )
      ) : !report ? (
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
