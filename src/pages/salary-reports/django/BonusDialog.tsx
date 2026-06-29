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
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/AddOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  createBonus,
  deleteBonus,
  getBonuses,
  type PayrollBonus,
} from "../../../api/payroll";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { formatKGS } from "../../../utility/format";

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: number;
  employeeName: string;
  year: number;
  month: number;
  organizationId?: number;
  /** When true (period locked or no manage right) the dialog is read-only. */
  readOnly: boolean;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Ошибка");

const BonusDialog: React.FC<Props> = ({
  open,
  onClose,
  employeeId,
  employeeName,
  year,
  month,
  organizationId,
  readOnly,
}) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const listParams = { year, month, employeeId, orgId: organizationId ?? null };

  const query = useQuery({
    queryKey: djangoQueryKeys.payroll.bonuses(listParams),
    queryFn: ({ signal }) =>
      getBonuses({ year, month, employeeId, organizationId }, signal),
    enabled: open,
  });

  // Refetch this employee's bonus list and the month report (earnings change).
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.payroll.bonuses(listParams),
    });
    queryClient.invalidateQueries({
      queryKey: ["django", "payroll", "report"],
    });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createBonus({ employeeId, year, month, amount: amount.trim(), reason: reason.trim() }),
    onSuccess: () => {
      invalidate();
      setAmount("");
      setReason("");
      setError(null);
    },
    onError: (e) => setError(errMsg(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBonus(id),
    onSuccess: invalidate,
    onError: (e) => setError(errMsg(e)),
  });

  const busy = createMutation.isPending || deleteMutation.isPending;

  const handleClose = () => {
    if (busy) return;
    setAmount("");
    setReason("");
    setError(null);
    onClose();
  };

  const handleAdd = () => {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Введите сумму больше нуля");
      return;
    }
    if (!reason.trim()) {
      setError("Укажите причину надбавки");
      return;
    }
    setError(null);
    createMutation.mutate();
  };

  const bonuses = query.data ?? [];
  const total = bonuses.reduce((sum, b) => sum + Number(b.amount || 0), 0);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Надбавки
        <Typography variant="body2" color="text.secondary">
          {employeeName} · {dayjs(`${year}-${String(month).padStart(2, "0")}-01`).format("MMMM YYYY")}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 1.5, fontSize: "0.8rem", py: 0.5 }}>
            {error}
          </Alert>
        )}

        {query.isLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={22} />
          </Stack>
        ) : (
          <Stack spacing={1} sx={{ mb: 1 }}>
            {bonuses.length === 0 && (
              <Typography variant="caption" color="text.disabled">
                Надбавок за этот месяц нет
              </Typography>
            )}
            {bonuses.map((b: PayrollBonus) => (
              <Box
                key={b.id}
                sx={{
                  p: 1.25,
                  borderRadius: "10px",
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                  <Box flex={1}>
                    <Typography variant="body2" fontWeight={700}>
                      {formatKGS(b.amount)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {b.reason}
                    </Typography>
                    {b.createdByName && (
                      <Typography variant="caption" color="text.disabled">
                        {b.createdByName} · {dayjs(b.createdAt).format("DD.MM.YYYY")}
                      </Typography>
                    )}
                  </Box>
                  {!readOnly && (
                    <Tooltip title="Удалить">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => deleteMutation.mutate(b.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            ))}
            {bonuses.length > 0 && (
              <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700}>
                  Итого надбавок
                </Typography>
                <Typography variant="caption" fontWeight={700}>
                  {formatKGS(total)}
                </Typography>
              </Stack>
            )}
          </Stack>
        )}

        {!readOnly && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={1.5}>
              <TextField
                label="Сумма (сом)"
                type="number"
                size="small"
                fullWidth
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                inputProps={{ min: 0, step: 100 }}
              />
              <TextField
                label="Причина"
                size="small"
                fullWidth
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                placeholder="Напр.: мыл полы"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={createMutation.isPending ? <CircularProgress size={14} /> : <AddIcon />}
                onClick={handleAdd}
                disabled={busy || !amount.trim() || !reason.trim()}
              >
                Добавить надбавку
              </Button>
            </Stack>
          </>
        )}

        {readOnly && (
          <Alert severity="info" sx={{ mt: 1, fontSize: "0.78rem", py: 0.5 }}>
            Месяц заморожен — изменение надбавок недоступно.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy} size="small">
          Закрыть
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BonusDialog;
