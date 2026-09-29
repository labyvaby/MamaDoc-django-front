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
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { formatHotelDate, formatHotelDateRange } from "./mockDemoData";
import { mapStayDisplayStatus, hotelStayStatusColor, HOTEL_STAY_STATUS_LABELS } from "./hotelDisplay";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { getDailyReport, getOccupancyReport, type HotelDailyReportRow } from "../api/hotel";
import { exportHotelDailyReportXlsx } from "./exportHotelDailyReportXlsx";
import { DateStepper, FilterChip, HotelPage, HotelPageHeader, MetricTile, SectionLabel, StatusPill, Surface, useHotelTableSx } from "./hotelUi";

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
  const tableSx = useHotelTableSx();
  const { property, isLoading: propertyLoading } = useHotelProperty();

  const [mode, setMode] = React.useState<ReportMode>("day");
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [exporting, setExporting] = React.useState(false);

  const dateStr = date.format("YYYY-MM-DD");

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


  const chartTooltipStyle = {
    borderRadius: 10,
    border: `1px solid ${subtleBorder(theme)}`,
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    fontSize: 13,
  };
  const axisTick = { fontSize: 12, fill: theme.palette.text.secondary };
  const money = (v: string | number, currency: string) => `${Number(v).toLocaleString("ru-RU")} ${currency === "KGS" ? "сом" : currency}`;

  const periodLabel =
    periodFrom.isSame(periodTo, "day")
      ? formatHotelDate(periodFromStr)
      : `${formatHotelDate(periodFromStr)} – ${formatHotelDate(periodToStr)}`;

  return (
    <HotelPage>
      <HotelPageHeader
        title="Отчёты"
        subtitle={mode === "day" ? `Сводка по номерам за ${formatHotelDate(dateStr)}` : `Показатели за ${periodLabel}`}
        info={
          mode === "day"
            ? "Кто заселён на выбранную дату, по какой цене и сколько номеров свободно. Считает бэкенд; выгрузка — реальный .xlsx."
            : "ADR — средняя цена проданной ночи. RevPAR — выручка на каждый доступный номер (с учётом пустых). Загрузка — доля проданных номере-ночей."
        }
        actions={
          mode === "day" ? (
            <>
              <DateStepper value={date} onChange={setDate} disableFuture />
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlined />}
                onClick={() => void handleExport()}
                disabled={exporting || !report}
              >
                {exporting ? "Готовим…" : "Excel"}
              </Button>
            </>
          ) : (
            <Stack direction="row" alignItems="center" gap={1}>
              <CustomDatePicker
                label="С"
                value={periodFrom}
                onChange={(v) => v && setPeriodFrom(v)}
                disableFuture
                slotProps={{ textField: { size: "small" } }}
                sx={{ width: 140 }}
              />
              <CustomDatePicker
                label="По"
                value={periodTo}
                onChange={(v) => v && setPeriodTo(v)}
                disableFuture
                minDate={periodFrom}
                slotProps={{ textField: { size: "small" } }}
                sx={{ width: 140 }}
              />
            </Stack>
          )
        }
      />

      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Stack direction="row" gap={1}>
          <FilterChip label="День" active={mode === "day"} onClick={() => setMode("day")} />
          <FilterChip label="Период" active={mode === "period"} onClick={() => setMode("period")} />
        </Stack>
        {mode === "period" && (
          <Stack direction="row" gap={0.5} flexWrap="wrap">
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

      {!property ? (
        propertyLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <HotelPropertyMissing />
        )
      ) : mode === "period" ? (
        periodTo.isBefore(periodFrom) ? (
          <Alert severity="warning" variant="outlined">
            Дата «По» раньше даты «С»
          </Alert>
        ) : !occupancy ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
              <MetricTile
                label="Загрузка"
                value={`${Number(occupancy.occupancyPercent).toLocaleString("ru-RU")}%`}
                hint={`${occupancy.soldRoomNights} из ${occupancy.availableRoomNights} номере-ночей`}
                accent={theme.palette.info.main}
              />
              <MetricTile label="ADR" value={money(occupancy.adr, occupancy.currency)} hint="средняя цена проданной ночи" />
              <MetricTile label="RevPAR" value={money(occupancy.revpar, occupancy.currency)} hint="выручка на доступный номер" />
              <MetricTile
                label="Выручка номеров"
                value={money(occupancy.roomRevenue, occupancy.currency)}
                accent={theme.palette.success.main}
              />
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" }, gap: 2 }}>
              <Surface>
                <SectionLabel>Движение гостей</SectionLabel>
                {[
                  { label: "Заезды", value: occupancy.arrivals, color: theme.palette.info.main },
                  { label: "Выезды", value: occupancy.departures, color: theme.palette.text.secondary },
                  { label: "Отмены", value: occupancy.cancellations, color: theme.palette.error.main },
                ].map((r, i) => (
                  <Stack
                    key={r.label}
                    direction="row"
                    alignItems="center"
                    gap={1.25}
                    sx={{ py: 1.25, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: r.color }} />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {r.label}
                    </Typography>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.value}</Typography>
                  </Stack>
                ))}
              </Surface>

              <Surface>
                <SectionLabel>Брони по источникам</SectionLabel>
                {bySourceRows.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 4, textAlign: "center" }}>
                    За период броней нет
                  </Typography>
                ) : (
                  <Box sx={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bySourceRows} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={subtleBorder(theme)} />
                        <XAxis type="number" tick={axisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={axisTick} width={130} axisLine={false} tickLine={false} />
                        <RechartsTooltip
                          cursor={{ fill: subtleBg(theme, true) }}
                          contentStyle={chartTooltipStyle}
                          formatter={(value?: number) => [`${value ?? 0}`, "Броней"]}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} fill={theme.palette.primary.main} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Surface>
            </Box>
          </>
        )
      ) : !report ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
            <MetricTile
              label="Загрузка"
              value={`${Number(report.occupancyPercent).toLocaleString("ru-RU")}%`}
              hint={`${report.occupiedRooms} занято из ${report.totalRooms}`}
              accent={theme.palette.info.main}
            />
            <MetricTile
              label="Свободно"
              value={report.freeRooms}
              hint={report.blockedRooms > 0 ? `ещё ${report.blockedRooms} заблокировано` : "номеров"}
              accent={theme.palette.success.main}
            />
            <MetricTile label="Заезды / выезды" value={`${report.arrivals} / ${report.departures}`} hint="за день" />
            <MetricTile label="Выручка за ночь" value={money(report.revenue, report.currency)} hint="по тарифам занятых номеров" />
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
                      contentStyle={chartTooltipStyle}
                      formatter={(value?: number) => [money(value ?? 0, report.currency), "Выручка"]}
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
                        <TableRow key={row.roomId}>
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
                          <TableCell align="right" sx={{ pr: 2.5, fontVariantNumeric: "tabular-nums", fontWeight: row.nightPrice ? 600 : 400, color: row.nightPrice ? "text.primary" : "text.disabled" }}>
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
    </HotelPage>
  );
};

export default HotelReportsPage;
