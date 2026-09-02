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
  Tooltip,
  Typography,
} from "@mui/material";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PauseCircleOutlineOutlined from "@mui/icons-material/PauseCircleOutlineOutlined";
import PlayCircleOutlineOutlined from "@mui/icons-material/PlayCircleOutlineOutlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import StopCircleOutlined from "@mui/icons-material/StopCircleOutlined";
import { alpha } from "@mui/material/styles";
import { useNotification } from "@refinedev/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { billingApi, type BillingContract } from "../../api/billing";
import { getErrorMessage } from "../../api/client";
import { djangoQueryKeys } from "../../api/queryKeys";

type Props = {
  contract: BillingContract | null;
  organizationId?: number;
  canManage: boolean;
  onClose: () => void;
  onChanged: (contract: BillingContract) => void;
};

const money = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KGS", maximumFractionDigits: 2 })
    .format(Number(value ?? 0));

const date = (value: string | null | undefined) => value ? dayjs(value).format("DD.MM.YYYY") : "—";

const cycleLabels: Record<string, string> = {
  one_time: "Разово",
  package: "Пакет",
  monthly: "Ежемесячно",
  quarterly: "Ежеквартально",
  yearly: "Ежегодно",
  per_course: "За курс",
  per_session: "За занятие",
};

