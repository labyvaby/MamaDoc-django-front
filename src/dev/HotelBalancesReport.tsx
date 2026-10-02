/**
 * «Заезды» — отчёт, которым Viva чаще всего пользуется в Exely («Балансы
 * бронирований» по дате заезда): номер брони, дата брони со временем, канал
 * и юрлицо, заказчик, заезд и выезд со временем (план объекта, а у заехавших
 * — фактическое время), статус, номер, ADR, стоимость, оплачено и баланс с
 * итогами. Фильтры — статус, баланс, канал, юрлицо, поиск; «Вид» — какие
 * колонки показывать (запоминается); печать и Excel — в выбранных колонках.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import ViewColumnOutlined from "@mui/icons-material/ViewColumnOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { getErrorMessage } from "../api/client";
import { CustomDatePicker } from "../components/ui";
import { formatPhoneDisplay } from "../utility/phone";
import { HOTEL_BOARD_TYPE_LABELS, HOTEL_BOOKING_SOURCE_LABELS, HOTEL_GUARANTEE_METHOD_LABELS, HOTEL_RESERVATION_STATUS_LABELS, hotelSourceColor } from "./hotelDisplay";
import { esc, printHtmlDocument } from "./hotelPrintDocs";
import { fmtInt, fmtMoney } from "./hotelReportFormat";
import { balanceRows, balanceTotals, fetchAllReservations, type BalanceFilter, type BalanceRow, type BalanceStatusFilter } from "./hotelReportData";
import { ReportKpi, type ReportNav } from "./hotelReportUi";
import { FilterChip, plural, Surface, useHotelTableSx } from "./hotelUi";
import { downloadXlsx, xlsxFileName, type XlsxKind, type XlsxValue } from "./hotelXlsx";

type SortKey = "number" | "createdAt" | "customer" | "checkIn" | "checkOut" | "nights" | "rooms" | "adr" | "total" | "paid" | "balance";

const BALANCE_LABELS: Record<BalanceFilter, string> = { all: "Все", debt: "С долгом", overpaid: "Переплата", settled: "Оплачены" };
const STATUS_LABELS: Record<BalanceStatusFilter, string> = { active: "Активные", all: "Все", cancelled: "Отменённые" };
/** Статус как в Exely: подтверждённая — «Активная». */
const statusWord = (s: string) => (s === "confirmed" ? "Активная" : (HOTEL_RESERVATION_STATUS_LABELS[s] ?? s));
const boardWords = (b: string) =>
  b
    .split(", ")
    .filter(Boolean)
    .map((x) => HOTEL_BOARD_TYPE_LABELS[x] ?? x)
    .join(", ");
const guaranteeWord = (g: string) => (g ? (HOTEL_GUARANTEE_METHOD_LABELS[g] ?? g) : "");

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");
const COLUMNS_KEY = "mamadoc:hotel-arrivals:columns";

interface Column {
  key: string;
  label: string;
  align?: "right";
  sort?: SortKey;
  /** Показывать по умолчанию — раскладка как у Exely. */
  def: boolean;
  /** Колонка всегда видна. */
  fixed?: boolean;
  cell: (r: BalanceRow) => React.ReactNode;
  text: (r: BalanceRow) => string;
  xlsx: { kind?: XlsxKind; value: (r: BalanceRow) => XlsxValue; width?: number };
}

function readColumns(defaults: string[]): string[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : defaults;
  } catch {
    return defaults;
  }
}

