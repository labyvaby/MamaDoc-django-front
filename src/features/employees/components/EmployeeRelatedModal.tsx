import React from "react";
import {
  Dialog,
  Box,
  Stack,
  Typography,
  IconButton,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import dayjs from "dayjs";

import { parseBackendError } from "../../../api/expenses";
import {
  useEmployeeShiftsMonth,
  useEmployeeExpensesMonth,
  usePayrollReportMonth,
} from "../hooks/useEmployeeRelated";

export type RelatedModalType = "skud" | "exp" | "sal" | null;

type Props = {
  open: boolean;
  type: RelatedModalType;
  employeeId: number;
  employeeName: string;
  organizationId?: number;
  /** Якорь месяца "YYYY-MM-DD" (любой день). По умолчанию — текущий месяц. */
  monthAnchor?: string;
  onClose: () => void;
};

const num = (s: string | number | null | undefined) => Number(s || 0);
const money = (v: number) => v.toLocaleString("ru-RU") + " с";

/** Небольшая карточка-показатель в шапке модалки. */
const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Box
    sx={(t) => ({
      flex: "1 1 120px",
      minWidth: 0,
      p: 1.5,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: t.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
    })}
  >
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h6" fontWeight={700} sx={{ mt: 0.25, fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Typography>
  </Box>
);

const StateBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ py: 5, textAlign: "center", color: "text.secondary" }}>{children}</Box>
);

// ── СКУД ────────────────────────────────────────────────────────────────────────
const SkudContent: React.FC<{ employeeId: number; monthAnchor?: string }> = ({
  employeeId,
  monthAnchor,
}) => {
  const q = useEmployeeShiftsMonth(employeeId, true, monthAnchor);
  if (q.isFetching) return <StateBox><CircularProgress size={24} /></StateBox>;
  if (q.error) return <StateBox>{parseBackendError(q.error)}</StateBox>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <StateBox>Смен за текущий месяц нет</StateBox>;
  const totalHours = rows.reduce((s, r) => s + num(r.dayHours) + num(r.nightHours), 0);
  return (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1.25 }}>
        <Stat label="Часов за месяц" value={totalHours.toFixed(1)} />
        <Stat label="Смен" value={rows.length} />
        <Stat label="Аномалий" value={rows.filter((r) => r.isAnomalous).length} />
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell>Приход</TableCell>
            <TableCell>Уход</TableCell>
            <TableCell align="right">Часы</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{dayjs(r.clockIn).format("DD.MM")}</TableCell>
              <TableCell>{dayjs(r.clockIn).format("HH:mm")}</TableCell>
              <TableCell>{r.clockOut ? dayjs(r.clockOut).format("HH:mm") : "—"}</TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {(num(r.dayHours) + num(r.nightHours)).toFixed(1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};

// ── Расходы ──────────────────────────────────────────────────────────────────────
const ExpensesContent: React.FC<{
  employeeId: number;
  organizationId?: number;
  monthAnchor?: string;
}> = ({ employeeId, organizationId, monthAnchor }) => {
  const q = useEmployeeExpensesMonth(employeeId, organizationId, true, monthAnchor);
  if (q.isFetching) return <StateBox><CircularProgress size={24} /></StateBox>;
  if (q.error) return <StateBox>{parseBackendError(q.error)}</StateBox>;
  const rows = q.data?.results ?? [];
  if (rows.length === 0) return <StateBox>Расходов за текущий месяц нет</StateBox>;
  const total = rows.reduce((s, r) => s + num(r.amount), 0);
  return (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1.25 }}>
        <Stat label="За месяц" value={money(total)} />
        <Stat label="Записей" value={rows.length} />
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell>Категория</TableCell>
            <TableCell align="right">Сумма</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{dayjs(r.expenseDate).format("DD.MM")}</TableCell>
              <TableCell>{r.categoryName || r.name || "—"}</TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{money(num(r.amount))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};

// ── ЗП ───────────────────────────────────────────────────────────────────────────
const PayRow: React.FC<{ label: string; value: number; negative?: boolean; total?: boolean }> = ({
  label,
  value,
  negative,
  total,
}) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    sx={(t) => ({
      py: 1.1,
      borderBottom: total ? "none" : `1px solid ${t.palette.divider}`,
      ...(total ? { borderTop: `2px solid ${t.palette.divider}`, mt: 0.5, pt: 1.5 } : {}),
    })}
  >
    <Typography variant="body2" fontWeight={total ? 700 : 400}>{label}</Typography>
    <Typography
      variant="body2"
      fontWeight={total ? 700 : 500}
      sx={{ fontVariantNumeric: "tabular-nums", color: negative ? "error.main" : "text.primary" }}
    >
      {negative ? "− " : ""}{money(Math.abs(value))}
    </Typography>
  </Stack>
);

