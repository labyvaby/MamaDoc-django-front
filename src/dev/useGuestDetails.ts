/**
 * Состояние и обработчики карточки гостя — общие для GuestCardPanel +
 * GuestHistoryPanel на «Гостях» (HotelGuestsPage). Реальные данные
 * (src/api/hotel.ts): гость — GET /hotel/guests/{clientId}/, история —
 * GET /hotel/reservations/?customerId= (см. hotel-viva-frontend-api.md §4.4).
 * Ключ теперь clientId (число), не имя — имя не уникально и не годится как id.
 */
import React from "react";
import { useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePermissions } from "../hooks/usePermissions";
import { useHotelProperty } from "./useHotelProperty";
import {
  getGuest,
  getHotelCatalogs,
  listReservations,
  setGuestBlacklist,
  clearGuestBlacklist,
  addPayment,
  type HotelReservation,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { CASHLESS_METHODS_ENABLED } from "../api/cashlessMethods";
import { useCashlessMethods } from "../hooks/useCashlessMethods";

export interface PaymentEditState {
  reservation: HotelReservation;
  method: string;
  amount: string;
  note: string;
  /** Способ безнала — актуален, только пока method не "cash" (см. GuestPaymentDialog). */
  cashlessMethodId: number | "";
}

export function useGuestDetails(clientId: number | null) {
  const theme = useTheme();
  const { employee } = usePermissions();
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();

  const guestQuery = useQuery({
    queryKey: ["hotel", "guest", clientId],
    queryFn: ({ signal }) => getGuest(clientId!, signal),
    enabled: clientId != null,
  });
  const guest = guestQuery.data;

  const reservationsQuery = useQuery({
    queryKey: ["hotel", "reservations", "byGuest", clientId, property?.id],
    queryFn: ({ signal }) => listReservations({ propertyId: property!.id, customerId: clientId!, limit: 50 }, signal),
    enabled: clientId != null && property != null,
  });
  const reservations = reservationsQuery.data?.results ?? [];

  // Способы оплаты — платформенные + свои у объекта (настройки), поэтому из
  // каталога объекта, а не из статичного словаря. Тот же ключ кеша, что у
  // ReservationDetailsDialog/CreateBookingButton.
  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
    staleTime: 5 * 60_000,
  });
  const paymentMethods = catalogsQuery.data?.paymentMethods ?? [];

  const [paymentEdit, setPaymentEdit] = React.useState<PaymentEditState | null>(null);
  const cashlessState = useCashlessMethods(paymentEdit != null, { branchId: property?.branchId ?? null });
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [savingPayment, setSavingPayment] = React.useState(false);
  const [blacklistReasonDraft, setBlacklistReasonDraft] = React.useState("");
  const [blacklistBusy, setBlacklistBusy] = React.useState(false);

  const openPaymentEdit = (reservation: HotelReservation) => {
    setPaymentError(null);
    // Остаток к оплате — разумный дефолт для новой записи: предоплата +
    // доплата при заезде обычно закрывают именно недостающую часть, не всю
    // сумму заново (hotel-viva-frontend-api.md §4.5).
    const suggested = Number(reservation.balanceDue) > 0 ? reservation.balanceDue : reservation.totalAmount;
    setPaymentEdit({ reservation, method: "cash", amount: suggested, note: "", cashlessMethodId: "" });
  };

  const invalidateGuest = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "guest", clientId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations", "byGuest", clientId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
    // Список на HotelGuestsPage.tsx (бейдж ЧС в GuestListPanel) — иначе после
    // блокировки/оплаты слева виден устаревший статус до следующего поиска.
    void queryClient.invalidateQueries({ queryKey: ["hotel", "guests"] });
  };

  const savePayment = async () => {
    if (!paymentEdit) return;
    const amount = Number(paymentEdit.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSavingPayment(true);
    setPaymentError(null);
    try {
      await addPayment(paymentEdit.reservation.id, {
        method: paymentEdit.method,
        amount: String(amount),
        note: paymentEdit.note.trim() || undefined,
        cashlessMethodId:
          CASHLESS_METHODS_ENABLED && paymentEdit.method !== "cash" && paymentEdit.cashlessMethodId !== ""
            ? paymentEdit.cashlessMethodId
            : undefined,
      });
      setPaymentEdit(null);
      invalidateGuest();
    } catch (err) {
      setPaymentError(getErrorMessage(err, "Не удалось провести оплату"));
    } finally {
      setSavingPayment(false);
    }
  };

  const addToBlacklist = async () => {
    if (clientId == null || !blacklistReasonDraft.trim()) return;
    setBlacklistBusy(true);
    try {
      await setGuestBlacklist(clientId, blacklistReasonDraft.trim());
      setBlacklistReasonDraft("");
      invalidateGuest();
    } finally {
      setBlacklistBusy(false);
    }
  };

  const removeFromBlacklist = async () => {
    if (clientId == null) return;
    setBlacklistBusy(true);
    try {
      await clearGuestBlacklist(clientId);
      invalidateGuest();
    } finally {
      setBlacklistBusy(false);
    }
  };

  return {
    theme,
    employee,
    guest,
    guestLoading: guestQuery.isLoading,
    reservations,
    reservationsLoading: reservationsQuery.isLoading,
    paymentMethods,
    cashlessState,
    paymentEdit,
    setPaymentEdit,
    openPaymentEdit,
    savePayment,
    savingPayment,
    paymentError,
    blacklistReasonDraft,
    setBlacklistReasonDraft,
    addToBlacklist,
    removeFromBlacklist,
    blacklistBusy,
  };
}

export type GuestDetailsState = ReturnType<typeof useGuestDetails>;
