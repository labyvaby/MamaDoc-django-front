/**
 * «Доходность и загрузка» — как одноимённый отчёт Exely, но с выбором вида:
 * таблица (месяцы / недели / дни, с итогом и по категориям), график выручки
 * и загрузки, тепловой календарь по дням, средние по дням недели и сравнение
 * с прошлым периодом или прошлым годом. Фильтры — категории и источник
 * брони; Excel. Расчёт — hotelYield.ts по броням периода и номерам фонда.
 */
import React from "react";
import { Alert, Box, Button, CircularProgress, FormControlLabel, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import QueryStatsOutlined from "@mui/icons-material/QueryStatsOutlined";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import LoginOutlined from "@mui/icons-material/LoginOutlined";
import TableRowsOutlined from "@mui/icons-material/TableRowsOutlined";
import InsertChartOutlined from "@mui/icons-material/InsertChartOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ViewWeekOutlined from "@mui/icons-material/ViewWeekOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";

import { ApiError } from "../api/client";
import { getYieldReport, listRooms } from "../api/hotel";
import { CustomDatePicker } from "../components/ui";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { HOTEL_BOOKING_SOURCE_LABELS } from "./hotelDisplay";
import { axisMoney, fmtInt, fmtMoney, fmtPercent, niceTicks } from "./hotelReportFormat";
import { deltaPercent, fetchAllReservations } from "./hotelReportData";
import { ReportFilters, ReportKpi, ReportSection, type ReportNav } from "./hotelReportUi";
import { FilterChip, Surface, useHotelTableSx } from "./hotelUi";
import { downloadXlsx, xlsxFileName } from "./hotelXlsx";
import {
  factsFromReservations,
  inventoryFromRooms,
  lastYearPeriod,
  previousPeriod,
  summarizeYield,
  type YieldFact,
  type YieldGroup,
  type YieldInventory,
  type YieldMetrics,
  type YieldResult,
  type YieldRoom,
  type YieldRow,
} from "./hotelYield";

type View = "table" | "chart" | "calendar" | "weekdays";
type Compare = "none" | "prev" | "year";


/** Факты периода — с сервера (GET /reports/yield/) или собранные из броней, пока его нет. */
interface YieldFacts {
  facts: YieldFact[];
  /** null — посчитать из фонда номеров. */
  inventory: YieldInventory[] | null;
  names: Map<number, string> | null;
  truncated: boolean;
  fromServer: boolean;
}

/** Сервер ответил 404 — до перезагрузки страницы сразу считаем сами, без лишнего запроса. */
let yieldEndpointMissing = false;

async function loadYieldFacts(propertyId: number, from: string, to: string, signal: AbortSignal): Promise<YieldFacts> {
  if (!yieldEndpointMissing) {
    try {
      const r = await getYieldReport({ propertyId, from, to }, signal);
      return {
        facts: r.sales.map((x) => ({ ...x, source: x.source || "other", revenue: Number(x.revenue) || 0 })),
        inventory: r.inventory,
        names: new Map(r.roomTypes.map((t) => [t.roomTypeId, t.roomTypeName])),
        truncated: false,
        fromServer: true,
      };
    } catch (err) {
      // 403 — у сотрудника нет права на серверный отчёт: считаем по броням, как до него.
      if (!(err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 403))) throw err;
      yieldEndpointMissing = true;
    }
  }
  const res = await fetchAllReservations({ propertyId, from, to: dayjs(to).add(1, "day").format("YYYY-MM-DD") }, signal, 25);
  return { facts: factsFromReservations(res.rows, from, to), inventory: null, names: null, truncated: res.truncated, fromServer: false };
}

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const SOURCES = ["direct", "website", "phone", "walk_in", "ota", "agent", "corporate"];

const rowLabel = (r: YieldRow, group: YieldGroup) =>
  group === "day"
    ? dayjs(r.from).format("DD.MM.YYYY, dd")
    : group === "month"
      ? dayjs(r.from).format("MMMM YYYY").replace(/^./, (c) => c.toUpperCase())
      : `${dayjs(r.from).format("D MMM")} – ${dayjs(r.to).format("D MMM")}`;

