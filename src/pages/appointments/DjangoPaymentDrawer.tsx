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
  Tooltip,
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
import PatientBalancePanel from "./PatientBalancePanel";
import AppointmentRefundsPanel from "./AppointmentRefundsPanel";

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

// ── Method labels (including balance) ─────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  balance: "Баланс пациента",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDecimal(s: string): number {
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

// Backend error messages that need user-friendly rewrites
function mapSaveError(raw: string): string {
  if (raw.includes("уже содержит оплату с баланса") || raw.includes("replace-all")) {
    return "Этот приём уже оплачивался с баланса. Изменение оплаты с баланса пока недоступно без возврата.";
  }
  return raw;
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
  const patientId = appointment?.patient?.id ?? null;

  // Track whether the user has touched discount — when true, user input wins over summary
  const discountTouchedRef = React.useRef(false);

  const paymentQuery = useQuery({
    queryKey: appointmentId
      ? djangoQueryKeys.appointments.payments(appointmentId)
      : ["django", "appointments", "payments", "closed"],
    queryFn: ({ signal }) => getAppointmentPayments(appointmentId!, signal),
    enabled: open && appointmentId !== null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchOnMount: "always",
  });
  const summary = paymentQuery.data ?? null;

  // Read available balance from cache (loaded by PatientBalancePanel) — no extra request
  const cachedBalance = patientId
    ? queryClient.getQueryData<{ balance: string }>(
        djangoQueryKeys.patients.balance(patientId),
      )
    : undefined;
  const availableBalance = parseDecimal(cachedBalance?.balance ?? "0");

  // Form state
  const [discountStr, setDiscountStr] = React.useState("0");
  const [cashStr, setCashStr] = React.useState("0");
  const [cardStr, setCardStr] = React.useState("0");
  const [balanceStr, setBalanceStr] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Reset on appointment change or close
  const prevAppointmentIdRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!open || appointmentId === null) {
      discountTouchedRef.current = false;
      setDiscountStr("0");
      setCashStr("0");
      setCardStr("0");
      setBalanceStr("0");
      setNote("");
      setSaveError(null);
      prevAppointmentIdRef.current = null;
      return;
    }
    if (appointmentId !== prevAppointmentIdRef.current) {
      discountTouchedRef.current = false;
      setDiscountStr(appointment?.discountAmount ?? "0");
      setCashStr("0");
      setCardStr("0");
      setBalanceStr("0");
      setNote("");
      setSaveError(null);
      prevAppointmentIdRef.current = appointmentId;
    }
  }, [open, appointmentId, appointment?.discountAmount]);

  // Seed discount from summary once (only if user hasn't touched it)
  const summaryDiscountRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!summary) return;
    if (discountTouchedRef.current) return;
    if (summary.discountAmount === summaryDiscountRef.current) return;
    summaryDiscountRef.current = summary.discountAmount;
    setDiscountStr(summary.discountAmount ?? "0");
  }, [summary]);

  // Derived calculations
  const total = parseDecimal(summary?.totalAmount ?? appointment?.totalAmount ?? "0");
  const discountRaw = parseDecimal(discountStr);
  const discount = Math.max(0, Math.min(discountRaw, total));
  const payable = discountTouchedRef.current || !summary
    ? Math.max(0, total - discount)
    : parseDecimal(summary.payableAmount);
  const cash = Math.max(0, parseDecimal(cashStr));
  const card = Math.max(0, parseDecimal(cardStr));
  const balanceUsed = Math.max(0, parseDecimal(balanceStr));
  const paidTotal = cash + card + balanceUsed;
  const debt = Math.max(0, payable - paidTotal);
  const overpaid = paidTotal > payable + 0.001;
  const balanceExceeded = balanceUsed > availableBalance + 0.001;

  const statusPreview = computeStatus(payable, paidTotal, discount, total);

  const hasRefunds = (summary?.refunds?.length ?? 0) > 0 || parseDecimal(summary?.refundedTotal ?? "0") > 0;
  // After a refund the backend blocks further apply — mirror that guard in the UI
  const applyBlockedByRefund = hasRefunds;

  // Validation
  const discountInvalid = discountRaw < 0 || discountRaw > total + 0.001;
  const cashInvalid = parseDecimal(cashStr) < 0;
  const cardInvalid = parseDecimal(cardStr) < 0;
  const balanceInvalid = parseDecimal(balanceStr) < 0 || balanceExceeded;
  const submitDisabled =
    discountInvalid || cashInvalid || cardInvalid || balanceInvalid || overpaid || applyBlockedByRefund;

  // Quick-fill: fill balance field with min(remaining debt, available balance)
  const handleBalanceQuickFill = () => {
    const fill = Math.min(debt, availableBalance);
    if (fill > 0) setBalanceStr(fmt(fill));
  };

  const applyMutation = useMutation({
    mutationFn: (payload: ApplyPaymentPayload) => {
      if (!appointmentId) throw new Error("Нет выбранного приёма");
      return applyAppointmentPayment(appointmentId, payload);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        djangoQueryKeys.appointments.payments(result.appointmentId),
        result,
      );
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.appointments.payments(result.appointmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "list"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["django", "appointments", "day-counts"],
      });
      // Refresh patient balance if balance was used
      if (patientId && balanceUsed > 0) {
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.patients.balance(patientId),
        });
        void queryClient.invalidateQueries({
          queryKey: djangoQueryKeys.patients.transactions(patientId),
        });
      }
      notify?.({ type: "success", message: "Оплата сохранена" });
      onClose();
      onSaved?.(result);
    },
    onError: (err: unknown) => {
      const raw = parseBackendError(err);
      const msg = mapSaveError(raw);
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
      balanceAmount: balanceUsed > 0 ? fmt(balanceUsed) : undefined,
      note: note.trim() || undefined,
    });
  };

  const handleSummaryUpdated = React.useCallback((updated: PaymentSummary) => {
    if (!updated.appointmentId) return;
    queryClient.setQueryData(
      djangoQueryKeys.appointments.payments(updated.appointmentId),
      updated,
    );
  }, [queryClient]);

  const isCancelled = CANCELLED_STATUSES.has(appointment?.status ?? "");
  const patientName = appointment?.patient?.fullName ?? "Бронирование";
  const hasPatient = !!patientId;

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

        {/* Patient balance panel — no extra request, reads from shared cache */}
        {hasPatient && <PatientBalancePanel patientId={patientId!} />}

        {/* Cancelled/no_show notice */}
        {isCancelled && (
          <Alert severity="warning" sx={{ mb: 2, mt: hasPatient ? 0 : 0 }}>
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

        {/* Payment form — hidden for cancelled/no_show */}
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
                disabled={isCancelled}
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
                disabled={isCancelled}
              />

              {/* Balance field — only for real patients */}
              {hasPatient && (
                <Stack spacing={0.5}>
                  <TextField
                    label="С баланса пациента"
                    size="small"
                    value={balanceStr}
                    onChange={(e) => setBalanceStr(e.target.value)}
                    error={balanceInvalid || overpaid}
                    helperText={
                      balanceExceeded
                        ? `Недостаточно средств. Доступно: ${fmt(availableBalance)} с`
                        : availableBalance > 0
                          ? `Доступно: ${fmt(availableBalance)} с`
                          : "Баланс: 0.00 с"
                    }
                    InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
                    inputProps={{ inputMode: "decimal" }}
                    fullWidth
                    disabled={isCancelled}
                  />
                  {availableBalance > 0 && debt > 0.001 && (
                    <Tooltip title={`Списать ${fmt(Math.min(debt, availableBalance))} с — покрыть остаток долга`}>
                      <Button
                        size="small"
                        variant="text"
                        onClick={handleBalanceQuickFill}
                        sx={{ textTransform: "none", alignSelf: "flex-start", px: 0 }}
                        disabled={isCancelled}
                      >
                        С баланса на остаток ({fmt(Math.min(debt, availableBalance))} с)
                      </Button>
                    </Tooltip>
                  )}
                </Stack>
              )}
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
              {balanceUsed > 0.001 && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">в т.ч. с баланса</Typography>
                  <Typography variant="body2" color="info.main">{fmt(balanceUsed)} с</Typography>
                </Stack>
              )}
              {/* Show refunded/net only when refunds exist on this appointment */}
              {summary && parseDecimal(summary.refundedTotal ?? "0") > 0 && (
                <>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Возвращено</Typography>
                    <Typography variant="body2" fontWeight={600} color="error.main">
                      − {summary.refundedTotal} с
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Чистая оплата</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {summary.paidNet ?? fmt(parseDecimal(summary.paidTotal) - parseDecimal(summary.refundedTotal ?? "0"))} с
                    </Typography>
                  </Stack>
                </>
              )}
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

            {/* Block-apply notice when refunds exist */}
            {applyBlockedByRefund && (
              <Alert severity="info" icon={false} sx={{ py: 0.5, fontSize: "0.75rem" }}>
                Изменение оплаты недоступно — по приёму уже оформлен возврат.
              </Alert>
            )}

            {/* Previous payments history (shown only when no refunds — refunds panel shows richer view) */}
            {summary && summary.payments.length > 0 && !hasRefunds && (
              <>
                <Divider />
                <Stack spacing={0.75}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                    История платежей
                  </Typography>
                  {summary.payments.map((p) => (
                    <Stack key={p.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {METHOD_LABELS[p.method] ?? p.method}
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

        {/* Refunds panel — always shown when summary is loaded, including cancelled/no_show.
            Refund button visibility is gated by finance.refund permission inside the panel. */}
        {!paymentQuery.isLoading && summary && appointmentId !== null && (
          <AppointmentRefundsPanel
            appointmentId={appointmentId}
            patientId={patientId}
            summary={summary}
            onSummaryUpdated={handleSummaryUpdated}
          />
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
