import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import EastOutlined from "@mui/icons-material/EastOutlined";
import { useMutation } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import type { DjangoAppointment } from "../../../../api/appointments";
import { ApiError } from "../../../../api/client";
import { CASHLESS_METHODS_ENABLED } from "../../../../api/cashlessMethods";
import {
  PAYMENT_HISTORY_ERROR_CODES,
  parseBackendError,
  updateAppointmentPayment,
  type AppointmentPayment,
  type PaymentSummary,
  type UpdateAppointmentPaymentPayload,
} from "../../../../api/payments";
import { CashlessMethodSelect } from "../../../../components/ui/CashlessMethodSelect";
import { useCashlessMethods } from "../../../../hooks/useCashlessMethods";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatSom } from "./formatSom";
import { paymentMethodLabel } from "../../../../utility/paymentMethodLabel";
import PaymentSheet from "./PaymentSheet";

type EditableMethod = "cash" | "card" | "insurance";

const MIN_REASON = 3;

const parseAmount = (raw: string): number => {
  const n = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Сообщение ошибки правки: известные коды — своим текстом, иначе от бэка. */
export function paymentHistoryErrorMessage(
  err: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (err instanceof ApiError) {
    if (err.code === PAYMENT_HISTORY_ERROR_CODES.dayLocked) return t("paymentHistory.errors.dayLocked");
    if (err.code === PAYMENT_HISTORY_ERROR_CODES.editingDisabled) {
      return t("paymentHistory.errors.editingDisabled");
    }
    if (err.code === PAYMENT_HISTORY_ERROR_CODES.locked) {
      return err.message || t("paymentHistory.errors.locked");
    }
  }
  return parseBackendError(err) || t("paymentHistory.errors.generic");
}

export interface PaymentEditDialogProps {
  open: boolean;
  appointment: DjangoAppointment;
  payment: AppointmentPayment | null;
  /** Неоплаченный остаток приёма — сколько ещё можно добавить к этой оплате. */
  remainingAmount: number;
  onClose: () => void;
  onSaved: (summary: PaymentSummary) => void;
}

/**
 * Правка одной принятой оплаты: сумма, способ (+ терминал), комментарий.
 * Причина обязательна — она уходит в историю вместе с именем сотрудника.
 */
export const PaymentEditDialog: React.FC<PaymentEditDialogProps> = ({
  open,
  appointment,
  payment,
  remainingAmount,
  onClose,
  onSaved,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const { open: notify } = useNotification();

  const [amountStr, setAmountStr] = React.useState("");
  const [method, setMethod] = React.useState<EditableMethod>("cash");
  const [cashlessMethodId, setCashlessMethodId] = React.useState<number | "">("");
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Форма заново заполняется на каждую открытую оплату.
  React.useEffect(() => {
    if (!open || !payment) return;
    setAmountStr(String(parseFloat(payment.amount)));
    setMethod((["cash", "card", "insurance"].includes(payment.method) ? payment.method : "cash") as EditableMethod);
    setCashlessMethodId(payment.cashlessMethodId ?? "");
    setNote(payment.note ?? "");
    setReason("");
    setTouched(false);
    setServerError(null);
  }, [open, payment]);

  const cashless = useCashlessMethods(open && method === "card", {
    organizationId: appointment.organizationId ?? null,
    branchId: appointment.branchId ?? null,
  });

  const mutation = useMutation({
    mutationFn: (body: UpdateAppointmentPaymentPayload) =>
      updateAppointmentPayment(appointment.id, payment!.id, body),
    onSuccess: (summary) => {
      notify?.({ type: "success", message: t("paymentHistory.edit.saved") });
      onSaved(summary);
    },
    onError: (err) => setServerError(paymentHistoryErrorMessage(err, t)),
  });

  if (!payment) return null;

  const original = parseFloat(payment.amount);
  const amount = parseAmount(amountStr);
  const maxAmount = original + Math.max(0, remainingAmount);
  const amountInvalid = !Number.isFinite(amount) || amount <= 0;
  const amountTooBig = !amountInvalid && amount > maxAmount + 0.004;
  const reasonInvalid = reason.trim().length < MIN_REASON;

  const methodChanged = method !== payment.method;
  const cashlessChanged =
    method === "card" && (cashlessMethodId === "" ? null : cashlessMethodId) !== (payment.cashlessMethodId ?? null);
  const amountChanged = !amountInvalid && Math.abs(amount - original) > 0.004;
  const noteChanged = note.trim() !== (payment.note ?? "").trim();
  const hasChanges = amountChanged || methodChanged || cashlessChanged || noteChanged;
  const cashlessMissing =
    method === "card" && CASHLESS_METHODS_ENABLED && cashless.isRequired && cashlessMethodId === "";

  const canSave =
    hasChanges && !amountInvalid && !amountTooBig && !reasonInvalid && !cashlessMissing && !mutation.isPending;

  const selectedCashlessName =
    method === "card" && cashlessMethodId !== ""
      ? cashless.methods.find((m) => m.id === cashlessMethodId)?.name ?? payment.cashlessMethodName ?? null
      : null;

  const handleSave = () => {
    setTouched(true);
    if (!canSave) return;
    const body: UpdateAppointmentPaymentPayload = { reason: reason.trim() };
    if (amountChanged) body.amount = amount.toFixed(2);
    if (methodChanged) body.method = method;
    if (method === "card" && (methodChanged || cashlessChanged)) {
      body.cashlessMethodId = cashlessMethodId === "" ? null : cashlessMethodId;
    }
    if (noteChanged) body.note = note.trim();
    setServerError(null);
    mutation.mutate(body);
  };

  const presets = [
    t("paymentHistory.edit.presetAmount"),
    t("paymentHistory.edit.presetMethod"),
    t("paymentHistory.edit.presetTypo"),
  ];

  const methodOptions: { value: EditableMethod; icon: React.ReactNode }[] = [
    { value: "cash", icon: <PaymentsOutlined fontSize="small" /> },
    { value: "card", icon: <CreditCardOutlined fontSize="small" /> },
    // Сменить способ НА страховку отсюда нельзя — нужна компания и полис;
    // это делается формой оплаты. Со страховки — можно.
    ...(payment.method === "insurance"
      ? [{ value: "insurance" as const, icon: <HealthAndSafetyOutlined fontSize="small" /> }]
      : []),
  ];

  const who = payment.createdByName ?? "—";
  const subtitle = `${formatSom(original)} · ${dayjs(payment.createdAt).format("D MMM, HH:mm")} · ${who}`;

  return (
    <PaymentSheet
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      icon={<EditOutlined fontSize="small" color="primary" />}
      title={t("paymentHistory.edit.title")}
      subtitle={subtitle}
      actions={
        <>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending}>
            {t("paymentHistory.edit.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!canSave}
            startIcon={mutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {t("paymentHistory.edit.save")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("paymentHistory.edit.amount")}
        size="small"
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
        inputProps={{ inputMode: "decimal" }}
        InputProps={{ endAdornment: <InputAdornment position="end">{t("refunds.currency")}</InputAdornment> }}
        error={(touched || amountStr !== "") && (amountInvalid || amountTooBig)}
        helperText={
          amountInvalid && (touched || amountStr !== "")
            ? t("paymentHistory.edit.amountPositive")
            : amountTooBig
              ? t("paymentHistory.edit.maxAmount", { amount: formatSom(maxAmount) })
              : " "
        }
        fullWidth
        autoFocus
      />

      <Box>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>
          {t("paymentHistory.edit.method")}
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={method}
          onChange={(_, value: EditableMethod | null) => value && setMethod(value)}
        >
          {methodOptions.map((option) => (
            <ToggleButton key={option.value} value={option.value} sx={{ gap: 0.75, textTransform: "none" }}>
              {option.icon}
              {t(`paymentHistory.edit.methods.${option.value}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Collapse in={method === "card" && CASHLESS_METHODS_ENABLED && (cashless.methods.length > 0 || cashless.isLoading)}>
          <Box sx={{ pt: 1.5 }}>
            <CashlessMethodSelect
              methods={cashless.methods}
              value={cashlessMethodId}
              onChange={setCashlessMethodId}
              loading={cashless.isLoading}
              loadFailed={cashless.isError}
              error={touched && cashlessMissing}
              label={t("paymentHistory.edit.terminal")}
            />
          </Box>
        </Collapse>
        <Collapse in={method === "insurance"}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ pt: 1 }}>
            {t("paymentHistory.edit.insuranceKept")}
          </Typography>
        </Collapse>
      </Box>

      <TextField
        label={t("paymentHistory.edit.note")}
        size="small"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        fullWidth
      />

      {/* Было → станет: кассир видит итог правки до сохранения. */}
      <Collapse in={hasChanges && !amountInvalid}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            p: 1.25,
            borderRadius: "12px",
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            border: "1px dashed",
            borderColor: alpha(theme.palette.primary.main, 0.25),
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {t("paymentHistory.edit.preview")}
            </Typography>
            <Typography variant="body2" fontWeight={600} sx={{ textDecoration: "line-through", opacity: 0.7 }} noWrap>
              {formatSom(original)} · {paymentMethodLabel(payment.method, payment.cashlessMethodName)}
            </Typography>
          </Box>
          <EastOutlined fontSize="small" color="primary" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {t("paymentHistory.edit.previewAfter")}
            </Typography>
            <Typography variant="body2" fontWeight={700} color="primary.main" noWrap>
              {formatSom(Number.isFinite(amount) ? amount : original)} · {paymentMethodLabel(method, selectedCashlessName)}
            </Typography>
          </Box>
        </Stack>
      </Collapse>

      <Box>
        <TextField
          label={t("paymentHistory.edit.reason")}
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          multiline
          minRows={2}
          error={touched && reasonInvalid}
          helperText={touched && reasonInvalid ? t("paymentHistory.edit.reasonRequired") : t("paymentHistory.edit.reasonHint")}
          fullWidth
        />
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
          {presets.map((preset) => (
            <Chip
              key={preset}
              label={preset}
              size="small"
              variant={reason === preset ? "filled" : "outlined"}
              color={reason === preset ? "primary" : "default"}
              onClick={() => setReason(preset)}
            />
          ))}
        </Stack>
      </Box>

      {!hasChanges && touched && (
        <Typography variant="caption" color="text.secondary">
          {t("paymentHistory.edit.noChanges")}
        </Typography>
      )}
      <Collapse in={serverError != null}>
        <Alert severity="error" sx={{ py: 0.5 }}>
          {serverError}
        </Alert>
      </Collapse>
    </PaymentSheet>
  );
};

export default PaymentEditDialog;
