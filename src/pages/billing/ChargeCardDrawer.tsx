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
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import { alpha } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { billingApi, type BillingCharge } from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";

type Props = {
  charge: BillingCharge | null;
  organizationId?: number;
  canManage: boolean;
  canManagePayments: boolean;
  onClose: () => void;
  onChanged: (charge: BillingCharge) => void;
};

const money = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 })
    .format(Number(value ?? 0));

const date = (value: string | null | undefined) => (value ? dayjs(value).format("DD.MM.YYYY") : "—");

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  issued: "Выставлено",
  partially_paid: "Частично оплачено",
  paid: "Оплачено",
  overdue: "Просрочено",
  cancelled: "Отменено",
  pending: "В обработке",
  succeeded: "Успешно",
  refunded: "Возвращено",
  failed: "Не прошёл",
};

const statusColors: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  draft: "default",
  issued: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "error",
  cancelled: "default",
};

const methodLabels: Record<string, string> = {
  cash: "Наличные",
  transfer: "Банковский перевод",
  bakai: "Bakai Pay",
};

const sourceLabels: Record<string, string> = {
  manual: "Создано вручную",
  auto: "Автоначисление",
  schedule: "По расписанию контракта",
};

const cycleLabels: Record<string, string> = {
  one_time: "Разово",
  package: "Пакет",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
  per_course: "За курс",
  per_session: "За занятие",
};

function Fact({ label, value, danger = false }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle1" fontWeight={760} color={danger ? "error.main" : "text.primary"} noWrap>{value}</Typography>
    </Box>
  );
}

function Rule({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 1.1 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={650} textAlign="right">{value}</Typography>
    </Stack>
  );
}

/** Дни просрочки: положительное число — срок уже прошёл. */
function overdueDays(charge: BillingCharge): number {
  return dayjs().startOf("day").diff(dayjs(charge.dueDate).startOf("day"), "day");
}

