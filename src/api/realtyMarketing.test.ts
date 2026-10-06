import { describe, expect, it } from "vitest";

import { campaignBody, fromRawSummary } from "./realtyMarketing";

describe("fromRawSummary", () => {
  it("демо без кампаний: деньги строками, null у цены заявки и ROMI сохраняется", () => {
    const s = fromRawSummary({
      dateFrom: "2026-09-06",
      dateTo: "2026-10-05",
      budget: "0.00",
      leads: 22,
      leadsChangePct: null,
      costPerLead: null,
      romi: null,
      campaigns: 0,
      channels: [{ source: "Instagram", leads: 5, deals: 0, spend: "612000.00", conversion: 0.0, revenue: "0.00", costPerLead: "122400.00", romi: -100.0 }],
    });
    expect(s.budget).toBe(0);
    expect(s.costPerLead).toBeNull();
    expect(s.romi).toBeNull();
    expect(s.channels[0]).toMatchObject({ spend: 612_000, costPerLead: 122_400, romi: -100 });
  });
});

describe("campaignBody", () => {
  it("пустые даты и заметку не шлём — бэк поставит сегодня и однодневную", () => {
    expect(campaignBody({ name: " Instagram осень ", source: "Instagram", budget: "612000", startDate: null, endDate: null, note: " " })).toEqual({
      name: "Instagram осень",
      source: "Instagram",
      budget: "612000",
    });
  });
});
