/**
 * Состояние и обработчики карточки гостя — общие для модалки (GuestDetailsDialog,
 * открывается с бара шахматки/из «Ближайших броней») и постоянной колонки на
 * странице «Гости» (GuestCardPanel + GuestHistoryPanel). Один хук вместо двух
 * копий одной и той же логики оплаты/чёрного списка.
 */
import React from "react";
import { useTheme } from "@mui/material/styles";

import { usePermissions } from "../hooks/usePermissions";
import {
  getHotelGuests,
  findDetailedGuestBooking,
  getRoomCategory,
  nightsBetween,
  getHotelPayment,
  setHotelPayment,
  subscribeHotelPayments,
  getHotelPaymentsSnapshot,
  setGuestBlacklisted,
  subscribeGuestBlacklist,
  getGuestBlacklistSnapshot,
  getHotelBookingStatusColor,
  type HotelBooking,
  type HotelPaymentMethod,
} from "./mockDemoData";

export interface PaymentEditState {
  booking: HotelBooking;
  method: HotelPaymentMethod;
  amount: string;
  note: string;
}

export function useGuestDetails(guestName: string | null) {
  const theme = useTheme();
  const { employee } = usePermissions();
  // Подписка форсирует перерисовку при изменении оплаты — сами данные читаются
  // напрямую через getHotelPayment() в каждой строке истории при рендере.
  React.useSyncExternalStore(subscribeHotelPayments, getHotelPaymentsSnapshot);
  // guest пересчитывается в useMemo ниже — снимок в зависимостях гарантирует
  // пересчёт isBlacklisted сразу при переключении (getHotelGuests сам не подписан).
  const blacklistSnapshot = React.useSyncExternalStore(subscribeGuestBlacklist, getGuestBlacklistSnapshot);
  const [paymentEdit, setPaymentEdit] = React.useState<PaymentEditState | null>(null);
  const [blacklistReasonDraft, setBlacklistReasonDraft] = React.useState("");

  const guest = React.useMemo(() => {
    if (!guestName) return undefined;
    return getHotelGuests().find((g) => g.name === guestName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestName, blacklistSnapshot]);

  const detailed = guest ? findDetailedGuestBooking(guest.bookings) : undefined;

  const statusColor = (status: HotelBooking["status"]) => getHotelBookingStatusColor(status, theme);

  const openPaymentEdit = (booking: HotelBooking) => {
    const existing = getHotelPayment(booking.roomNumber, booking.checkIn);
    const category = getRoomCategory(booking.roomNumber);
    const defaultAmount = category ? category.pricePerNight * nightsBetween(booking.checkIn, booking.checkOut) : 0;
    setPaymentEdit({
      booking,
      method: existing?.method ?? "cash",
      amount: String(existing?.amount ?? defaultAmount),
      note: existing?.note ?? "",
    });
  };

  const savePayment = () => {
    if (!paymentEdit) return;
    const amount = Number(paymentEdit.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setHotelPayment(paymentEdit.booking.roomNumber, paymentEdit.booking.checkIn, {
      method: paymentEdit.method,
      amount,
      note: paymentEdit.note.trim() || undefined,
      acceptedBy: employee?.fullName || "Неизвестный сотрудник",
    });
    setPaymentEdit(null);
  };

  const addToBlacklist = () => {
    if (!guestName) return;
    setGuestBlacklisted(guestName, true, blacklistReasonDraft);
    setBlacklistReasonDraft("");
  };

  const removeFromBlacklist = () => {
    if (!guestName) return;
    setGuestBlacklisted(guestName, false);
  };

  return {
    theme,
    employee,
    guest,
    detailed,
    statusColor,
    paymentEdit,
    setPaymentEdit,
    openPaymentEdit,
    savePayment,
    blacklistReasonDraft,
    setBlacklistReasonDraft,
    addToBlacklist,
    removeFromBlacklist,
  };
}

export type GuestDetailsState = ReturnType<typeof useGuestDetails>;