export function ChargeCardDrawer({
  charge, organizationId, canManage, canManagePayments, onClose, onChanged,
}: Props) {
  const chargeId = charge?.id;
  const scope = React.useMemo(() => ({ ...(organizationId ? { organizationId } : {}) }), [organizationId]);
  const cardKey = djangoQueryKeys.billing.chargeCard(organizationId, chargeId);
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [payOpen, setPayOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState("cash");
  const [payLink, setPayLink] = React.useState<string | null>(null);

  const remaining = charge ? Math.max(0, Number(charge.amount) - Number(charge.paidAmount)) : 0;

  const contractQuery = useQuery({
    queryKey: [...cardKey, "contract"],
    queryFn: () => billingApi.contract(charge!.subscriptionId, scope),
    enabled: charge != null && charge.subscriptionId > 0,
  });
  // Кто реально закрыл начисление: у FIFO-платежа chargeId пустой, поэтому
  // список оплат клиента на этот вопрос не отвечает — отвечают распределения.
  const allocationsQuery = useQuery({
    queryKey: [...cardKey, "allocations"],
    queryFn: () => billingApi.chargeAllocations(chargeId!, { ...scope, pageSize: 200 }),
    enabled: charge != null,
  });

  const finish = React.useCallback(async (updated: BillingCharge, message: string) => {
    onChanged(updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.billing.all }),
      queryClient.invalidateQueries({ queryKey: cardKey }),
    ]);
    notify?.({ type: "success", message });
  }, [cardKey, notify, onChanged, queryClient]);

  const statusMutation = useMutation({
    mutationFn: (action: "issue" | "cancel") => billingApi.chargeAction(chargeId!, action, scope),
    onSuccess: (updated, action) =>
      finish(updated, action === "issue" ? "Начисление выставлено клиенту" : "Начисление отменено"),
    onError: (error) => notify?.({ type: "error", message: "Статус не изменён", description: getErrorMessage(error) }),
  });

  const payMutation = useMutation({
    mutationFn: () => billingApi.createPayment({
      clientId: charge!.clientId,
      chargeId: charge!.id,
      amount: payAmount,
      method: payMethod,
      ...scope,
    }),
    onSuccess: async () => {
      setPayOpen(false);
      const refreshed = await billingApi.charge(chargeId!, scope);
      await finish(refreshed, "Оплата принята");
    },
    onError: (error) => notify?.({ type: "error", message: "Оплата не принята", description: getErrorMessage(error) }),
  });

  const linkMutation = useMutation({
    mutationFn: () => billingApi.createPayLink(chargeId!, organizationId),
    onSuccess: async (result) => {
      const url = result.providerPayUrl || result.url;
      setPayLink(url);
      try {
        await navigator.clipboard.writeText(url);
        notify?.({ type: "success", message: "Ссылка на оплату скопирована" });
      } catch {
        notify?.({ type: "success", message: "Ссылка на оплату готова", description: "Скопируйте её из карточки." });
      }
    },
    onError: (error) => notify?.({ type: "error", message: "Ссылка не создана", description: getErrorMessage(error) }),
  });

  React.useEffect(() => {
    setPayOpen(false);
    setPayMethod("cash");
    setPayLink(null);
  }, [chargeId]);

  const allocations = allocationsQuery.data?.items ?? [];
  const busy = statusMutation.isPending || linkMutation.isPending;
  const closed = charge != null && ["paid", "cancelled"].includes(charge.status);
  const progress = charge && Number(charge.amount)
    ? Math.min(100, (Number(charge.paidAmount) / Number(charge.amount)) * 100)
    : 0;
  const late = charge ? overdueDays(charge) : 0;

  return (
    <>
      <Drawer
        anchor="right"
        open={charge != null}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100%", sm: 720, lg: 820 }, maxWidth: "100%" } }}
      >
        {charge && (
          <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
            <Box
              sx={(theme) => ({
                px: { xs: 2, sm: 3 }, py: 2.5,
                bgcolor: alpha(
                  charge.status === "overdue" ? theme.palette.error.main : theme.palette.primary.main,
                  theme.palette.mode === "dark" ? 0.18 : 0.06,
                ),
                borderBottom: 1, borderColor: "divider",
              })}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="overline" color="text.secondary" fontWeight={800}>Начисление № {charge.number}</Typography>
                    <Chip
                      size="small"
                      label={statusLabels[charge.status] ?? charge.status}
                      color={statusColors[charge.status] ?? "default"}
                    />
                    {charge.status === "overdue" && late > 0 && (
                      <Chip size="small" variant="outlined" color="error" label={`просрочка ${late} дн.`} />
                    )}
                  </Stack>
                  <Typography variant="h5" fontWeight={820}>{charge.purpose || charge.offeringName}</Typography>
                  <Typography color="text.secondary">{charge.clientName} · {charge.periodLabel || charge.periodKey}</Typography>
                </Box>
                <IconButton aria-label="Закрыть карточку" onClick={onClose}><CloseOutlined /></IconButton>
              </Stack>

              {!closed && (canManage || canManagePayments) && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                  {canManagePayments && (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PaymentsOutlined />}
                      disabled={busy || remaining <= 0}
                      onClick={() => { setPayAmount(String(remaining)); setPayOpen(true); }}
                    >
                      Принять оплату
                    </Button>
                  )}
                  {canManage && charge.status === "draft" && (
                    <Button size="small" variant="outlined" startIcon={<SendOutlined />} disabled={busy} onClick={() => statusMutation.mutate("issue")}>
                      Выставить клиенту
                    </Button>
                  )}
                  {canManage && (
                    <Button size="small" variant="outlined" startIcon={<LinkOutlined />} disabled={busy} onClick={() => linkMutation.mutate()}>
                      Ссылка на оплату
                    </Button>
                  )}
                  {canManage && ["draft", "issued"].includes(charge.status) && (
                    <Button size="small" color="error" startIcon={<BlockOutlined />} disabled={busy} onClick={() => statusMutation.mutate("cancel")}>
                      Отменить
                    </Button>
                  )}
                </Stack>
              )}
            </Box>

            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {(contractQuery.isLoading || allocationsQuery.isLoading) && <CircularProgress size={20} sx={{ mb: 2 }} />}
              {(contractQuery.isError || allocationsQuery.isError) && (
                <Alert severity="error" sx={{ mb: 2 }}>Часть данных начисления не загрузилась.</Alert>
              )}
              {payLink && (
                <Alert severity="info" sx={{ mb: 2, wordBreak: "break-all" }} onClose={() => setPayLink(null)}>
                  Ссылка на оплату: {payLink}
                </Alert>
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
                <Fact label="Сумма" value={money(charge.amount)} />
                <Fact label="Оплачено" value={money(charge.paidAmount)} />
                <Fact label="Остаток" value={money(remaining)} danger={remaining > 0 && charge.status === "overdue"} />
                <Fact
                  label="Срок оплаты"
                  value={date(charge.dueDate)}
                  danger={charge.status === "overdue"}
                />
              </Paper>

              <Box sx={{ mt: 1.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  color={progress >= 100 ? "success" : charge.status === "overdue" ? "error" : "primary"}
                  sx={{ height: 8, borderRadius: 4 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Закрыто {Math.round(progress)}% суммы начисления
                </Typography>
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 2, mt: 3 }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <DescriptionOutlined color="action" />
                    <Typography variant="h6" fontWeight={780}>Начисление</Typography>
                  </Stack>
                  <Divider sx={{ my: 1 }} />
                  <Rule label="Период" value={charge.periodLabel || charge.periodKey} />
                  <Rule label="Объект продажи" value={charge.offeringName} />
                  <Rule label="Назначение" value={charge.purpose || "—"} />
                  <Rule label="Источник" value={sourceLabels[charge.source] ?? charge.source} />
                  <Rule label="Создано" value={date(charge.createdAt)} />
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AccountBalanceWalletOutlined color="action" />
                    <Typography variant="h6" fontWeight={780}>Контракт</Typography>
                  </Stack>
                  <Divider sx={{ my: 1 }} />
                  {contractQuery.data ? (
                    <>
                      <Rule
                        label="Контракт"
                        value={`№ ${contractQuery.data.number ?? contractQuery.data.id} · ${contractQuery.data.name || contractQuery.data.offeringName}`}
                      />
                      <Rule label="Статус контракта" value={statusLabels[contractQuery.data.status] ?? contractQuery.data.status} />
                      <Rule label="Текущий тариф" value={money(contractQuery.data.effectivePrice)} />
                      <Rule
                        label="Периодичность"
                        value={cycleLabels[contractQuery.data.effectiveBillingCycle] ?? contractQuery.data.effectiveBillingCycle}
                      />
                      <Rule label="Следующее начисление" value={date(contractQuery.data.nextChargeOn)} />
                      <Rule label="Долг по контракту" value={money(contractQuery.data.debt)} />
                    </>
                  ) : (
                    !contractQuery.isLoading && <Typography color="text.secondary">Контракт не найден.</Typography>
                  )}
                </Paper>
              </Box>

              <Divider sx={{ my: 3 }} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <PaymentsOutlined color="action" />
                <Typography variant="h6" fontWeight={780}>Оплаты по начислению</Typography>
                <Chip size="small" label={allocations.length} />
              </Stack>
              <Stack spacing={1}>
                {allocations.map((allocation) => {
                  const reversed = Number(allocation.reversedAmount);
                  return (
                    <Paper key={allocation.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <Typography fontWeight={700} noWrap>
                              {methodLabels[allocation.method] ?? allocation.method}
                            </Typography>
                            {reversed > 0 && (
                              <Chip size="small" variant="outlined" color="warning" label={`возвращено ${money(reversed)}`} />
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {date(allocation.paidAt ?? allocation.createdAt)} · платёж #{allocation.paymentId}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography fontWeight={760}>{money(allocation.remainingAmount)}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {reversed > 0 ? `из ${money(allocation.amount)}` : statusLabels[allocation.paymentStatus] ?? allocation.paymentStatus}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
                {!allocationsQuery.isLoading && allocations.length === 0 && (
                  <Typography color="text.secondary">
                    {Number(charge.paidAmount) > 0
                      ? "Начисление закрыто до появления учёта распределений — по нему нет разбивки по платежам."
                      : "Оплат по этому начислению ещё нет."}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Box>
        )}
      </Drawer>

      <Dialog open={payOpen} onClose={() => !payMutation.isPending && setPayOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Принять оплату</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Платёж закроет начисление № {charge?.number}. Остаток к оплате — {money(remaining)}.
          </Typography>
          <Stack spacing={2}>
            <TextField
              fullWidth
              required
              type="number"
              label="Сумма"
              value={payAmount}
              onChange={(event) => setPayAmount(event.target.value)}
              inputProps={{ min: 0, step: "0.01" }}
              helperText={Number(payAmount) > remaining ? "Излишек попадёт на баланс клиента." : " "}
            />
            <TextField select fullWidth label="Метод" value={payMethod} onChange={(event) => setPayMethod(event.target.value)}>
              <MenuItem value="cash">Наличные</MenuItem>
              <MenuItem value="transfer">Банковский перевод</MenuItem>
              <MenuItem value="bakai">Bakai Pay</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)} disabled={payMutation.isPending}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => payMutation.mutate()}
            disabled={!payAmount || Number(payAmount) <= 0 || payMutation.isPending}
          >
            {payMutation.isPending ? <CircularProgress size={20} /> : "Принять оплату"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
