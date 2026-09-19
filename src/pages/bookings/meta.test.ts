import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import { bookingAgeText, bookingTimeHint, isBookingClosed, isBookingMissed, isBookingOverdue } from "./meta";

/**
 * `isBookingClosed` решает, что скрыть из списка броней по умолчанию, поэтому
 * инварианты фиксируем: лишняя строгость спрячет живую заявку, лишняя мягкость
 * вернёт в список мусор от просроченных оплат.
 */
describe("isBookingClosed", () => {
  const now = dayjs("2026-09-09T12:00:00");

  it("отменённая и неявка — закрыты", () => {
    expect(isBookingClosed({ status: "cancelled" }, now)).toBe(true);
    expect(isBookingClosed({ status: "no_show" }, now)).toBe(true);
  });

  it("живые статусы — не закрыты", () => {
    expect(isBookingClosed({ status: "pending" }, now)).toBe(false);
    expect(isBookingClosed({ status: "confirmed" }, now)).toBe(false);
  });

  it("выполненная бронь — не закрыта: это история приёма, а не мусор", () => {
    expect(isBookingClosed({ status: "completed" }, now)).toBe(false);
  });

  it("оплата с истёкшей ссылкой — закрыта", () => {
    expect(
      isBookingClosed(
        { status: "awaiting_payment", prepaymentExpiresAt: "2026-09-09T11:45:00" },
        now,
      ),
    ).toBe(true);
  });

  it("оплата с живым таймером — не закрыта: пациент ещё платит", () => {
    expect(
      isBookingClosed(
        { status: "awaiting_payment", prepaymentExpiresAt: "2026-09-09T12:10:00" },
        now,
      ),
    ).toBe(false);
  });

  it("серверный expired закрывает бронь даже без срока в ответе", () => {
    expect(
      isBookingClosed({ status: "awaiting_payment", prepaymentStatus: "expired" }, now),
    ).toBe(true);
  });

  it("живая оплата не закрыта, даже если ссылка формально истекла: бэк видит деньги", () => {
    // §9.2 контракта: статус точнее часов браузера — по такой броне платёж
    // подтверждён, и прятать её из списка нельзя.
    expect(
      isBookingClosed(
        {
          status: "awaiting_payment",
          prepaymentStatus: "paid",
          prepaymentExpiresAt: "2026-09-09T11:45:00",
        },
        now,
      ),
    ).toBe(false);
  });

  it("оплата без срока и с мусорной датой — не закрыта: утверждать нечего", () => {
    expect(isBookingClosed({ status: "awaiting_payment" }, now)).toBe(false);
    expect(
      isBookingClosed({ status: "awaiting_payment", prepaymentExpiresAt: null }, now),
    ).toBe(false);
    expect(
      isBookingClosed({ status: "awaiting_payment", prepaymentExpiresAt: "мусор" }, now),
    ).toBe(false);
  });

  it("просроченная «Ожидает» остаётся в списке — её как раз надо разобрать", () => {
    const overdue = { date: "2026-09-08", time: "10:00", status: "pending" as const };
    expect(isBookingOverdue(overdue)).toBe(true);
    expect(isBookingClosed(overdue, now)).toBe(false);
  });
});

describe("isBookingMissed", () => {
  const now = dayjs("2026-09-15T12:00:00");
  const pending = (time: string, dur = 30) => ({
    date: "2026-09-15",
    time,
    status: "pending" as const,
    totalDurationMin: dur,
  });

  it("порог — конец окна визита, не начало: пациент мог опоздать", () => {
    expect(isBookingMissed(pending("11:45"), now)).toBe(false);
    expect(isBookingMissed(pending("11:20"), now)).toBe(true);
  });

  it("без длительности окно равно началу", () => {
    expect(isBookingMissed(pending("11:59", 0), now)).toBe(true);
  });

  it("только «Ожидает»: подтверждённая с прошедшим временем — забота регистратуры", () => {
    expect(isBookingMissed({ ...pending("10:00"), status: "confirmed" }, now)).toBe(false);
  });

  it("подсказка времени различает идущий визит и пропуск", () => {
    expect(bookingTimeHint("2026-09-15", "11:20", "pending", 30)?.text).toMatch(/пропущена/);
  });
});

/**
 * Колонка «Создано» в разборе показывает возраст заявки, а не время суток:
 * регистратуре важно, сколько заявка ждёт, а «00:08» без даты читалось как
 * время визита.
 */
describe("bookingAgeText", () => {
  const now = dayjs("2026-09-19T06:41:00");
  const ago = (n: number, unit: "minute" | "hour" | "day") => now.subtract(n, unit).toISOString();

  it("минуты и «только что»", () => {
    expect(bookingAgeText(ago(0, "minute"), now)).toBe("только что");
    expect(bookingAgeText(ago(1, "minute"), now)).toBe("1 мин назад");
    expect(bookingAgeText(ago(59, "minute"), now)).toBe("59 мин назад");
  });

  it("часы со склонением", () => {
    expect(bookingAgeText(ago(1, "hour"), now)).toBe("1 час назад");
    expect(bookingAgeText(ago(3, "hour"), now)).toBe("3 часа назад");
    expect(bookingAgeText(ago(6, "hour"), now)).toBe("6 часов назад");
    expect(bookingAgeText(ago(23, "hour"), now)).toBe("23 часа назад");
  });

  it("дни со склонением — и вчерашняя ночная заявка тоже в днях, а не «00:08»", () => {
    expect(bookingAgeText(ago(1, "day"), now)).toBe("1 день назад");
    expect(bookingAgeText(ago(2, "day"), now)).toBe("2 дня назад");
    expect(bookingAgeText(ago(5, "day"), now)).toBe("5 дней назад");
    expect(bookingAgeText(ago(11, "day"), now)).toBe("11 дней назад");
    expect(bookingAgeText(ago(21, "day"), now)).toBe("21 день назад");
  });

  it("часы округляются вниз: 1 ч 59 мин — это ещё «1 час назад»", () => {
    expect(bookingAgeText(now.subtract(119, "minute").toISOString(), now)).toBe("1 час назад");
  });

  it("без даты или с мусором — null, ячейка покажет прочерк", () => {
    expect(bookingAgeText(undefined, now)).toBeNull();
    expect(bookingAgeText("not-a-date", now)).toBeNull();
  });
});
