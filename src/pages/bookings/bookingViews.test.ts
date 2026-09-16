import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import "dayjs/locale/ru";

import type { BookingListItem } from "../../api/bookings";
import {
  autoConfirmExtras,
  bookingFunnel,
  formatDurationMin,
  funnelBy,
  needsTriage,
  reactionStats,
  visitDayPhrase,
  whatsappUrl,
} from "./bookingViews";

const now = dayjs("2026-09-15T12:00:00");

const booking = (over: Partial<BookingListItem> = {}): BookingListItem => ({
  id: 1,
  operatorBookingId: "public-x",
  confirmationCode: "ABC",
  patientName: "Асель",
  patientPhone: "+996 700 11 22 33",
  doctorName: "Клепова",
  doctorId: 5,
  date: "2026-09-16",
  time: "10:00",
  status: "pending",
  source: "public",
  totalPrice: "1200.00",
  totalDurationMin: 30,
  appointmentId: null,
  ...over,
});

describe("needsTriage", () => {
  it("«Ожидает» — разобрать, в том числе просроченная", () => {
    expect(needsTriage(booking(), now)).toBe(true);
    expect(needsTriage(booking({ date: "2026-09-10" }), now)).toBe(true);
  });

  it("подтверждённая и идущая оплата — не разбирать: дальше приём или банк", () => {
    expect(needsTriage(booking({ status: "confirmed", appointmentId: 7 }), now)).toBe(false);
    expect(needsTriage(booking({ status: "awaiting_payment" }), now)).toBe(false);
  });

  it("деньги есть, приёма не будет — разобрать, даже если бронь отменена", () => {
    expect(
      needsTriage(booking({ status: "cancelled", prepaymentNeedsAttention: true }), now),
    ).toBe(true);
    expect(needsTriage(booking({ status: "cancelled" }), now)).toBe(false);
  });
});

describe("autoConfirmExtras", () => {
  const match = { id: 10, fullName: "Асель", phone: "+996700112233" };
  const service = { id: 65, name: "Приём", price: "1200.00" };

  it("одна карта и услуга — подтверждаем в один клик", () => {
    expect(autoConfirmExtras({ patientMatches: [match], services: [service] })).toEqual({
      patientId: 10,
      serviceIds: [65],
    });
  });

  it("без услуг — на ручной выбор: бэк такое подтверждение отклоняет", () => {
    expect(autoConfirmExtras({ patientMatches: [match], services: [] })).toBeNull();
    // operator.kg присылает услуги без id каталога — это тоже «услуг нет».
    expect(
      autoConfirmExtras({ patientMatches: [match], services: [{ id: null, name: "Приём", price: null }] }),
    ).toBeNull();
  });

  it("услуга, которую врач в филиале не ведёт, — на ручной выбор", () => {
    const detail = { patientMatches: [match], services: [service] };
    expect(autoConfirmExtras(detail, new Set([1, 2]))).toBeNull();
    expect(autoConfirmExtras(detail, new Set([65]))).not.toBeNull();
    // Матрицы нет — проверку пропускаем, решает бэк.
    expect(autoConfirmExtras(detail, null)).not.toBeNull();
  });

  it("карт ноль или несколько — на ручной выбор", () => {
    expect(autoConfirmExtras({ patientMatches: [], services: [service] })).toBeNull();
    expect(
      autoConfirmExtras({ patientMatches: [match, { ...match, id: 11 }], services: [service] }),
    ).toBeNull();
  });
});

describe("bookingFunnel", () => {
  it("подтверждение считается по факту: неявка и отмена с приёмом через него прошли", () => {
    const f = bookingFunnel(
      [
        booking({ status: "pending" }),
        booking({ status: "confirmed", appointmentId: 1, date: "2026-09-20" }),
        booking({ status: "confirmed", appointmentId: 2, date: "2026-09-10" }),
        booking({ status: "completed", appointmentId: 3 }),
        booking({ status: "no_show", appointmentId: 4 }),
        booking({ status: "cancelled", appointmentId: 5 }),
        booking({ status: "cancelled", appointmentId: null }),
      ],
      now,
    );
    expect(f.requests).toBe(7);
    expect(f.confirmed).toBe(5);
    expect(f.completed).toBe(1);
    expect(f.waiting).toBe(1);
    expect(f.upcoming).toBe(1);
    expect(f.unresolved).toBe(1);
    expect(f.noShow).toBe(1);
    expect(f.cancelledAfter).toBe(1);
    expect(f.cancelledBefore).toBe(1);
  });

  it("брошенная оплата — не заявка: до регистратуры она не дошла", () => {
    const f = bookingFunnel(
      [
        booking({ status: "awaiting_payment", prepaymentStatus: "expired" }),
        booking({ status: "awaiting_payment", prepaymentExpiresAt: "2026-09-15T12:10:00" }),
      ],
      now,
    );
    expect(f.requests).toBe(0);
    expect(f.abandonedPayment).toBe(1);
    expect(f.inPayment).toBe(1);
  });

  it("разрез сортирует крупные группы наверх", () => {
    const rows = funnelBy(
      [booking({ doctorName: "Б" }), booking({ doctorName: "А" }), booking({ doctorName: "А" })],
      (b) => ({ key: b.doctorName, label: b.doctorName }),
      now,
    );
    expect(rows.map((r) => [r.label, r.funnel.requests])).toEqual([
      ["А", 2],
      ["Б", 1],
    ]);
  });
});

