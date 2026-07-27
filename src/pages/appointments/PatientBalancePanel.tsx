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
import { useT } from "../../i18n/VerticalProvider";
import { tt } from "../../i18n/t";

// ── Transaction type labels ────────────────────────────────────────────────────

/** Подпись операции баланса — из общего словаря (common:balanceTx). */
const txLabel = (type: BalanceTransactionType | string): string =>
  tt(`common:balanceTx.${type}`, { defaultValue: String(type) });

/** true, если ошибка запроса — 403/404 (нет доступа / нет кошелька). */
function isAccessDeniedStatus(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "status" in err &&
      ((err as { status: number }).status === 403 ||
        (err as { status: number }).status === 404),
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type PatientBalancePanelProps = {
  patientId: number;
};

// ── Component ─────────────────────────────────────────────────────────────────

const PatientBalancePanel: React.FC<PatientBalancePanelProps> = ({
  patientId,
}) => {
  const { t } = useT("appointments");
  const queryClient = useQueryClient();
  const canManageFinance = useCan("finance.manage");

  // Balance query — enabled always; 403 handled gracefully
  const balanceQuery = useQuery({
    queryKey: djangoQueryKeys.patients.balance(patientId),
    queryFn: ({ signal }) => getPatientBalance(patientId, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    retry: (count, err) => {
      // Не повторяем permission/not-found/rate-limit ответы.
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status;
        if (status === 403 || status === 404 || status === 429) return false;
      }
      return count < 2;
    },
  });

  // Transactions — загружаем сразу вместе с балансом (первая страница, 10 шт):
  // если история пуста, кнопка «История» вовсе не показывается.
  const [txExpanded, setTxExpanded] = React.useState(false);
  const txQuery = useQuery({
    queryKey: djangoQueryKeys.patients.transactionsPage(patientId, { page: 1, pageSize: 10 }),
    queryFn: ({ signal }) =>
      getPatientBalanceTransactions(patientId, { page: 1, pageSize: 10 }, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    enabled: !isAccessDeniedStatus(balanceQuery.error),
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
      setFormError(t("balancePanel.invalidAmount"));
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
  const isAccessDenied = isAccessDeniedStatus(balanceQuery.error);

  if (isAccessDenied) return null;

  const balance = balanceQuery.data;
  const transactions = txQuery.data?.results ?? [];
  // История уже загружена (грузим сразу): пустая → кнопку не показываем.
  const hasHistory = (txQuery.data?.count ?? 0) > 0;
  const balanceNum = balance ? parseFloat(balance.balance) : 0;
  const isDebt = balanceNum < 0;

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
          {t("balancePanel.title")}
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
          {isDebt && (
            <Alert severity="error" sx={{ py: 0.25 }}>
              {t("balancePanel.debt", { amount: Math.abs(balanceNum).toFixed(2) })}
            </Alert>
          )}
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">{t("balancePanel.balance")}</Typography>
            <Typography
              variant="body2"
              fontWeight={isDebt ? 700 : 600}
              color={isDebt ? "error.main" : "text.primary"}
            >
              {t("common:currency.amountShort", { amount: balance.balance })}
            </Typography>
          </Stack>
          {parseFloat(balance.bonuses) > 0 && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">{t("balancePanel.bonuses")}</Typography>
              <Typography variant="body2" fontWeight={500} color="success.main">
                {t("common:currency.amountShort", { amount: balance.bonuses })}
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
              {t("balancePanel.topUp")}
            </Button>
          ) : (
            <Stack spacing={1.25} mt={0.5}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                {t("balancePanel.topUpTitle")}
              </Typography>

              <TextField
                label={t("balancePanel.amount")}
                size="small"
                value={amountStr}
                onChange={(e) => {
                  setFormError(null);
                  setAmountStr(e.target.value);
                }}
                inputProps={{ inputMode: "decimal" }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">{t("balancePanel.currency")}</InputAdornment>,
                }}
                fullWidth
                disabled={topUpMutation.isPending}
              />

              <TextField
                label={t("balancePanel.bonuses")}
                size="small"
                value={bonusesStr}
                onChange={(e) => setBonusesStr(e.target.value)}
                inputProps={{ inputMode: "decimal" }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">{t("balancePanel.currency")}</InputAdornment>,
                }}
                fullWidth
                disabled={topUpMutation.isPending}
              />

              <TextField
                label={t("balancePanel.comment")}
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
                  {t("balancePanel.cancel")}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleTopUp}
                  disabled={topUpMutation.isPending || !amountStr}
                  startIcon={topUpMutation.isPending ? <CircularProgress size={14} /> : undefined}
                  fullWidth
                >
                  {t("balancePanel.topUp")}
                </Button>
              </Stack>
            </Stack>
          )}
        </Box>
      )}

      {/* Transactions toggle — виден только когда есть хоть одна операция */}
      {balance && hasHistory && (
        <Box mt={1.5}>
          <Tooltip title={txExpanded ? t("balancePanel.hideHistory") : t("balancePanel.showHistory")}>
            <Button
              size="small"
              variant="text"
              onClick={() => setTxExpanded((v) => !v)}
              endIcon={txExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
              sx={{ textTransform: "none", color: "text.secondary", px: 0 }}
            >
              {t("balancePanel.history")}
            </Button>
          </Tooltip>

          <Collapse in={txExpanded} unmountOnExit>
            <Box mt={1}>
              {txQuery.error && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  {parseBackendError(txQuery.error)}
                </Alert>
              )}
              {transactions.map((tx) => (
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
                      {txLabel(tx.transactionType)}
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
                        {t("balancePanel.txAmount", { amount: tx.amount, after: tx.balanceAfter })}
                      </Typography>
                    )}
                    {parseFloat(tx.bonusesAmount) !== 0 && (
                      <Typography variant="caption" color="success.main">
                        {t("balancePanel.txBonuses", { amount: tx.bonusesAmount })}
                      </Typography>
                    )}
                  </Stack>
                </Stack>
              ))}
              {(txQuery.data?.count ?? 0) > 10 && (
                <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                  {t("balancePanel.lastTen", { total: txQuery.data?.count })}
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
