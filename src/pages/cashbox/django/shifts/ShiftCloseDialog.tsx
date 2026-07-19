import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  closeCashboxShift,
  parseBackendError,
  type CashboxShift,
  type CashboxShiftSummary,
} from "../../../../api/cashboxShifts";
import { djangoQueryKeys } from "../../../../api/queryKeys";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  shift: CashboxShift | null;
  summary: CashboxShiftSummary | null | undefined;
  onClose: () => void;
  onClosed: (shift: CashboxShift) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: string | null | undefined): string {
  if (!s) return "0.00";
  const n = parseFloat(s);
  return isNaN(n) ? (s ?? "0.00") : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────

const ShiftCloseDialog: React.FC<Props> = ({
  open,
  shift,
  summary,
  onClose,
  onClosed,
}) => {
  const [actualCash, setActualCash] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [cashError, setCashError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (open) {
      setActualCash("");
      setComment("");
      setCashError(null);
      setServerError(null);
    }
  }, [open]);

  const expectedCash = summary?.expectedCash ?? shift?.expectedCash ?? null;
  const actualNum = parseFloat(actualCash);
  const expectedNum = parseFloat(expectedCash ?? "0");
  const difference = !isNaN(actualNum) && actualCash !== "" ? actualNum - expectedNum : null;

  const mutation = useMutation({
    mutationFn: () =>
      closeCashboxShift(shift!.id, {
        actualCash: actualNum.toFixed(2),
        closeComment: comment.trim() || undefined,
      }),
    onSuccess: (closed) => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.shifts.all });
      onClosed(closed);
      handleClose();
    },
    onError: (err) => {
      setServerError(parseBackendError(err));
    },
  });

  const handleSubmit = () => {
    if (isNaN(actualNum) || actualCash === "" || actualNum < 0) {
      setCashError("Укажите фактическую сумму ≥ 0");
      return;
    }
    setCashError(null);
    setServerError(null);
    mutation.mutate();
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Закрыть смену</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {serverError && <Alert severity="error" sx={{ py: 0.5 }}>{serverError}</Alert>}

          {/* Expected cash info */}
          <Box
            sx={{
              bgcolor: "action.hover",
              borderRadius: 1,
              px: 2,
              py: 1.5,
            }}
          >
            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Ожидаемые наличные:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {fmt(expectedCash)} с
                </Typography>
              </Stack>
              {summary && (
                <>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Приход наличными:</Typography>
                    <Typography variant="caption">+ {fmt(summary.cashIncome)} с</Typography>
                  </Stack>
                  {parseFloat(summary.salesCash ?? "0") > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">Продажи товаров:</Typography>
                      <Typography variant="caption">+ {fmt(summary.salesCash)} с</Typography>
                    </Stack>
                  )}
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Возвраты наличными:</Typography>
                    <Typography variant="caption" color="error.main">− {fmt(summary.cashRefunds)} с</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Расходы наличными:</Typography>
                    <Typography variant="caption" color="error.main">− {fmt(summary.cashExpenses)} с</Typography>
                  </Stack>
                  {parseFloat(summary.supplyCash ?? "0") > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">Закупки товара:</Typography>
                      <Typography variant="caption" color="error.main">− {fmt(summary.supplyCash)} с</Typography>
                    </Stack>
                  )}
                </>
              )}
            </Stack>
          </Box>

          <TextField
            size="small"
            fullWidth
            autoFocus
            label="Фактически в кассе *"
            type="number"
            inputProps={{ min: 0, step: "0.01" }}
            value={actualCash}
            onChange={(e) => {
              setActualCash(e.target.value);
              setCashError(null);
            }}
            error={!!cashError}
            helperText={cashError ?? "Пересчитайте наличные и введите сумму"}
            disabled={mutation.isPending}
          />

          {/* Live difference preview */}
          {difference !== null && (
            <Box sx={{ px: 0.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Разница:</Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={
                    difference < 0
                      ? "error.main"
                      : difference > 0
                        ? "warning.main"
                        : "success.main"
                  }
                >
                  {difference >= 0 ? "+" : ""}
                  {difference.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} с
                </Typography>
              </Stack>
              {difference !== 0 && (
                <Typography variant="caption" color="text.secondary">
                  {difference < 0 ? "Недостача — проверьте расчёты" : "Излишек — уточните данные"}
                </Typography>
              )}
            </Box>
          )}

          <TextField
            size="small"
            fullWidth
            label="Комментарий"
            multiline
            minRows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={mutation.isPending}
            placeholder="Необязательно"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={handleClose} disabled={mutation.isPending}>
          Отмена
        </Button>
        <Button
          variant="contained"
          size="small"
          color="error"
          onClick={handleSubmit}
          disabled={mutation.isPending || actualCash === ""}
          startIcon={mutation.isPending ? <CircularProgress size={14} /> : undefined}
        >
          Закрыть смену
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftCloseDialog;
