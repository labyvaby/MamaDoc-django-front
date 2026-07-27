import { describe, expect, it } from "vitest";

import { getStatusChipState, OVERDUE_GRACE_MS } from "./statusChipState";
import type { AppointmentStatusSource } from "./statusChipState";

/**
 * Правила видимости чипов легко ломаются молча (чип просто исчезает), поэтому
 * фиксируем их тестами: логика чистая, рендер не нужен.
 */

const NOW = Date.parse("2026-07-28T12:00:00Z");
const past = new Date(NOW - OVERDUE_GRACE_MS - 60_000).toISOString();
const recent = new Date(NOW - 5 * 60_000).toISOString();
const future = new Date(NOW + 30 * 60_000).toISOString();

const appt = (over: Partial<AppointmentStatusSource>): AppointmentStatusSource => ({
  status: "scheduled",
  ...over,
});

const state = (over: Partial<AppointmentStatusSource>, alwaysShowStatus = false) =>
  getStatusChipState(appt(over), { alwaysShowStatus, now: NOW });

describe("статус-чип vs платёжные чипы", () => {
  it("оплаченный приём показывает только оплату", () => {
    const s = state({ status: "scheduled", paymentStatus: "paid", paidTotal: "1600.00" });
    expect(s.showStatusChip).toBe(false);
    expect(s.showPayChip).toBe(true);
  });

  it("alwaysShowStatus возвращает статус рядом с оплатой (открытая карточка приёма)", () => {
    const s = state({ status: "in_progress", paymentStatus: "paid", paidTotal: "1600.00" }, true);
    expect(s.showStatusChip).toBe(true);
    expect(s.showPayChip).toBe(true);
  });

  it("«Завершено» без оплаты не остаётся вообще без чипа", () => {
    const s = state({ status: "completed", paymentStatus: "unpaid" });
    expect(s.showStatusChip).toBe(true);
  });

  it("100% скидка даёт отдельный чип вместо чипа оплаты", () => {
    const s = state({ status: "scheduled", paymentStatus: "discounted", paidTotal: "0.00" });
    expect(s.showDiscountChip).toBe(true);
    expect(s.showPayChip).toBe(false);
    expect(s.showStatusChip).toBe(false);
  });

  it("заключение без оплаты не оставляет строку без чипов", () => {
    // hideStatusChip=true по заключению, но других чипов нет — статус возвращаем.
    const s = state({
      status: "scheduled",
      services: [{ conclusionState: "completed" }] as AppointmentStatusSource["services"],
    });
    expect(s.showStatusChip).toBe(true);
    expect(s.showPayChip).toBe(false);
  });
});

describe("отмена и неявка не прячутся за оплатой", () => {
  // На проде есть оплаченные отменённые приёмы (возврат не оформлен): раньше
  // строка выглядела как обычное «Оплачено», без признака отмены.
  it.each(["canceled", "cancelled", "no_show", "Отменено"])("%s", (status) => {
    const s = state({ status: status as AppointmentStatusSource["status"], paymentStatus: "paid", paidTotal: "1600.00" });
    expect(s.showStatusChip).toBe(true);
    expect(s.showPayChip).toBe(true);
  });

  it("отменённый приём не считается просроченным", () => {
    expect(state({ status: "canceled", endsAt: past }).isOverdue).toBe(false);
  });
});

describe("просроченный статус", () => {
  it.each(["scheduled", "confirmed", "arrived", "in_progress"])(
    "%s после окончания + запас времени",
    (status) => {
      const s = state({ status: status as AppointmentStatusSource["status"], endsAt: past });
      expect(s.isOverdue).toBe(true);
    },
  );

  it("приём, который только что закончился, ещё не просрочен (мог идти дольше)", () => {
    expect(state({ status: "in_progress", endsAt: recent }).isOverdue).toBe(false);
  });

  it("будущий приём не просрочен", () => {
    expect(state({ status: "scheduled", endsAt: future }).isOverdue).toBe(false);
  });

  it("завершённый приём не просрочен", () => {
    expect(state({ status: "completed", endsAt: past }).isOverdue).toBe(false);
  });

  it("без endsAt признака нет", () => {
    expect(state({ status: "in_progress" }).isOverdue).toBe(false);
    expect(state({ status: "in_progress", endsAt: "" }).isOverdue).toBe(false);
  });
});

describe("чип долга", () => {
  it("показывается при частичной оплате", () => {
    const s = state({ status: "scheduled", paymentStatus: "partial", paidTotal: "500.00", debt: "1100.00" });
    expect(s.debtAmount).toBe(1100);
  });

  it("не показывается, когда не оплачено (долг равен «Итого»)", () => {
    expect(state({ status: "scheduled", paymentStatus: "unpaid", debt: "1600.00" }).debtAmount).toBeNull();
  });

  it("не показывается при нулевом остатке", () => {
    expect(
      state({ status: "scheduled", paymentStatus: "paid", paidTotal: "1600.00", debt: "0.00" }).debtAmount,
    ).toBeNull();
  });
});

describe("стиль платёжного чипа", () => {
  it("оплата только картой — безналичный код", () => {
    const s = state({ paymentStatus: "paid", paidTotal: "1600.00", paymentMethods: ["card"] });
    expect(s.paymentStyleStatus).toBe("paid_cashless");
  });

  it("карта плюс наличные — обычное «Оплачено»", () => {
    const s = state({ paymentStatus: "paid", paidTotal: "1600.00", paymentMethods: ["card", "cash"] });
    expect(s.paymentStyleStatus).toBe("paid");
  });

  it("частичная оплата", () => {
    expect(state({ paymentStatus: "partial", paidTotal: "500.00" }).paymentStyleStatus).toBe("partially_paid");
  });
});
