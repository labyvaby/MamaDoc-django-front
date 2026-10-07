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
  ButtonBase,
  Checkbox,
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
  useMediaQuery,
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
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { formatPhoneDisplay } from "../utility/phone";
import { HOTEL_BOARD_TYPE_LABELS, HOTEL_BOOKING_SOURCE_LABELS, HOTEL_GUARANTEE_METHOD_LABELS, HOTEL_RESERVATION_STATUS_LABELS, hotelSourceColor } from "./hotelDisplay";
import { esc, printHtmlDocument } from "./hotelPrintDocs";
import { fmtInt, fmtMoney } from "./hotelReportFormat";
import { balanceRows, balanceTotals, fetchAllReservations, type BalanceFilter, type BalanceRow, type BalanceStatusFilter } from "./hotelReportData";
import { ReportControls, ReportFilters, ReportKpi, ReportSkeleton, type ReportNav } from "./hotelReportUi";
import { matchesByParts } from "./searchParts";
import { FilterChip, plural, Surface, useHotelTableSx } from "./hotelUi";
import { formatHotelDate, formatHotelDateRange } from "./mockDemoData";
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
  // На телефоне широкая таблица Exely видна на треть — там карточка брони.
  const phone = useMediaQuery(theme.breakpoints.down("md"));
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
            r.missed ? "не заехал" : r.checkedInAt ? `${dayjs(r.checkedInAt).format("HH:mm")} · заселён` : (r.expectedArrivalTime ?? inTime),
            r.missed ? "error.main" : r.checkedInAt ? "success.main" : r.expectedArrivalTime ? "info.main" : undefined,
            r.missed
              ? "Ждали, гость не приехал, незаезд не закрыт: ресепшен → «Закрыть день»"
              : r.checkedInAt
                ? "Время фактического заселения"
                : r.expectedArrivalTime
                  ? "Время заезда брони: ранний заезд или со слов гостя"
                  : "Время заезда по правилам объекта",
          ),
        text: (r) => dateTime(r.checkIn, r.expectedArrivalTime ?? inTime, r.checkedInAt),
        xlsx: { value: (r) => dateTime(r.checkIn, r.expectedArrivalTime ?? inTime, r.checkedInAt) },
      },
      {
        key: "checkOut",
        label: "Выезд",
        sort: "checkOut",
        def: true,
        cell: (r) =>
          twoLine(
            r.checkOut,
            r.checkedOutAt ? `${dayjs(r.checkedOutAt).format("HH:mm")} · выехал` : (r.expectedDepartureTime ?? outTime),
            r.checkedOutAt ? undefined : r.expectedDepartureTime ? "warning.dark" : undefined,
            r.checkedOutAt ? "Время фактического выезда" : r.expectedDepartureTime ? "Время выезда брони: поздний выезд" : "Время выезда по правилам объекта",
          ),
        text: (r) => dateTime(r.checkOut, r.expectedDepartureTime ?? outTime, r.checkedOutAt),
        xlsx: { value: (r) => dateTime(r.checkOut, r.expectedDepartureTime ?? outTime, r.checkedOutAt) },
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
        // Цена ночи без допуслуг, по ночам, которые гость прожил или проживёт — как ADR «Собственнику».
        // Незаезд или выезд до первой ночи — ночей нет, ADR не показываем.
        cell: (r) => (
          <Typography variant="body2" color="text.secondary" sx={num}>
            {r.adrNights ? fmtMoney(r.adr) : "—"}
          </Typography>
        ),
        text: (r) => (r.adrNights ? fmtMoney(r.adr) : "—"),
        xlsx: { kind: "money", value: (r) => (r.adrNights ? r.adr : null) },
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
    // checkInFrom/checkInTo сервер с §10 применяет сам (меньше страниц), старый — пропускает; режем и здесь.
    queryFn: ({ signal }) =>
      fetchAllReservations(
        { propertyId, from, to: D(dayjs(to).add(1, "day")), checkInFrom: from, checkInTo: to, ...(status === "active" ? { status: "confirmed" } : {}) },
        signal,
      ),
  });

  const rows = React.useMemo(() => {
    const base = balanceRows(query.data?.rows ?? [], { from, to, balance, status, source: source || undefined, corporate: corporate || undefined, today });
    // По частям, как поиск на сервере (searchParts): «Бекова 201», «0555 11 10», «Альфа».
    const guestsOf = (r: BalanceRow) => r.reservation.items.flatMap((i) => i.guests);
    const filtered = q.trim()
      ? base.filter((r) =>
          matchesByParts(q, {
            texts: [r.customer, r.externalId, r.corporateName, ...guestsOf(r).map((g) => g.fullName)],
            phones: [r.phone, ...guestsOf(r).map((g) => g.phone)],
            exact: [r.number, ...r.rooms.split(/[\s,]+/)],
          }),
        )
      : base;
    const val = (r: BalanceRow): string | number => (sort.key === "customer" || sort.key === "rooms" ? r[sort.key].toLowerCase() : (r[sort.key] ?? ""));
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [query.data, from, to, balance, status, source, corporate, q, sort, today]);
  const totals = balanceTotals(rows);
  // Долг — у тех, кто заехал или ещё приедет; не заехавшие (незаезд не закрыт) — отдельно, как в «Собственнику».
  const debt = rows.reduce((s, r) => s + (r.missed ? 0 : Math.max(0, r.balance)), 0);
  const missedDebt = rows.reduce((s, r) => s + (r.missed ? Math.max(0, r.balance) : 0), 0);
  const missedCount = rows.filter((r) => r.missed && r.balance > 0).length;
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

  const viewButton = (
    <Button variant="outlined" startIcon={<ViewColumnOutlined />} onClick={(e) => setViewAnchor(e.currentTarget)} sx={{ alignSelf: { xs: "flex-start", md: "auto" } }}>
      {phone ? "Колонки печати и Excel" : "Вид"}
    </Button>
  );
  const printButton = (
    <Button variant="outlined" startIcon={<PrintOutlined />} disabled={rows.length === 0} onClick={handlePrint} sx={{ minHeight: { xs: 40, md: 0 }, px: { xs: 1.25, md: 2 } }}>
      Печать
    </Button>
  );
  const excelButton = (
    <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exporting || rows.length === 0} onClick={() => void handleExport()} sx={{ minHeight: { xs: 40, md: 0 }, px: { xs: 1.25, md: 2 } }}>
      {exporting ? "Готовим…" : "Excel"}
    </Button>
  );
  const searchField = (
    <TextField
      size="small"
      placeholder="ФИО, телефон, № брони, комната"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      sx={{ minWidth: { xs: 0, md: 220 } }}
      slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
    />
  );

  // Свёрнутая панель — одной строкой: период и включённые фильтры.
  const activePreset = presets.find((p) => p.from === from && p.to === to);
  const summaryParts = [
    status !== "active" ? STATUS_LABELS[status].toLowerCase() : null,
    balance !== "all" ? BALANCE_LABELS[balance].toLowerCase() : null,
    source ? (HOTEL_BOOKING_SOURCE_LABELS[source] ?? source) : null,
    corporate || null,
    q.trim() ? `«${q.trim()}»` : null,
  ].filter(Boolean);

  const phoneCard = (r: BalanceRow, i: number) => {
    const arrival = r.missed
      ? { text: "не заехал", color: "error.main" }
      : r.checkedInAt
      ? { text: `заселён в ${dayjs(r.checkedInAt).format("HH:mm")}`, color: "success.main" }
      : r.expectedArrivalTime
        ? { text: `заезд в ${r.expectedArrivalTime}`, color: "info.main" }
        : r.expectedDepartureTime && !r.checkedOutAt
          ? { text: `выезд до ${r.expectedDepartureTime}`, color: "warning.dark" }
          : null;
    return (
      <ButtonBase
        key={r.id}
        component="div"
        onClick={() => nav.openReservation(r.id)}
        sx={{
          display: "block",
          width: "100%",
          textAlign: "left",
          px: 2,
          py: 1.5,
          borderTop: i > 0 ? `1px solid ${subtleBorder(theme)}` : "none",
          "&.Mui-focusVisible": { bgcolor: subtleBg(theme, true) },
        }}
      >
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1.5}>
          <Typography variant="body2" fontWeight={700} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {r.customer || "—"}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: r.balance > 0 ? "error.main" : r.balance < 0 ? "warning.main" : "success.main" }}
          >
            {r.balance > 0 ? `долг ${fmtMoney(r.balance, r.currency)}` : r.balance < 0 ? `переплата ${fmtMoney(-r.balance, r.currency)}` : "оплачено"}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25, fontVariantNumeric: "tabular-nums" }}>
          №{r.number}
          {r.checkIn && r.checkOut ? ` · ${formatHotelDateRange(r.checkIn, r.checkOut)}` : ""} · {r.nights} {plural(r.nights, "ночь", "ночи", "ночей")}
          {r.rooms ? ` · номер ${r.rooms}` : ""}
        </Typography>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 0.75 }}>
          <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ minWidth: 0 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: hotelSourceColor(r.source), flexShrink: 0 }} />
            <Typography variant="caption">{HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source}</Typography>
            {r.status !== "confirmed" && (
              <Typography variant="caption" color="error.main" fontWeight={600}>
                · {statusWord(r.status)}
              </Typography>
            )}
            {arrival && (
              <Typography variant="caption" color={arrival.color} fontWeight={600}>
                · {arrival.text}
              </Typography>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {fmtMoney(r.paid)} из {fmtMoney(r.total, r.currency)}
          </Typography>
        </Stack>
      </ButtonBase>
    );
  };

  return (
    <Stack gap={2.5}>
      <ReportControls
        nav={nav}
        summary={
          <>
            Заезд {from === to ? formatHotelDate(from) : formatHotelDateRange(from, to)}
            {activePreset ? ` · ${activePreset.label.toLowerCase()}` : ""}
            {summaryParts.length > 0 && (
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                {" "}
                · {summaryParts.join(" · ")}
              </Box>
            )}
          </>
        }
        actions={[
          { label: "Печать", icon: <PrintOutlined />, onClick: handlePrint, disabled: rows.length === 0 },
          { label: exporting ? "Готовим…" : "Excel", icon: <FileDownloadOutlined />, onClick: () => void handleExport(), disabled: exporting || rows.length === 0 },
        ]}
      >
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
            <Box sx={{ flex: 1, display: { xs: "none", md: "block" } }} />
            {!phone && (
              <Stack direction="row" gap={1}>
                {viewButton}
                {printButton}
                {excelButton}
              </Stack>
            )}
          </Stack>
          {phone && searchField}
          <ReportFilters
            active={(status !== "active" ? 1 : 0) + (balance !== "all" ? 1 : 0) + (source ? 1 : 0) + (corporate ? 1 : 0)}
            extra={
              <>
                {printButton}
                {excelButton}
              </>
            }
          >
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
              <Stack direction={{ xs: "column", md: "row" }} gap={1}>
                <TextField
                  select
                  size="small"
                  label="Канал"
                  value={source}
                  onChange={(e) => nav.setParams({ source: e.target.value || null })}
                  sx={{ minWidth: { md: 160 } }}
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
                  sx={{ minWidth: { md: 180 } }}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">Все</MenuItem>
                  {corporates.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </TextField>
                {!phone && searchField}
                {phone && viewButton}
              </Stack>
            </Stack>
          </ReportFilters>
        </Stack>
      </ReportControls>

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
        <ReportSkeleton block={320} />
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
              hint={
                missedDebt > 0
                  ? `не заехали: ещё ${fmtMoney(missedDebt, cur)} (${missedCount}) — не считаем`
                  : overpaid > 0
                    ? `переплата ${fmtMoney(overpaid, cur)}`
                    : `${rows.filter((r) => r.balance > 0 && !r.missed).length} с долгом`
              }
              onClick={balance === "debt" ? undefined : () => nav.setParams({ balance: "debt" })}
            />
            <ReportKpi icon={<NightsStayOutlined />} tone="info" label="ADR" value={fmtMoney(totals.adr, cur)} hint={`цена ночи без допуслуг · ${fmtInt(totals.adrNights)} ${plural(totals.adrNights, "ночь", "ночи", "ночей")}`} />
          </Box>

          <Surface padded={false} sx={{ overflow: "hidden", position: "relative" }}>
            {query.isFetching && <LinearProgress sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }} />}
            {rows.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }}>
                {balance === "debt" ? "Должников среди заездов нет" : "Заездов за период нет"}
              </Typography>
            ) : phone ? (
              rows.map(phoneCard)
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
