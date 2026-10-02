/**
 * «Собственнику» — главная сводка отеля за период: номерной фонд (выручка,
 * загрузка, ADR, RevPAR — с динамикой к прошлому такому же периоду), деньги
 * (поступило по кассе, расходы, остаток, долги гостей), динамика по дням и
 * разбивки — каналы, категории, способы оплаты, расходы, должники. Каждый
 * блок ведёт в связанный отчёт: долги — в «Балансы», день графика — в
 * «Номера за день», оплаты — в «Кассу».
 *
 * Источники: GET /hotel/reports/occupancy/ (бэкенд, ADR/RevPAR/загрузка),
 * брони периода (цены ночей — для графика и разбивок), реестр оплат
 * (hotel.payments.manage), расходы финансов (finance.view / finance.expense.view).
 */
import React from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import QueryStatsOutlined from "@mui/icons-material/QueryStatsOutlined";
import AccountBalanceOutlined from "@mui/icons-material/AccountBalanceOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import SavingsOutlined from "@mui/icons-material/SavingsOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { getOccupancyReport } from "../api/hotel";
import { CustomDatePicker } from "../components/ui";
import { useCan } from "../hooks/useCan";
import { usePermissions } from "../hooks/usePermissions";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { HOTEL_BOOKING_SOURCE_LABELS, hotelSourceColor } from "./hotelDisplay";
import {
  dailySeries,
  deltaPercent,
  fetchAllExpenses,
  fetchAllReservations,
  fetchPaymentRegister,
  isRevenueReservation,
  reservationCheckIn,
  revenueByCategory,
  revenueBySource,
  summarizeExpenses,
} from "./hotelReportData";
import { fmtInt, fmtMoney, fmtPercent, REPORT_PALETTE } from "./hotelReportFormat";
import { ReportEmpty, ReportKpi, ReportLink, ReportSection, ShareRow, type ReportNav } from "./hotelReportUi";
import { plural, SectionLabel, Surface } from "./hotelUi";
import { downloadXlsx, xlsxFileName } from "./hotelXlsx";
import { formatHotelDate } from "./mockDemoData";

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

const sourceLabel = (s: string) => HOTEL_BOOKING_SOURCE_LABELS[s] ?? (s === "other" ? "Другое" : s);

