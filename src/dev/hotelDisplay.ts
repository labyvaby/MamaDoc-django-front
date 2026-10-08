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
import CleaningServicesOutlined from "@mui/icons-material/CleaningServicesOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";

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

/**
 * Иконка состояния уборки — как в Exely у номера в шахматке: убрано — галочка,
 * проверено — двойная галочка, грязно — швабра, ремонт — ключ. Цвет — hotelRoomStateColor.
 */
export const HOTEL_ROOM_STATE_ICONS: Record<HotelRoomState, ElementType> = {
  clean: CheckOutlined,
  inspected: DoneAllOutlined,
  dirty: CleaningServicesOutlined,
  repair: BuildOutlined,
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

/**
 * Номер, снятый с продажи на дату (RoomBlock: ремонт или ручная блокировка).
 * Причину бэк пока отдаёт технической склейкой («Статус номера: выведен из
 * продажи») — в подпись её не выносим, человек видит одно «Снят с продажи».
 */
export const HOTEL_OFF_SALE_LABEL = "Снят с продажи";

/**
 * «0 из 11 в продаже · 1 снят» — одна подпись для отчёта, Excel и полосы над
 * шахматкой. Все три числа — итоги бэка на дату (total/occupied/blocked);
 * статусы номеров фронт не пересчитывает. База «в продаже» = total − blocked —
 * та же, от которой бэк считает occupancyPercent.
 */
export function formatSellableSummary(occupied: number, total: number, blocked: number): string {
  const sellable = Math.max(0, total - blocked);
  return `${occupied} из ${sellable} в продаже` + (blocked > 0 ? ` · ${blocked} снят` : "");
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
  // direct — бронь, которую завёл администратор в CRM (так шлёт форма без выбранного источника), не сайт.
  direct: "Прямая",
  phone: "Звонок",
  walk_in: "От стойки",
  website: "Сайт отеля",
  ota: "Booking.com / OTA",
  agent: "Турагент",
  corporate: "Корпоративный клиент",
};

/**
 * Цвет источника брони — для режима «Цвет: по источнику» в шахматке и легенды.
 * Разные оттенки, различимые и в светлой, и в тёмной теме; OTA — фиолетовый,
 * как у большинства каналов-агрегаторов.
 */
export const HOTEL_BOOKING_SOURCE_COLORS: Record<string, string> = {
  direct: "#db2777",
  website: "#2563eb",
  phone: "#16a34a",
  walk_in: "#ca8a04",
  ota: "#9333ea",
  agent: "#0891b2",
  corporate: "#475569",
};

/** Цвет источника; незнакомый — нейтральный серо-синий, как цвет канала по умолчанию. */
export const hotelSourceColor = (source: string | null | undefined): string =>
  (source && HOTEL_BOOKING_SOURCE_COLORS[source]) || "#64748b";

/** Короткая подпись источника — для бара в шахматке, где места мало. */
export const HOTEL_BOOKING_SOURCE_SHORT: Record<string, string> = {
  direct: "Прямая",
  website: "Сайт",
  phone: "Звонок",
  walk_in: "От стойки",
  ota: "OTA",
  agent: "Агент",
  corporate: "Корп.",
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
