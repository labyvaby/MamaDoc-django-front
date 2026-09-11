/**
 * «Отчёты» — отчёт по отелю за один день: кто заселён, на сколько ночей,
 * сколько заплатит по тарифу номера и сколько номеров было свободно.
 * Данные считаются из тех же броней, что и шахматка (RoomBookingGrid) —
 * getHotelDailyReport в mockDemoData.ts, не декоративный набор чисел.
 * Выгрузка в .xlsx — реальный файл на диск (exportHotelDailyReportXlsx.ts).
 */
import React from "react";
import {
  Box,
  Button,
  Chip,
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
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  getHotelDailyReport,
  getHotelBookingStatusColor,
  formatHotelDate,
  nightsBetween,
  subscribeCustomBookings,
  getCustomBookingsSnapshot,
  HOTEL_BOOKING_STATUS_LABELS,
  type HotelBooking,
} from "./mockDemoData";
import { exportHotelDailyReportXlsx } from "./exportHotelDailyReportXlsx";

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <Paper elevation={0} variant="outlined" sx={{ p: 1.75, minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Typography>
    {hint && (
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    )}
  </Paper>
);

export const HotelReportsPage: React.FC = () => {
  usePageTitle("Отчёты");
  const theme = useTheme();
  // Отчёт зависит от ручных броней (CreateBookingButton) — подписка гарантирует
  // пересчёт таблицы сразу, если бронь на просматриваемую дату добавили только что.
  React.useSyncExternalStore(subscribeCustomBookings, getCustomBookingsSnapshot);

  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [exporting, setExporting] = React.useState(false);

  const dateStr = date.format("YYYY-MM-DD");
  const report = React.useMemo(() => getHotelDailyReport(dateStr), [dateStr]);
  const isToday = dateStr === dayjs().format("YYYY-MM-DD");

  const statusColor = (status: HotelBooking["status"]) => getHotelBookingStatusColor(status, theme);

  const handleExport = async () => {
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
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Готовим файл…" : "Скачать .xlsx"}
          </Button>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <StatCard
          label="Загрузка"
          value={`${report.occupancyPercent}%`}
          hint={`${report.occupiedRooms} занято из ${report.totalRooms}`}
        />
        <StatCard label="Свободно номеров" value={report.freeRooms} />
        <StatCard label="Заездов / выездов" value={`${report.arrivals} / ${report.departures}`} />
        <StatCard
          label="Выручка за ночь"
          value={`${report.revenue.toLocaleString("ru-RU")} сом`}
          hint="по тарифам занятых номеров"
        />
      </Box>

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
                <TableCell align="right">Ночей</TableCell>
                <TableCell align="right">Цена/ночь</TableCell>
                <TableCell align="right">Сумма</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.rows.map((row) => {
                const b = row.booking;
                const nights = b ? nightsBetween(b.checkIn, b.checkOut) : null;
                return (
                  <TableRow key={row.room} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{row.room}</TableCell>
                    <TableCell>
                      {row.categoryName}
                      {row.luxury && (
                        <Chip
                          label="Люкс"
                          size="small"
                          sx={{ ml: 1, height: 18, fontSize: "0.65rem", fontWeight: 700 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>{b?.guestName ?? <Typography color="text.disabled">—</Typography>}</TableCell>
                    <TableCell>
                      <Chip
                        label={b ? HOTEL_BOOKING_STATUS_LABELS[b.status] : "Свободен"}
                        size="small"
                        sx={{
                          bgcolor: b
                            ? alpha(statusColor(b.status), theme.palette.mode === "dark" ? 0.25 : 0.14)
                            : alpha(theme.palette.text.disabled, 0.14),
                          color: b ? statusColor(b.status) : "text.secondary",
                          fontWeight: 600,
                        }}
                      />
                    </TableCell>
                    <TableCell>{b ? formatHotelDate(b.checkIn) : "—"}</TableCell>
                    <TableCell>{b ? formatHotelDate(b.checkOut) : "—"}</TableCell>
                    <TableCell align="right">{nights ?? "—"}</TableCell>
                    <TableCell align="right">{row.pricePerNight.toLocaleString("ru-RU")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {b && nights ? (row.pricePerNight * nights).toLocaleString("ru-RU") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Paper>
    </Box>
  );
};

export default HotelReportsPage;
