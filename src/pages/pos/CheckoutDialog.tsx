import React from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import type { PosBootstrap, PosTender } from "../../api/pos";
import { PosAmount } from "./ui";

export function CheckoutDialog({
  open,
  due,
  bootstrap,
  pending,
  error,
  onClose,
  onPay,
}: {
  open: boolean;
  due: string;
  bootstrap: PosBootstrap;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onPay: (payments: PosTender[]) => void;
}) {
  const methods = (["cash", "card", "cashless", "split"] as const).filter(
    (method) =>
      bootstrap.actions[method] &&
      (method !== "split" || (bootstrap.actions.cash && bootstrap.actions.card))
  );
  const [method, setMethod] = React.useState<string>(methods[0] ?? "");
  const [cash, setCash] = React.useState(due);
  const [cashlessId, setCashlessId] = React.useState<number | "">(
    bootstrap.cashlessMethods[0]?.id ?? ""
  );
  React.useEffect(() => {
    if (open) {
      setCash(due);
      setMethod(methods[0] ?? "");
    }
  }, [open, due]);
  const cents = (value: string) =>
    /^\d+(?:[.,]\d{0,2})?$/.test(value)
      ? Math.round(Number(value.replace(",", ".")) * 100)
      : NaN;
  const amount = cents(due);
  const entered = cents(cash);
  const noncash = method === "split" ? amount - entered : amount;
  const valid =
    amount === 0 ||
    (Boolean(method) &&
      (method === "cash"
        ? Number.isFinite(entered) && entered >= amount
        : method === "split"
        ? entered > 0 && noncash > 0 && cashlessId !== ""
        : cashlessId !== ""));
  const submit = () => {
    if (!valid || pending) return;
    if (amount === 0) {
      onPay([]);
      return;
    }
    const payments: PosTender[] = [];
    if (method === "cash" || method === "split")
      payments.push({
        method: "cash",
        amount: ((method === "cash" ? amount : entered) / 100).toFixed(2),
      });
    if (method !== "cash")
      payments.push({
        method: method === "cashless" ? "cashless" : "card",
        amount: (noncash / 100).toFixed(2),
        cashlessMethodId: Number(cashlessId),
      });
    onPay(payments);
  };
  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: "18px" } }}
    >
      <DialogTitle>Оплата покупки</DialogTitle>
      <DialogContent>
        <Stack gap={2}>
          <Tabs
            value={method || false}
            onChange={(_, v) => setMethod(v)}
            variant="fullWidth"
          >
            {methods.map((value) => (
              <Tab
                key={value}
                value={value}
                label={
                  {
                    cash: "Наличные",
                    card: "Карта",
                    cashless: "QR / безнал",
                    split: "Частями",
                  }[value]
                }
                disabled={pending}
              />
            ))}
          </Tabs>
          <Box sx={{ p: 2, borderRadius: 3, bgcolor: "action.hover" }}>
            <Typography color="text.secondary">К оплате</Typography>
            <Typography variant="h4">
              <PosAmount value={Number(due)} />
            </Typography>
          </Box>
          {(method === "cash" || method === "split") && (
            <TextField
              label={
                method === "cash"
                  ? "Получено наличными, сом"
                  : "Часть наличными, сом"
              }
              value={cash}
              onChange={(event) => setCash(event.target.value)}
              disabled={pending}
              inputProps={{ inputMode: "decimal" }}
            />
          )}
          {method === "cash" && (
            <Typography>
              Сдача:{" "}
              <PosAmount
                value={
                  Number.isFinite(entered)
                    ? Math.max(0, entered - amount) / 100
                    : 0
                }
              />
            </Typography>
          )}
          {method !== "cash" && (
            <TextField
              select
              label="Способ безналичной оплаты"
              value={cashlessId}
              onChange={(event) => setCashlessId(Number(event.target.value))}
              disabled={pending}
            >
              {bootstrap.cashlessMethods.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {method === "split" && (
            <Typography>
              Картой: <PosAmount value={Math.max(0, noncash) / 100} />
            </Typography>
          )}
          {method !== "cash" && (
            <Alert severity="info">
              Подтвердите поступление оплаты в терминале или банковском
              приложении. Эта кнопка фиксирует полученную оплату в кассе.
            </Alert>
          )}
          {!methods.length && amount > 0 && (
            <Alert severity="warning">
              Нет разрешённых способов оплаты. Обратитесь к управляющему.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Назад
        </Button>
        <Button
          variant="contained"
          disabled={!valid || pending}
          onClick={submit}
        >
          {pending ? "Сохраняем…" : "Подтвердить оплату"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
