import type { BookingStatus } from "../../api/bookings";

type ChipColor = "default" | "success" | "warning" | "error" | "info";

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; color: ChipColor }
> = {
  pending: { label: "Ожидает", color: "warning" },
  confirmed: { label: "Подтверждена", color: "info" },
  completed: { label: "Завершена", color: "success" },
  cancelled: { label: "Отменена", color: "error" },
  no_show: { label: "Неявка", color: "default" },
};

export const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "pending", label: "Ожидает" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "completed", label: "Завершена" },
  { value: "cancelled", label: "Отменена" },
  { value: "no_show", label: "Неявка" },
];
