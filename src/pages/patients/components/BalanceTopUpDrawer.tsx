/**
 * BalanceTopUpDrawer — пополнение счёта и история операций (Django mode).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  topUpPatientBalance,
  deductPatientBalance,
  getPatientBalanceTransactions,
  type PatientBalance,
  type BalanceTopUpPayload,
  type BalanceTransactionType,
} from "../../../api/patientBalance";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../../api/queryKeys";
import { parseBackendError } from "../../../api/appointments";

// ── Transaction type labels ────────────────────────────────────────────────────

const TX_LABELS: Record<BalanceTransactionType, string> = {
  top_up: "Пополнение",
  deduct: "Списание",
  bonus_accrual: "Начисление бонусов",
  bonus_redeem: "Списание бонусов",
  bonus_refund: "Возврат бонусов",
  correction: "Коррекция",
};

const TX_COLOR: Record<BalanceTransactionType, string> = {
  top_up: "success.main",
  deduct: "error.main",
  bonus_accrual: "success.main",
  bonus_redeem: "error.main",
  bonus_refund: "warning.main",
  correction: "text.secondary",
};

const PAGE_SIZE = 20;

// ── Props ─────────────────────────────────────────────────────────────────────

type TopUpType = "balance" | "bonuses";

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  patientFio: string;
  branchId?: number | null;
  onSuccess: (b: PatientBalance) => void;
};

// ── History tab ───────────────────────────────────────────────────────────────

const HistoryTab: React.FC<{ patientId: number }> = ({ patientId }) => {
  const [page, setPage] = React.useState(1);

  const txQuery = useQuery({
    queryKey: djangoQueryKeys.patients.transactionsPage(patientId, { page, pageSize: PAGE_SIZE }),
    queryFn: ({ signal }) =>
      getPatientBalanceTransactions(patientId, { page, pageSize: PAGE_SIZE }, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    placeholderData: (prev) => prev,
  });

  const results = txQuery.data?.results ?? [];
  const count = txQuery.data?.count ?? 0;
  const hasNext = txQuery.data?.next != null;
  const hasPrev = txQuery.data?.previous != null;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  if (txQuery.isLoading) {
    return (
      <Stack alignItems="center" py={4}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  if (txQuery.error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {parseBackendError(txQuery.error)}
      </Alert>
    );
  }

  if (results.length === 0) {
    return (
      <Stack alignItems="center" py={4}>
        <Typography variant="body2" color="text.disabled">Операций пока нет</Typography>
      </Stack>
    );
  }

  return (
    <Stack sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {results.map((tx) => {
          const amountNum = parseFloat(tx.amount);
          const bonusNum = parseFloat(tx.bonusesAmount);
          const color = TX_COLOR[tx.transactionType] ?? "text.primary";
          return (
            <Box
              key={tx.id}
              sx={{
                px: 3,
                py: 1.5,
                borderBottom: "1px solid",
                borderColor: "divider",
                "&:last-child": { borderBottom: 0 },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                {/* left */}
                <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1, pr: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {TX_LABELS[tx.transactionType] ?? tx.transactionType}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(tx.createdAt)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tx.createdByName ?? "Система"}
                    {" · "}
                    {tx.branchName ?? "Без филиала"}
                  </Typography>
                  {tx.comment && (
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {tx.comment}
                    </Typography>
                  )}
                  {tx.appointmentId && (
                    <Typography variant="caption" color="text.disabled">
                      Приём #{tx.appointmentId}
                    </Typography>
                  )}
                  {tx.paymentId && (
                    <Typography variant="caption" color="text.disabled">
                      Платёж #{tx.paymentId}
                    </Typography>
                  )}
                </Stack>

                {/* right */}
                <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
                  {amountNum !== 0 && (
                    <Typography variant="body2" fontWeight={700} color={color}>
                      {amountNum > 0 ? "+" : ""}{tx.amount} с
                    </Typography>
                  )}
                  {bonusNum !== 0 && (
                    <Typography variant="caption" color={color}>
                      бонусы {bonusNum > 0 ? "+" : ""}{tx.bonusesAmount} с
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                    баланс {tx.balanceBefore} → {tx.balanceAfter} с
                  </Typography>
                  {bonusNum !== 0 && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                      бонусы {tx.bonusesBefore} → {tx.bonusesAfter} с
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </Box>
          );
        })}
      </Box>

      {/* Pagination */}
      {count > PAGE_SIZE && (
        <Box sx={{ borderTop: "1px solid", borderColor: "divider", px: 3, py: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Button
              size="small"
              startIcon={<ArrowBackOutlined fontSize="small" />}
              disabled={!hasPrev || txQuery.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Назад
            </Button>
            <Typography variant="caption" color="text.secondary">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} из {count}
            </Typography>
            <Button
              size="small"
              endIcon={<ArrowForwardOutlined fontSize="small" />}
              disabled={!hasNext || txQuery.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Далее
            </Button>
          </Stack>
        </Box>
      )}
    </Stack>
  );
};

// ── Main drawer ───────────────────────────────────────────────────────────────

const BalanceTopUpDrawer: React.FC<Props> = ({
  open,
  onClose,
  patientId,
  patientFio,
  branchId,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState(0);
  const [type, setType] = React.useState<TopUpType>("balance");
  const [amount, setAmount] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTab(0);
      setType("balance");
      setAmount("");
      setComment("");
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);
    const parsed = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(parsed) || parsed === 0) {
      setError("Введите корректную сумму");
      return;
    }
    if (!patientId) return;
    setSubmitting(true);
    try {
      const abs = Math.abs(parsed).toFixed(2);
      const payload: BalanceTopUpPayload = {
        amount: type === "balance" ? abs : "0.00",
        bonusesAmount: type === "bonuses" ? abs : "0.00",
        comment: comment.trim() || undefined,
        branchId: branchId ?? null,
      };
      const updated = await (parsed < 0
        ? deductPatientBalance(patientId, payload)
        : topUpPatientBalance(patientId, payload));
      setSuccess(true);
      setAmount("");
      setComment("");
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.patients.transactions(patientId),
      });
      onSuccess(updated);
    } catch (e) {
      setError(parseBackendError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={submitting ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, display: "flex", flexDirection: "column" } }}
    >
      {/* Header */}
      <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <AccountBalanceWalletOutlined color="primary" />
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>Баланс</Typography>
            <Typography variant="caption" color="text.secondary">{patientFio}</Typography>
          </Box>
        </Stack>
        <IconButton onClick={submitting ? undefined : onClose} size="small">
          <CloseOutlined />
        </IconButton>
      </Box>

      {/* Tabs */}
      <Box sx={{ flexShrink: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 3 }}
          variant="fullWidth"
        >
          <Tab label="Пополнение" />
          <Tab label="История" disabled={!patientId} />
        </Tabs>
        <Divider />
      </Box>

      {/* Tab: Top-up */}
      {tab === 0 && (
        <>
          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Тип пополнения</Typography>
                <ToggleButtonGroup
                  value={type}
                  exclusive
                  onChange={(_, v) => v && setType(v)}
                  fullWidth
                  size="small"
                >
                  <ToggleButton value="balance">Баланс</ToggleButton>
                  <ToggleButton value="bonuses">Бонусы</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <TextField
                label="Сумма (отрицательная — списание)"
                value={amount}
                onChange={(e) => { setError(null); setSuccess(false); setAmount(e.target.value); }}
                type="number"
                inputProps={{ step: "any" }}
                InputProps={{ endAdornment: <InputAdornment position="end">сом</InputAdornment> }}
                fullWidth
                size="small"
                error={!!error}
                helperText={error || undefined}
                disabled={submitting}
              />

              <TextField
                label="Комментарий"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                fullWidth
                size="small"
                multiline
                minRows={2}
                placeholder="Необязательно"
                disabled={submitting}
              />

              {success && <Alert severity="success">Счёт успешно пополнен!</Alert>}
            </Stack>
          </Box>

          <Divider />
          <Box sx={{ px: 3, py: 2, flexShrink: 0 }}>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button variant="outlined" onClick={onClose} disabled={submitting}>Отмена</Button>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={submitting || !amount}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {submitting ? "Сохранение…" : parseFloat(amount.replace(",", ".")) < 0 ? "Списать" : "Пополнить"}
              </Button>
            </Stack>
          </Box>
        </>
      )}

      {/* Tab: History */}
      {tab === 1 && patientId && (
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <HistoryTab patientId={patientId} />
        </Box>
      )}
    </Drawer>
  );
};

export default BalanceTopUpDrawer;
