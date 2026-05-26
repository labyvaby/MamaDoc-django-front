/**
 * BalanceTopUpDrawer.tsx
 * Боковая панель для пополнения счёта пациента.
 * Поля: тип (баланс / аванс / Бонусы), сумма, метод оплаты (нал/безнал), заметка.
 */
import React, { useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  Stack,
  Divider,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  IconButton,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import type { TopUpType, PaymentMethod, TopUpPayload } from "../usePatientBalance";

type Props = {
  open: boolean;
  onClose: () => void;
  patientFio: string;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (payload: TopUpPayload) => Promise<boolean>;
};

const TYPE_LABELS: Record<TopUpType, string> = {
  balance: "Баланс",
  bonuses: "Бонусы",
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  card: "Безналичные",
  free: "Бесплатно",
};

const BalanceTopUpDrawer: React.FC<Props> = ({
  open,
  onClose,
  patientFio,
  submitting,
  submitError,
  onSubmit,
}) => {
  const [type, setType] = useState<TopUpType>("balance");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const requiresMethod = type === "balance";

  const reset = () => {
    setType("balance");
    setAmount("");
    setMethod("cash");
    setLocalError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setLocalError(null);
    setSuccess(false);

    const parsed = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setLocalError("Введите корректную сумму");
      return;
    }

    const payload: TopUpPayload = {
      type,
      amount: parsed,
      payment_method: requiresMethod ? method : undefined,
    };

    const ok = await onSubmit(payload);
    if (ok) {
      setSuccess(true);
      setAmount("");
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <Stack direction="row" alignItems="center" gap={1.25}>
            <AccountBalanceWalletOutlined color="primary" />
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                Пополнить счёт
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {patientFio}
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={handleClose} size="small">
            <CloseOutlined />
          </IconButton>
        </Box>

        <Divider />

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2.5 }}>
          <Stack spacing={3}>
            {/* Тип пополнения */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Тип пополнения
              </Typography>
              <ToggleButtonGroup
                value={type}
                exclusive
                onChange={(_, v) => v && setType(v)}
                fullWidth
                size="small"
              >
                {(Object.keys(TYPE_LABELS) as TopUpType[]).map((t) => (
                  <ToggleButton key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            {/* Метод оплаты (только для баланса) */}
            {requiresMethod && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Тип оплаты
                </Typography>
                <ToggleButtonGroup
                  value={method}
                  exclusive
                  onChange={(_, v) => v && setMethod(v)}
                  fullWidth
                  size="small"
                >
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <ToggleButton key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            )}

            {/* Сумма */}
            <TextField
              label="Сумма"
              value={amount}
              onChange={(e) => {
                setLocalError(null);
                setSuccess(false);
                setAmount(e.target.value);
              }}
              type="number"
              inputProps={{ min: 0, step: "any" }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">сом</InputAdornment>
                ),
              }}
              fullWidth
              size="small"
              error={!!localError}
              helperText={localError || undefined}
              disabled={submitting}
            />

            {/* Errors / Success */}
            {submitError && (
              <Alert severity="error" onClose={() => {}}>
                {submitError}
              </Alert>
            )}
            {success && (
              <Alert severity="success">Счёт успешно пополнен!</Alert>
            )}
          </Stack>
        </Box>

        <Divider />

        {/* Footer */}
        <Box sx={{ px: 3, py: 2, flexShrink: 0 }}>
          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={handleClose}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting || !amount}
              startIcon={
                submitting ? (
                  <CircularProgress size={16} color="inherit" />
                ) : undefined
              }
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
