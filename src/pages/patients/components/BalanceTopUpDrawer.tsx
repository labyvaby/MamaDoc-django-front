/**
 * BalanceTopUpDrawer — пополнение счёта пациента (Django mode).
 * Использует Django patientBalance API (topUpPatientBalance). Без Supabase.
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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";

import {
  topUpPatientBalance,
  type PatientBalance,
  type BalanceTopUpPayload,
} from "../../../api/patientBalance";

type TopUpType = "balance" | "bonuses";

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: number | null;
  patientFio: string;
  branchId?: number | null;
  onSuccess: (b: PatientBalance) => void;
};

const BalanceTopUpDrawer: React.FC<Props> = ({
  open,
  onClose,
  patientId,
  patientFio,
  branchId,
  onSuccess,
}) => {
  const [type, setType] = React.useState<TopUpType>("balance");
  const [amount, setAmount] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    if (open) {
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
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("Введите корректную сумму");
      return;
    }
    if (!patientId) return;
    setSubmitting(true);
    try {
      const payload: BalanceTopUpPayload = {
        amount: type === "balance" ? parsed.toFixed(2) : "0.00",
        bonusesAmount: type === "bonuses" ? parsed.toFixed(2) : "0.00",
        comment: comment.trim() || undefined,
        branchId: branchId ?? null,
      };
      const updated = await topUpPatientBalance(patientId, payload);
      setSuccess(true);
      setAmount("");
      onSuccess(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка пополнения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={submitting ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <Box sx={{ px: 3, py: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" gap={1.25}>
            <AccountBalanceWalletOutlined color="primary" />
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>Пополнить счёт</Typography>
              <Typography variant="caption" color="text.secondary">{patientFio}</Typography>
            </Box>
          </Stack>
          <IconButton onClick={submitting ? undefined : onClose} size="small">
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />

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
              label="Сумма"
              value={amount}
              onChange={(e) => { setError(null); setSuccess(false); setAmount(e.target.value); }}
              type="number"
              inputProps={{ min: 0, step: "any" }}
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
              {submitting ? "Сохранение…" : "Пополнить"}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
};

export default BalanceTopUpDrawer;
