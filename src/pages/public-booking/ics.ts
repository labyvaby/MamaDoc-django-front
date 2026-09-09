import type { BookingBranchRef, BookingDoctorRef, BookingServiceRef } from "../../api/publicBooking";

/**
 * Файл .ics для брони — кнопка «Добавить в календарь» на карточке записи.
 *
 * Время — floating (без TZID и без Z), как и остальной расчёт дат в модуле
 * (см. `isPast()` в `api/publicPatient.ts`): клиника и пациент всегда в одной
 * зоне, а строгая привязка к TZID усложнила бы генерацию без реальной пользы.
 */

export interface IcsBookingInput {
  confirmationCode: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  totalDurationMin: number;
  doctor: BookingDoctorRef | null;
  branch: BookingBranchRef | null;
  services: BookingServiceRef[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function localStamp(date: string, time: string, addMinutes = 0): string {
  const dt = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  dt.setMinutes(dt.getMinutes() + addMinutes);
  return (
    `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}` +
    `T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`
  );
}

/** DTSTAMP — единственное поле события, которое всегда UTC по спецификации. */
function utcStampNow(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Экранирование текста полей ICS (RFC 5545 §3.3.11) — порядок важен. */
function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildBookingIcs(b: IcsBookingInput, orgLabel: string): string {
  const start = localStamp(b.date, b.time);
  const end = localStamp(b.date, b.time, b.totalDurationMin || 30);
  const summary = b.doctor ? `Приём: ${b.doctor.fullName}` : `Приём — ${orgLabel}`;
  // Ссылку на карты и телефон кладём в описание: `LOCATION` — просто текст, и
  // из календаря на телефоне до маршрута иначе не добраться.
  const mapUrl = b.branch?.twoGisUrl || b.branch?.yandexMapsUrl || b.branch?.googleMapsUrl || null;
  const phone = b.branch?.phones?.[0] ?? null;
  const descriptionParts = [
    b.services.length ? `Услуги: ${b.services.map((s) => s.name).join(", ")}` : null,
    `Код подтверждения: ${b.confirmationCode}`,
    phone ? `Телефон: ${phone}` : null,
    mapUrl ? `Как доехать: ${mapUrl}` : null,
  ].filter((s): s is string => Boolean(s));
  const location = b.branch ? [b.branch.name, b.branch.address].filter(Boolean).join(", ") : "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MamaDoc//Booking//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:booking-${b.confirmationCode}@mamadoc`,
    `DTSTAMP:${utcStampNow()}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    descriptionParts.length ? `DESCRIPTION:${escapeIcsText(descriptionParts.join("\\n"))}` : null,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));

  return lines.join("\r\n");
}

/** Скачивает .ics через временную ссылку — без обращения к внешним сервисам. */
export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
