/**
 * Детали гостя в модалке — открывается кликом по имени: на баре в
 * RoomBookingGrid или в «Ближайших бронях» RoomDetailsDialog. На странице
 * «Гости» (HotelGuestsPage) та же карточка+история живут постоянной колонкой,
 * не модалкой — см. GuestCardPanel/GuestHistoryPanel, здесь только обёртка
 * в Dialog для точечного вызова из остальной шахматки. Вся логика (оплата,
 * чёрный список) — в общем хуке useGuestDetails.ts, не дублируется.
 */
import React from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { formatHotelDateRange, nightsBetween, HOTEL_PAYMENT_METHOD_LABELS, type HotelPaymentMethod } from "./mockDemoData";
import { useGuestDetails } from "./useGuestDetails";
import { GuestCardPanel } from "./GuestCardPanel";
import { GuestHistoryPanel } from "./GuestHistoryPanel";

export interface GuestDetailsDialogProps {
  /** Имя гостя или null — диалог закрыт. Гость ищется в getHotelGuests() заново на каждое открытие. */
  guestName: string | null;
  onClose: () => void;
}

export const GuestDetailsDialog: React.FC<GuestDetailsDialogProps> = ({ guestName, onClose }) => {
  const state = useGuestDetails(guestName);
  const { employee, paymentEdit, setPaymentEdit, savePayment } = state;

  return (
    <Dialog open={guestName != null} onClose={onClose} maxWidth="sm" fullWidth>
      {guestName && (
        <>
          <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 6 }}>
            {guestName}
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }}>
              <CloseOutlined fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent sx={{ pt: 0 }}>
            <Stack gap={2}>
              <GuestCardPanel guestName={guestName} state={state} />
              <Divider />
              <GuestHistoryPanel state={state} />
            </Stack>
          </DialogContent>
        </>
      )}

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
                  onChange={(e) =>
                    setPaymentEdit({ ...paymentEdit, method: e.target.value as HotelPaymentMethod })
                  }
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
    </Dialog>
  );
};

export default GuestDetailsDialog;
