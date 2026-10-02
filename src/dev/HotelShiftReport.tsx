/**
 * «Смена администратора» — отчёт, который ресепшен Viva вёл в Google Sheets
 * («отчёт админов»), теперь из самой системы: поступления за смену по
 * номерам (наличка / безнал / терминал), расходы смены с добавлением прямо
 * здесь, выручка и касса, завтраки на утро, звонки и сообщения, заезды дня.
 * Смена — календарные сутки или сутки с часа пересменки (суточные смены).
 * Печать в формате их таблицы и выгрузка в Excel.
 *
 * Оплаты — реестр кассы (hotel.payments.manage), расходы — финансы филиала
 * (finance.view / finance.expense.view, добавление — finance.expense.manage).
 * Звонки и сообщения на бэкенде пока не хранятся — держим на устройстве
 * администратора до печати (см. docs/hotel-backend-requests-2026-10-02.md).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import ShoppingCartOutlined from "@mui/icons-material/ShoppingCartOutlined";
import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
import FreeBreakfastOutlined from "@mui/icons-material/FreeBreakfastOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { createExpense, createExpenseCategory, getExpenseCategories, voidExpense, type ExpenseCategory } from "../api/expenses";
import { getReservation, type HotelReservation } from "../api/hotel";
import { getAllDjangoEmployees } from "../api/staff";
import { useCan } from "../hooks/useCan";
import { usePermissions } from "../hooks/usePermissions";
import { subtleBg } from "../theme/uiHelpers";
import { HOTEL_BOOKING_SOURCE_LABELS } from "./hotelDisplay";
import { printHtmlDocument } from "./hotelPrintDocs";
import {
  breakfastCount,
  fetchAllExpenses,
  fetchAllReservations,
  fetchPaymentRegister,
  inWindow,
  paymentChannelLabel,
  reservationCheckIn,
  reservationCheckOut,
  shiftWindow,
  signedAmount,
  summarizeExpenses,
  summarizePayments,
} from "./hotelReportData";
import { fmtMoney } from "./hotelReportFormat";
import { ReportEmpty, ReportKpi, ReportLink, ReportSection, type ReportNav } from "./hotelReportUi";
import { buildShiftReportHtml, type ShiftArrivalLine, type ShiftCounters, type ShiftExpenseLine, type ShiftPaymentLine } from "./hotelShiftPrint";
import { DateStepper, useHotelTableSx } from "./hotelUi";
import { downloadXlsx, xlsxFileName } from "./hotelXlsx";

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");
const SHIFT_START_KEY = "mamadoc:hotel-shift:start";
const SHIFT_STARTS = [0, 8, 9, 10, 12];
const EMPTY_COUNTERS: ShiftCounters = { megacom: "", o: "", whatsapp: "" };
const countersKey = (propertyId: number, date: string) => `mamadoc:hotel-shift:counters:${propertyId}:${date}`;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим — счётчики просто не запомнятся */
  }
}

const LIVE = new Set(["confirmed"]);