describe("reactionStats", () => {
  const claimed = (createdAt: string, claimedAt: string, by = { id: 1, fullName: "Айгуль" }) =>
    booking({ createdAt, claimedAt, claimedBy: by });

  it("медиана, p90 и доля за 15 минут", () => {
    const s = reactionStats([
      claimed("2026-09-15T10:00:00Z", "2026-09-15T10:05:00Z"),
      claimed("2026-09-15T10:00:00Z", "2026-09-15T10:10:00Z"),
      claimed("2026-09-15T10:00:00Z", "2026-09-15T11:00:00Z", { id: 2, fullName: "Бека" }),
      booking({ createdAt: "2026-09-15T10:00:00Z", claimedAt: null }),
    ]);
    expect(s.measured).toBe(3);
    expect(s.medianMin).toBe(10);
    expect(s.p90Min).toBe(60);
    expect(s.within15Pct).toBe(67);
    expect(s.unclaimed).toBe(1);
    expect(s.byEmployee[0]).toMatchObject({ name: "Айгуль", count: 2, medianMin: 7.5 });
    expect(s.unsupported).toBe(false);
  });

  it("без createdAt в ответе — честное «не из чего считать», а не нули", () => {
    const s = reactionStats([booking(), booking()]);
    expect(s.unsupported).toBe(true);
    expect(s.medianMin).toBeNull();
  });

  it("часы сервера назад не дают отрицательной реакции", () => {
    const s = reactionStats([claimed("2026-09-15T10:05:00Z", "2026-09-15T10:00:00Z")]);
    expect(s.medianMin).toBe(0);
  });
});

describe("напоминание", () => {
  it("день визита звучит по-человечески", () => {
    expect(visitDayPhrase("2026-09-15", now)).toBe("сегодня");
    expect(visitDayPhrase("2026-09-16", now)).toBe("завтра");
    expect(visitDayPhrase("2026-09-17", now)).toBe("в четверг, 17 сентября");
    expect(visitDayPhrase("2026-09-23", now)).toBe("в среду, 23 сентября");
    expect(visitDayPhrase("2026-09-22", now)).toBe("во вторник, 22 сентября");
    expect(visitDayPhrase("2026-09-19", now)).toBe("в субботу, 19 сентября");
  });

  it("ссылка WhatsApp — только цифры номера и закодированный текст", () => {
    expect(whatsappUrl("+996 700 11-22-33")).toBe("https://wa.me/996700112233");
    expect(whatsappUrl("+996700112233", "Привет & до встречи")).toBe(
      "https://wa.me/996700112233?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%26%20%D0%B4%D0%BE%20%D0%B2%D1%81%D1%82%D1%80%D0%B5%D1%87%D0%B8",
    );
  });

  it("длительность для людей", () => {
    expect(formatDurationMin(null)).toBe("—");
    expect(formatDurationMin(7.4)).toBe("7 мин");
    expect(formatDurationMin(135)).toBe("2 ч 15 мин");
    expect(formatDurationMin(60)).toBe("1 ч");
    expect(formatDurationMin(3 * 24 * 60)).toBe("3 дн.");
  });
});

describe("пропущенные заявки в воронке", () => {
  it("«Ожидает» с прошедшим окном визита — пропущена, а не «ждёт»", () => {
    const f = bookingFunnel(
      [
        // now = 15.09 12:00. Окно 10:00–10:30 закрылось — пропущена.
        booking({ date: "2026-09-15", time: "10:00", totalDurationMin: 30 }),
        // Начало прошло, окно ещё идёт — обычная очередь.
        booking({ date: "2026-09-15", time: "11:45", totalDurationMin: 30 }),
        booking({ date: "2026-09-16" }),
      ],
      now,
    );
    expect(f.missed).toBe(1);
    expect(f.waiting).toBe(2);
  });

  it("неявка без приёма — пропущенная, закрытая из «Разобрать»; с приёмом — обычная неявка", () => {
    const f = bookingFunnel(
      [
        booking({ status: "no_show", appointmentId: null }),
        booking({ status: "no_show", appointmentId: 4 }),
      ],
      now,
    );
    expect(f.missed).toBe(1);
    expect(f.noShow).toBe(1);
    // Подтверждение — только у той, что прошла через приём.
    expect(f.confirmed).toBe(1);
  });
});
