import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { getCashboxShiftSummary } from "../../../../api/cashboxShifts";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../../api/queryKeys";
import type { CashboxShift } from "../../../../api/cashboxShifts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: string | null | undefined): string {
  if (!s) return "0.00";
  const n = parseFloat(s);
  return isNaN(n) ? (s ?? "0.00") : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const Row: React.FC<{ label: string; value: string; color?: string; bold?: boolean }> = ({
  label, value, color, bold,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center">
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" fontWeight={bold ? 700 : 500} color={color ?? "text.primary"}>
      {value}
    </Typography>
  </Stack>
);

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  shift: CashboxShift | null;
  onClose: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

const ShiftSummaryDialog: React.FC<Props> = ({ open, shift, onClose }) => {
  const summaryQuery = useQuery({
    queryKey: shift ? djangoQueryKeys.shifts.summary(shift.id) : ["noop"],
    queryFn: ({ signal }) => getCashboxShiftSummary(shift!.id, signal),
    enabled: open && shift !== null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });

  const s = summaryQuery.data;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Итоги смены #{shift?.id}
        {summaryQuery.isFetching && <CircularProgress size={14} sx={{ ml: 1 }} />}
      </DialogTitle>
      <DialogContent>
        {summaryQuery.isLoading ? (
          <Box sx={{ textAlign: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : s ? (
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {/* Meta */}
            <Stack spacing={0.5}>
              <Row label="Филиал" value={shift?.branchName ?? "—"} />
              <Row label="Открыл" value={shift?.openedByName ?? "—"} />
              <Row
                label="Открыта"
                value={shift ? dayjs(shift.openedAt).format("DD.MM.YY HH:mm") : "—"}
              />
              {shift?.closedAt && (
                <>
                  <Row label="Закрыл" value={shift.closedByName ?? "—"} />
                  <Row
                    label="Закрыта"
                    value={dayjs(shift.closedAt).format("DD.MM.YY HH:mm")}
                  />
                </>
              )}
            </Stack>

            <Divider />

            {/* Cash */}
            <Typography variant="caption" color="success.main" fontWeight={600} textTransform="uppercase">
              Наличные
            </Typography>
            <Row label="Начальные наличные" value={`${fmt(shift?.openingCash)} с`} color="success.main" />
            <Row label="Приход" value={`+ ${fmt(s.cashIncome)} с`} color="success.main" />
            <Row label="Возвраты" value={`− ${fmt(s.cashRefunds)} с`} color="success.main" />
            <Row label="Расходы" value={`− ${fmt(s.cashExpenses)} с`} color="success.main" />
            <Row label="Ожидается в кассе" value={`${fmt(s.expectedCash)} с`} color="success.main" bold />

            {shift?.actualCash != null && (
              <>
                <Row label="Фактически" value={`${fmt(shift.actualCash)} с`} color="success.main" bold />
                <Row
                  label="Разница"
                  value={(() => {
                    const d = parseFloat(shift.difference ?? "0");
                    return `${d >= 0 ? "+" : ""}${fmt(shift.difference)} с`;
                  })()}
                  color={
                    parseFloat(shift.difference ?? "0") < 0
                      ? "error.main"
                      : parseFloat(shift.difference ?? "0") > 0
                        ? "warning.main"
                        : "success.main"
                  }
                  bold
                />
              </>
            )}

            <Divider />

            {/* Card */}
            <Typography variant="caption" color="primary.main" fontWeight={600} textTransform="uppercase">
              Безналичные
            </Typography>
            <Row label="Карта приход" value={`${fmt(s.cardIncome)} с`} color="primary.main" />
            <Row label="Карта возвраты" value={`− ${fmt(s.cardRefunds)} с`} color="primary.main" />
            <Row label="Карта расходы" value={`− ${fmt(s.cardExpenses)} с`} color="primary.main" />

            {(parseFloat(s.balancePayments) > 0 || parseFloat(s.balanceRefunds) > 0) && (
              <>
                <Divider />
                <Typography variant="caption" color="text.disabled" fontWeight={600} textTransform="uppercase">
                  Баланс (внутренние)
                </Typography>
                <Row label="Оплата с баланса" value={`${fmt(s.balancePayments)} с`} color="info.main" />
                <Row label="Возврат на баланс" value={`${fmt(s.balanceRefunds)} с`} color="text.secondary" />
              </>
            )}

            <Divider />

            {/* Counts */}
            <Stack direction="row" spacing={2} justifyContent="center">
              <Typography variant="caption" color="text.secondary">
                Платежей: <strong>{s.paymentCount}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Возвратов: <strong>{s.refundCount}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Расходов: <strong>{s.expenseCount}</strong>
              </Typography>
            </Stack>

            {shift?.closeComment && (
              <>
                <Divider />
                <Typography variant="body2" color="text.secondary">
                  Комментарий: {shift.closeComment}
                </Typography>
              </>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftSummaryDialog;
