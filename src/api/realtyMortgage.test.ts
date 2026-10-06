import { describe, expect, it } from "vitest";

import { bankFits, fromRawApplication, matchesApplication } from "./realtyMortgage";

describe("bankFits", () => {
  const optima = { maxTerm: 15, minDown: 30 };
  it("срок ≤ maxTerm и взнос ≥ minDown — подходит (границы включительно)", () => {
    expect(bankFits(optima, { term: 15, downPct: 30 })).toBe(true);
  });
  it("срок длиннее или взнос меньше — не подходит", () => {
    expect(bankFits(optima, { term: 20, downPct: 30 })).toBe(false);
    expect(bankFits(optima, { term: 15, downPct: 29.9 })).toBe(false);
  });
  it("ноль в справочнике срока — без ограничения", () => {
    expect(bankFits({ maxTerm: 0, minDown: 10 }, { term: 25, downPct: 20 })).toBe(true);
  });
});

describe("fromRawApplication", () => {
  it("деньги строками, банки в любой из форм, выбранный банк объектом", () => {
    const app = fromRawApplication({
      id: 6,
      number: "ИП-006",
      buyer: "Бакыт Сыдыков",
      price: "7391000.00",
      downPayment: "2217000.00",
      downPct: 30.0,
      amount: "5174000.00",
      term: 15,
      status: "approved",
      banks: [
        { bankId: 1, name: "Оптима Банк", status: "approved", rate: 16.5 },
        { bank: { id: 3, name: "KICB" }, status: "review" },
      ],
      bankChosen: { id: 1, name: "Оптима Банк" },
      docs: [{ id: 21, name: "Паспорт", ok: true }],
    });
    expect(app.amount).toBe(5_174_000);
    expect(app.banks.map((b) => [b.bankId, b.name, b.rate])).toEqual([
      [1, "Оптима Банк", 16.5],
      [3, "KICB", null],
    ]);
    expect(app.bankChosen).toBe(1);
    expect(app.docs[0]).toEqual({ id: 21, name: "Паспорт", ok: true, fileUrl: "" });
  });
});

describe("matchesApplication", () => {
  const app = fromRawApplication({ id: 1, number: "ИП-006", buyer: "Бакыт Сыдыков", projectName: "Ордо Park", unitNumber: 604, manager: "Дмитрий Орлов" });
  it("номер, покупатель, ЖК, квартира", () => {
    expect(matchesApplication(app, "ип-006")).toBe(true);
    expect(matchesApplication(app, "бакыт")).toBe(true);
    expect(matchesApplication(app, "604")).toBe(true);
    expect(matchesApplication(app, "ала-тоо")).toBe(false);
  });
});