export const HotelYieldReport: React.FC<{ propertyId: number; currency: string; nav: ReportNav }> = ({ propertyId, currency, nav }) => {
  const tableSx = useHotelTableSx();
  const theme = useTheme();
  // На телефоне фильтры прячутся под «Фильтры», вид отчёта — отдельной строкой во всю ширину.
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const today = dayjs();
  const from = nav.param("from") ?? D(today.startOf("month"));
  const toRaw = nav.param("to") ?? D(today.endOf("month"));
  const to = toRaw < from ? from : toRaw;
  const group = ((nav.param("group") as YieldGroup | null) ?? "month") as YieldGroup;
  const view = ((nav.param("view") as View | null) ?? "table") as View;
  const compare = ((nav.param("compare") as Compare | null) ?? "none") as Compare;
  const [byCategory, setByCategory] = React.useState(false);
  const [cats, setCats] = React.useState<Set<number>>(new Set());
  const [sources, setSources] = React.useState<Set<string>>(new Set());
  const [exporting, setExporting] = React.useState(false);
  const days = dayjs(to).diff(dayjs(from), "day") + 1;

  const roomsQuery = useQuery({ queryKey: ["hotel", "rooms", propertyId], queryFn: ({ signal }) => listRooms({ propertyId }, signal) });
  const rooms: YieldRoom[] = React.useMemo(
    () => (roomsQuery.data ?? []).map((r) => ({ id: r.id, roomTypeId: r.roomTypeId, roomTypeName: r.roomTypeName, active: r.status !== "out_of_service" })),
    [roomsQuery.data],
  );
  const categories = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rooms) m.set(r.roomTypeId, r.roomTypeName);
    return [...m.entries()];
  }, [rooms]);

  const fetchPeriod = (f: string, t: string) => ({
    queryKey: ["hotel", "reports", "yield", propertyId, f, t],
    queryFn: ({ signal }: { signal: AbortSignal }) => loadYieldFacts(propertyId, f, t, signal),
    staleTime: 60_000,
  });
  const mainQuery = useQuery(fetchPeriod(from, to));
  const cmp = compare === "prev" ? previousPeriod(from, to) : compare === "year" ? lastYearPeriod(from, to) : null;
  const cmpQuery = useQuery({ ...fetchPeriod(cmp?.from ?? from, cmp?.to ?? to), enabled: cmp != null });

  const filters = { roomTypeIds: cats.size ? cats : null, sources: sources.size ? sources : null };
  const names = React.useMemo(() => new Map(rooms.map((r) => [r.roomTypeId, r.roomTypeName])), [rooms]);
  const summarize = (data: YieldFacts, f: string, t: string) =>
    summarizeYield({ facts: data.facts, inventory: data.inventory ?? inventoryFromRooms(rooms, f, t), names: data.names ?? names, from: f, to: t, group, ...filters });
  const result: YieldResult | null = React.useMemo(
    () => (mainQuery.data && roomsQuery.data ? summarize(mainQuery.data, from, to) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mainQuery.data, roomsQuery.data, rooms, names, from, to, group, cats, sources],
  );
  const cmpResult: YieldResult | null = React.useMemo(
    () => (cmp && cmpQuery.data && roomsQuery.data ? summarize(cmpQuery.data, cmp.from, cmp.to) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cmpQuery.data, roomsQuery.data, rooms, names, cmp?.from, cmp?.to, group, cats, sources],
  );

  const setParam = (patch: Record<string, string | null>) => nav.setParams(patch);
  const presets = [
    { label: "Этот месяц", from: D(today.startOf("month")), to: D(today.endOf("month")) },
    { label: "Прошлый месяц", from: D(today.subtract(1, "month").startOf("month")), to: D(today.subtract(1, "month").endOf("month")) },
    { label: "Квартал", from: D(today.subtract(2, "month").startOf("month")), to: D(today.endOf("month")) },
    { label: "С начала года", from: D(today.startOf("year")), to: D(today) },
    { label: "30 дней", from: D(today.subtract(29, "day")), to: D(today) },
  ];

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const delta = (key: keyof YieldMetrics) => (result && cmpResult ? deltaPercent(result.total[key], cmpResult.total[key]) : null);
  const occDelta = result && cmpResult ? Math.round((result.total.occupancy - cmpResult.total.occupancy) * 10) / 10 : null;
  const cmpLabel = cmp ? `${dayjs(cmp.from).format("D MMM YYYY")} – ${dayjs(cmp.to).format("D MMM YYYY")}` : "";

  const exportXlsx = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const cols = [
        { header: group === "day" ? "Дата" : "Период", width: 22 },
        { header: `Доход за проживание (${currency})`, kind: "money" as const },
        { header: "Продано номероночей", kind: "int" as const },
        { header: "Заезд гостей", kind: "int" as const },
        { header: "Заезд номеров", kind: "int" as const },
        { header: `ADR (${currency})`, kind: "money" as const },
        { header: `RevPAR (${currency})`, kind: "money" as const },
        { header: "Всего доступно номероночей", kind: "int" as const },
        { header: "Загрузка, %", kind: "percent" as const },
      ];
      const line = (label: string, m: YieldMetrics) => [label, m.revenue, m.sold, m.guestsArrived, m.roomsArrived, m.adr, m.revpar, m.available, m.occupancy];
      await downloadXlsx(xlsxFileName("Доходность и загрузка", from, to), [
        {
          name: "Доходность",
          title: "Доходность и загрузка",
          meta: [
            `Период: ${dayjs(from).format("DD.MM.YYYY")} – ${dayjs(to).format("DD.MM.YYYY")}`,
            `Категории: ${cats.size ? categories.filter(([id]) => cats.has(id)).map(([, n]) => n).join(", ") : "все"}`,
            `Источник: ${sources.size ? [...sources].map((s) => HOTEL_BOOKING_SOURCE_LABELS[s] ?? s).join(", ") : "все"}`,
          ],
          tables: [
            { columns: cols, rows: result.rows.map((r) => line(rowLabel(r, group), r)), totals: line("Итого за период", result.total) },
            ...(group !== "day" ? [{ title: "По дням", columns: cols, rows: result.days.map((r) => line(rowLabel(r, "day"), r)) }] : []),
            { title: "По категориям номеров", columns: [{ header: "Категория", width: 22 }, ...cols.slice(1)], rows: result.byCategory.map((c) => line(c.name, c)) },
            { title: "По дням недели", columns: [{ header: "День недели" }, ...cols.slice(1)], rows: result.byWeekday.map((w) => line(WEEKDAYS[w.weekday], w)) },
          ],
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  const loading = mainQuery.isPending || roomsQuery.isPending;
  const activeFilters = (group !== "month" ? 1 : 0) + (compare !== "none" ? 1 : 0) + (byCategory ? 1 : 0) + (cats.size > 0 ? 1 : 0) + (sources.size > 0 ? 1 : 0);
  const excelButton = (
    <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={!result || exporting} onClick={() => void exportXlsx()} sx={{ minHeight: { xs: 40, md: 0 }, px: { xs: 1.25, md: 2 } }}>
      {exporting ? "Готовим…" : phone ? "Excel" : "Экспорт в Excel"}
    </Button>
  );

  return (
    <Stack gap={2.5}>
      <Surface sx={{ p: { xs: 1.75, md: 2 } }}>
        <Stack gap={1.5}>
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} flexWrap="wrap">
            <Stack direction="row" alignItems="center" gap={1}>
              <CustomDatePicker label="С" value={dayjs(from)} onChange={(v) => v && setParam({ from: D(v), to: D(v) > to ? D(v) : to })} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
              <CustomDatePicker label="По" value={dayjs(to)} minDate={dayjs(from)} maxDate={dayjs(from).add(366, "day")} onChange={(v) => v && setParam({ to: D(v) })} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
            </Stack>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {presets.map((p) => (
                <Button key={p.label} size="small" variant={p.from === from && p.to === to ? "contained" : "text"} disableElevation onClick={() => setParam({ from: p.from, to: p.to })} sx={{ borderRadius: "8px" }}>
                  {p.label}
                </Button>
              ))}
            </Stack>
            <Box sx={{ flex: 1, display: { xs: "none", md: "block" } }} />
            {!phone && excelButton}
          </Stack>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, v: View | null) => v && setParam({ view: v === "table" ? null : v })}
            sx={{ display: { xs: "flex", md: "none" }, "& .MuiToggleButton-root": { flex: 1, textTransform: "none", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", py: 0.75, px: 0.25 } }}
          >
            <ToggleButton value="table">Таблица</ToggleButton>
            <ToggleButton value="chart">График</ToggleButton>
            <ToggleButton value="calendar">Календарь</ToggleButton>
            <ToggleButton value="weekdays">Дни недели</ToggleButton>
          </ToggleButtonGroup>
          <ReportFilters active={activeFilters} extra={excelButton}>
            <Stack direction={{ xs: "column", lg: "row" }} gap={1.5} alignItems={{ lg: "center" }} flexWrap="wrap">
              <ToggleButtonGroup size="small" exclusive value={group} onChange={(_, v: YieldGroup | null) => v && setParam({ group: v })} sx={{ "& .MuiToggleButton-root": { flex: { xs: 1, md: "none" }, textTransform: "none", fontWeight: 600, py: 0.4 } }}>
                <ToggleButton value="month">По месяцам</ToggleButton>
                <ToggleButton value="week">По неделям</ToggleButton>
                <ToggleButton value="day">По дням</ToggleButton>
              </ToggleButtonGroup>
              <TextField
                select
                size="small"
                label="Сравнить"
                value={compare}
                onChange={(e) => setParam({ compare: e.target.value === "none" ? null : e.target.value })}
                sx={{ minWidth: { md: 200 } }}
              >
                <MenuItem value="none">Без сравнения</MenuItem>
                <MenuItem value="prev">С прошлым периодом</MenuItem>
                <MenuItem value="year">С прошлым годом</MenuItem>
              </TextField>
              <FormControlLabel control={<Switch size="small" checked={byCategory} onChange={(e) => setByCategory(e.target.checked)} />} label={<Typography variant="body2">Детализация по категориям</Typography>} />
              <Box sx={{ flex: 1 }} />
              <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: View | null) => v && setParam({ view: v === "table" ? null : v })} sx={{ display: { xs: "none", md: "flex" }, "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, py: 0.4, gap: 0.5 } }}>
                <ToggleButton value="table">
                  <TableRowsOutlined sx={{ fontSize: 17 }} /> Таблица
                </ToggleButton>
                <ToggleButton value="chart">
                  <InsertChartOutlined sx={{ fontSize: 17 }} /> График
                </ToggleButton>
                <ToggleButton value="calendar">
                  <CalendarMonthOutlined sx={{ fontSize: 17 }} /> Календарь
                </ToggleButton>
                <ToggleButton value="weekdays">
                  <ViewWeekOutlined sx={{ fontSize: 17 }} /> Дни недели
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Категории:
              </Typography>
              <FilterChip label="Все" active={cats.size === 0} onClick={() => setCats(new Set())} />
              {categories.map(([id, name]) => (
                <FilterChip key={id} label={name} active={cats.has(id)} onClick={() => setCats((c) => toggle(c, id))} />
              ))}
              <Box sx={{ width: "1px", height: 22, bgcolor: "divider", mx: 0.75 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Источник:
              </Typography>
              <FilterChip label="Все" active={sources.size === 0} onClick={() => setSources(new Set())} />
              {SOURCES.filter((s) => s !== "website").map((s) => (
                <FilterChip key={s} label={HOTEL_BOOKING_SOURCE_LABELS[s] ?? s} active={sources.has(s)} onClick={() => setSources((x) => toggle(x, s))} />
              ))}
            </Stack>
          </ReportFilters>
        </Stack>
      </Surface>

      {days > 120 && mainQuery.data?.fromServer !== true && (
        <Alert severity="info" variant="outlined">
          Длинный период — считаем по всем броням за {fmtInt(days)} дней, это может занять несколько секунд.
        </Alert>
      )}
      {mainQuery.data?.truncated && (
        <Alert severity="warning" variant="outlined">
          Броней за период больше 5000 — посчитаны первые 5000. Сузьте период.
        </Alert>
      )}

      {mainQuery.isError ? (
        <Alert severity="error" variant="outlined">
          Не удалось загрузить брони за период
        </Alert>
      ) : loading || !result ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)", xl: "repeat(6, 1fr)" }, gap: 1.5 }}>
            <ReportKpi emphasis tone="success" icon={<SellOutlined />} label="Доход" value={fmtMoney(result.total.revenue, currency)} delta={delta("revenue")} hint={cmp ? `к ${compare === "year" ? "прошлому году" : "прошлому периоду"}` : "за период"} />
            <ReportKpi tone="info" icon={<HotelOutlined />} label="Загрузка" value={fmtPercent(result.total.occupancy)} delta={occDelta} deltaUnit="п.п." hint={`${fmtInt(result.total.sold)} из ${fmtInt(result.total.available)}`} />
            <ReportKpi icon={<QueryStatsOutlined />} label="ADR" value={fmtMoney(result.total.adr, currency)} delta={delta("adr")} hint="средняя цена ночи" />
            <ReportKpi icon={<QueryStatsOutlined />} label="RevPAR" value={fmtMoney(result.total.revpar, currency)} delta={delta("revpar")} hint="доход на номер" />
            <ReportKpi tone="warning" icon={<NightsStayOutlined />} label="Номероночей" value={fmtInt(result.total.sold)} delta={delta("sold")} hint="продано" />
            <ReportKpi tone="primary" icon={<LoginOutlined />} label="Заезды" value={`${fmtInt(result.total.guestsArrived)} / ${fmtInt(result.total.roomsArrived)}`} delta={delta("guestsArrived")} hint="гостей / номеров" />
          </Box>
          {cmp && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              Сравнение с периодом {cmpLabel}
              {cmpQuery.isPending ? " — загружаем…" : ""}
            </Typography>
          )}

          {view === "table" && <YieldTable result={result} cmp={cmpResult} group={group} currency={currency} tableSx={tableSx} onDay={(d) => nav.go("day", { date: d })} />}
          {view === "chart" && <YieldChart result={result} cmp={cmpResult} group={group} currency={currency} />}
          {view === "calendar" && <YieldHeatmap result={result} currency={currency} onDay={(d) => nav.go("day", { date: d })} />}
          {view === "weekdays" && <YieldWeekdays result={result} currency={currency} />}

          {byCategory && (
            <ReportSection title="По категориям номеров" subtitle="Те же показатели для каждой категории за период" padded={false}>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ ...tableSx, minWidth: 880, "& td": { whiteSpace: "nowrap" }, "& th": { whiteSpace: "normal", lineHeight: 1.25, verticalAlign: "bottom" } }}>
                  <MetricsHead first="Категория" />
                  <TableBody>
                    {result.byCategory.map((c) => (
                      <MetricsRow key={c.roomTypeId} label={c.name} m={c} currency={currency} />
                    ))}
                    <MetricsRow label="Итого" m={result.total} currency={currency} total />
                  </TableBody>
                </Table>
              </Box>
            </ReportSection>
          )}
        </>
      )}
    </Stack>
  );
};

