/**
 * «Балансы бронирований» — как одноимённый отчёт Exely, которым пользуется
 * Viva: брони по дате заезда за период, канал, заказчик, номер, ADR,
 * стоимость, оплачено и баланс с итогами. Фильтры — статус, баланс (долг /
 * переплата / рассчитаны) и канал; строка открывает карточку брони; выгрузка
 * в Excel в той же раскладке, что у Exely.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  LinearProgress,
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
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { getErrorMessage } from "../api/client";
import { CustomDatePicker } from "../components/ui";
import { HOTEL_BOOKING_SOURCE_LABELS, HOTEL_RESERVATION_STATUS_LABELS, hotelSourceColor } from "./hotelDisplay";
import { balanceRows, balanceTotals, fetchAllReservations, type BalanceFilter, type BalanceRow, type BalanceStatusFilter } from "./hotelReportData";
import { fmtInt, fmtMoney } from "./hotelReportFormat";
import { ReportKpi, type ReportNav } from "./hotelReportUi";
import { FilterChip, plural, Surface, useHotelTableSx } from "./hotelUi";
import { downloadXlsx, xlsxFileName } from "./hotelXlsx";

type SortKey = "number" | "createdAt" | "customer" | "checkIn" | "checkOut" | "nights" | "rooms" | "adr" | "total" | "paid" | "balance";

const BALANCE_LABELS: Record<BalanceFilter, string> = { all: "Все", debt: "С долгом", overpaid: "Переплата", settled: "Оплачены" };
const STATUS_LABELS: Record<BalanceStatusFilter, string> = { active: "Активные", all: "Все", cancelled: "Отменённые" };

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

export const HotelBalancesReport: React.FC<{ propertyId: number; currency: string; nav: ReportNav }> = ({ propertyId, currency, nav }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const today = D(dayjs());
  const from = nav.param("from") ?? today;
  const toRaw = nav.param("to") ?? from;
  const to = toRaw < from ? from : toRaw;
  const balance = ((nav.param("balance") as BalanceFilter | null) ?? "all") as BalanceFilter;
  const status = ((nav.param("status") as BalanceStatusFilter | null) ?? "active") as BalanceStatusFilter;
  const source = nav.param("source") ?? "";
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "checkIn", dir: 1 });
  const [exporting, setExporting] = React.useState(false);

  // Пересечение [from, to+1) с проживанием — все, кто заезжает в период; дату заезда режем уже здесь.
  const query = useQuery({
    queryKey: ["hotel", "reports", "balances", propertyId, from, to, status === "active" ? "confirmed" : "any"],
    queryFn: ({ signal }) =>
      fetchAllReservations(
        { propertyId, from, to: D(dayjs(to).add(1, "day")), ...(status === "active" ? { status: "confirmed" } : {}) },
        signal,
      ),
  });

  const rows = React.useMemo(() => {
    const base = balanceRows(query.data?.rows ?? [], { from, to, balance, status, source: source || undefined });
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? base.filter((r) =>
          [r.customer, String(r.number), r.externalId, r.rooms].some((v) => v.toLowerCase().includes(needle)),
        )
      : base;
    const val = (r: BalanceRow): string | number => (sort.key === "customer" || sort.key === "rooms" ? r[sort.key].toLowerCase() : (r[sort.key] ?? ""));
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [query.data, from, to, balance, status, source, q, sort]);
  const totals = balanceTotals(rows);
  const debt = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const overpaid = rows.reduce((s, r) => s + Math.max(0, -r.balance), 0);
  const cur = rows[0]?.currency ?? currency;

  const sources = React.useMemo(() => {
    const set = new Set((query.data?.rows ?? []).map((r) => r.source).filter(Boolean));
    return [...set];
  }, [query.data]);

  const setRange = (f: string, t: string) => nav.setParams({ from: f, to: t });
  const presets: { label: string; from: string; to: string }[] = [
    { label: "Сегодня", from: today, to: today },
    { label: "Завтра", from: D(dayjs().add(1, "day")), to: D(dayjs().add(1, "day")) },
    { label: "7 дней", from: today, to: D(dayjs().add(6, "day")) },
    { label: "Этот месяц", from: D(dayjs().startOf("month")), to: D(dayjs().endOf("month")) },
    { label: "Прошлый месяц", from: D(dayjs().subtract(1, "month").startOf("month")), to: D(dayjs().subtract(1, "month").endOf("month")) },
  ];

  const sortHead = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <TableCell align={align} sortDirection={sort.key === key ? (sort.dir === 1 ? "asc" : "desc") : false}>
      <TableSortLabel
        active={sort.key === key}
        direction={sort.key === key && sort.dir === -1 ? "desc" : "asc"}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "balance" || key === "total" ? -1 : 1 }))}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadXlsx(xlsxFileName("Балансы бронирований", from, to), [
        {
          name: "Балансы",
          title: "Балансы бронирований",
          meta: [
            `Валюта: ${cur}`,
            `Период: по дате заезда с ${dayjs(from).format("DD.MM.YYYY")} по ${dayjs(to).format("DD.MM.YYYY")}`,
            `Статус бронирования: ${STATUS_LABELS[status]}`,
            `Канал: ${source ? HOTEL_BOOKING_SOURCE_LABELS[source] ?? source : "Все"}`,
            `Баланс: ${BALANCE_LABELS[balance]}`,
          ],
          tables: [
            {
              columns: [
                { header: "Номер брони", kind: "int" },
                { header: "Внешний номер" },
                { header: "Дата брони", kind: "datetime" },
                { header: "Канал" },
                { header: "ФИО заказчика", width: 30 },
                { header: "Дата заезда", kind: "date" },
                { header: "Дата выезда", kind: "date" },
                { header: "Ночей", kind: "int" },
                { header: "Статус" },
                { header: "Номер комнаты" },
                { header: `ADR (${cur})`, kind: "money" },
                { header: `Стоимость (${cur})`, kind: "money" },
                { header: `Оплачено (${cur})`, kind: "money" },
                { header: `Баланс (${cur})`, kind: "money" },
              ],
              rows: rows.map((r) => [
                r.number,
                r.externalId,
                r.createdAt,
                HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source,
                r.customer,
                r.checkIn,
                r.checkOut,
                r.nights,
                HOTEL_RESERVATION_STATUS_LABELS[r.status] ?? r.status,
                r.rooms,
                r.adr,
                r.total,
                r.paid,
                r.balance,
              ]),
              totals: ["Итого:", null, null, null, `${rows.length} броней`, null, null, totals.nights, null, null, totals.adr, totals.total, totals.paid, totals.balance],
            },
          ],
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack gap={2.5}>
      <Surface sx={{ p: { xs: 1.75, md: 2 } }}>
        <Stack gap={1.75}>
          <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} flexWrap="wrap">
            <Stack direction="row" alignItems="center" gap={1}>
              <CustomDatePicker
                label="Заезд с"
                value={dayjs(from)}
                onChange={(v) => v && setRange(D(v), D(v) > to ? D(v) : to)}
                slotProps={{ textField: { size: "small" } }}
                sx={{ width: 150 }}
              />
              <CustomDatePicker
                label="по"
                value={dayjs(to)}
                minDate={dayjs(from)}
                onChange={(v) => v && setRange(from, D(v))}
                slotProps={{ textField: { size: "small" } }}
                sx={{ width: 150 }}
              />
            </Stack>
            <Stack direction="row" gap={0.5} flexWrap="wrap">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  size="small"
                  variant={p.from === from && p.to === to ? "contained" : "text"}
                  disableElevation
                  onClick={() => setRange(p.from, p.to)}
                  sx={{ borderRadius: "8px" }}
                >
                  {p.label}
                </Button>
              ))}
            </Stack>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlined />}
              disabled={exporting || rows.length === 0}
              onClick={() => void handleExport()}
            >
              {exporting ? "Готовим…" : "Excel"}
            </Button>
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
            <Stack direction="row" gap={1}>
              <TextField
                select
                size="small"
                label="Канал"
                value={source}
                onChange={(e) => nav.setParams({ source: e.target.value || null })}
                sx={{ minWidth: 170 }}
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
                size="small"
                placeholder="Гость, №, номер"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                sx={{ minWidth: { xs: 0, sm: 220 }, flex: { xs: 1, sm: "none" } }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
              />
            </Stack>
          </Stack>
        </Stack>
      </Surface>

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
            <ReportKpi icon={<ReceiptLongOutlined />} label="Стоимость" value={fmtMoney(totals.total, cur)} hint={`${fmtInt(rows.length)} ${plural(rows.length, "бронь", "брони", "броней")}`} />
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
                {balance === "debt" ? "Должников за период нет" : "За период броней нет"}
              </Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ ...tableSx, minWidth: 1000, "& td, & th": { whiteSpace: "nowrap", px: 1.25 }, "& td:first-of-type, & th:first-of-type": { pl: 2.5 }, "& td:last-of-type, & th:last-of-type": { pr: 2.5 } }}>
                  <TableHead>
                    <TableRow>
                      {sortHead("number", "Бронь")}
                      {sortHead("createdAt", "Создана")}
                      <TableCell>Канал</TableCell>
                      {sortHead("customer", "Заказчик")}
                      {sortHead("checkIn", "Заезд")}
                      {sortHead("checkOut", "Выезд")}
                      {sortHead("nights", "Ночей", "right")}
                      {sortHead("rooms", "Номер")}
                      {sortHead("adr", "ADR", "right")}
                      {sortHead("total", "Стоимость", "right")}
                      {sortHead("paid", "Оплачено", "right")}
                      {sortHead("balance", "Баланс", "right")}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} hover onClick={() => nav.openReservation(r.id)} sx={{ cursor: "pointer" }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>
                            №{r.number}
                          </Typography>
                          {r.externalId && (
                            <Typography variant="caption" color="text.secondary" component="div">
                              {r.externalId}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ color: "text.secondary" }}>{dayjs(r.createdAt).format("DD.MM HH:mm")}</TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" gap={0.75}>
                            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: hotelSourceColor(r.source) }} />
                            <Typography variant="body2">{HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 240 }}>
                          <Typography variant="body2" fontWeight={600} noWrap title={r.customer}>
                            {r.customer || "—"}
                          </Typography>
                          {status !== "active" && (
                            <Typography variant="caption" color={r.status === "confirmed" ? "text.secondary" : "error.main"} component="div">
                              {HOTEL_RESERVATION_STATUS_LABELS[r.status] ?? r.status}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{r.checkIn ? dayjs(r.checkIn).format("DD.MM.YY") : "—"}</TableCell>
                        <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{r.checkOut ? dayjs(r.checkOut).format("DD.MM.YY") : "—"}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {r.nights}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.rooms}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                          {fmtMoney(r.adr)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(r.total)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(r.paid)}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 700,
                            color: r.balance > 0 ? "error.main" : r.balance < 0 ? "warning.main" : "success.main",
                          }}
                        >
                          {r.balance === 0 ? "0" : fmtMoney(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ "& td": { fontWeight: 800, bgcolor: theme.palette.action.hover, borderTop: `2px solid ${theme.palette.divider}` } }}>
                      <TableCell colSpan={6}>Итого · {fmtInt(rows.length)} броней</TableCell>
                      <TableCell align="right">{fmtInt(totals.nights)}</TableCell>
                      <TableCell />
                      <TableCell align="right">{fmtMoney(totals.adr)}</TableCell>
                      <TableCell align="right">{fmtMoney(totals.total)}</TableCell>
                      <TableCell align="right">{fmtMoney(totals.paid)}</TableCell>
                      <TableCell align="right" sx={{ color: totals.balance > 0 ? "error.main" : "text.primary" }}>
                        {fmtMoney(totals.balance)}
                      </TableCell>
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
