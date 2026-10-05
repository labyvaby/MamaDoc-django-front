import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import { useMutation } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";

import {
  deleteAppointmentPayment,
  type AppointmentPayment,
  type PaymentSummary,
} from "../../../../api/payments";
import { useT } from "../../../../i18n/VerticalProvider";
import { formatSom } from "./formatSom";
import { paymentMethodLabel } from "../../../../utility/paymentMethodLabel";
import { paymentHistoryErrorMessage } from "./PaymentEditDialog";
import PaymentSheet from "./PaymentSheet";

const MIN_REASON = 3;

export interface PaymentDeleteDialogProps {
  open: boolean;
  appointmentId: number;
  payment: AppointmentPayment | null;
  onClose: () => void;
  onDeleted: (summary: PaymentSummary) => void;
  /** Деньги на самом деле были и их отдают — это возврат, а не удаление. */
  onRefundInstead?: (payment: AppointmentPayment) => void;
}

/**
 * Удаление оплаты, которой не было (дубль, ошибочная строка). Запись не
 * исчезает бесследно: бэк кладёт снимок в историю с причиной и автором.
 */
export const PaymentDeleteDialog: React.FC<PaymentDeleteDialogProps> = ({
  open,
  appointmentId,
  payment,
  onClose,
  onDeleted,
  onRefundInstead,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const { open: notify } = useNotification();
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setReason("");
    setTouched(false);
    setServerError(null);
  }, [open, payment?.id]);

  const mutation = useMutation({
    mutationFn: () => deleteAppointmentPayment(appointmentId, payment!.id, reason.trim()),
    onSuccess: (summary) => {
      notify?.({ type: "success", message: t("paymentHistory.delete.deleted") });
      onDeleted(summary);
    },
    onError: (err) => setServerError(paymentHistoryErrorMessage(err, t)),
  });

  if (!payment) return null;

  const reasonInvalid = reason.trim().length < MIN_REASON;
  const presets = [
    t("paymentHistory.edit.presetDouble"),
    t("paymentHistory.edit.presetNotPaid"),
    t("paymentHistory.edit.presetAmount"),
  ];

  const handleDelete = () => {
    setTouched(true);
    if (reasonInvalid || mutation.isPending) return;
    setServerError(null);
    mutation.mutate();
  };

  return (
    <PaymentSheet
      open={open}
      onClose={onClose}
      busy={mutation.isPending}
      icon={<DeleteOutlineOutlined fontSize="small" color="error" />}
      title={t("paymentHistory.delete.title")}
      subtitle={`${formatSom(payment.amount)} · ${paymentMethodLabel(payment.method, payment.cashlessMethodName)} · ${dayjs(payment.createdAt).format("D MMM, HH:mm")}`}
      actions={
        <>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending}>
            {t("paymentHistory.edit.cancel")}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={mutation.isPending || (touched && reasonInvalid)}
            startIcon={mutation.isPending ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineOutlined />}
          >
            {t("paymentHistory.delete.confirm")}
          </Button>
        </>
      }
    >
      <Box
        sx={{
          p: 1.5,
          borderRadius: "12px",
          bgcolor: alpha(theme.palette.warning.main, 0.08),
          border: "1px solid",
          borderColor: alpha(theme.palette.warning.main, 0.25),
        }}
      >
        <Typography variant="body2">{t("paymentHistory.delete.text")}</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
          {t("paymentHistory.delete.keepsTrail")}
        </Typography>
        {onRefundInstead && payment.canRefund && (
          <Button
            size="small"
            color="warning"
            startIcon={<UndoOutlined fontSize="small" />}
            onClick={() => onRefundInstead(payment)}
            sx={{ mt: 1, textTransform: "none", px: 1 }}
          >
            {t("paymentHistory.delete.toRefund")}
          </Button>
        )}
      </Box>

      <Box>
        <TextField
          label={t("paymentHistory.delete.reason")}
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          multiline
          minRows={2}
          error={touched && reasonInvalid}
          helperText={touched && reasonInvalid ? t("paymentHistory.edit.reasonRequired") : t("paymentHistory.edit.reasonHint")}
          fullWidth
          autoFocus
        />
        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
          {presets.map((preset) => (
            <Chip
              key={preset}
              label={preset}
              size="small"
              variant={reason === preset ? "filled" : "outlined"}
              color={reason === preset ? "error" : "default"}
              onClick={() => setReason(preset)}
            />
          ))}
        </Stack>
      </Box>

      <Collapse in={serverError != null}>
        <Alert severity="error" sx={{ py: 0.5 }}>
          {serverError}
        </Alert>
      </Collapse>
    </PaymentSheet>
  );
};

export default PaymentDeleteDialog;
