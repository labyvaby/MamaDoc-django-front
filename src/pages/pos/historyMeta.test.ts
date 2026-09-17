import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { PosSavedReceipt } from "../../api/pos";
import {
  clientLabel,
  historyPreset,
  linesSummary,
  paymentsSummary,
  receiptDateLabel,
  receiptInRange,
  receiptMatches,
  receiptNumber,
  receiptStatusMeta,
  summarizeReceipts,
  unitsCount,
} from "./historyMeta";

const line = (productName: string, quantity: string) => ({
  id: 1,
  productId: 1,
  productName,
  quantity,
  unitPrice: "100.00",
  total: "100.00",
});

describe("history receipt labels", () => {
  it("shows the same 8-char number the printed receipt carries", () => {
    expect(receiptNumber({ id: 7, number: "3f2a8b1c-1234-4567-89ab-cdef01234567" })).toBe("3f2a8b1c");
    expect(receiptNumber({ id: 7, number: "" })).toBe("#7");
  });

  it("prefers the client's name and never shows a bare id when there is none", () => {
    expect(clientLabel({ clientId: 12, clientName: "Айгуль Бекова" })).toBe("Айгуль Бекова");
    expect(clientLabel({ clientId: 12, clientName: "  " })).toBe("Клиент #12");
    expect(clientLabel({ clientId: null })).toBe("Без клиента");
  });

  it("maps every backend status, keeping unknown ones readable", () => {
    expect(receiptStatusMeta("completed")).toEqual({ label: "Завершён", tone: "success" });
    expect(receiptStatusMeta("draft").label).toBe("Отменён");
    expect(receiptStatusMeta("weird")).toEqual({ label: "weird", tone: null });
  });
});

describe("history line and payment summaries", () => {
  it("names the first product and counts the rest", () => {
    expect(linesSummary([])).toBe("Без товаров");
    expect(linesSummary([line("Пальто", "1.000")])).toBe("Пальто");
    expect(linesSummary([line("Пальто", "2.000"), line("Шарф", "1.000"), line("Шапка", "1.000")])).toBe("Пальто ×2 и ещё 2");
    expect(unitsCount([line("Пальто", "2.000"), line("Шарф", "1.500")])).toBe(3.5);
  });

  it("lists distinct payment methods in order", () => {
    const payment = (method: string) => ({ id: 1, method, amount: "1.00" });
    expect(paymentsSummary([])).toBe("Без оплаты");
    expect(paymentsSummary([payment("card"), payment("cash"), payment("card")])).toBe("Карта + Наличные");
    expect(paymentsSummary([payment("debt")])).toBe("В долг");
  });
});

describe("history dates", () => {
  const now = dayjs("2026-09-15T12:00:00");

  it("uses relative words only for today and yesterday", () => {
    expect(receiptDateLabel("2026-09-15T09:05:00", now)).toBe("Сегодня, 09:05");
    expect(receiptDateLabel("2026-09-14T23:40:00", now)).toBe("Вчера, 23:40");
    expect(receiptDateLabel("2026-09-01T08:00:00", now)).toBe("1 сент., 08:00");
    expect(receiptDateLabel("2025-12-31T18:30:00", now)).toBe("31 дек. 2025, 18:30");
  });

  it("falls back to today for an unknown preset key", () => {
    expect(historyPreset("nope").key).toBe("today");
    const [from, to] = historyPreset("yesterday").range();
    expect(to.diff(from, "day")).toBe(0);
    expect(from.isSame(dayjs().subtract(1, "day"), "day")).toBe(true);
  });
});

describe("compat mode with a backend without server-side history filters", () => {
  const receipt = (over: Partial<PosSavedReceipt>): PosSavedReceipt => ({
    id: 1,
    number: "3f2a8b1c-1234-4567-89ab-cdef01234567",
    organizationId: 1,
    branchId: 1,
    warehouseId: 1,
    clientId: null,
    status: "completed",
    comment: "",
    subtotal: "100.00",
    discountTotal: "0.00",
    totalAmount: "100.00",
    createdAt: "2026-09-15T10:00:00",
    lines: [line("Пальто", "1.000")],
    payments: [],
    ...over,
  });

  it("keeps receipts inside the inclusive day range", () => {
    const range = { from: dayjs("2026-09-15").startOf("day"), to: dayjs("2026-09-15").endOf("day") };
    expect(receiptInRange(receipt({ createdAt: "2026-09-15T00:00:00" }), range)).toBe(true);
    expect(receiptInRange(receipt({ createdAt: "2026-09-15T23:59:59" }), range)).toBe(true);
    expect(receiptInRange(receipt({ createdAt: "2026-09-14T23:59:59" }), range)).toBe(false);
    expect(receiptInRange(receipt({ createdAt: "2000-01-01T00:00:00" }), null)).toBe(true);
  });

  it("matches the same fields the server searches", () => {
    const sale = receipt({ clientId: 12, clientName: "Айгуль Бекова" });
    expect(receiptMatches(sale, "")).toBe(true);
    expect(receiptMatches(sale, "3F2A8B")).toBe(true);
    expect(receiptMatches(sale, "паль")).toBe(true);
    expect(receiptMatches(sale, "бекова")).toBe(true);
    expect(receiptMatches(sale, "12")).toBe(true);
    expect(receiptMatches(sale, "шарф")).toBe(false);
  });

  it("summarises a page the way history/summary/ does", () => {
    const summary = summarizeReceipts([
      receipt({ totalAmount: "100.00", discountTotal: "10.00" }),
      receipt({ id: 2, totalAmount: "50.00", discountTotal: "5.00" }),
      receipt({ id: 3, status: "held", totalAmount: "999.00" }),
      receipt({ id: 4, status: "returned", totalAmount: "999.00" }),
      receipt({ id: 5, status: "draft" }),
    ]);
    expect(summary).toEqual({
      count: 5,
      completed: 2,
      held: 1,
      returned: 1,
      cancelled: 1,
      revenue: "150",
      discountTotal: "15",
    });
  });
});
