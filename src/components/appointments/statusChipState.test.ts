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

const state = (over: Partial<AppointmentStatusSource>) =>
  getStatusChipState(appt(over), { now: NOW });

describe("статус визита виден рядом с деньгами", () => {
  // Регистратуре нужны оба факта сразу: пришёл ли человек и закрыт ли чек.
  // Пока чипы сливались по цвету, статус прятали за платёжными — и по
  // оплаченной строке нельзя было понять, ждёт пациент в холле или нет.
  it("оплаченный приём показывает и статус, и оплату", () => {
    const s = state({ status: "arrived", paymentStatus: "paid", paidTotal: "1600.00" });
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
    expect(s.showStatusChip).toBe(true);
  });
});

describe("процент скидки", () => {
  // Чип подписывался «Скидка 100%» по одному признаку paymentStatus, не сверяя
  // суммы, — и половинная скидка выглядела полной.
  it("половинная скидка не выдаётся за полную", () => {
    const s = state({
      status: "scheduled",
      paymentStatus: "discounted",
      paidTotal: "0.00",
      totalAmount: "1600.00",
      discountAmount: "800.00",
    });
    expect(s.showDiscountChip).toBe(true);
    expect(s.discountPercent).toBe(50);
  });

  it("скидка на всю сумму — 100%", () => {
    const s = state({
      status: "scheduled",
      paymentStatus: "discounted",
      paidTotal: "0.00",
      totalAmount: "1600.00",
      discountAmount: "1600.00",
    });
    expect(s.discountPercent).toBe(100);
  });

  it("почти полная скидка округляется вниз, а не до 100%", () => {
    // Платить ещё нужно — «100%» здесь означало бы «можно отпускать».
    const s = state({
      status: "scheduled",
      paymentStatus: "discounted",
      paidTotal: "0.00",
      totalAmount: "1000.00",
      discountAmount: "999.00",
    });
    expect(s.discountPercent).toBe(99);
  });

  it("скидка есть, но статус не discounted — чип всё равно показываем", () => {
    const s = state({
      status: "scheduled",
      paymentStatus: "unpaid",
      paidTotal: "0.00",
      totalAmount: "1600.00",
      discountAmount: "600.00",
    });
    expect(s.showDiscountChip).toBe(true);
    expect(s.discountPercent).toBe(38);
  });

  it("без сумм процент не выдумываем", () => {
    const s = state({ status: "scheduled", paymentStatus: "discounted", paidTotal: "0.00" });
    expect(s.discountPercent).toBeNull();
  });

  it("оплаченный приём со скидкой чипа скидки не получает", () => {
    // Там уже есть «Оплачено» — операционно вопрос закрыт.
    const s = state({
      status: "scheduled",
      paymentStatus: "paid",
      paidTotal: "1000.00",
      totalAmount: "1600.00",
      discountAmount: "600.00",
    });
    expect(s.showDiscountChip).toBe(false);
  });

  it("заключение не скрывает статус", () => {
    const s = state({
      status: "in_progress",
      services: [{ conclusionState: "completed" }] as AppointmentStatusSource["services"],
    });
    expect(s.showStatusChip).toBe(true);
    expect(s.showPayChip).toBe(false);
  });
});

describe("отмена и неявка видны вместе с оплатой", () => {
  // На проде есть оплаченные отменённые приёмы (возврат не оформлен): строка
  // не должна выглядеть как обычное «Оплачено», без признака отмены.
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

  it("вчерашний незакрытый приём не помечается", () => {
    // Бэк приёмы не закрывает, поэтому в архиве метка стояла бы у всех строк.
    const yesterday = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    expect(state({ status: "in_progress", endsAt: yesterday }).isOverdue).toBe(false);
  });

  it("без endsAt признака нет", () => {
    expect(state({ status: "in_progress" }).isOverdue).toBe(false);
    expect(state({ status: "in_progress", endsAt: "" }).isOverdue).toBe(false);
  });
});

describe("чип долга", () => {
  it("показывается при частичной оплате и заменяет чип оплаты", () => {
    const s = state({
      status: "scheduled",
      paymentStatus: "partial",
      paidTotal: "500.00",
      debt: "1100.00",
      totalAmount: "1600.00",
    });
    expect(s.debtAmount).toBe(1100);
    expect(s.totalAmount).toBe(1600);
    // «Долг 1100 из 1600» уже говорит, что часть внесена — второй чип лишний.
    expect(s.showPayChip).toBe(false);
  });

  it("без суммы чека остаётся короткая форма «Долг N»", () => {
    const s = state({ status: "scheduled", paymentStatus: "partial", paidTotal: "500.00", debt: "1100.00" });
    expect(s.debtAmount).toBe(1100);
    expect(s.totalAmount).toBeNull();
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
