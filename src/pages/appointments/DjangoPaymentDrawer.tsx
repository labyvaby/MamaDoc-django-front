import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { useNotification } from "@refinedev/core";

import {
  getAppointmentPayments,
  applyAppointmentPayment,
  parseBackendError,
  type PaymentSummary,
  type PaymentStatus,
  type ApplyPaymentPayload,
} from "../../api/payments";
import type { DjangoAppointment } from "../../api/appointments";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";

// ── Payment status display ─────────────────────────────────────────────────────

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  discounted: "Со скидкой",
  refunded: "Возврат",
};

export const PAYMENT_STATUS_COLOR: Record<
  PaymentStatus,
  "default" | "warning" | "success" | "info" | "error"
> = {
  unpaid: "default",
  partial: "warning",
  paid: "success",
  discounted: "info",
  refunded: "error",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDecimal(s: string): number {
  // Accept both "." and "," as decimal separator
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function computeStatus(
  payable: number,
  paid: number,
  discount: number,
  total: number,
): PaymentStatus {
  if (payable <= 0 && discount > 0 && total > 0 && paid === 0) return "discounted";
  if (paid >= payable && payable > 0) return "paid";
  if (paid > 0 && paid < payable) return "partial";
  return "unpaid";
}

const CANCELLED_STATUSES = new Set(["cancelled", "no_show"]);

// ── Props ─────────────────────────────────────────────────────────────────────

export type DjangoPaymentDrawerProps = {
  open: boolean;
  onClose: () => void;
  appointment: DjangoAppointment | null;
  /** Called after successful apply. Drawer is already closed by the time this fires. */
  onSaved?: (summary: PaymentSummary) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

const DjangoPaymentDrawer: React.FC<DjangoPaymentDrawerProps> = ({
  open,
  onClose,
  appointment,
  onSaved,
}) => {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const appointmentId = appointment?.id ?? null;

  // Track whether the user has touched the discount field since opening.
  // When true we stop syncing from summary — user input wins.
  const discountTouchedRef = React.useRef(false);

  const paymentQuery = useQuery({
    queryKey: appointmentId
      ? djangoQueryKeys.appointments.payments(appointmentId)
      : ["django", "appointments", "payments", "closed"],
    queryFn: ({ signal }) => getAppointmentPayments(appointmentId!, signal),
    enabled: open && appointmentId !== null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    // Always re-fetch when drawer opens so repeated opens show fresh data
    refetchOnMount: "always",
  });
  const summary = paymentQuery.data ?? null;

  const [discountStr, setDiscountStr] = React.useState("0");
  const [cashStr, setCashStr] = React.useState("0");
  const [cardStr, setCardStr] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Reset all form state when drawer opens for a new appointment (or closes).
  // We separate "on open" from "on summary arrives" to avoid overwriting user input.
  const prevAppointmentIdRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!open || appointmentId === null) {
      discountTouchedRef.current = false;
      setDiscountStr("0");
      setCashStr("0");
      setCardStr("0");
      setNote("");
      setSaveError(null);
      prevAppointmentIdRef.current = null;
      return;
    }

    if (appointmentId !== prevAppointmentIdRef.current) {
      // Different appointment — reset unconditionally before summary loads
      discountTouchedRef.current = false;
      setDiscountStr(appointment?.discountAmount ?? "0");
      setCashStr("0");
      setCardStr("0");
      setNote("");
      setSaveError(null);
      prevAppointmentIdRef.current = appointmentId;
    }
  }, [open, appointmentId, appointment?.discountAmount]);

  // Once summary arrives (and user hasn't touched discount yet), seed from summary.
  const summaryDiscountRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!summary) return;
    if (discountTouchedRef.current) return;
    if (summary.discountAmount === summaryDiscountRef.current) return;
    summaryDiscountRef.current = summary.discountAmount;
    setDiscountStr(summary.discountAmount ?? "0");
  }, [summary]);

  // Derived calculations — use payableAmount from summary when available
  const total = parseDecimal(summary?.totalAmount ?? appointment?.totalAmount ?? "0");
  const discountRaw = parseDecimal(discountStr);
  const discount = Math.max(0, Math.min(discountRaw, total));
  // Prefer backend-computed payableAmount if discount hasn't been changed by user
  const payable = discountTouchedRef.current || !summary
    ? Math.max(0, total - discount)
    : parseDecimal(summary.payableAmount);
  const cash = Math.max(0, parseDecimal(cashStr));
  const card = Math.max(0, parseDecimal(cardStr));
  const paidTotal = cash + card;
  const debt = Math.max(0, payable - paidTotal);
  const overpaid = paidTotal > payable + 0.001; // float tolerance

  const statusPreview = computeStatus(payable, paidTotal, discount, total);

  // Validation
  const discountInvalid = discountRaw < 0 || discountRaw > total + 0.001;
  const cashInvalid = parseDecimal(cashStr) < 0;
  const cardInvalid = parseDecimal(cardStr) < 0;
  const submitDisabled = discountInvalid || cashInvalid || cardInvalid || overpaid;

  const applyMutation = useMutation({
    mutationFn: (payload: ApplyPaymentPayload) => {
      if (!appointmentId) throw new Error("Нет выбранного приёма");
      return applyAppointmentPayment(appointmentId, payload);
    },
    onSuccess: (result) => {
      // Update payment cache so next open shows fresh data immediately
      queryClient.setQueryData(
        djangoQueryKeys.appointments.payments(result.appointmentId),
        result,
      );
      // Invalidate so background refetch runs — catches any server-side divergence
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.payments(result.appointmentId),
      });
      // Invalidate all appointment lists so every filter sees fresh payment fields
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.all,
      });
      notify?.({ type: "success", message: "Оплата сохранена" });
      // Close first, then notify parent — avoids double-close via handlePaymentSaved
      onClose();
      onSaved?.(result);
    },
    onError: (err: unknown) => {
      const msg = parseBackendError(err);
      setSaveError(msg);
      notify?.({ type: "error", message: msg });
    },
  });

  const handleSave = () => {
    if (!appointment) return;
    setSaveError(null);
    const payments: { method: "cash" | "card"; amount: string }[] = [];
    if (cash > 0) payments.push({ method: "cash", amount: fmt(cash) });
    if (card > 0) payments.push({ method: "card", amount: fmt(card) });

    applyMutation.mutate({
      discountAmount: fmt(discount),
      payments,
      note: note.trim() || undefined,
    });
  };

  const isCancelled = CANCELLED_STATUSES.has(appointment?.status ?? "");
  const patientName = appointment?.patient?.fullName ?? "Бронирование";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={applyMutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, display: "flex", flexDirection: "column" } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <PaymentsOutlined color="primary" />
          <Typography variant="h6" fontWeight={600}>Оплата</Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} disabled={applyMutation.isPending}>
          <CloseOutlined />
        </IconButton>
      </Stack>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
        {/* Patient info */}
        <Stack spacing={0.25} mb={2}>
          <Typography variant="subtitle2" fontWeight={600}>{patientName}</Typography>
          {appointment?.patient?.phone && (
            <Typography variant="caption" color="text.secondary">
              {appointment.patient.phone}
            </Typography>
          )}
        </Stack>

        {/* Cancelled/no_show notice */}
        {isCancelled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Приём отменён или помечен как неявка — оплата недоступна.
          </Alert>
        )}

        {paymentQuery.isLoading && (
          <Stack alignItems="center" py={3}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {paymentQuery.error && !paymentQuery.isLoading && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {parseBackendError(paymentQuery.error)}
          </Alert>
        )}

        {!paymentQuery.isLoading && !isCancelled && (
          <Stack spacing={2.5}>
            {/* Total */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ bgcolor: "action.hover", borderRadius: 1, px: 2, py: 1.25 }}
            >
              <Typography variant="body2" color="text.secondary">Сумма приёма</Typography>
              <Typography variant="subtitle1" fontWeight={700}>{fmt(total)} с</Typography>
            </Stack>

            <Divider />

            {/* Discount */}
            <TextField
              label="Скидка"
              size="small"
              value={discountStr}
              onChange={(e) => {
                discountTouchedRef.current = true;
                setDiscountStr(e.target.value);
              }}
              error={discountInvalid}
              helperText={discountInvalid ? `Скидка: от 0 до ${fmt(total)}` : " "}
              InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
              inputProps={{ inputMode: "decimal" }}
              fullWidth
            />

            {/* Payable */}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">К оплате</Typography>
              <Typography variant="body1" fontWeight={600}>{fmt(payable)} с</Typography>
            </Stack>

            <Divider />

            {/* Payment inputs */}
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                Метод оплаты
              </Typography>
              <TextField
                label="Наличные"
                size="small"
                value={cashStr}
                onChange={(e) => setCashStr(e.target.value)}
                error={cashInvalid || overpaid}
                InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
                inputProps={{ inputMode: "decimal" }}
                fullWidth
              />
              <TextField
                label="Карта"
                size="small"
                value={cardStr}
                onChange={(e) => setCardStr(e.target.value)}
                error={cardInvalid || overpaid}
                InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
                inputProps={{ inputMode: "decimal" }}
                fullWidth
              />
            </Stack>

            {overpaid && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                Переплата: внесено больше суммы к оплате
              </Alert>
            )}

            <Divider />

            {/* Summary */}
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Внесено</Typography>
                <Typography variant="body2" fontWeight={500}>{fmt(paidTotal)} с</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Долг</Typography>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color={debt > 0.001 ? "warning.main" : "text.secondary"}
                >
                  {fmt(debt)} с
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Статус</Typography>
                <Chip
                  label={PAYMENT_STATUS_LABELS[statusPreview] ?? statusPreview}
                  size="small"
                  color={PAYMENT_STATUS_COLOR[statusPreview] ?? "default"}
                  variant="outlined"
                  sx={{ fontSize: "0.7rem", height: 22 }}
                />
              </Stack>
            </Stack>

            {/* Previous payments history */}
            {summary && summary.payments.length > 0 && (
              <>
                <Divider />
                <Stack spacing={0.75}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                    История платежей
                  </Typography>
                  {summary.payments.map((p) => (
                    <Stack key={p.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {p.method === "cash" ? "Наличные" : "Карта"}
                      </Typography>
                      <Typography variant="caption" fontWeight={500}>{p.amount} с</Typography>
                    </Stack>
                  ))}
                </Stack>
              </>
            )}

            {/* Note */}
            <TextField
              label="Комментарий"
              size="small"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fullWidth
            />

            {saveError && <Alert severity="error">{saveError}</Alert>}
          </Stack>
        )}
      </Box>

      {/* Footer */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ px: 2.5, py: 2, borderTop: "1px solid", borderColor: "divider", flexShrink: 0 }}
      >
        <Button
          variant="outlined"
          onClick={onClose}
          fullWidth
          disabled={applyMutation.isPending}
        >
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          fullWidth
          disabled={submitDisabled || applyMutation.isPending || isCancelled}
          startIcon={applyMutation.isPending ? <CircularProgress size={16} /> : undefined}
        >
          Сохранить
        </Button>
      </Stack>
    </Drawer>
  );
};

export default DjangoPaymentDrawer;
