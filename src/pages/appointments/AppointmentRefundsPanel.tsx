import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import UndoOutlined from "@mui/icons-material/UndoOutlined";

import {
  createAppointmentRefund,
  parseBackendError,
  type AppointmentPayment,
  type AppointmentRefund,
  type PaymentSummary,
  type RefundPayload,
} from "../../api/payments";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useCan } from "../../hooks/useCan";

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  balance: "Баланс пациента",
};

function parseDecimal(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RefundDialogState = {
  payment: AppointmentPayment;
  remaining: number;
} | null;

type Props = {
  appointmentId: number;
  patientId: number | null;
  summary: PaymentSummary;
  /** Called after successful refund with updated summary */
  onSummaryUpdated: (summary: PaymentSummary) => void;
};

// ── RefundDialog ──────────────────────────────────────────────────────────────

type RefundDialogProps = {
  state: RefundDialogState;
  appointmentId: number;
  patientId: number | null;
  onClose: () => void;
  onSuccess: (summary: PaymentSummary) => void;
};

const RefundDialog: React.FC<RefundDialogProps> = ({
  state,
  appointmentId,
  patientId,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [amountStr, setAmountStr] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Reset form when dialog opens for a new payment
  React.useEffect(() => {
    if (state) {
      setAmountStr("");
      setReason("");
      setLocalError(null);
      setConfirmOpen(false);
    }
  }, [state?.payment.id]);

  const refundMutation = useMutation({
    mutationFn: (payload: RefundPayload) =>
      createAppointmentRefund(appointmentId, state!.payment.id, payload),
    onSuccess: (res) => {
      // Instant cache update from response — no extra request
      queryClient.setQueryData(
        djangoQueryKeys.appointments.payments(appointmentId),
        res.paymentSummary,
      );
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.payments(appointmentId),
      });
      // Invalidate list + dayCounts so payment chip / status update in the calendar.
      // Use the shared prefix ["django", "appointments", "list"] / ["django", "appointments", "day-counts"]
      // — React Query matches all entries with that prefix regardless of params.
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "list"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "day-counts"],
      });
      // If refund method is balance, refresh patient balance cache
      if (patientId && state?.payment.method === "balance") {
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.patients.balance(patientId),
        });
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.patients.transactions(patientId),
        });
      }
      onSuccess(res.paymentSummary);
      onClose();
    },
    onError: (err: unknown) => {
      setLocalError(parseBackendError(err));
      setConfirmOpen(false);
    },
  });

  if (!state) return null;

  const amount = parseDecimal(amountStr);
  const amountInvalid = amountStr !== "" && (amount <= 0 || amount > state.remaining + 0.001);
  const canSubmit = amount > 0 && amount <= state.remaining + 0.001 && reason.trim().length > 0 && !refundMutation.isPending;

  const handleFullRefund = () => {
    setAmountStr(fmt(state.remaining));
  };

  const handleRequestConfirm = () => {
    setLocalError(null);
    if (!canSubmit) return;
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    refundMutation.mutate({ amount: fmt(amount), reason: reason.trim() });
  };

  return (
    <>
      <Dialog open={!!state} onClose={refundMutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <UndoOutlined fontSize="small" color="error" />
            <Typography variant="h6" fontWeight={600} fontSize="1rem">
              Возврат платежа
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            {/* Payment info */}
            <Box sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.5, py: 1 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Метод</Typography>
                <Typography variant="caption" fontWeight={600}>
                  {METHOD_LABELS[state.payment.method] ?? state.payment.method}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Сумма платежа</Typography>
                <Typography variant="caption" fontWeight={600}>{state.payment.amount} с</Typography>
              </Stack>
              {parseDecimal(state.payment.refundedAmount) > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">Уже возвращено</Typography>
                  <Typography variant="caption" fontWeight={600} color="error.main">
                    {state.payment.refundedAmount} с
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Доступно к возврату</Typography>
                <Typography variant="caption" fontWeight={700} color="warning.main">
                  {fmt(state.remaining)} с
                </Typography>
              </Stack>
            </Box>

            {/* Amount */}
            <Stack spacing={0.5}>
              <TextField
                label="Сумма возврата"
                size="small"
                value={amountStr}
                onChange={(e) => { setLocalError(null); setAmountStr(e.target.value); }}
                error={amountInvalid}
                helperText={
                  amountInvalid
                    ? `От 0.01 до ${fmt(state.remaining)} с`
                    : " "
                }
                InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
                inputProps={{ inputMode: "decimal" }}
                fullWidth
                disabled={refundMutation.isPending}
              />
              <Button
                size="small"
                variant="text"
                onClick={handleFullRefund}
                sx={{ textTransform: "none", alignSelf: "flex-start", px: 0 }}
                disabled={refundMutation.isPending}
              >
                Вернуть полностью ({fmt(state.remaining)} с)
              </Button>
            </Stack>

            {/* Reason */}
            <TextField
              label="Причина возврата"
              size="small"
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => { setLocalError(null); setReason(e.target.value); }}
              required
              helperText={reason.trim().length === 0 ? "Обязательное поле" : " "}
              fullWidth
              disabled={refundMutation.isPending}
            />

            {localError && <Alert severity="error" sx={{ py: 0.5 }}>{localError}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={onClose}
            disabled={refundMutation.isPending}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRequestConfirm}
            disabled={!canSubmit}
            startIcon={refundMutation.isPending ? <CircularProgress size={14} /> : undefined}
          >
            Оформить возврат
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Подтвердите возврат</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Вернуть <strong>{fmt(amount)} с</strong> по платежу{" "}
            <strong>{METHOD_LABELS[state.payment.method] ?? state.payment.method}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.75}>
            Причина: {reason}
          </Typography>
          <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }} icon={false}>
            После возврата изменение состава оплаты недоступно. Дополнительные возвраты можно делать по каждому платежу.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setConfirmOpen(false)} disabled={refundMutation.isPending}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirm}
            disabled={refundMutation.isPending}
            startIcon={refundMutation.isPending ? <CircularProgress size={14} /> : undefined}
          >
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// ── AppointmentRefundsPanel ───────────────────────────────────────────────────

