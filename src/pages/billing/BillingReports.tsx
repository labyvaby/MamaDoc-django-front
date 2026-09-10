import React from "react";
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { billingApi, type BillingReportKey } from "../../api/billing";
import { getErrorMessage } from "../../api/client";

type Props = { organizationId?: number; enabled: boolean };

const REPORTS: Array<{ value: BillingReportKey; label: string; description: string }> = [
  { value: "revenue", label: "Выручка", description: "Поступления по дням" },
  { value: "charges", label: "Начисления", description: "Суммы и оплаты по статусам" },
  { value: "payments", label: "Оплаты", description: "Платежи по способам и статусам" },
  { value: "debtors", label: "Должники", description: "Текущая просроченная задолженность" },
  { value: "clients", label: "Новые клиенты", description: "Динамика клиентской базы" },
  { value: "refunds", label: "Возвраты", description: "Возвращённые клиентам платежи" },
];

const money = (value: unknown) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value ?? 0))} сом`;
const date = (value: unknown) => value ? dayjs(String(value)).format("DD.MM.YYYY") : "—";

const STATUS: Record<string, string> = {
  draft: "Черновик", issued: "Выставлено", partial: "Частично", paid: "Оплачено",
  overdue: "Просрочено", canceled: "Отменено", pending: "В обработке",
  succeeded: "Успешно", failed: "Не прошёл", refunded: "Возвращено",
};
const METHOD: Record<string, string> = { cash: "Наличные", transfer: "Банковский перевод", bakai: "Bakai Pay" };
const SEVERITY: Record<string, string> = { small: "Низкий", medium: "Средний", critical: "Критический" };

function Empty({ colSpan }: { colSpan: number }) {
  return <TableRow><TableCell colSpan={colSpan} align="center" sx={{ py: 6, color: "text.secondary" }}>За выбранный период данных нет.</TableCell></TableRow>;
}

function ReportTable({ reportKey, rows }: { reportKey: BillingReportKey; rows: Array<Record<string, unknown>> }) {
  if (reportKey === "revenue") return (
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Дата</TableCell><TableCell align="right">Платежей</TableCell><TableCell align="right">Выручка</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={String(row.date)} hover><TableCell>{date(row.date)}</TableCell><TableCell align="right">{String(row.count ?? 0)}</TableCell><TableCell align="right" sx={{ fontWeight: 750, color: "success.main" }}>{money(row.total)}</TableCell></TableRow>)}{!rows.length && <Empty colSpan={3} />}</TableBody></Table></TableContainer>
  );
  if (reportKey === "charges") return (
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Статус</TableCell><TableCell align="right">Начислений</TableCell><TableCell align="right">Начислено</TableCell><TableCell align="right">Оплачено</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={String(row.status)} hover><TableCell><Chip size="small" label={STATUS[String(row.status)] ?? String(row.status)} /></TableCell><TableCell align="right">{String(row.count ?? 0)}</TableCell><TableCell align="right">{money(row.amountTotal)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{money(row.paidTotal)}</TableCell></TableRow>)}{!rows.length && <Empty colSpan={4} />}</TableBody></Table></TableContainer>
  );
  if (reportKey === "payments") return (
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Способ</TableCell><TableCell>Статус</TableCell><TableCell align="right">Платежей</TableCell><TableCell align="right">Сумма</TableCell></TableRow></TableHead><TableBody>{rows.map((row, index) => <TableRow key={`${row.method}-${row.status}-${index}`} hover><TableCell>{METHOD[String(row.method)] ?? String(row.method)}</TableCell><TableCell>{STATUS[String(row.status)] ?? String(row.status)}</TableCell><TableCell align="right">{String(row.count ?? 0)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{money(row.total)}</TableCell></TableRow>)}{!rows.length && <Empty colSpan={4} />}</TableBody></Table></TableContainer>
  );
  if (reportKey === "debtors") return (
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Клиент</TableCell><TableCell>Телефон</TableCell><TableCell align="right">Просрочка</TableCell><TableCell>Риск</TableCell><TableCell align="right">Долг</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={String(row.clientId)} hover><TableCell sx={{ fontWeight: 700 }}>{String(row.clientName ?? "—")}</TableCell><TableCell>{String(row.clientPhone || "—")}</TableCell><TableCell align="right">{String(row.daysOverdue ?? 0)} дн.</TableCell><TableCell>{SEVERITY[String(row.severity)] ?? String(row.severity)}</TableCell><TableCell align="right" sx={{ fontWeight: 750, color: "error.main" }}>{money(row.amountOverdue)}</TableCell></TableRow>)}{!rows.length && <Empty colSpan={5} />}</TableBody></Table></TableContainer>
  );
  if (reportKey === "clients") return (
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Дата регистрации</TableCell><TableCell align="right">Новых клиентов</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={String(row.date)} hover><TableCell>{date(row.date)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{String(row.count ?? 0)}</TableCell></TableRow>)}{!rows.length && <Empty colSpan={2} />}</TableBody></Table></TableContainer>
  );
  return (
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Возврат</TableCell><TableCell>Клиент</TableCell><TableCell>Дата</TableCell><TableCell align="right">Сумма</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={String(row.id)} hover><TableCell>#{String(row.id)}<Typography variant="caption" color="text.secondary" display="block">платёж #{String(row.originalPaymentId)}</Typography></TableCell><TableCell>{String(row.clientName ?? "—")}</TableCell><TableCell>{date(row.paidAt)}</TableCell><TableCell align="right" sx={{ fontWeight: 750, color: "error.main" }}>−{money(row.amount)}</TableCell></TableRow>)}{!rows.length && <Empty colSpan={4} />}</TableBody></Table></TableContainer>
  );
}

export function BillingReports({ organizationId, enabled }: Props) {
  const [reportKey, setReportKey] = React.useState<BillingReportKey>("revenue");
  const [dateFrom, setDateFrom] = React.useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [dateTo, setDateTo] = React.useState(dayjs().format("YYYY-MM-DD"));
  const selected = REPORTS.find((report) => report.value === reportKey)!;
  const validPeriod = Boolean(dateFrom && dateTo && !dayjs(dateFrom).isAfter(dayjs(dateTo)));

  const reportQuery = useQuery({
    queryKey: ["django", "billing", "report", reportKey, organizationId ?? null, dateFrom, dateTo],
    queryFn: () => billingApi.report(reportKey, { organizationId, dateFrom, dateTo }),
    enabled: enabled && validPeriod,
  });

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField select label="Отчёт" value={reportKey} onChange={(event) => setReportKey(event.target.value as BillingReportKey)} sx={{ minWidth: 230 }}>
            {REPORTS.map((report) => <MenuItem key={report.value} value={report.value}>{report.label}</MenuItem>)}
          </TextField>
          <TextField label="С" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="По" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} />
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={750}>{selected.label}</Typography>
            <Typography variant="body2" color="text.secondary">{selected.description}</Typography>
          </Box>
        </Stack>
        {!validPeriod && <Alert severity="warning" sx={{ mt: 2 }}>Дата начала должна быть раньше даты окончания.</Alert>}
      </Paper>
      {reportQuery.isFetching && <LinearProgress sx={{ borderRadius: 2 }} />}
      {reportQuery.isError && <Alert severity="error">{getErrorMessage(reportQuery.error, "Не удалось сформировать отчёт")}</Alert>}
      {reportQuery.data && <ReportTable reportKey={reportKey} rows={reportQuery.data.rows} />}
    </Stack>
  );
}

