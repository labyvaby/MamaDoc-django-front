/**
 * GuestPaymentDialog — «Оплата» на карточке брони в GuestHistoryPanel.tsx:
 * способ + сумма + комментарий, тот же принцип, что реальная оплата приёма
 * (DjangoPaymentDrawer.tsx) — только без баланса/бонусов/страховки/безнала
 * по терминалам, которых у отельного демо-стора нет. Логика (открыть/сохранить)
 * живёт в общем хуке useGuestDetails.ts, здесь только форма — общий компонент
 * для обеих точек входа, где показывается история проживаний: постоянная
 * колонка на «Гостях» (HotelGuestsPage) и модалка GuestDetailsDialog, вызываемая
 * с бара шахматки. Раньше диалог был вложен только в GuestDetailsDialog — на
 * «Гостях» кнопка «Оплата» молча взводила paymentEdit в хуке, а показать было
 * нечему.
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

import { formatHotelDateRange, nightsBetween, HOTEL_PAYMENT_METHOD_LABELS, type HotelPaymentMethod } from "./mockDemoData";
import type { GuestDetailsState } from "./useGuestDetails";

export interface GuestPaymentDialogProps {
  state: GuestDetailsState;
}

export const GuestPaymentDialog: React.FC<GuestPaymentDialogProps> = ({ state }) => {
  const { employee, paymentEdit, setPaymentEdit, savePayment } = state;

  return (
    <Dialog open={paymentEdit != null} onClose={() => setPaymentEdit(null)} maxWidth="xs" fullWidth>
      {paymentEdit && (
        <>
          <DialogTitle>Оплата — номер {paymentEdit.booking.roomNumber}</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={{ mt: 0.5 }}>
              <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                {formatHotelDateRange(paymentEdit.booking.checkIn, paymentEdit.booking.checkOut)} ·{" "}
                {nightsBetween(paymentEdit.booking.checkIn, paymentEdit.booking.checkOut)} ноч. Запись всегда можно
                открыть и поправить.
              </Alert>
              <TextField
                select
                label="Способ оплаты"
                value={paymentEdit.method}
                onChange={(e) => setPaymentEdit({ ...paymentEdit, method: e.target.value as HotelPaymentMethod })}
                fullWidth
              >
                {(Object.keys(HOTEL_PAYMENT_METHOD_LABELS) as HotelPaymentMethod[]).map((key) => (
                  <MenuItem key={key} value={key}>
                    {HOTEL_PAYMENT_METHOD_LABELS[key]}
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
            <Button onClick={() => setPaymentEdit(null)}>Отмена</Button>
            <Button variant="contained" onClick={savePayment}>
              Провести оплату
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default GuestPaymentDialog;
