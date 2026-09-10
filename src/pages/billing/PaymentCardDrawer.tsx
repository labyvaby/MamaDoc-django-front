import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import { alpha } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { billingApi, type BillingPayment } from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";

type Props = {
  payment: BillingPayment | null;
  organizationId?: number;
  canManagePayments: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const money = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 })
    .format(Number(value ?? 0));

const dateTime = (value: string | null | undefined) =>
  value ? dayjs(value).format("DD.MM.YYYY, HH:mm") : "—";

const methodLabels: Record<string, string> = {
  cash: "Наличные",
  transfer: "Банковский перевод",
  bakai: "Bakai Pay",
};

const statusLabels: Record<string, string> = {
  pending: "В обработке",
  succeeded: "Проведён",
  failed: "Не прошёл",
  refunded: "Возвращён",
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle1" fontWeight={760}>{value}</Typography>
    </Box>
  );
}

export function PaymentCardDrawer({
  payment, organizationId, canManagePayments, onClose, onChanged,
}: Props) {
  const paymentId = payment?.id;
  const scope = React.useMemo(() => ({ ...(organizationId ? { organizationId } : {}) }), [organizationId]);
  const cardKey = React.useMemo(
    () => ["django", "billing", "payment-card", organizationId ?? null, paymentId ?? null] as const,
    [organizationId, paymentId],
  );
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundAmount, setRefundAmount] = React.useState("");

  const allocationsQuery = useQuery({
    queryKey: [...cardKey, "allocations"],
    queryFn: () => billingApi.paymentAllocations(paymentId!, { ...scope, pageSize: 200 }),
    enabled: payment != null,
  });

  const allocations = allocationsQuery.data?.items ?? [];
  const reversed = allocations.reduce((sum, item) => sum + Number(item.reversedAmount || 0), 0);
  const refundable = Math.max(0, Number(payment?.amount ?? 0) - reversed);
  const isOriginalSuccessful = payment?.status === "succeeded" && !payment.refundOfId;

  const refundMutation = useMutation({
    mutationFn: () => billingApi.refundPayment(paymentId!, refundAmount, scope),
    onSuccess: async () => {
      setRefundOpen(false);
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.billing.all });
      await queryClient.invalidateQueries({ queryKey: cardKey });
      onChanged();
      notify?.({ type: "success", message: "Возврат проведён" });
    },
    onError: (error) => notify?.({
      type: "error",
      message: "Возврат не проведён",
      description: getErrorMessage(error),
    }),
  });

  React.useEffect(() => {
    setRefundOpen(false);
    setRefundAmount("");
  }, [paymentId]);

  const openRefund = () => {
    setRefundAmount(String(refundable));
    setRefundOpen(true);
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={payment != null}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100%", sm: 680, lg: 760 }, maxWidth: "100%" } }}
      >
        {payment && (
          <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
            <Box
              sx={(theme) => ({
                px: { xs: 2, sm: 3 }, py: 2.5,
                bgcolor: alpha(
                  payment.refundOfId ? theme.palette.error.main : theme.palette.success.main,
                  theme.palette.mode === "dark" ? 0.18 : 0.07,
                ),
                borderBottom: 1, borderColor: "divider",
              })}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="overline" color="text.secondary" fontWeight={800}>
                      {payment.refundOfId ? "Возврат" : "Платёж"} #{payment.id}
                    </Typography>
                    <Chip
                      size="small"
                      color={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "error" : "default"}
                      label={statusLabels[payment.status] ?? payment.status}
                    />
                  </Stack>
                  <Typography variant="h5" fontWeight={820}>{payment.clientName}</Typography>
                  <Typography color="text.secondary">
                    {methodLabels[payment.method] ?? payment.method} · {dateTime(payment.paidAt ?? payment.createdAt)}
                  </Typography>
                </Box>
                <IconButton aria-label="Закрыть карточку" onClick={onClose}><CloseOutlined /></IconButton>
              </Stack>

              {canManagePayments && isOriginalSuccessful && refundable > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<ReplayOutlined />}
                  onClick={openRefund}
                  sx={{ mt: 2 }}
                >
                  Оформить возврат
                </Button>
              )}
            </Box>

            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {allocationsQuery.isLoading && <CircularProgress size={20} sx={{ mb: 2 }} />}
              {allocationsQuery.isError && (
                <Alert severity="error" sx={{ mb: 2 }}>Не удалось загрузить распределение платежа.</Alert>
              )}

              <Paper
                variant="outlined"
                sx={{
                  display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                  borderRadius: 3, overflow: "hidden",
                  "& > div": { p: 2, borderRight: { sm: 1 }, borderBottom: { xs: 1, sm: 0 }, borderColor: "divider" },
                  "& > div:last-of-type": { borderRight: 0 },
                }}
              >
                <Fact label={payment.refundOfId ? "Сумма возврата" : "Сумма платежа"} value={money(payment.amount)} />
                <Fact label="Комиссия" value={money(payment.fee)} />
                <Fact label="Возвращено" value={money(reversed)} />
                <Fact label="Доступно к возврату" value={payment.refundOfId ? "—" : money(refundable)} />
              </Paper>

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 2 }}>
                <Stack spacing={1.1}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography color="text.secondary">Способ оплаты</Typography>
                    <Typography fontWeight={650}>{methodLabels[payment.method] ?? payment.method}</Typography>
                  </Stack>
                  <Divider />
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography color="text.secondary">Идентификатор провайдера</Typography>
                    <Typography fontWeight={650} sx={{ wordBreak: "break-all", textAlign: "right" }}>{payment.providerTxnId || "—"}</Typography>
                  </Stack>
                  {payment.refundOfId && <><Divider /><Stack direction="row" justifyContent="space-between"><Typography color="text.secondary">Исходный платёж</Typography><Typography fontWeight={650}>#{payment.refundOfId}</Typography></Stack></>}
                </Stack>
              </Paper>

              <Divider sx={{ my: 3 }} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <AccountBalanceWalletOutlined color="action" />
                <Typography variant="h6" fontWeight={780}>Распределение</Typography>
                <Chip size="small" label={allocations.length} />
              </Stack>
              <Stack spacing={1}>
                {allocations.map((allocation) => (
                  <Paper key={allocation.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight={700}>
                            {allocation.chargeId ? `Начисление № ${allocation.chargeId}` : "Баланс клиента"}
                          </Typography>
                          {Number(allocation.reversedAmount) > 0 && (
                            <Chip size="small" variant="outlined" color="warning" label={`возвращено ${money(allocation.reversedAmount)}`} />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {allocation.chargeId ? "Оплата начисления" : "Свободный остаток для будущих начислений"}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography fontWeight={760}>{money(allocation.remainingAmount)}</Typography>
                        <Typography variant="caption" color="text.secondary">из {money(allocation.amount)}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))}
                {!allocationsQuery.isLoading && allocations.length === 0 && (
                  <Typography color="text.secondary">
                    {payment.refundOfId ? "Возврат уменьшает распределения исходного платежа." : "Распределение для платежа не найдено."}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Box>
        )}
      </Drawer>

      <Dialog open={refundOpen} onClose={() => !refundMutation.isPending && setRefundOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Оформить возврат</DialogTitle>
        <DialogContent>
          <Alert severity="warning" icon={<PaymentsOutlined />} sx={{ mb: 2 }}>
            Возврат отменит распределение денег по начислениям и балансу клиента.
          </Alert>
          <TextField
            autoFocus
            fullWidth
            required
            type="number"
            label="Сумма возврата"
            value={refundAmount}
            onChange={(event) => setRefundAmount(event.target.value)}
            inputProps={{ min: 0.01, max: refundable, step: "0.01" }}
            helperText={`Можно вернуть до ${money(refundable)}`}
            error={Number(refundAmount) > refundable}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundOpen(false)} disabled={refundMutation.isPending}>Отмена</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => refundMutation.mutate()}
            disabled={refundMutation.isPending || Number(refundAmount) <= 0 || Number(refundAmount) > refundable}
          >
            {refundMutation.isPending ? <CircularProgress size={20} /> : "Вернуть деньги"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
