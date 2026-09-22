/**
 * GuestPaymentDialog — «Оплата» на карточке брони в GuestHistoryPanel.tsx:
 * способ + сумма + комментарий → POST /hotel/reservations/{id}/payments/
 * (append-only список, см. hotel-viva-frontend-api.md §4.5 — предоплата +
 * доплата при заезде это отдельные записи, не перезапись одной). Логика
 * (открыть/сохранить) живёт в общем хуке useGuestDetails.ts, здесь только
 * форма — общий компонент для колонки на «Гостях».
 */
import React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { formatHotelDateRange, nightsBetween } from "./mockDemoData";
import type { GuestDetailsState } from "./useGuestDetails";

export interface GuestPaymentDialogProps {
  state: GuestDetailsState;
}

export const GuestPaymentDialog: React.FC<GuestPaymentDialogProps> = ({ state }) => {
  const { employee, paymentMethods, paymentEdit, setPaymentEdit, savePayment, savingPayment, paymentError } = state;
  const item = paymentEdit?.reservation.items[0];

  return (
    <Dialog open={paymentEdit != null} onClose={() => setPaymentEdit(null)} maxWidth="xs" fullWidth>
      {paymentEdit && item && (
        <>
          <DialogTitle>Оплата — номер {item.roomNumber ?? "—"}</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={{ mt: 0.5 }}>
              <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                {formatHotelDateRange(item.checkIn, item.checkOut)} · {nightsBetween(item.checkIn, item.checkOut)} ноч.
                Оплачено {Number(paymentEdit.reservation.paidAmount).toLocaleString("ru-RU")} из{" "}
                {Number(paymentEdit.reservation.totalAmount).toLocaleString("ru-RU")} {paymentEdit.reservation.currency}.
              </Alert>
              {paymentError && <Alert severity="error">{paymentError}</Alert>}
              <TextField
                select
                label="Способ оплаты"
                value={paymentEdit.method}
                onChange={(e) => setPaymentEdit({ ...paymentEdit, method: e.target.value })}
                fullWidth
              >
                {paymentMethods.map((c) => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Сумма, сом"
                type="number"
                value={paymentEdit.amount}
                onChange={(e) => setPaymentEdit({ ...paymentEdit, amount: e.target.value })}
                slotProps={{ htmlInput: { min: 0 } }}
                autoFocus
                fullWidth
              />
              <TextField
                label="Комментарий"
                placeholder="Необязательно"
                value={paymentEdit.note}
                onChange={(e) => setPaymentEdit({ ...paymentEdit, note: e.target.value })}
                fullWidth
              />
              <Typography variant="caption" color="text.secondary">
                Примет оплату: {employee?.fullName || "текущий сотрудник"} · сейчас
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPaymentEdit(null)} disabled={savingPayment}>
              Отмена
            </Button>
            <Button variant="contained" onClick={() => void savePayment()} disabled={savingPayment}>
              {savingPayment ? "Сохраняем…" : "Провести оплату"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default GuestPaymentDialog;