const AppointmentRefundsPanel: React.FC<Props> = ({
  appointmentId,
  patientId,
  summary,
  onSummaryUpdated,
}) => {
  const canRefund = useCan("finance.refund");
  const [dialogState, setDialogState] = React.useState<RefundDialogState>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const refundedTotal = parseDecimal(summary.refundedTotal);
  const paidNet = parseDecimal(summary.paidNet ?? summary.paidTotal);
  const refunds = summary.refunds ?? [];
  const hasRefunds = refundedTotal > 0 || refunds.length > 0;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {/* Section header */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1.25}>
        <UndoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
        <Typography variant="body2" fontWeight={600} color="text.secondary">
          Возвраты
        </Typography>
      </Stack>

      {/* Refund totals */}
      {hasRefunds && (
        <Stack spacing={0.5} mb={1.5} sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.5, py: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">Оплачено (брутто)</Typography>
            <Typography variant="caption" fontWeight={500}>{summary.paidTotal} с</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">Возвращено</Typography>
            <Typography variant="caption" fontWeight={600} color="error.main">
              − {summary.refundedTotal} с
            </Typography>
          </Stack>
          <Divider sx={{ my: 0.25 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary" fontWeight={600}>Чистая оплата</Typography>
            <Typography variant="caption" fontWeight={700}>{fmt(paidNet)} с</Typography>
          </Stack>
        </Stack>
      )}

      {/* Blocked-apply notice */}
      {hasRefunds && (
        <Alert severity="info" icon={false} sx={{ mb: 1.5, py: 0.5, fontSize: "0.75rem" }}>
          После возврата изменение состава оплаты недоступно. Дополнительные возвраты можно делать по каждому платежу.
        </Alert>
      )}

      {/* Per-payment refund rows */}
      {summary.payments.length > 0 && canRefund && (
        <Stack spacing={1} mb={1}>
          {summary.payments.map((p) => {
            const refundedAmt = parseDecimal(p.refundedAmount);
            const remaining = Math.max(0, parseDecimal(p.amount) - refundedAmt);
            const canRefundThis = remaining > 0.001;

            return (
              <Stack
                key={p.id}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  px: 1.5,
                  py: 0.75,
                }}
              >
                <Stack spacing={0}>
                  <Typography variant="caption" fontWeight={600}>
                    {METHOD_LABELS[p.method] ?? p.method}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.amount} с
                    {refundedAmt > 0 && (
                      <> · возвращено: <span style={{ color: "var(--mui-palette-error-main, #d32f2f)", fontWeight: 600 }}>{p.refundedAmount} с</span></>
                    )}
                  </Typography>
                  {canRefundThis && (
                    <Typography variant="caption" color="warning.main">
                      доступно к возврату: {fmt(remaining)} с
                    </Typography>
                  )}
                </Stack>
                {canRefundThis && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => setDialogState({ payment: p, remaining })}
                    sx={{ textTransform: "none", minWidth: 80, flexShrink: 0, ml: 1 }}
                  >
                    Возврат
                  </Button>
                )}
                {!canRefundThis && refundedAmt > 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ ml: 1, flexShrink: 0 }}>
                    Возвращён
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      {/* Refund history toggle */}
      {refunds.length > 0 && (
        <Box>
          <Button
            size="small"
            variant="text"
            onClick={() => setHistoryOpen((v) => !v)}
            sx={{ textTransform: "none", color: "text.secondary", px: 0 }}
          >
            {historyOpen ? "Скрыть историю возвратов" : `История возвратов (${refunds.length})`}
          </Button>

          <Collapse in={historyOpen} unmountOnExit>
            <Stack spacing={0} mt={0.75}>
              {refunds.map((r: AppointmentRefund) => (
                <Stack
                  key={r.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  py={0.75}
                  sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                >
                  <Stack spacing={0}>
                    <Typography variant="caption" fontWeight={500}>
                      {METHOD_LABELS[r.method] ?? r.method}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ maxWidth: 180 }}>
                      {r.reason}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" fontWeight={700} color="error.main" sx={{ flexShrink: 0, ml: 1 }}>
                    − {r.amount} с
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}

      <RefundDialog
        state={dialogState}
        appointmentId={appointmentId}
        patientId={patientId}
        onClose={() => setDialogState(null)}
        onSuccess={(updated) => {
          setDialogState(null);
          onSummaryUpdated(updated);
        }}
      />
    </>
  );
};

export default AppointmentRefundsPanel;
