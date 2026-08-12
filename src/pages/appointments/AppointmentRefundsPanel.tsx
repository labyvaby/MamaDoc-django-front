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

import { useNotification } from "@refinedev/core";

import {
  createAppointmentRefund,
  parseBackendError,
  refundConsumptionWarnings,
  type AppointmentPayment,
  type AppointmentRefund,
  type PaymentSummary,
  type RefundPayload,
} from "../../api/payments";
import { formatConsumptionWarnings } from "../../components/appointments/consumptionWarnings";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useCan } from "../../hooks/useCan";
import { useFormValidation } from "../../hooks/useFormValidation";
import { useT } from "../../i18n/VerticalProvider";
import { paymentMethodLabel } from "../../utility/paymentMethodLabel";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const { t } = useT("appointments");
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
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
      // Refresh patient balance/transactions when balance or bonus payment is refunded
      if (patientId && (state?.payment.method === "balance" || state?.payment.method === "bonus")) {
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.patients.balance(patientId),
        });
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.patients.transactions(patientId),
        });
      }
      // Возврат, уводящий приём из оплаченных, возвращает списанные расходники
      // на склад — бэк сообщает об этом теми же consumptionWarnings.
      const warning = formatConsumptionWarnings(refundConsumptionWarnings(res));
      if (warning) notify?.({ type: "error", message: warning });
      onSuccess(res.paymentSummary);
      onClose();
    },
    onError: (err: unknown) => {
      setLocalError(parseBackendError(err));
      setConfirmOpen(false);
    },
  });

  const amountValue = parseDecimal(amountStr);
  const remaining = state?.remaining ?? 0;
  const v = useFormValidation({
    amount:
      amountValue > 0 && amountValue <= remaining + 0.001
        ? null
        : t("refunds.errors.amountRange", { max: fmt(remaining) }),
    reason: reason.trim() ? null : t("refunds.errors.reasonRequired"),
  });

  if (!state) return null;

  const amount = amountValue;

  const handleFullRefund = () => {
    setAmountStr(fmt(state.remaining));
  };

  const handleRequestConfirm = () => {
    setLocalError(null);
    if (refundMutation.isPending) return;
    if (!v.validate()) return;
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
              {t("refunds.title")}
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} pt={0.5}>
            {/* Payment info */}
            <Box sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.5, py: 1 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{t("refunds.method")}</Typography>
                <Typography variant="caption" fontWeight={600}>
                  {paymentMethodLabel(state.payment.method, state.payment.cashlessMethodName)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{t("refunds.paymentAmount")}</Typography>
                <Typography variant="caption" fontWeight={600}>{t("common:currency.amountShort", { amount: state.payment.amount })}</Typography>
              </Stack>
              {parseDecimal(state.payment.refundedAmount) > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">{t("refunds.alreadyRefunded")}</Typography>
                  <Typography variant="caption" fontWeight={600} color="error.main">
                    {t("common:currency.amountShort", { amount: state.payment.refundedAmount })}
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{t("refunds.availableToRefund")}</Typography>
                <Typography variant="caption" fontWeight={700} color="warning.main">
                  {t("common:currency.amountShort", { amount: fmt(state.remaining) })}
                </Typography>
              </Stack>
            </Box>

            {/* Amount */}
            <Stack spacing={0.5}>
              <TextField
                label={t("refunds.amountLabel")}
                size="small"
                value={amountStr}
                onChange={(e) => { setLocalError(null); setAmountStr(e.target.value); }}
                {...v.field("amount", " ")}
                InputProps={{ endAdornment: <InputAdornment position="end">{t("refunds.currency")}</InputAdornment> }}
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
                {t("refunds.refundFull", { amount: fmt(state.remaining) })}
              </Button>
            </Stack>

            {/* Reason */}
            <TextField
              label={t("refunds.reasonLabel")}
              size="small"
              multiline
              minRows={2}
              value={reason}
              onChange={(e) => { setLocalError(null); setReason(e.target.value); }}
              required
              {...v.field("reason", " ")}
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
            {t("refunds.cancel")}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRequestConfirm}
            disabled={refundMutation.isPending}
            startIcon={refundMutation.isPending ? <CircularProgress size={14} /> : undefined}
          >
            {t("refunds.submit")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("refunds.confirmTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t("refunds.refundVerb")} <strong>{fmt(amount)} {t("refunds.currency")}</strong> {t("refunds.byPayment")}{" "}
            <strong>{paymentMethodLabel(state.payment.method, state.payment.cashlessMethodName)}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.75}>
            {t("refunds.reasonInline", { reason })}
          </Typography>
          <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }} icon={false}>
            {t("refunds.confirmText")}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setConfirmOpen(false)} disabled={refundMutation.isPending}>
            {t("refunds.cancel")}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirm}
            disabled={refundMutation.isPending}
            startIcon={refundMutation.isPending ? <CircularProgress size={14} /> : undefined}
          >
            {t("refunds.confirm")}
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
  const { t } = useT("appointments");
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
          {t("refunds.sectionTitle")}
        </Typography>
      </Stack>

      {/* Refund totals */}
      {hasRefunds && (
        <Stack spacing={0.5} mb={1.5} sx={{ bgcolor: "action.hover", borderRadius: 1, px: 1.5, py: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">{t("refunds.paidGross")}</Typography>
            <Typography variant="caption" fontWeight={500}>{t("common:currency.amountShort", { amount: summary.paidTotal })}</Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">{t("refunds.refunded")}</Typography>
            <Typography variant="caption" fontWeight={600} color="error.main">
              {t("common:currency.minusAmountShort", { amount: summary.refundedTotal })}
            </Typography>
          </Stack>
          <Divider sx={{ my: 0.25 }} />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary" fontWeight={600}>{t("refunds.netPaid")}</Typography>
            <Typography variant="caption" fontWeight={700}>{t("common:currency.amountShort", { amount: fmt(paidNet) })}</Typography>
          </Stack>
        </Stack>
      )}

      {/* Blocked-apply notice */}
      {hasRefunds && (
        <Alert severity="info" icon={false} sx={{ mb: 1.5, py: 0.5, fontSize: "0.75rem" }}>
          {t("refunds.confirmText")}
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
                    {paymentMethodLabel(p.method, p.cashlessMethodName)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("common:currency.amountShort", { amount: p.amount })}
                    {refundedAmt > 0 && (
                      <> {t("refunds.refundedInline")} <Box component="span" sx={{ color: "error.main", fontWeight: 600 }}>{p.refundedAmount} {t("refunds.currency")}</Box></>
                    )}
                  </Typography>
                  {canRefundThis && (
                    <Typography variant="caption" color="warning.main">
                      {t("refunds.availableInline", { amount: fmt(remaining) })}
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
                    {t("refunds.refund")}
                  </Button>
                )}
                {!canRefundThis && refundedAmt > 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ ml: 1, flexShrink: 0 }}>
                    {t("refunds.refundedChip")}
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
            {historyOpen
              ? t("refunds.hideHistory")
              : t("refunds.showHistory", { count: refunds.length })}
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
                      {paymentMethodLabel(r.method, r.cashlessMethodName)}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ maxWidth: 180 }}>
                      {r.reason}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" fontWeight={700} color="error.main" sx={{ flexShrink: 0, ml: 1 }}>
                    {t("common:currency.minusAmountShort", { amount: r.amount })}
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
