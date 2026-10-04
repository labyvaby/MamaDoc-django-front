/** Условия отмены словами — для предпросмотра в настройках отеля до сохранения. */
import type { HotelCancellationPenaltyKind } from "../api/hotel";

/** Те же условия словами, что строит сервер (cancellationPolicyText) — чтобы видеть результат до сохранения. */
export function cancellationPolicyPreview(t: {
  freeDays: number | null;
  penalty: HotelCancellationPenaltyKind;
  penaltyValue: string;
  prepaymentPercent: string;
  prepaymentHours: number | null;
  currency: string;
}): string {
  const parts: string[] = [];
  const penaltyText =
    t.penalty === "first_night"
      ? "стоимость первой ночи"
      : t.penalty === "percent"
        ? `${t.penaltyValue || "?"} % от стоимости проживания`
        : t.penalty === "amount"
          ? `${Number(t.penaltyValue || 0).toLocaleString("ru-RU")} ${t.currency === "KGS" ? "сом" : t.currency}`
          : null;
  if (t.penalty === "none") {
    if (t.freeDays != null) parts.push("Бесплатная отмена.");
  } else if (t.freeDays == null) {
    parts.push(`Отмена и незаезд — штраф: ${penaltyText}.`);
  } else {
    parts.push(
      t.freeDays === 0
        ? `Бесплатная отмена — до дня заезда. При более поздней отмене или незаезде — штраф: ${penaltyText}.`
        : `Бесплатная отмена — не позднее чем за ${t.freeDays} ${t.freeDays % 10 === 1 && t.freeDays % 100 !== 11 ? "сутки" : "суток"} до заезда. При более поздней отмене или незаезде — штраф: ${penaltyText}.`,
    );
  }
  const pp = Number(t.prepaymentPercent);
  if (t.prepaymentPercent.trim() !== "" && pp > 0) parts.push(`Предоплата ${pp} %${t.prepaymentHours ? ` — в течение ${t.prepaymentHours} ч после бронирования` : ""}.`);
  return parts.join(" ");
}
