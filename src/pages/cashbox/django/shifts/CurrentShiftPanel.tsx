import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LockIcon from "@mui/icons-material/Lock";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  getCurrentShift,
  getCashboxShiftSummary,
  parseBackendError,
  type CashboxShift,
  type CashboxShiftSummary,
} from "../../../../api/cashboxShifts";
import { djangoQueryKeys, DJANGO_DETAIL_STALE_TIME_MS } from "../../../../api/queryKeys";
import { ApiError } from "../../../../api/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: string | null | undefined): string {
  if (!s) return "0.00";
  const n = parseFloat(s);
  return isNaN(n) ? (s ?? "0.00") : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const InfoRow: React.FC<{ label: string; value: React.ReactNode; loading?: boolean }> = ({
  label, value, loading,
}) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
    <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
    {loading ? <Skeleton width={64} height={16} /> : (
      <Typography variant="caption" fontWeight={500} textAlign="right">{value}</Typography>
    )}
  </Stack>
);

// ── Props ──────────────────────────────────────────────────────────────────────

type Branch = { id: number; name: string };

type Props = {
  /** branchId from filter bar — required to fetch current shift */
  selectedBranchId: number | undefined;
  organizationId: number | undefined;
  branches: Branch[];
  canOpen: boolean;
  canClose: boolean;
  queriesEnabled: boolean;
  onShiftOpened: (shift: CashboxShift) => void;
  onOpenShiftClick: () => void;
  onCloseShiftClick: () => void;
  /** Expose fetched data upward so CloseDialog can use it */
  onSummaryLoaded: (summary: CashboxShiftSummary | null) => void;
  onShiftLoaded: (shift: CashboxShift | null) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

const CurrentShiftPanel: React.FC<Props> = ({
  selectedBranchId,
  organizationId,
  queriesEnabled,
  canOpen,
  canClose,
  onOpenShiftClick,
  onCloseShiftClick,
  onSummaryLoaded,
  onShiftLoaded,
}) => {
  const branchSelected = selectedBranchId != null;
  const enabled = queriesEnabled && branchSelected;

  const currentKey = djangoQueryKeys.shifts.current({
    branchId: selectedBranchId ?? null,
    organizationId: organizationId ?? null,
  });

  const shiftQuery = useQuery({
    queryKey: currentKey,
    queryFn: ({ signal }) =>
      getCurrentShift(
        { branchId: selectedBranchId!, organizationId },
        signal,
      ),
    enabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: enabled ? 30_000 : false,
    retry: (count, err) => {
      const status = (err as ApiError)?.status;
      if (status === 403 || status === 404) return false;
      return count < 1;
    },
  });

  const shift = shiftQuery.data ?? null;

  // Notify parent whenever shift changes
  React.useEffect(() => {
    onShiftLoaded(shift ?? null);
  }, [shift, onShiftLoaded]);

  const summaryEnabled = enabled && shift?.status === "open" && shift.id != null;

  const summaryQuery = useQuery({
    queryKey: shift ? djangoQueryKeys.shifts.summary(shift.id) : ["noop"],
    queryFn: ({ signal }) => getCashboxShiftSummary(shift!.id, signal),
    enabled: summaryEnabled,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    refetchInterval: summaryEnabled ? 30_000 : false,
    retry: (count, err) => {
      if ((err as ApiError)?.status === 403) return false;
      return count < 1;
    },
  });

  const summary = summaryQuery.data ?? null;

  React.useEffect(() => {
    onSummaryLoaded(summary);
  }, [summary, onSummaryLoaded]);

  const shiftError = shiftQuery.error ? parseBackendError(shiftQuery.error) : null;
  const isLoading = shiftQuery.isLoading;
  const isFetching = shiftQuery.isFetching || summaryQuery.isFetching;

  // ── Neutral state: no branch selected ────────────────────────────────────
  if (!branchSelected) {
    return (
      <Box
        sx={{
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1.5,
          px: 2,
          py: 1.5,
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="body2" color="text.disabled" textAlign="center">
          Выберите филиал для отображения текущей смены
        </Typography>
      </Box>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          px: 2,
          py: 1.5,
        }}
      >
        <Skeleton width="40%" height={20} />
        <Skeleton width="60%" height={16} sx={{ mt: 0.5 }} />
      </Box>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (shiftError) {
    return <Alert severity="warning" sx={{ py: 0.5 }}>{shiftError}</Alert>;
  }

  // ── No open shift ─────────────────────────────────────────────────────────
  if (!shift || shift.status === "closed") {
    return (
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          px: 2,
          py: 1.5,
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <LockIcon fontSize="small" color="disabled" />
          <Typography variant="body2" color="text.secondary">
            Смена не открыта
          </Typography>
        </Stack>
        {canOpen && (
          <Button
            size="small"
            variant="outlined"
            color="success"
            startIcon={<LockOpenIcon />}
            onClick={onOpenShiftClick}
          >
            Открыть смену
          </Button>
        )}
      </Box>
    );
  }

  // ── Open shift ────────────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "success.main",
        borderRadius: 1.5,
        px: 2,
        py: 1.5,
        bgcolor: "background.paper",
      }}
    >
      {/* Header row */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LockOpenIcon fontSize="small" color="success" />
          <Typography variant="subtitle2" fontWeight={700} color="success.main">
            Смена открыта
          </Typography>
          {isFetching && <CircularProgress size={12} />}
          <Chip
            label={`#${shift.id}`}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: "0.68rem" }}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          {canClose && (
            <Tooltip title="Закрыть смену">
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<LockIcon />}
                onClick={onCloseShiftClick}
              >
                Закрыть
              </Button>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Stack spacing={0.5}>
        <InfoRow
          label="Открыта"
          value={`${shift.openedByName ?? "—"} • ${dayjs(shift.openedAt).format("DD.MM.YY HH:mm")}`}
        />
        <InfoRow label="Нач. касса" value={`${fmt(shift.openingCash)} с`} />

        {summary ? (
          <>
            <Divider sx={{ my: 0.5 }} />
            <InfoRow
              label="Ожидается в кассе"
              value={
                <Typography variant="caption" fontWeight={700} color="success.main">
                  {fmt(summary.expectedCash)} с
                </Typography>
              }
            />
            <InfoRow
              label="Наличные приход"
              value={`+ ${fmt(summary.cashIncome)} с`}
            />
            {parseFloat(summary.cashRefunds) > 0 && (
              <InfoRow
                label="Наличные возвраты"
                value={
                  <Typography variant="caption" color="error.main">
                    − {fmt(summary.cashRefunds)} с
                  </Typography>
                }
              />
            )}
            {parseFloat(summary.cashExpenses) > 0 && (
              <InfoRow
                label="Наличные расходы"
                value={
                  <Typography variant="caption" color="error.main">
                    − {fmt(summary.cashExpenses)} с
                  </Typography>
                }
              />
            )}
            {(parseFloat(summary.cardIncome) > 0 || parseFloat(summary.cardExpenses) > 0) && (
              <InfoRow
                label="Карта"
                value={`${fmt(summary.cardIncome)} с`}
              />
            )}
            <Stack direction="row" spacing={1.5} sx={{ pt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">
                Платежей: <strong>{summary.paymentCount}</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Возвратов: <strong>{summary.refundCount}</strong>
              </Typography>
              {summary.expenseCount > 0 && (
                <Typography variant="caption" color="text.secondary">
                  Расходов: <strong>{summary.expenseCount}</strong>
                </Typography>
              )}
            </Stack>
          </>
        ) : summaryQuery.isLoading ? (
          <Skeleton width="80%" height={14} sx={{ mt: 0.5 }} />
        ) : null}
      </Stack>
    </Box>
  );
};

export default CurrentShiftPanel;