export const HotelShiftReport: React.FC<{
  propertyId: number;
  propertyName: string;
  branchId: number | null;
  currency: string;
  nav: ReportNav;
}> = ({ propertyId, propertyName, branchId, currency, nav }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { activeOrganization, activeEmployee, user } = usePermissions();
  const canExpenses = useCan(["finance.view", "finance.expense.view"]);
  const canManageExpenses = useCan("finance.expense.manage");
  const orgId = activeOrganization?.id ?? null;
  const me = activeEmployee?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || "";

  const date = nav.param("date") ?? D(dayjs());
  const [startHour, setStartHourState] = React.useState<number>(() => {
    const v = readLocal<number>(SHIFT_START_KEY, 0);
    return SHIFT_STARTS.includes(v) ? v : 0;
  });
  const setStartHour = (h: number) => {
    setStartHourState(h);
    writeLocal(SHIFT_START_KEY, h);
  };
  const [admin, setAdmin] = React.useState("");
  const [counters, setCounters] = React.useState<ShiftCounters>(() => readLocal(countersKey(propertyId, date), EMPTY_COUNTERS));
  React.useEffect(() => setCounters(readLocal(countersKey(propertyId, date), EMPTY_COUNTERS)), [propertyId, date]);
  const updateCounter = (key: keyof ShiftCounters, value: string) => {
    const next = { ...counters, [key]: value.replace(/\D/g, "").slice(0, 5) };
    setCounters(next);
    writeLocal(countersKey(propertyId, date), next);
  };

  const shift = React.useMemo(() => shiftWindow(date, startHour), [date, startHour]);
  const windowLabel =
    startHour === 0
      ? `сутки ${dayjs(date).format("DD.MM")}`
      : `смена ${shift.start.format("DD.MM HH:mm")} – ${shift.end.format("DD.MM HH:mm")}`;
  const regTo = D(dayjs(date).add(startHour > 0 ? 2 : 1, "day"));

  const paymentsQuery = useQuery({
    queryKey: ["hotel", "reports", "shiftPayments", propertyId, date, regTo],
    queryFn: ({ signal }) => fetchPaymentRegister(propertyId, date, regTo, signal),
    placeholderData: undefined,
  });
  const dayQuery = useQuery({
    queryKey: ["hotel", "reports", "shiftDay", propertyId, date],
    queryFn: async ({ signal }) => {
      const [arrivals, inHouse, prevNight, departures] = await Promise.all([
        fetchAllReservations({ propertyId, arrivingOn: date }, signal, 2),
        fetchAllReservations({ propertyId, inHouseOn: date }, signal, 3),
        fetchAllReservations({ propertyId, inHouseOn: D(dayjs(date).subtract(1, "day")) }, signal, 3),
        fetchAllReservations({ propertyId, departingOn: date }, signal, 2),
      ]);
      return { arrivals: arrivals.rows, inHouse: inHouse.rows, prevNight: prevNight.rows, departures: departures.rows };
    },
    placeholderData: undefined,
  });
  const expensesQuery = useQuery({
    queryKey: ["hotel", "reports", "shiftExpenses", orgId, branchId, date],
    queryFn: ({ signal }) => fetchAllExpenses({ organizationId: orgId!, branchId, dateFrom: date, dateTo: date }, signal),
    enabled: canExpenses && orgId != null,
    placeholderData: undefined,
  });

  const shiftPayments = React.useMemo(
    () =>
      (paymentsQuery.data?.rows ?? [])
        .filter((p) => inWindow(p.acceptedAt, shift))
        .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt)),
    [paymentsQuery.data, shift],
  );
  const admins = React.useMemo(() => {
    const set = new Set(shiftPayments.map((p) => p.acceptedByName).filter(Boolean));
    return [...set].sort();
  }, [shiftPayments]);
  const visiblePayments = admin ? shiftPayments.filter((p) => p.acceptedByName === admin) : shiftPayments;

  // Брони для строк оплат: сначала из списков дня, недостающие — по одной (их немного).
  const known = React.useMemo(() => {
    const map = new Map<number, HotelReservation>();
    const d = dayQuery.data;
    if (d) for (const r of [...d.arrivals, ...d.inHouse, ...d.departures, ...d.prevNight]) map.set(r.id, r);
    return map;
  }, [dayQuery.data]);
  const missingIds = React.useMemo(
    () => (dayQuery.data ? [...new Set(visiblePayments.map((p) => p.reservationId))].filter((id) => !known.has(id)).slice(0, 40).sort((a, b) => a - b) : []),
    [visiblePayments, known, dayQuery.data],
  );
  const missingQuery = useQuery({
    queryKey: ["hotel", "reports", "shiftMissing", missingIds],
    queryFn: async ({ signal }) => (await Promise.all(missingIds.map((id) => getReservation(id, signal).catch(() => null)))).filter((r): r is NonNullable<typeof r> => r != null),
    enabled: missingIds.length > 0,
  });
  const reservationOf = (id: number) => known.get(id) ?? missingQuery.data?.find((r) => r.id === id);

  const lines: ShiftPaymentLine[] = visiblePayments.map((p) => {
    const r = reservationOf(p.reservationId);
    const active = r?.items.filter((i) => i.isActive !== false) ?? [];
    const amount = signedAmount(p);
    return {
      id: p.id,
      acceptedAt: p.acceptedAt,
      reservationId: p.reservationId,
      reservationNumber: r?.number ?? null,
      room: active.length ? active.map((i) => i.roomNumber ?? "—").join(", ") : "—",
      guest: r?.customerName || active[0]?.guests[0]?.fullName || (r ? "" : "…"),
      checkIn: r ? reservationCheckIn(r) : null,
      checkOut: r ? reservationCheckOut(r) : null,
      cash: p.method === "cash" ? amount : null,
      cashless: p.method !== "cash" ? amount : null,
      channel: paymentChannelLabel(p),
      note: p.note,
      acceptedBy: p.acceptedByName,
      refund: p.kind === "refund",
    };
  });
  const payments = summarizePayments(visiblePayments);
  const expenseRows = expensesQuery.data?.rows ?? [];
  const expenseSummary = summarizeExpenses(expenseRows);
  const expenseLines: ShiftExpenseLine[] = expenseRows.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    name: e.name,
    category: e.categoryName ?? "",
    cash: Number(e.cashAmount) > 0,
    employee: e.employeeName ?? "",
  }));
  const kassa = payments.cash - expenseSummary.cash;
  const breakfasts = dayQuery.data ? breakfastCount(dayQuery.data.prevNight, date) : 0;
  const arrivals: ShiftArrivalLine[] = (dayQuery.data?.arrivals ?? [])
    .filter((r) => LIVE.has(r.status))
    .map((r) => {
      const active = r.items.filter((i) => i.isActive !== false);
      return {
        number: r.number,
        externalId: r.externalId,
        room: active.map((i) => i.roomNumber ?? "—").join(", "),
        guest: r.customerName || active[0]?.guests[0]?.fullName || "",
        checkIn: reservationCheckIn(r),
        checkOut: reservationCheckOut(r),
        source: HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source,
        checkedInAt: active.find((i) => i.checkedInAt)?.checkedInAt ?? null,
        total: Number(r.totalAmount),
        paid: Number(r.paidAmount),
        balance: Number(r.balanceDue),
      };
    });
  const arrivalIds = (dayQuery.data?.arrivals ?? []).filter((r) => LIVE.has(r.status)).map((r) => r.id);
  const adminName = admin || me;

  const printInput = () => ({
    propertyName,
    date,
    windowLabel,
    adminName,
    currency,
    lines,
    expenses: expenseLines,
    payments,
    expenseSummary,
    breakfasts,
    counters,
    arrivals,
  });

  const [exporting, setExporting] = React.useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadXlsx(xlsxFileName("Отчёт администратора", date), [
        {
          name: "Смена",
          title: "Отчёт администратора за смену",
          meta: [`${propertyName} · ${windowLabel}`, `Дата: ${dayjs(date).format("DD.MM.YYYY")}`, `Админ: ${adminName || "—"}`, `Валюта: ${currency}`],
          summary: [
            { label: "Выручка — наличка", value: payments.cash, kind: "money" },
            { label: "Выручка — безнал", value: payments.cashless, kind: "money" },
            ...payments.byChannel.map((c) => ({ label: `   в т.ч. ${c.label}`, value: c.amount, kind: "money" as const })),
            { label: "Выручка — всего", value: payments.total, kind: "money" },
            { label: "Расходы", value: expenseSummary.total, kind: "money" },
            { label: "Касса (наличные − расходы наличными)", value: kassa, kind: "money" },
            { label: "Кол-во завтраков", value: breakfasts, kind: "int" },
            { label: "Звонков — Мегаком", value: counters.megacom || null, kind: "int" },
            { label: "Звонков — О!", value: counters.o || null, kind: "int" },
            { label: "Сообщений в WhatsApp", value: counters.whatsapp || null, kind: "int" },
          ],
          tables: [
            {
              title: "Поступления",
              columns: [
                { header: "Номер" },
                { header: "ФИО", width: 28 },
                { header: "Заезд", kind: "date" },
                { header: "Выезд", kind: "date" },
                { header: "Наличка", kind: "money" },
                { header: "Безнал", kind: "money" },
                { header: "Способ" },
                { header: "Время", kind: "datetime" },
                { header: "Комментарий", width: 28 },
                { header: "Принял" },
              ],
              rows: lines.map((l) => [l.room, l.guest, l.checkIn, l.checkOut, l.cash, l.cashless, l.cashless != null ? l.channel : "", l.acceptedAt, [l.refund ? "возврат" : "", l.note].filter(Boolean).join(" · "), l.acceptedBy]),
              totals: ["Всего:", null, null, null, payments.cash, payments.cashless, null, null, null, null],
            },
            {
              title: "Расходы",
              columns: [{ header: "Сумма", kind: "money" }, { header: "Комментарий", width: 28 }, { header: "Категория" }, { header: "Сотрудник" }],
              rows: expenseLines.map((e) => [e.amount, e.name, e.category + (e.cash ? "" : " (безнал)"), e.employee]),
              totals: [expenseSummary.total, "Всего", null, null],
            },
            {
              title: "Заезды дня",
              columns: [
                { header: "Бронь" },
                { header: "Комната" },
                { header: "ФИО", width: 28 },
                { header: "Заезд", kind: "date" },
                { header: "Выезд", kind: "date" },
                { header: "Канал" },
                { header: "Заселён", kind: "datetime" },
                { header: "Стоимость", kind: "money" },
                { header: "Оплачено", kind: "money" },
                { header: "Долг", kind: "money" },
              ],
              rows: arrivals.map((a) => [a.externalId || `№${a.number}`, a.room, a.guest, a.checkIn, a.checkOut, a.source, a.checkedInAt, a.total, a.paid, a.balance]),
            },
          ],
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  // ── Добавление расхода ──
  const categoriesQuery = useQuery({
    queryKey: ["finance", "expenseCategories", orgId],
    queryFn: ({ signal }) => getExpenseCategories(orgId ?? undefined, signal),
    enabled: canManageExpenses && orgId != null,
  });
  const categories = (categoriesQuery.data ?? []).filter((c) => c.isActive);
  const employeesQuery = useQuery({
    queryKey: ["staff", "employees", "all", "active"],
    queryFn: ({ signal }) => getAllDjangoEmployees({ status: "active" }, signal),
    enabled: canManageExpenses,
  });
  const [form, setForm] = React.useState<{ amount: string; name: string; categoryId: number | ""; method: "cash" | "card"; employeeId: number | "" }>({
    amount: "",
    name: "",
    categoryId: "",
    method: "cash",
    employeeId: "",
  });
  const pickedCategory: ExpenseCategory | undefined = categories.find((c) => c.id === form.categoryId) ?? categories.find((c) => c.kind === "general") ?? categories[0];
  const needsEmployee = pickedCategory != null && pickedCategory.kind !== "general";
  const [saving, setSaving] = React.useState(false);
  const [newCategory, setNewCategory] = React.useState("");
  const amountNum = Number(form.amount.replace(",", "."));
  const formValid = amountNum > 0 && form.name.trim() !== "" && pickedCategory != null && (!needsEmployee || form.employeeId !== "");

  const addExpense = async () => {
    if (!formValid || !pickedCategory || orgId == null) return;
    setSaving(true);
    try {
      await createExpense({
        organizationId: orgId,
        branchId: branchId ?? undefined,
        categoryId: pickedCategory.id,
        name: form.name.trim(),
        ...(form.method === "cash" ? { cashAmount: amountNum } : { cardAmount: amountNum }),
        expenseDate: date,
        employeeId: needsEmployee && form.employeeId !== "" ? form.employeeId : undefined,
      });
      setForm((f) => ({ ...f, amount: "", name: "", employeeId: "" }));
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reports", "shiftExpenses"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reports", "ownerExpenses"] });
      enqueueSnackbar("Расход добавлен", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось добавить расход"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };
  const addCategory = async () => {
    if (!newCategory.trim() || orgId == null) return;
    setSaving(true);
    try {
      const created = await createExpenseCategory({ organizationId: orgId, name: newCategory.trim(), kind: "general" });
      setNewCategory("");
      setForm((f) => ({ ...f, categoryId: created.id }));
      void queryClient.invalidateQueries({ queryKey: ["finance", "expenseCategories"] });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось создать категорию"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };
  const [voiding, setVoiding] = React.useState<{ id: number; name: string } | null>(null);
  const [voidReason, setVoidReason] = React.useState("");
  const confirmVoid = async () => {
    if (!voiding || !voidReason.trim()) return;
    setSaving(true);
    try {
      await voidExpense(voiding.id, { reason: voidReason.trim() });
      setVoiding(null);
      setVoidReason("");
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reports", "shiftExpenses"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reports", "ownerExpenses"] });
      enqueueSnackbar("Расход аннулирован", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось аннулировать расход"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const loading = paymentsQuery.isPending || dayQuery.isPending;
  const error = paymentsQuery.error ?? dayQuery.error;
  const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as const;

  return (
    <Stack gap={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} flexWrap="wrap">
        <DateStepper value={dayjs(date)} onChange={(d) => nav.setParams({ date: D(d) })} disableFuture />
        <TextField select size="small" label="Смена" value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} sx={{ minWidth: 170 }}>
          {SHIFT_STARTS.map((h) => (
            <MenuItem key={h} value={h}>
              {h === 0 ? "Календарные сутки" : `Сутки с ${String(h).padStart(2, "0")}:00`}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Администратор"
          value={admin}
          onChange={(e) => setAdmin(e.target.value)}
          sx={{ minWidth: 200 }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">Все</MenuItem>
          {admins.map((a) => (
            <MenuItem key={a} value={a}>
              {a}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<PrintOutlined />} disabled={loading} onClick={() => printHtmlDocument(buildShiftReportHtml(printInput()))}>
            Печать
          </Button>
          <Button variant="outlined" startIcon={<FileDownloadOutlined />} disabled={loading || exporting} onClick={() => void handleExport()}>
            {exporting ? "Готовим…" : "Excel"}
          </Button>
        </Stack>
      </Stack>

      {error ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(error, "Не удалось загрузить данные смены")}
        </Alert>
      ) : loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" }, gap: 1.5 }}>
            <ReportKpi icon={<PaymentsOutlined />} tone="success" label="Наличные" value={fmtMoney(payments.cash, currency)} hint={`${lines.filter((l) => l.cash != null).length} оплат`} />
            <ReportKpi icon={<CreditCardOutlined />} tone="info" label="Безнал" value={fmtMoney(payments.cashless, currency)} hint={payments.byChannel.map((c) => c.label).slice(0, 3).join(", ") || "—"} />
            <ReportKpi icon={<ReceiptLongOutlined />} label="Выручка" value={fmtMoney(payments.total, currency)} hint={payments.refunds ? `возвраты ${fmtMoney(payments.refunds, currency)}` : "за смену"} />
            <ReportKpi icon={<ShoppingCartOutlined />} tone="warning" label="Расходы" value={canExpenses ? fmtMoney(expenseSummary.total, currency) : "нет доступа"} hint={canExpenses ? `наличными ${fmtMoney(expenseSummary.cash, currency)}` : undefined} />
            <ReportKpi icon={<PointOfSaleOutlined />} tone="primary" emphasis label="В кассе" value={fmtMoney(kassa, currency)} hint="наличные − расходы" />
            <ReportKpi icon={<FreeBreakfastOutlined />} tone="warning" label="Завтраков" value={breakfasts} hint={`утром ${dayjs(date).format("D MMM")}`} />
          </Box>

          <ReportSection
            title="Поступления за смену"
            subtitle={`${windowLabel} · ${lines.length} ${lines.length === 1 ? "операция" : "операций"}${admin ? ` · принял ${admin}` : ""}`}
            padded={false}
          >
            {lines.length === 0 ? (
              <ReportEmpty>За смену оплат не было</ReportEmpty>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ ...tableSx, minWidth: 980 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5 }}>Номер</TableCell>
                      <TableCell>Гость</TableCell>
                      <TableCell>Заезд</TableCell>
                      <TableCell>Выезд</TableCell>
                      <TableCell align="right">Наличка</TableCell>
                      <TableCell align="right">Безнал</TableCell>
                      <TableCell>Способ</TableCell>
                      <TableCell align="right">Время</TableCell>
                      <TableCell>Комментарий</TableCell>
                      <TableCell sx={{ pr: 2.5 }}>Принял</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.id} hover onClick={() => nav.openReservation(l.reservationId)} sx={{ cursor: "pointer", "& td": l.refund ? { color: "error.main" } : undefined }}>
                        <TableCell sx={{ pl: 2.5, fontWeight: 800, ...num }}>{l.room}</TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Typography variant="body2" fontWeight={600} noWrap title={l.guest}>
                            {l.guest || "—"}
                          </Typography>
                          {l.reservationNumber && (
                            <Typography variant="caption" color="text.secondary">
                              бронь №{l.reservationNumber}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={num}>{l.checkIn ? dayjs(l.checkIn).format("DD.MM") : "—"}</TableCell>
                        <TableCell sx={num}>{l.checkOut ? dayjs(l.checkOut).format("DD.MM") : "—"}</TableCell>
                        <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>
                          {l.cash != null ? fmtMoney(l.cash) : ""}
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>
                          {l.cashless != null ? fmtMoney(l.cashless) : ""}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{l.cashless != null ? l.channel : ""}</TableCell>
                        <TableCell align="right" sx={{ ...num, color: "text.secondary" }}>
                          {dayjs(l.acceptedAt).format(startHour > 0 && !dayjs(l.acceptedAt).isSame(dayjs(date), "day") ? "DD.MM HH:mm" : "HH:mm")}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 240 }}>
                          <Typography variant="body2" noWrap title={l.note}>
                            {[l.refund ? "возврат" : "", l.note].filter(Boolean).join(" · ")}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ pr: 2.5, whiteSpace: "nowrap", color: "text.secondary" }}>{l.acceptedBy}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ "& td": { fontWeight: 800, bgcolor: subtleBg(theme), borderTop: `2px solid ${theme.palette.divider}` } }}>
                      <TableCell sx={{ pl: 2.5 }} colSpan={4}>
                        Всего
                      </TableCell>
                      <TableCell align="right" sx={num}>
                        {fmtMoney(payments.cash)}
                      </TableCell>
                      <TableCell align="right" sx={num}>
                        {fmtMoney(payments.cashless)}
                      </TableCell>
                      <TableCell colSpan={4} />
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            )}
          </ReportSection>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.2fr 1fr" }, gap: 2, alignItems: "start" }}>
            <ReportSection title="Расходы смены" subtitle={canExpenses ? `${expenseLines.length} · ${fmtMoney(expenseSummary.total, currency)}` : undefined}>
              {!canExpenses ? (
                <ReportEmpty>Нет доступа к расходам — нужно право на финансы</ReportEmpty>
              ) : (
                <Stack gap={1.5}>
                  {canManageExpenses && (
                    <Box sx={{ p: 1.5, borderRadius: "12px", bgcolor: subtleBg(theme) }}>
                      {categories.length === 0 && !categoriesQuery.isPending ? (
                        <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
                          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                            Категорий расходов ещё нет — создайте первую, например «Хозрасходы».
                          </Typography>
                          <TextField size="small" placeholder="Название категории" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                          <Button variant="contained" disableElevation disabled={saving || !newCategory.trim()} onClick={() => void addCategory()}>
                            Создать
                          </Button>
                        </Stack>
                      ) : (
                        <Stack gap={1}>
                          <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
                            <TextField
                              size="small"
                              label="Сумма"
                              value={form.amount}
                              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.,]/g, "").slice(0, 10) }))}
                              sx={{ width: { sm: 130 } }}
                              slotProps={{ input: { endAdornment: <InputAdornment position="end">{currency === "KGS" ? "сом" : currency}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
                            />
                            <TextField
                              size="small"
                              label="Что купили / за что"
                              value={form.name}
                              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 200) }))}
                              sx={{ flex: 1 }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && formValid) void addExpense();
                              }}
                            />
                          </Stack>
                          <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
                            <TextField
                              select
                              size="small"
                              label="Категория"
                              value={pickedCategory?.id ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value), employeeId: "" }))}
                              sx={{ minWidth: 170 }}
                            >
                              {categories.map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {c.name}
                                  {c.kind === "advance" ? " · аванс" : c.kind === "salary" ? " · зарплата" : ""}
                                </MenuItem>
                              ))}
                            </TextField>
                            {needsEmployee && (
                              <TextField
                                select
                                size="small"
                                label="Сотрудник"
                                value={form.employeeId}
                                onChange={(e) => setForm((f) => ({ ...f, employeeId: Number(e.target.value) }))}
                                sx={{ minWidth: 180 }}
                              >
                                {(employeesQuery.data ?? []).map((emp) => (
                                  <MenuItem key={emp.id} value={emp.id}>
                                    {emp.fullName}
                                  </MenuItem>
                                ))}
                              </TextField>
                            )}
                            <ToggleButtonGroup
                              size="small"
                              exclusive
                              value={form.method}
                              onChange={(_e, v: "cash" | "card" | null) => v && setForm((f) => ({ ...f, method: v }))}
                            >
                              <ToggleButton value="cash">Наличные</ToggleButton>
                              <ToggleButton value="card">Безнал</ToggleButton>
                            </ToggleButtonGroup>
                            <Box sx={{ flex: 1 }} />
                            <Button variant="contained" disableElevation startIcon={<AddOutlined />} disabled={!formValid || saving} onClick={() => void addExpense()}>
                              Добавить
                            </Button>
                          </Stack>
                        </Stack>
                      )}
                    </Box>
                  )}
                  {expensesQuery.isPending ? (
                    <ReportEmpty>Загружаем…</ReportEmpty>
                  ) : expenseLines.length === 0 ? (
                    <ReportEmpty>Расходов за день нет</ReportEmpty>
                  ) : (
                    <Table size="small" sx={tableSx}>
                      <TableBody>
                        {expenseLines.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell sx={{ ...num, fontWeight: 700, width: 110 }}>{fmtMoney(e.amount)}</TableCell>
                            <TableCell>
                              <Typography variant="body2">{e.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {[e.category, e.cash ? "" : "безнал", e.employee].filter(Boolean).join(" · ")}
                              </Typography>
                            </TableCell>
                            {canManageExpenses && (
                              <TableCell align="right" sx={{ width: 48 }}>
                                <Tooltip title="Аннулировать">
                                  <IconButton size="small" onClick={() => setVoiding({ id: e.id, name: e.name })}>
                                    <DeleteOutlineOutlined fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Stack>
              )}
            </ReportSection>

            <Stack gap={2}>
              <ReportSection title="Итог смены" subtitle="Как в нижнем блоке отчёта админа">
                <Stack gap={0.75} sx={{ pt: 0.5 }}>
                  {[
                    { label: "Выручка — наличка", value: payments.cash },
                    { label: "Выручка — безнал", value: payments.cashless },
                    ...payments.byChannel.map((c) => ({ label: `в т.ч. ${c.label}`, value: c.amount, sub: true })),
                    { label: "Выручка — всего", value: payments.total, strong: true },
                    { label: "Расходы наличными", value: expenseSummary.cash ? -expenseSummary.cash : 0 },
                    { label: "Касса (наличные)", value: kassa, strong: true, accent: true },
                    ...payments.foreignCash.map((f) => ({ label: `в т.ч. валютой, ${f.currency}`, value: f.amount, sub: true, foreign: f.currency })),
                  ].map((row) => (
                    <Stack
                      key={row.label}
                      direction="row"
                      alignItems="baseline"
                      sx={{
                        py: 0.5,
                        pl: "sub" in row && row.sub ? 2 : 0,
                        ...("accent" in row && row.accent ? { mt: 0.5, pt: 1, borderTop: `1px solid ${theme.palette.divider}` } : {}),
                      }}
                    >
                      <Typography variant="body2" color={"sub" in row && row.sub ? "text.secondary" : "text.primary"} sx={{ flex: 1, fontWeight: "strong" in row && row.strong ? 700 : 400 }}>
                        {row.label}
                      </Typography>
                      <Typography
                        sx={{
                          ...num,
                          fontWeight: "strong" in row && row.strong ? 800 : 600,
                          fontSize: "accent" in row && row.accent ? 20 : 14,
                          color: "accent" in row && row.accent ? "primary.main" : row.value < 0 ? "error.main" : "text.primary",
                        }}
                      >
                        {"foreign" in row && row.foreign ? `${row.value.toLocaleString("ru-RU")} ${row.foreign}` : fmtMoney(row.value, currency)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </ReportSection>

              <ReportSection title="Звонки и сообщения" subtitle="Заполняет администратор — попадает в печать и Excel, хранится на этом устройстве">
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, pt: 0.5 }}>
                  <TextField size="small" label="Мегаком" value={counters.megacom} onChange={(e) => updateCounter("megacom", e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
                  <TextField size="small" label="О!" value={counters.o} onChange={(e) => updateCounter("o", e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
                  <TextField size="small" label="WhatsApp" value={counters.whatsapp} onChange={(e) => updateCounter("whatsapp", e.target.value)} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
                </Box>
              </ReportSection>
            </Stack>
          </Box>

          <ReportSection
            title="Заезды дня"
            subtitle={`${arrivals.length} · брони каналов (Booking, Островок) обычно оплачены через канал`}
            padded={false}
            action={<ReportLink label="Балансы" onClick={() => nav.go("balances", { from: date, to: date })} />}
          >
            {arrivals.length === 0 ? (
              <ReportEmpty>Заездов нет</ReportEmpty>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ ...tableSx, minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5 }}>Бронь</TableCell>
                      <TableCell>Комната</TableCell>
                      <TableCell>Гость</TableCell>
                      <TableCell>Даты</TableCell>
                      <TableCell>Канал</TableCell>
                      <TableCell align="right">Заселён</TableCell>
                      <TableCell align="right">Стоимость</TableCell>
                      <TableCell align="right">Оплачено</TableCell>
                      <TableCell align="right" sx={{ pr: 2.5 }}>
                        Долг
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {arrivals.map((a, i) => (
                      <TableRow key={a.number} hover onClick={() => nav.openReservation(arrivalIds[i])} sx={{ cursor: "pointer" }}>
                        <TableCell sx={{ pl: 2.5, whiteSpace: "nowrap" }}>
                          <Typography variant="body2" fontWeight={700}>
                            №{a.number}
                          </Typography>
                          {a.externalId && (
                            <Typography variant="caption" color="text.secondary">
                              {a.externalId}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, ...num }}>{a.room}</TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {a.guest}
                          </Typography>
                        </TableCell>
                        <TableCell sx={num}>
                          {a.checkIn ? dayjs(a.checkIn).format("DD.MM") : ""} – {a.checkOut ? dayjs(a.checkOut).format("DD.MM") : ""}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{a.source}</TableCell>
                        <TableCell align="right" sx={{ ...num, color: a.checkedInAt ? "success.main" : "text.disabled", fontWeight: 600 }}>
                          {a.checkedInAt ? dayjs(a.checkedInAt).format("HH:mm") : "ждём"}
                        </TableCell>
                        <TableCell align="right" sx={num}>
                          {fmtMoney(a.total)}
                        </TableCell>
                        <TableCell align="right" sx={num}>
                          {fmtMoney(a.paid)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, pr: 2.5, fontWeight: 700, color: a.balance > 0 ? "error.main" : "success.main" }}>
                          {a.balance > 0 ? fmtMoney(a.balance) : "0"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </ReportSection>
        </>
      )}

      <Dialog open={voiding != null} onClose={() => !saving && setVoiding(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Аннулировать расход?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            «{voiding?.name}» останется в истории финансов с пометкой и причиной, но не попадёт в отчёты.
          </Typography>
          <TextField autoFocus fullWidth size="small" label="Причина" value={voidReason} onChange={(e) => setVoidReason(e.target.value.slice(0, 300))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoiding(null)} disabled={saving}>
            Отмена
          </Button>
          <Button color="error" variant="contained" disableElevation disabled={saving || !voidReason.trim()} onClick={() => void confirmVoid()}>
            Аннулировать
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default HotelShiftReport;
