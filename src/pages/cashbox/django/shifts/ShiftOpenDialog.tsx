import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  openCashboxShift,
  parseBackendError,
  type CashboxShift,
} from "../../../../api/cashboxShifts";
import { djangoQueryKeys } from "../../../../api/queryKeys";

// ── Types ──────────────────────────────────────────────────────────────────────

type Branch = { id: number; name: string };

type Props = {
  open: boolean;
  organizationId?: number;
  branches: Branch[];
  /** Pre-selected branchId (from filter bar) */
  defaultBranchId?: number;
  onClose: () => void;
  onOpened: (shift: CashboxShift) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

const ShiftOpenDialog: React.FC<Props> = ({
  open,
  organizationId,
  branches,
  defaultBranchId,
  onClose,
  onOpened,
}) => {
  const [branchId, setBranchId] = React.useState<number | "">("");
  const [openingCash, setOpeningCash] = React.useState("0.00");
  const [cashError, setCashError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  // Sync pre-selected branch when dialog opens
  React.useEffect(() => {
    if (open) {
      setBranchId(defaultBranchId ?? (branches.length === 1 ? branches[0].id : ""));
      setOpeningCash("0.00");
      setCashError(null);
      setServerError(null);
    }
  }, [open, defaultBranchId, branches]);

  const mutation = useMutation({
    mutationFn: () => {
      const amt = parseFloat(openingCash);
      return openCashboxShift({
        organizationId,
        branchId: branchId as number,
        openingCash: isNaN(amt) ? "0.00" : amt.toFixed(2),
      });
    },
    onSuccess: (shift) => {
      // Point-invalidate current shift and history for this context
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.shifts.all });
      onOpened(shift);
      handleClose();
    },
    onError: (err) => {
      setServerError(parseBackendError(err));
    },
  });

  const handleSubmit = () => {
    if (branchId === "") {
      setServerError("Выберите филиал");
      return;
    }
    const amt = parseFloat(openingCash);
    if (isNaN(amt) || amt < 0) {
      setCashError("Начальная сумма должна быть ≥ 0");
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
      <DialogTitle>Открыть смену</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {serverError && <Alert severity="error" sx={{ py: 0.5 }}>{serverError}</Alert>}

          <FormControl size="small" fullWidth required>
            <InputLabel>Филиал *</InputLabel>
            <Select
              value={branchId}
              label="Филиал *"
              onChange={(e) => setBranchId(e.target.value as number | "")}
              disabled={mutation.isPending}
            >
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            fullWidth
            label="Начальная наличная сумма"
            type="number"
            inputProps={{ min: 0, step: "0.01" }}
            value={openingCash}
            onChange={(e) => {
              setOpeningCash(e.target.value);
              setCashError(null);
            }}
            error={!!cashError}
            helperText={cashError ?? "Наличные в кассе на момент открытия"}
            disabled={mutation.isPending}
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
          color="success"
          onClick={handleSubmit}
          disabled={mutation.isPending || branchId === ""}
          startIcon={mutation.isPending ? <CircularProgress size={14} /> : undefined}
        >
          Открыть
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftOpenDialog;