// ── Таблица ─────────────────────────────────────────────────────────────────

const MetricsHead: React.FC<{ first: string; withDelta?: boolean }> = ({ first, withDelta }) => (
  <TableHead>
    <TableRow>
      <TableCell sx={{ pl: 2.5 }}>{first}</TableCell>
      <TableCell align="right">Доход за проживание</TableCell>
      {withDelta && <TableCell align="right">Δ дохода</TableCell>}
      <TableCell align="right">Продано номероночей</TableCell>
      <TableCell align="right">Заезд гостей</TableCell>
      <TableCell align="right">Заезд номеров</TableCell>
      <TableCell align="right">ADR</TableCell>
      <TableCell align="right">RevPAR</TableCell>
      <TableCell align="right">Всего доступно</TableCell>
      <TableCell align="right" sx={{ pr: 2.5 }}>
        Загрузка
      </TableCell>
      {withDelta && <TableCell align="right" sx={{ pr: 2.5 }}>Δ загрузки</TableCell>}
    </TableRow>
  </TableHead>
);

const MetricsRow: React.FC<{
  label: React.ReactNode;
  m: YieldMetrics;
  currency: string;
  total?: boolean;
  cmp?: YieldMetrics | null;
  onClick?: () => void;
}> = ({ label, m, total, cmp, onClick }) => {
  const theme = useTheme();
  const num = { fontVariantNumeric: "tabular-nums" } as const;
  const occColor = m.occupancy >= 90 ? theme.palette.success.main : m.occupancy >= 60 ? theme.palette.warning.main : theme.palette.error.main;
  const dRev = cmp ? deltaPercent(m.revenue, cmp.revenue) : null;
  const dOcc = cmp ? Math.round((m.occupancy - cmp.occupancy) * 10) / 10 : null;
  const deltaCell = (v: number | null, unit: string) => (
    <Typography variant="body2" sx={{ ...num, fontWeight: 600, color: v == null || v === 0 ? "text.secondary" : v > 0 ? "success.main" : "error.main" }}>
      {v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("ru-RU")}${unit}`}
    </Typography>
  );
  return (
    <TableRow
      hover={!!onClick}
      onClick={onClick}
      sx={{
        cursor: onClick ? "pointer" : "default",
        ...(total ? { "& td": { fontWeight: 800, bgcolor: subtleBg(theme), borderTop: `2px solid ${theme.palette.divider}` } } : {}),
      }}
    >
      <TableCell sx={{ pl: 2.5, fontWeight: total ? 800 : 600 }}>{label}</TableCell>
      <TableCell align="right" sx={{ ...num, fontWeight: 700 }}>
        {fmtMoney(m.revenue)}
      </TableCell>
      {cmp !== undefined && <TableCell align="right">{deltaCell(dRev, "%")}</TableCell>}
      <TableCell align="right" sx={num}>
        {fmtInt(m.sold)}
      </TableCell>
      <TableCell align="right" sx={num}>
        {fmtInt(m.guestsArrived)}
      </TableCell>
      <TableCell align="right" sx={num}>
        {fmtInt(m.roomsArrived)}
      </TableCell>
      <TableCell align="right" sx={num}>
        {fmtMoney(m.adr, undefined, 2)}
      </TableCell>
      <TableCell align="right" sx={num}>
        {fmtMoney(m.revpar, undefined, 2)}
      </TableCell>
      <TableCell align="right" sx={{ ...num, color: "text.secondary" }}>
        {fmtInt(m.available)}
      </TableCell>
      <TableCell align="right" sx={{ pr: cmp !== undefined ? undefined : 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={1}>
          <Box sx={{ width: 44, height: 5, borderRadius: 3, bgcolor: alpha(occColor, 0.15), overflow: "hidden", display: { xs: "none", md: "block" } }}>
            <Box sx={{ width: `${Math.min(100, m.occupancy)}%`, height: "100%", bgcolor: occColor }} />
          </Box>
          <Typography variant="body2" sx={{ ...num, fontWeight: 700, minWidth: 56, textAlign: "right" }}>
            {fmtPercent(m.occupancy, 2)}
          </Typography>
        </Stack>
      </TableCell>
      {cmp !== undefined && (
        <TableCell align="right" sx={{ pr: 2.5 }}>
          {deltaCell(dOcc, " п.п.")}
        </TableCell>
      )}
    </TableRow>
  );
};

const YieldTable: React.FC<{
  result: YieldResult;
  cmp: YieldResult | null;
  group: YieldGroup;
  currency: string;
  tableSx: object;
  onDay: (date: string) => void;
}> = ({ result, cmp, group, currency, tableSx, onDay }) => {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const withDelta = cmp != null;
  return (
    <Surface padded={false} sx={{ overflow: "hidden" }}>
      <Box sx={{ overflowX: "auto", maxHeight: group === "day" ? "calc(100vh - 260px)" : undefined }}>
        <Table
          size="small"
          stickyHeader
          sx={{ ...tableSx, minWidth: withDelta ? 1100 : 920, "& td": { whiteSpace: "nowrap" }, "& th": { whiteSpace: "normal", lineHeight: 1.25, verticalAlign: "bottom" } }}
        >
          <MetricsHead first={group === "day" ? "Дата" : "Период"} withDelta={withDelta} />
          <TableBody>
            {result.rows.map((r, i) => {
              const expandable = group !== "day";
              const isOpen = open.has(r.key);
              const cmpRow = cmp?.rows[i] ?? null;
              return (
                <React.Fragment key={r.key}>
                  <MetricsRow
                    label={
                      <Stack direction="row" alignItems="center" gap={0.75}>
                        {expandable && (
                          <Box component="span" sx={{ width: 14, color: "text.secondary", fontSize: 12 }}>
                            {isOpen ? "▾" : "▸"}
                          </Box>
                        )}
                        {rowLabel(r, group)}
                      </Stack>
                    }
                    m={r}
                    currency={currency}
                    cmp={withDelta ? cmpRow : undefined}
                    onClick={
                      expandable
                        ? () =>
                            setOpen((s) => {
                              const next = new Set(s);
                              if (next.has(r.key)) next.delete(r.key);
                              else next.add(r.key);
                              return next;
                            })
                        : () => onDay(r.from)
                    }
                  />
                  {expandable &&
                    isOpen &&
                    result.days
                      .filter((d) => d.from >= r.from && d.from <= r.to)
                      .map((d) => (
                        <MetricsRow
                          key={d.key}
                          label={<Box sx={{ pl: 3, color: "text.secondary", fontWeight: 500 }}>{rowLabel(d, "day")}</Box>}
                          m={d}
                          currency={currency}
                          cmp={withDelta ? null : undefined}
                          onClick={() => onDay(d.from)}
                        />
                      ))}
                </React.Fragment>
              );
            })}
            <MetricsRow label="Итого за период" m={result.total} currency={currency} total cmp={withDelta ? cmp?.total ?? null : undefined} />
          </TableBody>
        </Table>
      </Box>
      {group !== "day" && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2.5, py: 1, borderTop: (t) => `1px solid ${subtleBorder(t)}` }}>
          Нажмите на строку, чтобы раскрыть по дням; на день — открыть номера за эту дату.
        </Typography>
      )}
    </Surface>
  );
};

// ── График ──────────────────────────────────────────────────────────────────

const YieldChart: React.FC<{ result: YieldResult; cmp: YieldResult | null; group: YieldGroup; currency: string }> = ({ result, cmp, group, currency }) => {
  const theme = useTheme();
  const rows = group === "month" && result.rows.length < 3 ? result.days : result.rows;
  const g: YieldGroup = rows === result.days ? "day" : group;
  const cmpRows = cmp ? (g === "day" ? cmp.days : cmp.rows) : null;
  const data = rows.map((r, i) => ({
    label: g === "day" ? dayjs(r.from).format("D MMM") : g === "month" ? dayjs(r.from).format("MMM YY") : dayjs(r.from).format("D MMM"),
    revenue: r.revenue,
    occupancy: r.occupancy,
    adr: r.adr,
    prevRevenue: cmpRows?.[i]?.revenue ?? null,
    prevOccupancy: cmpRows?.[i]?.occupancy ?? null,
    from: r.from,
  }));
  const moneyTicks = niceTicks(Math.max(0, ...data.map((p) => Math.max(p.revenue, p.prevRevenue ?? 0))));
  const tick = { fontSize: 11.5, fill: theme.palette.text.secondary };
  const tooltipStyle = { borderRadius: 10, border: `1px solid ${subtleBorder(theme)}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: 13 };
  const names: Record<string, string> = { revenue: "Доход", occupancy: "Загрузка", adr: "ADR", prevRevenue: "Доход (сравнение)", prevOccupancy: "Загрузка (сравнение)" };
  return (
    <ReportSection title="Доход и загрузка" subtitle={g === "day" ? "По дням" : g === "week" ? "По неделям" : "По месяцам"}>
      <Box sx={{ height: 340, mx: -1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={subtleBorder(theme)} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
            <YAxis yAxisId="money" tick={tick} width={64} axisLine={false} tickLine={false} ticks={moneyTicks} domain={[0, moneyTicks[moneyTicks.length - 1]]} tickFormatter={axisMoney} />
            <YAxis yAxisId="occ" orientation="right" tick={tick} width={44} axisLine={false} tickLine={false} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tickFormatter={(v: number) => `${v}%`} />
            <RechartsTooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: subtleBg(theme, true) }}
              formatter={(value?: number | string, name?: string | number) => {
                const key = String(name);
                const v = Number(value ?? 0);
                return [key.toLowerCase().includes("occupancy") ? fmtPercent(v) : fmtMoney(v, currency), names[key] ?? key];
              }}
            />
            <Legend formatter={(v: string) => names[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="money" dataKey="revenue" fill={theme.palette.primary.main} radius={[5, 5, 0, 0]} maxBarSize={34} />
            {cmp && <Bar yAxisId="money" dataKey="prevRevenue" fill={alpha(theme.palette.text.secondary, 0.3)} radius={[5, 5, 0, 0]} maxBarSize={34} />}
            <Line yAxisId="occ" dataKey="occupancy" type="monotone" stroke={theme.palette.success.main} strokeWidth={2.5} dot={false} />
            {cmp && <Line yAxisId="occ" dataKey="prevOccupancy" type="monotone" stroke={theme.palette.success.main} strokeDasharray="5 4" strokeWidth={1.5} dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </ReportSection>
  );
};

// ── Тепловой календарь ──────────────────────────────────────────────────────

const YieldHeatmap: React.FC<{ result: YieldResult; currency: string; onDay: (date: string) => void }> = ({ result, currency, onDay }) => {
  const theme = useTheme();
  const months = new Map<string, YieldRow[]>();
  for (const d of result.days) {
    const k = d.from.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), d]);
  }
  const color = (occ: number) => {
    const c = occ >= 90 ? theme.palette.success.main : occ >= 60 ? theme.palette.warning.main : theme.palette.error.main;
    return alpha(c, 0.12 + Math.min(1, occ / 100) * 0.55);
  };
  return (
    <ReportSection title="Календарь загрузки" subtitle="Цвет — загрузка дня: зелёный ≥ 90%, жёлтый ≥ 60%, красный — ниже. Нажмите на день — номера за дату.">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }, gap: 2.5 }}>
        {[...months.entries()].map(([key, list]) => {
          const first = dayjs(`${key}-01`);
          const offset = (first.day() + 6) % 7;
          const byDate = new Map(list.map((d) => [d.from, d]));
          const total = list.reduce(
            (s, d) => ({ revenue: s.revenue + d.revenue, sold: s.sold + d.sold, available: s.available + d.available }),
            { revenue: 0, sold: 0, available: 0 },
          );
          return (
            <Box key={key}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography sx={{ fontWeight: 800, textTransform: "capitalize" }}>{first.format("MMMM YYYY")}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtMoney(total.revenue, currency)} · {fmtPercent(total.available ? (total.sold / total.available) * 100 : 0)}
                </Typography>
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
                {WEEKDAYS.map((w, i) => (
                  <Typography key={w} variant="caption" sx={{ textAlign: "center", color: i >= 5 ? "error.main" : "text.secondary", fontWeight: 700 }}>
                    {w}
                  </Typography>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <Box key={`e${i}`} />
                ))}
                {Array.from({ length: first.daysInMonth() }, (_, i) => {
                  const date = first.date(i + 1).format("YYYY-MM-DD");
                  const d = byDate.get(date);
                  if (!d) return <Box key={date} sx={{ aspectRatio: "1 / 0.82", borderRadius: "8px", bgcolor: subtleBg(theme), opacity: 0.4 }} />;
                  return (
                    <Tooltip key={date} title={`${dayjs(date).format("D MMMM, dd")}: загрузка ${fmtPercent(d.occupancy)}, продано ${d.sold} из ${d.available}, доход ${fmtMoney(d.revenue, currency)}, ADR ${fmtMoney(d.adr, currency)}`}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => onDay(date)}
                        sx={{
                          aspectRatio: "1 / 0.82",
                          border: 0,
                          borderRadius: "8px",
                          bgcolor: color(d.occupancy),
                          font: "inherit",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: 1.1,
                          "&:hover": { outline: `2px solid ${alpha(theme.palette.text.primary, 0.35)}` },
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>
                          {i + 1}
                        </Typography>
                        <Typography sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{Math.round(d.occupancy)}%</Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          );
        })}
      </Box>
    </ReportSection>
  );
};

// ── Дни недели ──────────────────────────────────────────────────────────────

const YieldWeekdays: React.FC<{ result: YieldResult; currency: string }> = ({ result, currency }) => {
  const theme = useTheme();
  const data = result.byWeekday.map((w) => ({ label: WEEKDAYS[w.weekday], occupancy: w.occupancy, adr: w.adr, revenue: w.days ? w.revenue / w.days : 0 }));
  const best = [...result.byWeekday].sort((a, b) => b.occupancy - a.occupancy)[0];
  const worst = [...result.byWeekday].filter((w) => w.days > 0).sort((a, b) => a.occupancy - b.occupancy)[0];
  const adrTicks = niceTicks(Math.max(0, ...data.map((w) => w.adr)));
  const tick = { fontSize: 12, fill: theme.palette.text.secondary };
  return (
    <ReportSection
      title="Средние по дням недели"
      subtitle={best && worst ? `Сильнее всего — ${WEEKDAYS[best.weekday]} (${fmtPercent(best.occupancy)}), слабее — ${WEEKDAYS[worst.weekday]} (${fmtPercent(worst.occupancy)}): цены будних и выходных можно разнести в «Календаре цен».` : undefined}
    >
      <Box sx={{ height: 280, mx: -1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={subtleBorder(theme)} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis yAxisId="occ" tick={tick} width={44} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
            <YAxis yAxisId="money" orientation="right" tick={tick} width={64} axisLine={false} tickLine={false} ticks={adrTicks} domain={[0, adrTicks[adrTicks.length - 1]]} tickFormatter={axisMoney} />
            <RechartsTooltip
              contentStyle={{ borderRadius: 10, border: `1px solid ${subtleBorder(theme)}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: 13 }}
              formatter={(value?: number | string, name?: string | number) =>
                String(name) === "occupancy" ? [fmtPercent(Number(value ?? 0)), "Средняя загрузка"] : String(name) === "adr" ? [fmtMoney(Number(value ?? 0), currency), "ADR"] : [fmtMoney(Number(value ?? 0), currency), "Доход в день"]
              }
            />
            <Legend formatter={(v: string) => (v === "occupancy" ? "Средняя загрузка" : v === "adr" ? "ADR" : "Доход в день")} wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="occ" dataKey="occupancy" fill={alpha(theme.palette.info.main, 0.75)} radius={[6, 6, 0, 0]} maxBarSize={48} />
            <Line yAxisId="money" dataKey="adr" type="monotone" stroke={theme.palette.warning.main} strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </ReportSection>
  );
};

export default HotelYieldReport;
