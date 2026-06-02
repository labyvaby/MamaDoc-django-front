import React from "react";
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
} from "../../api/payments";
import type { DjangoAppointment } from "../../api/appointments";

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
  const n = parseFloat(s);
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

// ── Props ─────────────────────────────────────────────────────────────────────

export type DjangoPaymentDrawerProps = {
  open: boolean;
  onClose: () => void;
  appointment: DjangoAppointment | null;
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

  const [summary, setSummary] = React.useState<PaymentSummary | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [discountStr, setDiscountStr] = React.useState("0");
  const [cashStr, setCashStr] = React.useState("0");
  const [cardStr, setCardStr] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Load summary when drawer opens
  React.useEffect(() => {
    if (!open || !appointment) {
      setSummary(null);
      setLoadError(null);
      setDiscountStr("0");
      setCashStr("0");
      setCardStr("0");
      setNote("");
      setSaveError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    getAppointmentPayments(appointment.id)
      .then((s) => {
        setSummary(s);
        setDiscountStr(s.discountAmount ?? "0");
        setCashStr("0");
        setCardStr("0");
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = parseBackendError(err);
        setLoadError(msg);
        setLoading(false);
        // Fallback: use fields from appointment list row
        setDiscountStr(appointment.discountAmount ?? "0");
      });
  }, [open, appointment]);

  // Derived calculations
  const total = parseDecimal(summary?.totalAmount ?? appointment?.totalAmount ?? "0");
  const discount = Math.max(0, Math.min(parseDecimal(discountStr), total));
  const payable = Math.max(0, total - discount);
  const cash = Math.max(0, parseDecimal(cashStr));
  const card = Math.max(0, parseDecimal(cardStr));
  const paidTotal = cash + card;
  const debt = Math.max(0, payable - paidTotal);
  const overpaid = paidTotal > payable;

  const statusPreview = computeStatus(payable, paidTotal, discount, total);

  // Validation
  const discountInvalid = parseDecimal(discountStr) < 0 || parseDecimal(discountStr) > total;
  const cashInvalid = parseDecimal(cashStr) < 0;
  const cardInvalid = parseDecimal(cardStr) < 0;
  const submitDisabled =
    saving || discountInvalid || cashInvalid || cardInvalid || overpaid;

  const handleSave = async () => {
    if (!appointment) return;
    setSaveError(null);
    setSaving(true);
    try {
      const payments: { method: "cash" | "card"; amount: string }[] = [];
      if (cash > 0) payments.push({ method: "cash", amount: fmt(cash) });
      if (card > 0) payments.push({ method: "card", amount: fmt(card) });

      const result = await applyAppointmentPayment(appointment.id, {
        discountAmount: fmt(discount),
        payments,
        note: note.trim() || undefined,
      });

      notify?.({ type: "success", message: "Оплата сохранена" });
      setSummary(result);
      onSaved?.(result);
      onClose();
    } catch (err: unknown) {
      const msg = parseBackendError(err);
      setSaveError(msg);
      notify?.({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const patientName = appointment?.patient?.fullName ?? "Бронирование";

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
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
        <IconButton size="small" onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Stack>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
        {/* Patient + appointment info */}
        <Stack spacing={0.25} mb={2}>
          <Typography variant="subtitle2" fontWeight={600}>{patientName}</Typography>
          {appointment?.patient?.phone && (
            <Typography variant="caption" color="text.secondary">
              {appointment.patient.phone}
            </Typography>
          )}
        </Stack>

        {loading && (
          <Stack alignItems="center" py={3}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {loadError && !loading && (
          <Alert severity="warning" sx={{ mb: 2 }}>{loadError}</Alert>
        )}

        {!loading && (
          <Stack spacing={2.5}>
            {/* Total */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ bgcolor: "action.hover", borderRadius: 1, px: 2, py: 1.25 }}
            >
              <Typography variant="body2" color="text.secondary">Сумма приёма</Typography>
              <Typography variant="subtitle1" fontWeight={700}>
                {fmt(total)} с
              </Typography>
            </Stack>

            <Divider />

            {/* Discount */}
            <TextField
              label="Скидка"
              size="small"
              value={discountStr}
              onChange={(e) => setDiscountStr(e.target.value)}
              error={discountInvalid}
              helperText={discountInvalid ? `Скидка должна быть от 0 до ${fmt(total)}` : " "}
              InputProps={{ endAdornment: <InputAdornment position="end">с</InputAdornment> }}
              inputProps={{ inputMode: "decimal" }}
              fullWidth
            />

            {/* Payable */}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">К оплате</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fmt(payable)} с
              </Typography>
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
                  color={debt > 0 ? "warning.main" : "text.secondary"}
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
        <Button variant="outlined" onClick={onClose} fullWidth disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          fullWidth
          disabled={submitDisabled}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          Сохранить
        </Button>
      </Stack>
    </Drawer>
  );
};

export default DjangoPaymentDrawer;
