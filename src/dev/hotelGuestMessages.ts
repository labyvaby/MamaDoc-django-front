/**
 * Сообщения гостю в WhatsApp — заготовки из карточки брони. Отправляет сам
 * администратор: ссылка wa.me открывает WhatsApp (приложение или Web) с уже
 * набранным текстом на номер гостя, остаётся нажать «Отправить». Серверной
 * рассылки у отеля пока нет — так сообщение уходит с рабочего номера отеля,
 * и гость может сразу ответить.
 */
import type { HotelProperty, HotelReservation } from "../api/hotel";
import { formatHotelDate, nightsBetween } from "./mockDemoData";

export type GuestMessageKind = "confirmation" | "reminder" | "balance" | "thanks";

export const GUEST_MESSAGE_LABELS: Record<GuestMessageKind, string> = {
  confirmation: "Подтверждение брони",
  reminder: "Напоминание о заезде",
  balance: "Остаток к оплате",
  thanks: "Спасибо за визит",
};

/**
 * Номер для wa.me — только цифры с кодом страны. Местный формат КР
 * («0555 111 002») приводим к 996…, иначе WhatsApp не найдёт номер.
 */
export function whatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `996${digits.slice(1)}`;
  if (digits.length === 9) return `996${digits}`;
  return digits;
}

export function whatsappLink(phone: string, text?: string): string | null {
  const digits = whatsappDigits(phone);
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ночь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "ночи" : "ночей");

export function buildGuestMessage(kind: GuestMessageKind, reservation: HotelReservation, property: HotelProperty | null): string {
  const item = reservation.items[0];
  const guest = item?.guests.find((g) => g.isPrimary) ?? item?.guests[0];
  // Полное имя: порядок «имя фамилия» или «фамилия имя» у гостей разный,
  // угадывать, где имя, — значит иногда обратиться по фамилии.
  const name = (reservation.customerName || guest?.fullName || "").trim();
  const hello = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  const hotel = property?.name ?? "наш отель";
  const unit = reservation.currency === "KGS" || !reservation.currency ? "сом" : reservation.currency;
  const money = (v: string | number) => `${Number(v).toLocaleString("ru-RU")} ${unit}`;
  const checkInTime = property?.checkInTime?.slice(0, 5);
  const checkOutTime = property?.checkOutTime?.slice(0, 5);
  const balance = Number(reservation.balanceDue);
  const rooms =
    reservation.items.length > 1
      ? `${reservation.items.length} номера (${reservation.items.map((i) => i.roomTypeName).join(", ")})`
      : item
        ? `номер «${item.roomTypeName}»`
        : "";
  // Гостю — даты заезда и выезда, а не «последняя ночь», как в шахматке.
  const dates = item
    ? `заезд ${formatHotelDate(item.checkIn)}, выезд ${formatHotelDate(item.checkOut)} (${nightsBetween(item.checkIn, item.checkOut)} ${nightsWord(nightsBetween(item.checkIn, item.checkOut))})`
    : "";
  const address = property?.address ? `Адрес: ${property.address}.` : "";
  const contact = property?.phone ? `Телефон отеля: ${property.phone}.` : "";

  switch (kind) {
    case "confirmation":
      return [
        hello,
        `Ваша бронь №${reservation.number} в ${hotel} подтверждена: ${dates}, ${rooms}.`,
        checkInTime || checkOutTime ? `Заезд с ${checkInTime ?? "—"}, выезд до ${checkOutTime ?? "—"}.` : "",
        `Стоимость — ${money(reservation.totalAmount)}${Number(reservation.paidAmount) > 0 ? `, оплачено ${money(reservation.paidAmount)}` : ""}${balance > 0 ? `, к оплате ${money(balance)}` : ""}.`,
        address,
        contact,
        "Ждём вас!",
      ]
        .filter(Boolean)
        .join("\n");
    case "reminder":
      return [
        hello,
        item ? `Напоминаем о заезде в ${hotel} ${formatHotelDate(item.checkIn)}${checkInTime ? ` с ${checkInTime}` : ""}, бронь №${reservation.number}.` : `Напоминаем о брони №${reservation.number} в ${hotel}.`,
        balance > 0 ? `К оплате при заезде — ${money(balance)}.` : "",
        "Если планы изменились, напишите нам — поможем.",
        address,
        contact,
      ]
        .filter(Boolean)
        .join("\n");
    case "balance":
      return [
        hello,
        `По брони №${reservation.number} в ${hotel} к оплате ${money(balance)} (всего ${money(reservation.totalAmount)}, оплачено ${money(reservation.paidAmount)}).`,
        "Оплатить можно на ресепшене. Если нужны реквизиты для перевода — ответьте на это сообщение.",
      ].join("\n");
    case "thanks":
      return [hello, `Спасибо, что выбрали ${hotel}! Будем рады видеть вас снова.`, "Если вам понравилось — расскажите друзьям, а если что-то было не так, напишите нам: мы обязательно исправим."].join("\n");
  }
}