export const HotelOwnerReport: React.FC<{
  propertyId: number;
  branchId: number | null;
  currency: string;
  roomsCount: number;
  nav: ReportNav;
}> = ({ propertyId, branchId, currency, roomsCount, nav }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { activeOrganization } = usePermissions();
  const canPayments = useCan("hotel.payments.manage");
  const canExpenses = useCan(["finance.view", "finance.expense.view"]);
  const [exporting, setExporting] = React.useState(false);

  const today = dayjs();
  const from = nav.param("from") ?? D(today.startOf("month"));
  const toRaw = nav.param("to") ?? D(today);
  const to = toRaw < from ? from : toRaw;
  const days = dayjs(to).diff(dayjs(from), "day") + 1;
  const prevTo = D(dayjs(from).subtract(1, "day"));
  const prevFrom = D(dayjs(prevTo).subtract(days - 1, "day"));
  const toExcl = D(dayjs(to).add(1, "day"));

  const occupancyQuery = useQuery({
    queryKey: ["hotel", "reports", "occupancy", propertyId, from, to],
    queryFn: ({ signal }) => getOccupancyReport(propertyId, from, to, signal),
  });
  const prevQuery = useQuery({
    queryKey: ["hotel", "reports", "occupancy", propertyId, prevFrom, prevTo],
    queryFn: ({ signal }) => getOccupancyReport(propertyId, prevFrom, prevTo, signal),
  });
  const reservationsQuery = useQuery({
    queryKey: ["hotel", "reports", "ownerReservations", propertyId, from, to],
    queryFn: ({ signal }) => fetchAllReservations({ propertyId, from, to: toExcl }, signal),
  });
  const paymentsQuery = useQuery({
    queryKey: ["hotel", "reports", "ownerPayments", propertyId, from, toExcl],
    queryFn: ({ signal }) => fetchPaymentRegister(propertyId, from, toExcl, signal, 1),
    enabled: canPayments,
  });
  const orgId = activeOrganization?.id ?? null;
  const expensesQuery = useQuery({
    queryKey: ["hotel", "reports", "ownerExpenses", orgId, branchId, from, to],
    queryFn: ({ signal }) => fetchAllExpenses({ organizationId: orgId!, branchId, dateFrom: from, dateTo: to }, signal),
    enabled: canExpenses && orgId != null,
  });

  const occ = occupancyQuery.data;
  const prev = prevQuery.data;
  const reservations = React.useMemo(() => reservationsQuery.data?.rows ?? [], [reservationsQuery.data]);
  const series = React.useMemo(
    () =>
      dailySeries(reservations, from, to).map((p) => ({
        ...p,
        label: dayjs(p.date).format(days > 45 ? "DD.MM" : "D MMM"),
        occupancy: roomsCount > 0 ? Math.round((p.soldRooms / roomsCount) * 1000) / 10 : 0,
      })),
    [reservations, from, to, roomsCount, days],
  );
  const categories = React.useMemo(() => revenueByCategory(reservations, from, to), [reservations, from, to]);
  const sources = React.useMemo(() => revenueBySource(reservations, from, to, sourceLabel), [reservations, from, to]);
  const todayStr = D(today);
  const debtors = React.useMemo(
    () =>
      reservations
        .filter((r) => isRevenueReservation(r) && Number(r.balanceDue) > 0 && (reservationCheckIn(r) ?? "9999") <= (to < todayStr ? to : todayStr))
        .sort((a, b) => Number(b.balanceDue) - Number(a.balanceDue)),
    [reservations, to, todayStr],
  );
  const debtTotal = debtors.reduce((s, r) => s + Number(r.balanceDue), 0);

  // Поступления — по реестру (net = оплаты − возвраты), в валюте объекта.
  const payTotals = paymentsQuery.data?.totals ?? [];
  const received = payTotals.filter((t) => t.currency === (occ?.currency ?? currency)).reduce((s, t) => s + Number(t.net), 0);
  const payChannels = payTotals
    .map((t) => ({ label: t.cashlessMethodName ? `${t.methodLabel} · ${t.cashlessMethodName}` : t.methodLabel, amount: Number(t.net), currency: t.currency }))
    .filter((t) => t.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  const expenses = React.useMemo(() => summarizeExpenses(expensesQuery.data?.rows ?? []), [expensesQuery.data]);
  const cur = occ?.currency ?? currency;

  const setRange = (f: string, t: string) => nav.setParams({ from: f, to: t });
  const presets = [
    { label: "Этот месяц", from: D(today.startOf("month")), to: D(today) },
    { label: "Прошлый месяц", from: D(today.subtract(1, "month").startOf("month")), to: D(today.subtract(1, "month").endOf("month")) },
    { label: "7 дней", from: D(today.subtract(6, "day")), to: D(today) },
    { label: "30 дней", from: D(today.subtract(29, "day")), to: D(today) },
    { label: "Год", from: D(today.startOf("year")), to: D(today) },
  ];

  const revenueTotal = categories.reduce((s, c) => s + c.revenue, 0);
  const revenueDelta = occ && prev ? deltaPercent(Number(occ.roomRevenue), Number(prev.roomRevenue)) : null;
  const nightsLabel = (n: number) => `${fmtInt(n)} ${plural(n, "ночь", "ночи", "ночей")}`;
  const bookingsLabel = (n: number) => `${fmtInt(n)} ${plural(n, "бронь", "брони", "броней")}`;
  const periodLabel = from === to ? formatHotelDate(from) : `${formatHotelDate(from)} – ${formatHotelDate(to)}`;

  const handleExport = async () => {
    if (!occ) return;
    setExporting(true);
    try {
      await downloadXlsx(xlsxFileName("Отчёт собственника", from, to), [
        {
          name: "Сводка",
          title: "Отчёт собственника",
          meta: [`Период: ${dayjs(from).format("DD.MM.YYYY")} – ${dayjs(to).format("DD.MM.YYYY")}`, `Валюта: ${cur}`],
          summary: [
            { label: "Выручка номеров", value: occ.roomRevenue, kind: "money" },
            { label: "Загрузка, %", value: occ.occupancyPercent, kind: "percent" },
            { label: "ADR", value: occ.adr, kind: "money" },
            { label: "RevPAR", value: occ.revpar, kind: "money" },
            { label: "Продано номеро-ночей", value: occ.soldRoomNights, kind: "int" },
            { label: "Доступно номеро-ночей", value: occ.availableRoomNights, kind: "int" },
            { label: "Заезды", value: occ.arrivals, kind: "int" },
            { label: "Выезды", value: occ.departures, kind: "int" },
            { label: "Отмены", value: occ.cancellations, kind: "int" },
            ...(canPayments ? [{ label: "Поступило по кассе", value: received, kind: "money" as const }] : []),
            ...(canExpenses ? [{ label: "Расходы", value: expenses.total, kind: "money" as const }] : []),
            ...(canPayments && canExpenses ? [{ label: "Остаток (поступило − расходы)", value: received - expenses.total, kind: "money" as const }] : []),
            { label: "Долги гостей", value: debtTotal, kind: "money" },
          ],
          tables: [],
        },
        {
          name: "По дням",
          title: "Динамика по дням",
          meta: [`Номеров в фонде: ${roomsCount}`],
          tables: [
            {
              columns: [{ header: "Дата", kind: "date" }, { header: "Продано номеров", kind: "int" }, { header: "Загрузка, %", kind: "percent" }, { header: `Выручка (${cur})`, kind: "money" }],
              rows: series.map((p) => [p.date, p.soldRooms, p.occupancy, p.revenue]),
              totals: ["Итого", series.reduce((s, p) => s + p.soldRooms, 0), null, series.reduce((s, p) => s + p.revenue, 0)],
            },
          ],
        },
        {
          name: "Каналы и категории",
          title: "Каналы продаж и категории номеров",
          tables: [
            {
              title: "Каналы",
              columns: [{ header: "Канал" }, { header: "Броней", kind: "int" }, { header: "Ночей", kind: "int" }, { header: `ADR (${cur})`, kind: "money" }, { header: `Выручка (${cur})`, kind: "money" }],
              rows: sources.map((s) => [s.label, s.reservations, s.nights, s.adr, s.revenue]),
            },
            {
              title: "Категории",
              columns: [{ header: "Категория" }, { header: "Броней", kind: "int" }, { header: "Ночей", kind: "int" }, { header: `ADR (${cur})`, kind: "money" }, { header: `Выручка (${cur})`, kind: "money" }],
              rows: categories.map((c) => [c.label, c.reservations, c.nights, c.adr, c.revenue]),
            },
          ],
        },
        ...(canPayments || canExpenses
          ? [
              {
                name: "Деньги",
                title: "Поступления и расходы",
                tables: [
                  ...(canPayments
                    ? [{ title: "Поступления по способам", columns: [{ header: "Способ" }, { header: "Валюта" }, { header: "Сумма", kind: "money" as const }], rows: payChannels.map((p) => [p.label, p.currency, p.amount]) }]
                    : []),
                  ...(canExpenses
                    ? [{ title: "Расходы по категориям", columns: [{ header: "Категория" }, { header: `Сумма (${cur})`, kind: "money" as const }], rows: expenses.byCategory.map((e) => [e.label, e.amount]) }]
                    : []),
                ],
              },
            ]
          : []),
        {
          name: "Должники",
          title: "Долги гостей",
          tables: [
            {
              columns: [{ header: "Бронь", kind: "int" }, { header: "Гость" }, { header: "Заезд", kind: "date" }, { header: "Выезд", kind: "date" }, { header: `Стоимость (${cur})`, kind: "money" }, { header: `Оплачено (${cur})`, kind: "money" }, { header: `Долг (${cur})`, kind: "money" }],
              rows: debtors.map((r) => [r.number, r.customerName, reservationCheckIn(r), r.checkOut, r.totalAmount, r.paidAmount, r.balanceDue]),
              totals: ["Итого", null, null, null, null, null, debtTotal],
            },
          ],
        },
      ]);
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
  const axisTick = { fontSize: 11.5, fill: theme.palette.text.secondary };
  const loadingMoney = (q: { isPending: boolean; isError: boolean }) => (q.isError ? "—" : q.isPending ? "…" : null);

  return (
    <Stack gap={2.5}>
      <Surface sx={{ p: { xs: 1.75, md: 2 } }}>
        <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} flexWrap="wrap">
          <Stack direction="row" alignItems="center" gap={1}>
            <CustomDatePicker label="С" value={dayjs(from)} onChange={(v) => v && setRange(D(v), D(v) > to ? D(v) : to)} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
            <CustomDatePicker label="По" value={dayjs(to)} minDate={dayjs(from)} onChange={(v) => v && setRange(from, D(v))} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
          </Stack>
          <Stack direction="row" gap={0.5} flexWrap="wrap">
            {presets.map((p) => (
              <Button key={p.label} size="small" variant={p.from === from && p.to === to ? "contained" : "text"} disableElevation onClick={() => setRange(p.from, p.to)} sx={{ borderRadius: "8px" }}>
                {p.label}
              </Button>
            ))}
          </Stack>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", lg: "block" } }}>
            сравнение с {formatHotelDate(prevFrom)} – {formatHotelDate(prevTo)}
          </Typography>
          <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exporting || !occ} onClick={() => void handleExport()}>
            {exporting ? "Готовим…" : "Excel"}
          </Button>
        </Stack>
      </Surface>

      {occupancyQuery.error ? (
        <Alert severity="error" variant="outlined">
          Не удалось загрузить показатели за период
        </Alert>
      ) : !occ ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box>
            <SectionLabel>Номерной фонд · {periodLabel}</SectionLabel>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
              <ReportKpi
                emphasis
                tone="success"
                icon={<SellOutlined />}
                label="Выручка номеров"
                value={fmtMoney(occ.roomRevenue, cur)}
                delta={revenueDelta}
                hint={revenueDelta == null ? "за период" : "к прошлому периоду"}
              />
              <ReportKpi
                tone="info"
                icon={<HotelOutlined />}
                label="Загрузка"
                value={fmtPercent(occ.occupancyPercent)}
                delta={prev ? Math.round((Number(occ.occupancyPercent) - Number(prev.occupancyPercent)) * 10) / 10 : null}
                deltaUnit="п.п."
                hint={`${fmtInt(occ.soldRoomNights)} из ${fmtInt(occ.availableRoomNights)} ночей`}
              />
              <ReportKpi
                icon={<QueryStatsOutlined />}
                label="ADR"
                value={fmtMoney(occ.adr, cur)}
                delta={prev ? deltaPercent(Number(occ.adr), Number(prev.adr)) : null}
                hint="средняя цена ночи"
              />
              <ReportKpi
                icon={<QueryStatsOutlined />}
                label="RevPAR"
                value={fmtMoney(occ.revpar, cur)}
                delta={prev ? deltaPercent(Number(occ.revpar), Number(prev.revpar)) : null}
                hint="выручка на номер"
              />
            </Box>
          </Box>

          <Box>
            <SectionLabel>Деньги</SectionLabel>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
              <ReportKpi
                tone="success"
                icon={<PaymentsOutlined />}
                label="Поступило"
                value={canPayments ? loadingMoney(paymentsQuery) ?? fmtMoney(received, cur) : "нет доступа"}
                hint={canPayments ? "оплаты минус возвраты" : "нужно право на кассу"}
                onClick={canPayments ? () => navigate("/hotel-cash") : undefined}
              />
              <ReportKpi
                tone="warning"
                icon={<ShoppingCartOutlined />}
                label="Расходы"
                value={canExpenses ? loadingMoney(expensesQuery) ?? fmtMoney(expenses.total, cur) : "нет доступа"}
                goodWhenUp={false}
                hint={canExpenses ? `наличными ${fmtMoney(expenses.cash, cur)}` : "нужно право на финансы"}
                onClick={canPayments ? () => nav.go("shift", { date: to }) : undefined}
              />
              <ReportKpi
                tone="primary"
                icon={<SavingsOutlined />}
                label="Остаток"
                value={canPayments && canExpenses ? loadingMoney(paymentsQuery) ?? loadingMoney(expensesQuery) ?? fmtMoney(received - expenses.total, cur) : "—"}
                hint="поступило минус расходы"
              />
              <ReportKpi
                tone="error"
                emphasis={debtTotal > 0}
                icon={<WarningAmberOutlined />}
                label="Долги гостей"
                value={reservationsQuery.isPending ? "…" : fmtMoney(debtTotal, cur)}
                goodWhenUp={false}
                hint={`${bookingsLabel(debtors.length)} с долгом`}
                onClick={() => nav.go("balances", { from, to: to < todayStr ? to : todayStr, balance: "debt" })}
              />
            </Box>
          </Box>

          <ReportSection
            title="Динамика по дням"
            subtitle="Столбцы — выручка по ценам ночей, линия — загрузка. Нажмите на день, чтобы открыть номера за эту дату."
          >
            {reservationsQuery.isPending ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress size={24} />
              </Stack>
            ) : (
              <Box sx={{ height: 280, mx: -1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={series}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    onClick={(state) => {
                      const idx = Number((state as { activeTooltipIndex?: number | string } | null)?.activeTooltipIndex);
                      const point = Number.isInteger(idx) ? series[idx] : undefined;
                      if (point) nav.go("day", { date: point.date });
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={subtleBorder(theme)} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis yAxisId="money" tick={axisTick} width={64} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                    <YAxis yAxisId="occ" orientation="right" tick={axisTick} width={40} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                    <RechartsTooltip
                      cursor={{ fill: subtleBg(theme, true) }}
                      contentStyle={tooltipStyle}
                      labelFormatter={(_l, payload) => {
                        const d = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
                        return d ? dayjs(d).format("D MMMM, dd") : "";
                      }}
                      formatter={(value?: number | string, name?: string | number) =>
                        name === "occupancy" ? [fmtPercent(Number(value ?? 0)), "Загрузка"] : [fmtMoney(Number(value ?? 0), cur), "Выручка"]
                      }
                    />
                    <Bar yAxisId="money" dataKey="revenue" fill={theme.palette.primary.main} radius={[5, 5, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="occ" dataKey="occupancy" type="monotone" stroke={theme.palette.success.main} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>
            )}
          </ReportSection>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
            <ReportSection title="Каналы продаж" subtitle="Выручка ночей периода по источнику брони" action={<ReportLink label="Балансы" onClick={() => nav.go("balances", { from, to })} />}>
              {sources.length === 0 ? (
                <ReportEmpty>За период продаж нет</ReportEmpty>
              ) : (
                sources.map((s, i) => (
                  <ShareRow
                    key={s.key}
                    first={i === 0}
                    color={hotelSourceColor(s.key)}
                    label={s.label}
                    value={fmtMoney(s.revenue, cur)}
                    share={revenueTotal ? (s.revenue / revenueTotal) * 100 : 0}
                    caption={`${bookingsLabel(s.reservations)} · ${nightsLabel(s.nights)} · ADR ${fmtMoney(s.adr, cur)}`}
                    onClick={() => nav.go("balances", { from, to, source: s.key })}
                  />
                ))
              )}
            </ReportSection>

            <ReportSection title="Категории номеров" subtitle="Что продаётся лучше и по какой средней цене">
              {categories.length === 0 ? (
                <ReportEmpty>За период продаж нет</ReportEmpty>
              ) : (
                categories.map((c, i) => (
                  <ShareRow
                    key={c.key}
                    first={i === 0}
                    color={REPORT_PALETTE[i % REPORT_PALETTE.length]}
                    label={c.label}
                    value={fmtMoney(c.revenue, cur)}
                    share={revenueTotal ? (c.revenue / revenueTotal) * 100 : 0}
                    caption={`${nightsLabel(c.nights)} · ADR ${fmtMoney(c.adr, cur)}`}
                  />
                ))
              )}
            </ReportSection>

            {canPayments && (
              <ReportSection title="Поступления по способам" subtitle="Оплаты минус возвраты, по реестру кассы" action={<ReportLink label="Касса" onClick={() => navigate("/hotel-cash")} />}>
                {paymentsQuery.isPending ? (
                  <ReportEmpty>Загружаем…</ReportEmpty>
                ) : payChannels.length === 0 ? (
                  <ReportEmpty>Оплат за период нет</ReportEmpty>
                ) : (
                  payChannels.map((p, i) => (
                    <ShareRow
                      key={`${p.label}-${p.currency}`}
                      first={i === 0}
                      color={REPORT_PALETTE[i % REPORT_PALETTE.length]}
                      label={p.label}
                      value={fmtMoney(p.amount, p.currency)}
                      share={received ? (p.amount / received) * 100 : 0}
                    />
                  ))
                )}
              </ReportSection>
            )}

            {canExpenses && (
              <ReportSection title="Расходы по категориям" subtitle="Из расходов филиала за период" action={canPayments ? <ReportLink label="Смена" onClick={() => nav.go("shift", { date: to })} /> : undefined}>
                {expensesQuery.isPending ? (
                  <ReportEmpty>Загружаем…</ReportEmpty>
                ) : expenses.byCategory.length === 0 ? (
                  <ReportEmpty>Расходов за период нет</ReportEmpty>
                ) : (
                  expenses.byCategory.map((e, i) => (
                    <ShareRow
                      key={e.label}
                      first={i === 0}
                      color={REPORT_PALETTE[(i + 3) % REPORT_PALETTE.length]}
                      label={e.label}
                      value={fmtMoney(e.amount, cur)}
                      share={expenses.total ? (e.amount / expenses.total) * 100 : 0}
                    />
                  ))
                )}
              </ReportSection>
            )}

            <ReportSection title="Движение гостей" subtitle={`К прошлому периоду: ${formatHotelDate(prevFrom)} – ${formatHotelDate(prevTo)}`}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, pt: 0.5 }}>
                {[
                  { label: "Заезды", value: occ.arrivals, prev: prev?.arrivals, good: true },
                  { label: "Выезды", value: occ.departures, prev: prev?.departures, good: true },
                  { label: "Отмены", value: occ.cancellations, prev: prev?.cancellations, good: false },
                ].map((m) => {
                  const delta = m.prev != null ? deltaPercent(m.value, m.prev) : null;
                  const bad = delta != null && delta !== 0 && delta > 0 !== m.good;
                  return (
                    <Box key={m.label} sx={{ p: 1.5, borderRadius: "12px", bgcolor: subtleBg(theme) }}>
                      <Typography variant="caption" color="text.secondary">
                        {m.label}
                      </Typography>
                      <Typography sx={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtInt(m.value)}</Typography>
                      <Typography variant="caption" sx={{ color: delta == null || delta === 0 ? "text.secondary" : bad ? "error.main" : "success.main", fontWeight: 600 }}>
                        {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("ru-RU")}%`}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </ReportSection>

            <ReportSection
              title="Должники"
              subtitle="Заехали или должны были заехать, но не рассчитались"
              action={<ReportLink label="Все долги" onClick={() => nav.go("balances", { from, to: to < todayStr ? to : todayStr, balance: "debt" })} />}
            >
              {reservationsQuery.isPending ? (
                <ReportEmpty>Загружаем…</ReportEmpty>
              ) : debtors.length === 0 ? (
                <ReportEmpty>Долгов нет — все рассчитались</ReportEmpty>
              ) : (
                debtors.slice(0, 6).map((r, i) => (
                  <Stack
                    key={r.id}
                    direction="row"
                    alignItems="center"
                    gap={1.25}
                    onClick={() => nav.openReservation(r.id)}
                    sx={{ py: 1.1, cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}`, "&:hover .debtor-name": { color: "primary.main" } }}
                  >
                    <AccountBalanceOutlined sx={{ fontSize: 18, color: "text.disabled" }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography className="debtor-name" variant="body2" fontWeight={600} noWrap>
                        {r.customerName || "Без заказчика"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div" noWrap>
                        №{r.number} · {r.items.map((it) => it.roomNumber ?? "—").join(", ")} · {formatHotelDate(reservationCheckIn(r) ?? "")}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: "error.main", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(r.balanceDue, cur)}
                    </Typography>
                  </Stack>
                ))
              )}
            </ReportSection>
          </Box>
        </>
      )}
    </Stack>
  );
};

export default HotelOwnerReport;