const SalaryContent: React.FC<{
  employeeId: number;
  organizationId?: number;
  monthAnchor?: string;
}> = ({ employeeId, organizationId, monthAnchor }) => {
  const q = usePayrollReportMonth(organizationId, true, monthAnchor);
  if (q.isFetching) return <StateBox><CircularProgress size={24} /></StateBox>;
  if (q.error) return <StateBox>{parseBackendError(q.error)}</StateBox>;
  const row = q.data?.rows.find((r) => r.employeeId === employeeId);
  if (!row) return <StateBox>Нет начислений за текущий месяц</StateBox>;
  const services = num(row.servicePercentPay) + num(row.serviceFixedPay);
  return (
    <Box>
      {num(row.hourlyPay) > 0 && (
        <PayRow label={`Почасовая (${num(row.dayHours) + num(row.nightHours)} ч)`} value={num(row.hourlyPay)} />
      )}
      {num(row.appointmentPay) > 0 && <PayRow label="Приёмы (ставка)" value={num(row.appointmentPay)} />}
      {services > 0 && <PayRow label="Услуги (%)" value={services} />}
      {num(row.productPay) > 0 && <PayRow label="Товары в приёмах" value={num(row.productPay)} />}
      {num(row.cleaningEarnings) > 0 && <PayRow label="Уборки" value={num(row.cleaningEarnings)} />}
      {num(row.bonus) > 0 && <PayRow label="Надбавка" value={num(row.bonus)} />}
      {num(row.advances) > 0 && <PayRow label="Аванс" value={num(row.advances)} negative />}
      <PayRow label="К выплате" value={num(row.netSalary)} total />
    </Box>
  );
};

const META: Record<Exclude<RelatedModalType, null>, { title: string; icon: React.ReactNode }> = {
  skud: { title: "СКУД", icon: <AccessTimeOutlined /> },
  exp: { title: "Расходы", icon: <ReceiptLongOutlined /> },
  sal: { title: "Зарплата", icon: <PaymentsOutlined /> },
};

const EmployeeRelatedModal: React.FC<Props> = ({
  open,
  type,
  employeeId,
  employeeName,
  organizationId,
  monthAnchor,
  onClose,
}) => {
  const meta = type ? META[type] : null;
  const monthLabel = dayjs(monthAnchor ?? undefined).format("MMMM YYYY");
  return (
    <Dialog
      open={open && Boolean(type)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "16px" } }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
          <Box
            sx={(t) => ({
              width: 34,
              height: 34,
              borderRadius: "9px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "primary.onSurface",
              bgcolor: t.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              "& .MuiSvgIcon-root": { fontSize: 19 },
            })}
          >
            {meta?.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>{meta?.title}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {employeeName} · {monthLabel}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} size="small"><CloseOutlined fontSize="small" /></IconButton>
      </Stack>

      <Box sx={{ p: 2.5, maxHeight: "70vh", overflowY: "auto" }}>
        {type === "skud" && <SkudContent employeeId={employeeId} monthAnchor={monthAnchor} />}
        {type === "exp" && (
          <ExpensesContent employeeId={employeeId} organizationId={organizationId} monthAnchor={monthAnchor} />
        )}
        {type === "sal" && (
          <SalaryContent employeeId={employeeId} organizationId={organizationId} monthAnchor={monthAnchor} />
        )}
      </Box>
    </Dialog>
  );
};

export default EmployeeRelatedModal;
