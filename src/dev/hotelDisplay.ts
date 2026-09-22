/**
 * Общие функции отображения для реальных отельных данных (src/api/hotel.ts) —
 * статус брони/уборки → русский текст и цвет темы. Аналог того, что раньше
 * лежало в mockDemoData.ts (HOTEL_BOOKING_STATUS_LABELS,
 * getHotelBookingStatusColor, ROOM_HOUSEKEEPING_STATUS_LABELS,
 * getRoomHousekeepingStatusColor), но на реальной модели статусов: у брони
 * теперь два поля (reservationStatus + stayStatus, см.
 * hotel-viva-frontend-api.md §2), а не один mock-статус.
 */
import type { ElementType } from "react";
import type { Theme } from "@mui/material/styles";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";

export type HotelStayDisplayStatus = "confirmed" | "arrived" | "completed";

/**
 * Сводит reservationStatus+stayStatus к тому же трёхзначному отображению,
 * что было в моке: confirmed (ожидается), arrived (заехал), completed (выехал).
 * Маппинг из контракта §2: confirmed → status=confirmed && stayStatus=expected;
 * arrived → checked_in; completed → checked_out.
 */
export function mapStayDisplayStatus(stayStatus: string): HotelStayDisplayStatus {
  if (stayStatus === "checked_out") return "completed";
  if (stayStatus === "checked_in") return "arrived";
  return "confirmed";
}

export const HOTEL_STAY_STATUS_LABELS: Record<HotelStayDisplayStatus, string> = {
  confirmed: "Подтверждена",
  arrived: "Гость заехал",
  completed: "Завершена",
};

export const HOTEL_STAY_STATUSES: HotelStayDisplayStatus[] = ["confirmed", "arrived", "completed"];

/** Иконка статуса — та же смысловая раскладка, что цвет (hotelStayStatusColor). */
export const HOTEL_STAY_STATUS_ICONS: Record<HotelStayDisplayStatus, ElementType> = {
  confirmed: ScheduleOutlined,
  arrived: CheckCircleOutlined,
  completed: TaskAltOutlined,
};

/** Цвет статуса из активной MUI-темы — тот же на баре, в чипе и в легенде. */
export function hotelStayStatusColor(status: HotelStayDisplayStatus, theme: Theme): string {
  return status === "arrived" ? theme.palette.success.main : status === "confirmed" ? theme.palette.info.main : theme.palette.text.disabled;
}

/** Русские подписи reservationStatus — для черновика/отмены/просрочки, которых нет в трёхзначном статусе выше. */
export const HOTEL_RESERVATION_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  hold: "Временная бронь",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  no_show: "Не явился",
  expired: "Истекла",
};

export type HotelRoomState = "dirty" | "clean" | "inspected" | "repair";

export const HOTEL_ROOM_STATE_LABELS: Record<HotelRoomState, string> = {
  dirty: "Грязно",
  clean: "Убрано",
  inspected: "Проверено",
  repair: "Ремонт",
};

/** Порядок пунктов в меню смены состояния номера (RoomStateControl). */
export const HOTEL_ROOM_STATES: HotelRoomState[] = ["clean", "dirty", "inspected", "repair"];

export function hotelRoomStateColor(state: string, theme: Theme): string {
  switch (state) {
    case "dirty":
      return theme.palette.error.main;
    case "clean":
      return theme.palette.success.main;
    case "inspected":
      return theme.palette.info.main;
    case "repair":
      // Серый, а не оранжевый: оранжевый в шахматке уже занят «Овербукингом», и два разных
      // смысла в одном цвете путают. Серый — «вне эксплуатации»; на белом 4.6:1 (точка ≥ 3:1).
      return theme.palette.mode === "dark" ? theme.palette.grey[400] : theme.palette.grey[600];
    default:
      return theme.palette.text.disabled;
  }
}

/** Ключи из catalogs.bookingSources/guaranteeMethods/boardTypes и т.п. — русские подписи для UI. */
export const HOTEL_BOARD_TYPE_LABELS: Record<string, string> = {
  none: "Без питания",
  breakfast: "Завтрак",
  half_board: "Полупансион",
  full_board: "Полный пансион",
  all_inclusive: "Всё включено",
};

export const HOTEL_BOOKING_SOURCE_LABELS: Record<string, string> = {
  direct: "Сайт отеля",
  phone: "Звонок",
  walk_in: "Без брони",
  website: "Сайт отеля",
  ota: "Booking.com / OTA",
  agent: "Турагент",
  corporate: "Корпоративный клиент",
};

export const HOTEL_GUARANTEE_METHOD_LABELS: Record<string, string> = {
  card: "Карта-гарантия",
  prepayment: "Предоплата",
  cash: "Наличные при заезде",
  corporate: "Корпоративный счёт",
};

export const HOTEL_GUEST_TYPE_LABELS: Record<string, string> = {
  resident: "Гражданин КР",
  foreign: "Иностранец",
};

export const HOTEL_GENDER_LABELS: Record<string, string> = {
  male: "Мужской",
  female: "Женский",
};

/** «Совпадение по …» — что значит элемент GuestSearchPayload.matchedBy. */
export const HOTEL_GUEST_MATCH_LABELS: Record<string, string> = {
  name: "ФИО",
  phone: "телефону",
  document: "номеру документа",
  inn: "ИНН",
};

/** "телефону и ИНН" из matchedBy строки поиска; пусто, если бэкенд не прислал причину. */
export function formatGuestMatchedBy(matchedBy: string[] | undefined): string {
  return (matchedBy ?? []).map((m) => HOTEL_GUEST_MATCH_LABELS[m] ?? m).join(" и ");
}

/**
 * «14:00:00» / «14:00» → «14:00» — HotelProperty.checkInTime/checkOutTime (footer
 * шахматки, RoomBookingGrid.tsx). Формат поля бэкенд не документирует явно, поэтому
 * отрезаем секунды регэкспом, а не парсим как дату: неожиданный формат остаётся как
 * есть, не пропадает и не падает.
 */
export function formatHotelTime(raw: string): string {
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : raw;
}

export const HOTEL_VISIT_PURPOSE_LABELS: Record<string, string> = {
  tourism: "Туризм",
  business: "Бизнес",
  other: "Другое",
};
