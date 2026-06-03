import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";

import {
  getPatientBalance,
  getPatientBalanceTransactions,
  topUpPatientBalance,
  parseBackendError,
  type BalanceTopUpPayload,
  type BalanceTransactionType,
} from "../../api/patientBalance";
import { useCan } from "../../hooks/useCan";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";

// ── Transaction type labels ────────────────────────────────────────────────────

const TX_LABELS: Record<BalanceTransactionType, string> = {
  top_up: "Пополнение",
  deduct: "Списание",
  bonus_accrual: "Начисление бонусов",
  bonus_redeem: "Списание бонусов",
  correction: "Корректировка",
};

// ── Props ─────────────────────────────────────────────────────────────────────

type PatientBalancePanelProps = {
  patientId: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

const PatientBalancePanel: React.FC<PatientBalancePanelProps> = ({
  patientId,
}) => {
  const queryClient = useQueryClient();
  const canManageFinance = useCan("finance.manage");

  // Balance query — enabled always; 403 handled gracefully
  const balanceQuery = useQuery({
    queryKey: djangoQueryKeys.patients.balance(patientId),
    queryFn: ({ signal }) => getPatientBalance(patientId, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: (count, err) => {
      // Don't retry on 403/404 — these are permission/not-found responses
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status;
        if (status === 403 || status === 404) return false;
      }
      return count < 2;
    },
  });

  // Transactions — only load when expanded
  const [txExpanded, setTxExpanded] = React.useState(false);
  const txQuery = useQuery({
    queryKey: djangoQueryKeys.patients.transactions(patientId),
    queryFn: ({ signal }) => getPatientBalanceTransactions(patientId, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    enabled: txExpanded,
    retry: false,
  });

  // Top-up form state
  const [topUpOpen, setTopUpOpen] = React.useState(false);
  const [amountStr, setAmountStr] = React.useState("");
  const [bonusesStr, setBonusesStr] = React.useState("0");
  const [comment, setComment] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const resetForm = () => {
    setAmountStr("");
    setBonusesStr("0");
    setComment("");
    setFormError(null);
  };

  const topUpMutation = useMutation({
    mutationFn: (payload: BalanceTopUpPayload) =>
      topUpPatientBalance(patientId, payload),
    onSuccess: (updated) => {
      // Instant cache update — no waiting for refetch
      queryClient.setQueryData(
        djangoQueryKeys.patients.balance(patientId),
        updated,
      );
      // Invalidate transactions so history refreshes if expanded
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.patients.transactions(patientId),
      });
      resetForm();
      setTopUpOpen(false);
    },
    onError: (err: unknown) => {
      setFormError(parseBackendError(err));
    },
  });

  const handleTopUp = () => {
    setFormError(null);
    const amount = parseFloat(amountStr.replace(",", "."));
    if (!amountStr || isNaN(amount) || amount <= 0) {
      setFormError("Введите корректную сумму");
      return;
    }
    const bonuses = parseFloat(bonusesStr.replace(",", "."));
    const payload: BalanceTopUpPayload = {
      amount: amount.toFixed(2),
      bonusesAmount: (!isNaN(bonuses) && bonuses > 0) ? bonuses.toFixed(2) : "0.00",
      comment: comment.trim() || undefined,
    };
    topUpMutation.mutate(payload);
  };

  // ── 403 / 404: silently hide the panel ────────────────────────────────────
  const err = balanceQuery.error;
  const isAccessDenied =
    err &&
    typeof err === "object" &&
    "status" in err &&
    ((err as { status: number }).status === 403 ||
      (err as { status: number }).status === 404);

  if (isAccessDenied) return null;

  const balance = balanceQuery.data;
  const transactions = txQuery.data ?? [];

  return (
    <Box>
      <Divider sx={{ my: 2 }} />

      {/* Section header */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1.25}>
        <AccountBalanceWalletOutlined
          fontSize="small"
          sx={{ color: "text.secondary" }}
        />
        <Typography variant="body2" fontWeight={600} color="text.secondary">
          Баланс пациента
        </Typography>
        {balanceQuery.isFetching && <CircularProgress size={12} />}
      </Stack>

      {/* Balance error (non-403) */}
      {balanceQuery.error && !isAccessDenied && (
        <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}>
          {parseBackendError(balanceQuery.error)}
        </Alert>
      )}

      {/* Balance display */}
      {balanceQuery.isLoading ? (
        <Stack alignItems="center" py={1.5}>
          <CircularProgress size={20} />
        </Stack>
      ) : balance ? (
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Баланс</Typography>
            <Typography variant="body2" fontWeight={600}>
              {balance.balance} с
            </Typography>
          </Stack>
          {parseFloat(balance.bonuses) > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Бонусы</Typography>
              <Typography variant="body2" fontWeight={500} color="success.main">
                {balance.bonuses} с
              </Typography>
            </Stack>
          )}
        </Stack>
      ) : null}

      {/* Top-up section */}
      {canManageFinance && balance !== undefined && (
        <Box mt={1.5}>
          {!topUpOpen ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setTopUpOpen(true)}
              sx={{ textTransform: "none" }}
            >
              Пополнить
            </Button>
          ) : (
            <Stack spacing={1.25} mt={0.5}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                Пополнение баланса
              </Typography>

              <TextField
                label="Сумма"
                size="small"
                value={amountStr}
                onChange={(e) => {
                  setFormError(null);
                  setAmountStr(e.target.value);
                }}
                inputProps={{ inputMode: "decimal" }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">с</InputAdornment>,
                }}
                fullWidth
                disabled={topUpMutation.isPending}
              />

              <TextField
                label="Бонусы"
                size="small"
                value={bonusesStr}
                onChange={(e) => setBonusesStr(e.target.value)}
                inputProps={{ inputMode: "decimal" }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">с</InputAdornment>,
                }}
                fullWidth
                disabled={topUpMutation.isPending}
              />

              <TextField
                label="Комментарий"
                size="small"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                fullWidth
                disabled={topUpMutation.isPending}
              />

              {formError && (
                <Alert severity="error" sx={{ py: 0.5 }}>{formError}</Alert>
              )}

              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { resetForm(); setTopUpOpen(false); }}
                  disabled={topUpMutation.isPending}
                  fullWidth
                >
                  Отмена
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleTopUp}
                  disabled={topUpMutation.isPending || !amountStr}
                  startIcon={topUpMutation.isPending ? <CircularProgress size={14} /> : undefined}
                  fullWidth
                >
                  Пополнить
                </Button>
              </Stack>
            </Stack>
          )}
        </Box>
      )}

      {/* Transactions toggle */}
      {balance && (
        <Box mt={1.5}>
          <Tooltip title={txExpanded ? "Скрыть историю" : "История операций"}>
            <Button
              size="small"
              variant="text"
              onClick={() => setTxExpanded((v) => !v)}
              endIcon={txExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
              sx={{ textTransform: "none", color: "text.secondary", px: 0 }}
            >
              История
            </Button>
          </Tooltip>

          <Collapse in={txExpanded} unmountOnExit>
            <Box mt={1}>
              {txQuery.isLoading && (
                <Stack alignItems="center" py={1}>
                  <CircularProgress size={18} />
                </Stack>
              )}
              {txQuery.error && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  {parseBackendError(txQuery.error)}
                </Alert>
              )}
              {!txQuery.isLoading && transactions.length === 0 && (
                <Typography variant="caption" color="text.disabled">
                  Нет операций
                </Typography>
              )}
              {transactions.slice(0, 10).map((tx) => (
                <Stack
                  key={tx.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  py={0.75}
                  sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                >
                  <Stack spacing={0}>
                    <Typography variant="caption" fontWeight={500}>
                      {TX_LABELS[tx.transactionType] ?? tx.transactionType}
                    </Typography>
                    {tx.comment && (
                      <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 160 }}>
                        {tx.comment}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.disabled">
                      {new Date(tx.createdAt).toLocaleDateString("ru-RU")}
                    </Typography>
                  </Stack>
                  <Stack alignItems="flex-end" spacing={0}>
                    {parseFloat(tx.amount) !== 0 && (
                      <Typography variant="caption" fontWeight={600}>
                        {tx.amount} с → {tx.balanceAfter} с
                      </Typography>
                    )}
                    {parseFloat(tx.bonusesAmount) !== 0 && (
                      <Typography variant="caption" color="success.main">
                        бонусы {tx.bonusesAmount} с
                      </Typography>
                    )}
                  </Stack>
                </Stack>
              ))}
              {transactions.length > 10 && (
                <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                  Показаны последние 10 из {transactions.length}
                </Typography>
              )}
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
};

export default PatientBalancePanel;