const statusLabels: Record<string, string> = {
  active: "Активен",
  paused: "На паузе",
  ended: "Завершён",
  draft: "Черновик",
  issued: "Выставлено",
  partially_paid: "Частично оплачено",
  paid: "Оплачено",
  overdue: "Просрочено",
  cancelled: "Отменено",
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

export function ContractCardDrawer({ contract, organizationId, canManage, onClose, onChanged }: Props) {
  const contractId = contract?.id;
  const scope = React.useMemo(() => ({ ...(organizationId ? { organizationId } : {}) }), [organizationId]);
  const cardKey = djangoQueryKeys.billing.contractCard(organizationId, contractId);
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const [price, setPrice] = React.useState("");
  const [priceDate, setPriceDate] = React.useState(dayjs().format("YYYY-MM-DD"));
  const [reason, setReason] = React.useState("");
  const [endOpen, setEndOpen] = React.useState(false);
  const [endDate, setEndDate] = React.useState(dayjs().format("YYYY-MM-DD"));

  const historyQuery = useQuery({
    queryKey: [...cardKey, "prices"],
    queryFn: () => billingApi.contractPriceHistory(contractId!, scope),
    enabled: contract != null,
  });
  const chargesQuery = useQuery({
    queryKey: [...cardKey, "charges"],
    queryFn: () => billingApi.charges({ ...scope, contractId, pageSize: 200 }),
    enabled: contract != null,
  });

  const finishMutation = async (updated: BillingContract, message: string) => {
    onChanged(updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.billing.all }),
      queryClient.invalidateQueries({ queryKey: cardKey }),
    ]);
    notify?.({ type: "success", message });
  };

  const statusMutation = useMutation({
    mutationFn: (action: "pause" | "resume") => billingApi.contractAction(contractId!, action, scope),
    onSuccess: (updated, action) => finishMutation(updated, action === "pause" ? "Контракт поставлен на паузу" : "Контракт возобновлён"),
    onError: (error) => notify?.({ type: "error", message: "Статус не изменён", description: getErrorMessage(error) }),
  });
  const priceMutation = useMutation({
    mutationFn: () => billingApi.changeContractPrice(contractId!, {
      price,
      effectiveFrom: priceDate,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    }, scope),
    onSuccess: async (updated) => {
      setPrice("");
      setReason("");
      await finishMutation(updated, "Новая цена сохранена");
    },
    onError: (error) => notify?.({ type: "error", message: "Цена не изменена", description: getErrorMessage(error) }),
  });
  const endMutation = useMutation({
    mutationFn: () => billingApi.endContract(contractId!, endDate, scope),
    onSuccess: async (updated) => {
      setEndOpen(false);
      await finishMutation(updated, "Контракт завершён");
    },
    onError: (error) => notify?.({ type: "error", message: "Контракт не завершён", description: getErrorMessage(error) }),
  });

  React.useEffect(() => {
    setPrice("");
    setReason("");
    setPriceDate(dayjs().format("YYYY-MM-DD"));
    setEndDate(dayjs().format("YYYY-MM-DD"));
    setEndOpen(false);
  }, [contractId]);

  const charges = chargesQuery.data?.items ?? [];
  const openCharges = charges.filter((charge) => !["paid", "cancelled"].includes(charge.status));
  const outstanding = openCharges.reduce((sum, charge) => sum + Math.max(0, Number(charge.amount) - Number(charge.paidAmount)), 0);
  const busy = statusMutation.isPending || endMutation.isPending;

  return (
    <>
      <Drawer
        anchor="right"
        open={contract != null}
        onClose={onClose}
        PaperProps={{ sx: { width: { xs: "100%", sm: 720, lg: 820 }, maxWidth: "100%" } }}
      >
        {contract && (
          <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
            <Box
              sx={(theme) => ({
                px: { xs: 2, sm: 3 }, py: 2.5,
                bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.06),
                borderBottom: 1, borderColor: "divider",
              })}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="overline" color="text.secondary" fontWeight={800}>Контракт № {contract.number ?? contract.id}</Typography>
                    <Chip
                      size="small"
                      label={statusLabels[contract.status] ?? contract.status}
                      color={contract.status === "active" ? "success" : contract.status === "paused" ? "warning" : "default"}
                    />
                  </Stack>
                  <Typography variant="h5" fontWeight={820}>{contract.name || contract.offeringName}</Typography>
                  <Typography color="text.secondary">{contract.clientName} · {contract.offeringName}</Typography>
                </Box>
                <IconButton aria-label="Закрыть карточку" onClick={onClose}><CloseOutlined /></IconButton>
              </Stack>
              {canManage && contract.status !== "ended" && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                  {contract.status === "active" && (
                    <Button size="small" variant="outlined" startIcon={<PauseCircleOutlineOutlined />} disabled={busy} onClick={() => statusMutation.mutate("pause")}>Поставить на паузу</Button>
                  )}
                  {contract.status === "paused" && (
                    <Button size="small" variant="outlined" startIcon={<PlayCircleOutlineOutlined />} disabled={busy} onClick={() => statusMutation.mutate("resume")}>Возобновить</Button>
                  )}
                  <Button size="small" color="error" startIcon={<StopCircleOutlined />} disabled={busy} onClick={() => setEndOpen(true)}>Завершить</Button>
                </Stack>
              )}
            </Box>

            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {(historyQuery.isLoading || chargesQuery.isLoading) && <CircularProgress size={20} sx={{ mb: 2 }} />}
              {(historyQuery.isError || chargesQuery.isError) && <Alert severity="error" sx={{ mb: 2 }}>Часть данных контракта не загрузилась.</Alert>}

              <Paper
                variant="outlined"
                sx={{
                  display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                  borderRadius: 3, overflow: "hidden",
                  "& > div": { p: 2, borderRight: { sm: 1 }, borderBottom: { xs: 1, sm: 0 }, borderColor: "divider" },
                  "& > div:last-of-type": { borderRight: 0 },
                }}
              >
                <Fact label="Текущий тариф" value={money(contract.effectivePrice)} />
                <Fact label="К оплате" value={money(outstanding || contract.debt)} danger={Number(contract.debt) > 0} />
                <Fact label="Следующее начисление" value={date(contract.nextChargeOn)} />
                <Fact label="Периодичность" value={cycleLabels[contract.effectiveBillingCycle] ?? contract.effectiveBillingCycle} />
              </Paper>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 2, mt: 3 }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1} alignItems="center"><CalendarMonthOutlined color="action" /><Typography variant="h6" fontWeight={780}>Правила начислений</Typography></Stack>
                  <Divider sx={{ my: 1 }} />
                  <Rule label="Срок контракта" value={`${date(contract.startsOn)} — ${date(contract.endsOn)}`} />
                  <Rule label="День начисления" value={contract.billingDay ? `${contract.billingDay}-е число` : "По дате начала"} />
                  <Rule label="Срок оплаты" value={contract.paymentTermDays == null ? "По календарю" : `${contract.paymentTermDays} дн.`} />
                  <Rule label="Льготный период" value={`${contract.graceDays} дн.`} />
                  <Rule label="Автоначисление" value={contract.autoCharge ? "Включено" : "Выключено"} />
                  <Rule label="Уведомления" value={contract.notifyOnCharge || contract.notifyOnOverdue ? "Включены" : "Выключены"} />
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1} alignItems="center"><PriceChangeOutlined color="action" /><Typography variant="h6" fontWeight={780}>История тарифа</Typography></Stack>
                  <Divider sx={{ my: 1 }} />
                  <Stack spacing={0}>
                    {(historyQuery.data ?? []).map((entry, index) => (
                      <Box key={entry.id} sx={{ display: "grid", gridTemplateColumns: "18px 1fr", columnGap: 1.25 }}>
                        <Box sx={{ position: "relative", display: "flex", justifyContent: "center" }}>
                          <Box sx={{ width: 8, height: 8, mt: 1.25, borderRadius: "50%", bgcolor: index === 0 ? "primary.main" : "divider", zIndex: 1 }} />
                          {index < (historyQuery.data?.length ?? 0) - 1 && <Box sx={{ position: "absolute", top: 16, bottom: -8, width: 1, bgcolor: "divider" }} />}
                        </Box>
                        <Box sx={{ pb: 1.5 }}>
                          <Typography fontWeight={720}>{money(entry.price)}</Typography>
                          <Typography variant="caption" color="text.secondary">с {date(entry.effectiveFrom)}{entry.reason ? ` · ${entry.reason}` : ""}</Typography>
                        </Box>
                      </Box>
                    ))}
                    {!historyQuery.isLoading && !(historyQuery.data?.length) && <Typography color="text.secondary">Изменений тарифа ещё не было.</Typography>}
                  </Stack>
                </Paper>
              </Box>

              {canManage && contract.status !== "ended" && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 3 }}>
                  <Typography fontWeight={760}>Изменить тариф</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, mt: 1.5 }}>
                    <TextField size="small" required type="number" label="Новая цена" value={price} onChange={(event) => setPrice(event.target.value)} inputProps={{ min: 0, step: "0.01" }} />
                    <TextField size="small" required type="date" label="Действует с" value={priceDate} onChange={(event) => setPriceDate(event.target.value)} InputLabelProps={{ shrink: true }} />
                    <TextField size="small" label="Причина изменения" value={reason} onChange={(event) => setReason(event.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} />
                  </Box>
                  <Box sx={{ mt: 1.5, textAlign: "right" }}><Button variant="contained" disabled={!price || Number(price) < 0 || priceMutation.isPending} onClick={() => priceMutation.mutate()}>{priceMutation.isPending ? <CircularProgress size={20} /> : "Сохранить новую цену"}</Button></Box>
                </Paper>
              )}

              <Divider sx={{ my: 3 }} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <ReceiptLongOutlined color="action" />
                <Typography variant="h6" fontWeight={780}>Начисления</Typography>
                <Chip size="small" label={charges.length} />
              </Stack>
              <Stack spacing={1}>
                {charges.slice(0, 8).map((charge) => (
                  <Paper key={charge.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} noWrap>№ {charge.number} · {charge.purpose}</Typography>
                        <Typography variant="caption" color={charge.status === "overdue" ? "error.main" : "text.secondary"}>Срок {date(charge.dueDate)} · оплачено {money(charge.paidAmount)}</Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography fontWeight={760}>{money(charge.amount)}</Typography>
                        <Typography variant="caption" color="text.secondary">{statusLabels[charge.status] ?? charge.status}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))}
                {!chargesQuery.isLoading && charges.length === 0 && <Typography color="text.secondary">По контракту ещё нет начислений.</Typography>}
              </Stack>
            </Box>
          </Box>
        )}
      </Drawer>

      <Dialog open={endOpen} onClose={() => !endMutation.isPending && setEndOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Завершить контракт?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Новые начисления после даты завершения создаваться не будут.</Typography>
          <TextField fullWidth type="date" label="Дата завершения" value={endDate} onChange={(event) => setEndDate(event.target.value)} InputLabelProps={{ shrink: true }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndOpen(false)} disabled={endMutation.isPending}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => endMutation.mutate()} disabled={!endDate || endMutation.isPending}>Завершить контракт</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
