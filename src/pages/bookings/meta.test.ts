import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import { isBookingClosed, isBookingOverdue } from "./meta";

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
