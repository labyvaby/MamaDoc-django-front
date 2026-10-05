import { describe, expect, it } from "vitest";

import { fromRawPartner, parseAgents, rateRange } from "./realtyPartners";

describe("fromRawPartner", () => {
  it("ставки по ЖК числами, деньги строками → числа, агенты строками", () => {
    const p = fromRawPartner({
      id: 1,
      name: "АН «Кыргыз Недвижимость»",
      agents: ["Гульнара Ташиева", { name: "Асель" }],
      commission: { "1": 2.5, "2": "2.0", "3": 3 },
      commissionTotal: "437400.00",
      toPay: "182400.00",
      rateMin: 2.0,
      rateMax: 3.0,
      hasUnpaid: true,
    });
    expect(p.agents).toEqual(["Гульнара Ташиева", "Асель"]);
    expect(p.commission).toEqual({ "1": 2.5, "2": 2, "3": 3 });
    expect(p.toPay).toBe(182_400);
  });
});

describe("rateRange", () => {
  it("диапазон из ответа бэка, одна ставка — без тире, нет ставок — прочерк", () => {
    expect(rateRange({ rateMin: 2, rateMax: 3, commission: {} })).toBe("2–3 %");
    expect(rateRange({ rateMin: null, rateMax: null, commission: { "1": 1.5 } })).toBe("1,5 %");
    expect(rateRange({ rateMin: null, rateMax: null, commission: {} })).toBe("—");
  });
});

describe("parseAgents", () => {
  it("через запятую и с новой строки, пустые выкидываются", () => {
    expect(parseAgents("Гульнара, Асель , ,\nБакыт")).toEqual(["Гульнара", "Асель", "Бакыт"]);
  });
});
