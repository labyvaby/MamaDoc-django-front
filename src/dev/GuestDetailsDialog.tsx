/**
 * Детали гостя в модалке — открывается кликом по имени: на баре в
 * RoomBookingGrid или в «Ближайших бронях» RoomDetailsDialog. На странице
 * «Гости» (HotelGuestsPage) та же карточка+история живут постоянной колонкой,
 * не модалкой — см. GuestCardPanel/GuestHistoryPanel, здесь только обёртка
 * в Dialog для точечного вызова из остальной шахматки. Вся логика (оплата,
 * чёрный список) — в общем хуке useGuestDetails.ts, не дублируется; сама
 * форма оплаты — тоже общий компонент, GuestPaymentDialog.tsx, который
 * HotelGuestsPage рендерит отдельно рядом с собой (нужен и там, и тут).
 */
import React from "react";
import { Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import { useGuestDetails } from "./useGuestDetails";
import { GuestCardPanel } from "./GuestCardPanel";
import { GuestHistoryPanel } from "./GuestHistoryPanel";
import { GuestPaymentDialog } from "./GuestPaymentDialog";

export interface GuestDetailsDialogProps {
  /** Имя гостя или null — диалог закрыт. Гость ищется в getHotelGuests() заново на каждое открытие. */
  guestName: string | null;
  onClose: () => void;
}

export const GuestDetailsDialog: React.FC<GuestDetailsDialogProps> = ({ guestName, onClose }) => {
  const state = useGuestDetails(guestName);

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

      <GuestPaymentDialog state={state} />
    </Dialog>
  );
};

export default GuestDetailsDialog;
