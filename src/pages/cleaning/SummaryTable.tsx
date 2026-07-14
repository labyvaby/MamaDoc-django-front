import React from "react";
import {
  Alert,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { animate } from "framer-motion";

import { formatKGS } from "../../utility/format";
import type { CleaningSummaryRow } from "../../api/cleaning";

/** Count-up: сумма «доезжает» до значения при загрузке/смене месяца. */
const AnimatedAmount: React.FC<{ value: number }> = ({ value }) => {
  const [display, setDisplay] = React.useState(value);
  const prev = React.useRef(value);
  React.useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <>{formatKGS(Math.round(display))}</>;
};

interface SummaryTableProps {
  rows: CleaningSummaryRow[];
  loading: boolean;
  /** null — ошибки нет. */
  error: string | null;
  /** Ставка за подтверждённую уборку (decimal строкой) — null, пока грузится. */
  rate: string | null;
}

/** Сводка за месяц: подтверждено/ждёт/отклонено и сумма к выплате по сотрудникам. */
const SummaryTable: React.FC<SummaryTableProps> = ({ rows, loading, error, rate }) => (
  <Stack gap={1.5} sx={{ flex: 1, minHeight: 0 }}>
    {rate != null && (
      <Typography variant="body2" color="text.secondary">
        Ставка: {formatKGS(rate)} за подтверждённую уборку. В ЗП попадают только
        подтверждённые уборки.
      </Typography>
    )}
    {error && <Alert severity="error">{error}</Alert>}
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: "14px" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Сотрудник</TableCell>
            <TableCell align="right">Подтверждено</TableCell>
            <TableCell align="right">Ждёт</TableCell>
            <TableCell align="right">Отклонено</TableCell>
            <TableCell align="right">К выплате</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell>
                  <Skeleton variant="text" width="60%" />
                </TableCell>
                {Array.from({ length: 4 }).map((__, j) => (
                  <TableCell key={j} align="right">
                    <Skeleton variant="text" width={36} sx={{ ml: "auto" }} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ py: 3, color: "text.secondary" }}>
                За этот месяц уборок нет
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.employeeId} hover>
              <TableCell>{row.employeeName}</TableCell>
              <TableCell align="right">{row.approvedCount}</TableCell>
              <TableCell align="right">{row.pendingCount}</TableCell>
              <TableCell align="right">{row.rejectedCount}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                <AnimatedAmount value={row.amount} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </Stack>
);

export default SummaryTable;