export const HotelBalancesReport: React.FC<{
  propertyId: number;
  currency: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  nav: ReportNav;
}> = ({ propertyId, currency, checkInTime, checkOutTime, nav }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const today = D(dayjs());
  const from = nav.param("from") ?? today;
  const toRaw = nav.param("to") ?? from;
  const to = toRaw < from ? from : toRaw;
  const balance = ((nav.param("balance") as BalanceFilter | null) ?? "all") as BalanceFilter;
  const status = ((nav.param("status") as BalanceStatusFilter | null) ?? "active") as BalanceStatusFilter;
  const source = nav.param("source") ?? "";
  const corporate = nav.param("corporate") ?? "";
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "checkIn", dir: 1 });
  const [exporting, setExporting] = React.useState(false);
  const [viewAnchor, setViewAnchor] = React.useState<HTMLElement | null>(null);

  const inTime = checkInTime ? checkInTime.slice(0, 5) : null;
  const outTime = checkOutTime ? checkOutTime.slice(0, 5) : null;

  const columnsAll: Column[] = React.useMemo(() => {
    const dateTime = (iso: string | null, planned: string | null, actual: string | null) =>
      iso ? `${dayjs(iso).format("DD.MM.YYYY")}${actual ? ` ${dayjs(actual).format("HH:mm")}` : planned ? ` ${planned}` : ""}` : "—";
    const num = { fontVariantNumeric: "tabular-nums" } as const;
    // Дата и время в две строки — так широкая таблица Exely помещается на экран без прокрутки.
    const twoLine = (iso: string | null, time: string | null, color?: string, title?: string) => (
      <Box title={title}>
        <Typography variant="body2" sx={{ ...num, color, fontWeight: color ? 600 : 400, lineHeight: 1.25 }}>
          {iso ? dayjs(iso).format("DD.MM.YYYY") : "—"}
        </Typography>
        {time && (
          <Typography variant="caption" sx={{ ...num, color: color ?? "text.secondary", lineHeight: 1.2 }} component="div">
            {time}
          </Typography>
        )}
      </Box>
    );
    return [
      {
        key: "number",
        label: "Бронь",
        sort: "number",
        def: true,
        fixed: true,
        cell: (r) => (
          <>
            <Typography variant="body2" fontWeight={700}>
              №{r.number}
            </Typography>
            {r.externalId && (
              <Typography variant="caption" color="text.secondary" component="div">
                {r.externalId}
              </Typography>
            )}
          </>
        ),
        text: (r) => `№${r.number}${r.externalId ? ` · ${r.externalId}` : ""}`,
        xlsx: { kind: "int", value: (r) => r.number },
      },
      { key: "externalId", label: "Номер брони канала", def: false, cell: (r) => r.externalId || "—", text: (r) => r.externalId, xlsx: { value: (r) => r.externalId } },
      {
        key: "createdAt",
        label: "Дата брони",
        sort: "createdAt",
        def: true,
        cell: (r) => twoLine(r.createdAt, dayjs(r.createdAt).format("HH:mm")),
        text: (r) => dayjs(r.createdAt).format("DD.MM.YYYY HH:mm"),
        xlsx: { kind: "datetime", value: (r) => r.createdAt },
      },
      {
        key: "source",
        label: "Канал",
        def: true,
        cell: (r) => (
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: hotelSourceColor(r.source), flexShrink: 0 }} />
            <Typography variant="body2" noWrap>
              {HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source}
            </Typography>
          </Stack>
        ),
        text: (r) => HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source,
        xlsx: { value: (r) => HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source },
      },
      { key: "corporate", label: "Компания-заказчик", def: false, cell: (r) => r.corporateName || "—", text: (r) => r.corporateName, xlsx: { value: (r) => r.corporateName } },
      {
        key: "customer",
        label: "Заказчик",
        sort: "customer",
        def: true,
        fixed: true,
        cell: (r) => (
          <Typography variant="body2" fontWeight={600} noWrap title={r.customer} sx={{ maxWidth: 240 }}>
            {r.customer || "—"}
          </Typography>
        ),
        text: (r) => r.customer,
        xlsx: { value: (r) => r.customer, width: 28 },
      },
      { key: "phone", label: "Телефон", def: false, cell: (r) => (r.phone ? formatPhoneDisplay(r.phone) : "—"), text: (r) => (r.phone ? formatPhoneDisplay(r.phone) : ""), xlsx: { value: (r) => r.phone } },
      {
        key: "checkIn",
        label: "Заезд",
        sort: "checkIn",
        def: true,
        cell: (r) =>
          twoLine(
            r.checkIn,
            r.checkedInAt ? `${dayjs(r.checkedInAt).format("HH:mm")} · заселён` : inTime,
            r.checkedInAt ? "success.main" : undefined,
            r.checkedInAt ? "Время фактического заселения" : "Время заезда по правилам объекта",
          ),
        text: (r) => dateTime(r.checkIn, inTime, r.checkedInAt),
        xlsx: { value: (r) => dateTime(r.checkIn, inTime, r.checkedInAt) },
      },
      {
        key: "checkOut",
        label: "Выезд",
        sort: "checkOut",
        def: true,
        cell: (r) => twoLine(r.checkOut, r.checkedOutAt ? `${dayjs(r.checkedOutAt).format("HH:mm")} · выехал` : outTime),
        text: (r) => dateTime(r.checkOut, outTime, r.checkedOutAt),
        xlsx: { value: (r) => dateTime(r.checkOut, outTime, r.checkedOutAt) },
      },
      { key: "nights", label: "Ночей", align: "right", sort: "nights", def: false, cell: (r) => r.nights, text: (r) => String(r.nights), xlsx: { kind: "int", value: (r) => r.nights } },
      { key: "guests", label: "Гостей", align: "right", def: false, cell: (r) => r.guests, text: (r) => String(r.guests), xlsx: { kind: "int", value: (r) => r.guests } },
      {
        key: "status",
        label: "Статус",
        def: true,
        cell: (r) => (
          <Typography variant="body2" color={r.status === "confirmed" ? "text.primary" : "error.main"} fontWeight={600}>
            {statusWord(r.status)}
          </Typography>
        ),
        text: (r) => statusWord(r.status),
        xlsx: { value: (r) => statusWord(r.status) },
      },
      {
        key: "rooms",
        label: "Номер",
        sort: "rooms",
        def: true,
        cell: (r) => (
          <Typography variant="body2" fontWeight={800} sx={num}>
            {r.rooms}
          </Typography>
        ),
        text: (r) => r.rooms,
        xlsx: { value: (r) => r.rooms },
      },
      { key: "ratePlan", label: "Тариф", def: false, cell: (r) => r.ratePlan || "—", text: (r) => r.ratePlan, xlsx: { value: (r) => r.ratePlan } },
      { key: "board", label: "Питание", def: false, cell: (r) => boardWords(r.board) || "—", text: (r) => boardWords(r.board), xlsx: { value: (r) => boardWords(r.board) } },
      { key: "guarantee", label: "Гарантия", def: false, cell: (r) => guaranteeWord(r.guarantee) || "—", text: (r) => guaranteeWord(r.guarantee), xlsx: { value: (r) => guaranteeWord(r.guarantee) } },
      { key: "createdBy", label: "Оформил", def: false, cell: (r) => r.createdByName || "—", text: (r) => r.createdByName, xlsx: { value: (r) => r.createdByName } },
      {
        key: "adr",
        label: "ADR",
        align: "right",
        sort: "adr",
        def: true,
        cell: (r) => (
          <Typography variant="body2" color="text.secondary" sx={num}>
            {fmtMoney(r.adr)}
          </Typography>
        ),
        text: (r) => fmtMoney(r.adr),
        xlsx: { kind: "money", value: (r) => r.adr },
      },
      {
        key: "total",
        label: "Стоимость",
        align: "right",
        sort: "total",
        def: true,
        fixed: true,
        cell: (r) => (
          <Typography variant="body2" sx={num}>
            {fmtMoney(r.total)}
          </Typography>
        ),
        text: (r) => fmtMoney(r.total),
        xlsx: { kind: "money", value: (r) => r.total },
      },
      {
        key: "paid",
        label: "Оплачено",
        align: "right",
        sort: "paid",
        def: true,
        cell: (r) => (
          <Typography variant="body2" sx={num}>
            {fmtMoney(r.paid)}
          </Typography>
        ),
        text: (r) => fmtMoney(r.paid),
        xlsx: { kind: "money", value: (r) => r.paid },
      },
      {
        key: "balance",
        label: "Баланс",
        align: "right",
        sort: "balance",
        def: true,
        fixed: true,
        cell: (r) => (
          <Typography variant="body2" sx={{ ...num, fontWeight: 800, color: r.balance > 0 ? "error.main" : r.balance < 0 ? "warning.main" : "success.main" }}>
            {r.balance === 0 ? "0" : fmtMoney(r.balance)}
          </Typography>
        ),
        text: (r) => fmtMoney(r.balance),
        xlsx: { kind: "money", value: (r) => r.balance },
      },
    ];
  }, [inTime, outTime]);
  const [visibleKeys, setVisibleKeysState] = React.useState<string[]>(() => readColumns(columnsAll.filter((c) => c.def).map((c) => c.key)));
  const setVisibleKeys = (keys: string[]) => {
    setVisibleKeysState(keys);
    try {
      window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(keys));
    } catch {
      /* не запомнится — не страшно */
    }
  };
  const columns = columnsAll.filter((c) => c.fixed || visibleKeys.includes(c.key));

  // Пересечение [from, to+1) с проживанием — все, кто заезжает в период; дату заезда режем уже здесь.
  const query = useQuery({
    queryKey: ["hotel", "reports", "balances", propertyId, from, to, status === "active" ? "confirmed" : "any"],
    queryFn: ({ signal }) => fetchAllReservations({ propertyId, from, to: D(dayjs(to).add(1, "day")), ...(status === "active" ? { status: "confirmed" } : {}) }, signal),
  });

  const rows = React.useMemo(() => {
    const base = balanceRows(query.data?.rows ?? [], { from, to, balance, status, source: source || undefined, corporate: corporate || undefined });
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? base.filter((r) => [r.customer, String(r.number), r.externalId, r.rooms, r.phone, r.corporateName].some((v) => v.toLowerCase().includes(needle)))
      : base;
    const val = (r: BalanceRow): string | number => (sort.key === "customer" || sort.key === "rooms" ? r[sort.key].toLowerCase() : (r[sort.key] ?? ""));
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [query.data, from, to, balance, status, source, corporate, q, sort]);
  const totals = balanceTotals(rows);
  const debt = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const overpaid = rows.reduce((s, r) => s + Math.max(0, -r.balance), 0);
  const cur = rows[0]?.currency ?? currency;

  const sources = React.useMemo(() => [...new Set((query.data?.rows ?? []).map((r) => r.source).filter(Boolean))], [query.data]);
  const corporates = React.useMemo(() => [...new Set((query.data?.rows ?? []).map((r) => r.corporateName ?? "").filter(Boolean))].sort(), [query.data]);

  const setRange = (f: string, t: string) => nav.setParams({ from: f, to: t });
  const presets: { label: string; from: string; to: string }[] = [
    { label: "Сегодня", from: today, to: today },
    { label: "Завтра", from: D(dayjs().add(1, "day")), to: D(dayjs().add(1, "day")) },
    { label: "Вчера", from: D(dayjs().subtract(1, "day")), to: D(dayjs().subtract(1, "day")) },
    { label: "7 дней", from: today, to: D(dayjs().add(6, "day")) },
    { label: "Этот месяц", from: D(dayjs().startOf("month")), to: D(dayjs().endOf("month")) },
  ];

  const filtersMeta = [
    `Валюта: ${cur}`,
    `Период: по дате заезда с ${dayjs(from).format("DD.MM.YYYY")} по ${dayjs(to).format("DD.MM.YYYY")}`,
    `Статус бронирования: ${STATUS_LABELS[status]}`,
    `Канал: ${source ? (HOTEL_BOOKING_SOURCE_LABELS[source] ?? source) : "Все"}`,
    `Компания-заказчик: ${corporate || "Все"}`,
    `Баланс: ${BALANCE_LABELS[balance]}`,
  ];
  const totalCells: Record<string, XlsxValue> = {
    number: "Итого:",
    customer: `${rows.length} ${plural(rows.length, "бронь", "брони", "броней")}`,
    nights: totals.nights,
    guests: rows.reduce((s, r) => s + r.guests, 0),
    adr: totals.adr,
    total: totals.total,
    paid: totals.paid,
    balance: totals.balance,
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadXlsx(xlsxFileName("Заезды", from, to), [
        {
          name: "Заезды",
          title: "Заезды — балансы бронирований",
          meta: filtersMeta,
          tables: [
            {
              columns: columns.map((c) => ({ header: c.label + (c.xlsx.kind === "money" ? ` (${cur})` : ""), kind: c.xlsx.kind, width: c.xlsx.width })),
              rows: rows.map((r) => columns.map((c) => c.xlsx.value(r))),
              totals: columns.map((c) => totalCells[c.key] ?? null),
            },
          ],
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    const head = columns.map((c) => `<th class="${c.align === "right" ? "num" : ""}">${esc(c.label)}</th>`).join("");
    const body = rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.align === "right" ? "num" : ""}">${esc(c.text(r))}</td>`).join("")}</tr>`).join("");
    const foot = `<tr class="total">${columns
      .map((c) => {
        const v = totalCells[c.key];
        const shown = v == null ? "" : typeof v === "number" ? (c.key === "nights" || c.key === "guests" ? fmtInt(v) : fmtMoney(v)) : v;
        return `<td class="${c.align === "right" ? "num" : ""}">${esc(shown)}</td>`;
      })
      .join("")}</tr>`;
    printHtmlDocument(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заезды ${esc(dayjs(from).format("DD.MM.YYYY"))}</title><style>
@page { size: A4 landscape; margin: 10mm; }
body { font: 10.5px/1.35 "Inter", "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 17px; margin: 0 0 4px; }
.meta { color: #64748b; margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; }
th { background: #0f172a; color: #fff; text-align: left; padding: 5px 6px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; }
td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; }
tr:nth-child(even) td { background: #f8fafc; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
tr.total td { font-weight: 700; background: #eef2f7; border-top: 1.5px solid #0f172a; }
</style></head><body><h1>Заезды — балансы бронирований</h1><div class="meta">${filtersMeta.map(esc).join(" · ")}</div><table><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table></body></html>`);
  };

  const sortHead = (c: Column) => (
    <TableCell key={c.key} align={c.align ?? "left"} sortDirection={c.sort && sort.key === c.sort ? (sort.dir === 1 ? "asc" : "desc") : false}>
      {c.sort ? (
        <TableSortLabel
          active={sort.key === c.sort}
          direction={sort.key === c.sort && sort.dir === -1 ? "desc" : "asc"}
          onClick={() => {
            const key = c.sort as SortKey;
            setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "balance" || key === "total" ? -1 : 1 }));
          }}
        >
          {c.label}
        </TableSortLabel>
      ) : (
        c.label
      )}
    </TableCell>
  );

  return (
    <Stack gap={2.5}>
      <Surface sx={{ p: { xs: 1.75, md: 2 } }}>
        <Stack gap={1.75}>
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} flexWrap="wrap">
            <Stack direction="row" alignItems="center" gap={1}>
              <CustomDatePicker label="Заезд с" value={dayjs(from)} onChange={(v) => v && setRange(D(v), D(v) > to ? D(v) : to)} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
              <CustomDatePicker label="по" value={dayjs(to)} minDate={dayjs(from)} onChange={(v) => v && setRange(from, D(v))} slotProps={{ textField: { size: "small" } }} sx={{ width: 150 }} />
            </Stack>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {presets.map((p) => (
                <Button key={p.label} size="small" variant={p.from === from && p.to === to ? "contained" : "text"} disableElevation onClick={() => setRange(p.from, p.to)} sx={{ borderRadius: "8px" }}>
                  {p.label}
                </Button>
              ))}
            </Stack>
            <Box sx={{ flex: 1 }} />
            <Stack direction="row" gap={1}>
              <Button variant="outlined" startIcon={<ViewColumnOutlined />} onClick={(e) => setViewAnchor(e.currentTarget)}>
                Вид
              </Button>
              <Button variant="outlined" startIcon={<PrintOutlined />} disabled={rows.length === 0} onClick={handlePrint}>
                Печать
              </Button>
              <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exporting || rows.length === 0} onClick={() => void handleExport()}>
                {exporting ? "Готовим…" : "Excel"}
              </Button>
            </Stack>
          </Stack>
          <Stack direction={{ xs: "column", lg: "row" }} gap={1.5} alignItems={{ lg: "center" }}>
            <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
              {(Object.keys(STATUS_LABELS) as BalanceStatusFilter[]).map((k) => (
                <FilterChip key={k} label={STATUS_LABELS[k]} active={status === k} onClick={() => nav.setParams({ status: k === "active" ? null : k })} />
              ))}
              <Box sx={{ width: "1px", height: 22, bgcolor: "divider", mx: 0.5, display: { xs: "none", sm: "block" } }} />
              {(Object.keys(BALANCE_LABELS) as BalanceFilter[]).map((k) => (
                <FilterChip key={k} label={BALANCE_LABELS[k]} active={balance === k} onClick={() => nav.setParams({ balance: k === "all" ? null : k })} />
              ))}
            </Stack>
            <Box sx={{ flex: 1 }} />
            <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
              <TextField
                select
                size="small"
                label="Канал"
                value={source}
                onChange={(e) => nav.setParams({ source: e.target.value || null })}
                sx={{ minWidth: 160 }}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Все каналы</MenuItem>
                {sources.map((s) => (
                  <MenuItem key={s} value={s}>
                    {HOTEL_BOOKING_SOURCE_LABELS[s] ?? s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Компания-заказчик"
                value={corporate}
                onChange={(e) => nav.setParams({ corporate: e.target.value || null })}
                sx={{ minWidth: 180 }}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Все</MenuItem>
                {corporates.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                placeholder="Гость, №, номер, телефон"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ minWidth: { xs: 0, sm: 220 } }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
              />
            </Stack>
          </Stack>
        </Stack>
      </Surface>

      <Menu anchorEl={viewAnchor} open={viewAnchor != null} onClose={() => setViewAnchor(null)}>
        {columnsAll
          .filter((c) => !c.fixed)
          .map((c) => {
            const on = visibleKeys.includes(c.key);
            return (
              <MenuItem key={c.key} dense onClick={() => setVisibleKeys(on ? visibleKeys.filter((k) => k !== c.key) : [...visibleKeys, c.key])}>
                <Checkbox size="small" checked={on} sx={{ p: 0.5, mr: 1 }} />
                <ListItemText primary={c.label} />
              </MenuItem>
            );
          })}
        <MenuItem dense onClick={() => setVisibleKeys(columnsAll.filter((c) => c.def).map((c) => c.key))}>
          <ListItemText primary="Как в Exely — по умолчанию" slotProps={{ primary: { color: "primary.main", fontWeight: 600 } }} />
        </MenuItem>
      </Menu>

      {query.error ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(query.error, "Не удалось загрузить брони")}
        </Alert>
      ) : !query.data ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          {query.data.truncated && (
            <Alert severity="warning" variant="outlined">
              Броней слишком много — показаны первые 2000. Сузьте период.
            </Alert>
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
            <ReportKpi icon={<ReceiptLongOutlined />} label="Стоимость" value={fmtMoney(totals.total, cur)} hint={`${fmtInt(rows.length)} ${plural(rows.length, "заезд", "заезда", "заездов")}`} />
            <ReportKpi icon={<PaymentsOutlined />} tone="success" label="Оплачено" value={fmtMoney(totals.paid, cur)} hint={totals.total ? `${Math.round((totals.paid / totals.total) * 100)}% от стоимости` : undefined} />
            <ReportKpi
              icon={<AccountBalanceWalletOutlined />}
              tone="error"
              label="К оплате"
              value={fmtMoney(debt, cur)}
              emphasis={debt > 0}
              hint={overpaid > 0 ? `переплата ${fmtMoney(overpaid, cur)}` : `${rows.filter((r) => r.balance > 0).length} с долгом`}
              onClick={balance === "debt" ? undefined : () => nav.setParams({ balance: "debt" })}
            />
            <ReportKpi icon={<NightsStayOutlined />} tone="info" label="ADR" value={fmtMoney(totals.adr, cur)} hint={`${fmtInt(totals.nights)} ${plural(totals.nights, "ночь", "ночи", "ночей")}`} />
          </Box>

          <Surface padded={false} sx={{ overflow: "hidden", position: "relative" }}>
            {query.isFetching && <LinearProgress sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }} />}
            {rows.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>
                {balance === "debt" ? "Должников среди заездов нет" : "Заездов за период нет"}
              </Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table
                  size="small"
                  sx={{
                    ...tableSx,
                    minWidth: 100 + columns.length * 76,
                    "& td, & th": { whiteSpace: "nowrap", px: 1 },
                    // Стрелка сортировки — только у активной колонки: невидимые стрелки съедали ширину таблицы.
                    "& .MuiTableSortLabel-root:not(.Mui-active) .MuiTableSortLabel-icon": { display: "none" },
                    "& td:first-of-type, & th:first-of-type": { pl: 2.5 },
                    "& td:last-of-type, & th:last-of-type": { pr: 2.5 },
                  }}
                >
                  <TableHead>
                    <TableRow>{columns.map(sortHead)}</TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} hover onClick={() => nav.openReservation(r.id)} sx={{ cursor: "pointer" }}>
                        {columns.map((c) => (
                          <TableCell key={c.key} align={c.align ?? "left"}>
                            {c.cell(r)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow sx={{ "& td": { fontWeight: 800, bgcolor: theme.palette.action.hover, borderTop: `2px solid ${theme.palette.divider}` } }}>
                      {columns.map((c) => {
                        const v = totalCells[c.key];
                        return (
                          <TableCell key={c.key} align={c.align ?? "left"} sx={c.key === "balance" && totals.balance > 0 ? { color: "error.main" } : undefined}>
                            {v == null ? "" : typeof v === "number" ? (c.key === "nights" || c.key === "guests" ? fmtInt(v) : fmtMoney(v)) : v}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            )}
          </Surface>
        </>
      )}
    </Stack>
  );
};

export default HotelBalancesReport;
