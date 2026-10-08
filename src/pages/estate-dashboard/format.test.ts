import { describe, expect, it } from "vitest";

import { focusHref } from "./format";

describe("focusHref", () => {
  const item = (patch: Partial<Parameters<typeof focusHref>[0]>) => ({ code: "", view: "", leadId: null, billingAccountId: null, ...patch });

  it("заявка — карточка лида, в том числе из просроченной задачи («today» с leadId)", () => {
    expect(focusHref(item({ code: "new-lead", view: "leads", leadId: 12 }))).toBe("/realestate/leads?lead=12");
    expect(focusHref(item({ code: "overdue-tasks", view: "today", leadId: 3 }))).toBe("/realestate/leads?lead=3");
    expect(focusHref(item({ code: "overdue-tasks", view: "today" }))).toBe("/realestate/today");
  });

  it("счёт — биллинг с открытым счётом, сделки без дела — фильтр лидов", () => {
    expect(focusHref(item({ code: "billing-overdue", view: "billing", billingAccountId: 5 }))).toBe("/finance/billing?account=5");
    expect(focusHref(item({ code: "no-next-step", view: "leads" }))).toBe("/realestate/leads?filter=notask");
    expect(focusHref(item({ code: "shows-today", view: "showings" }))).toBe("/realestate/today");
    expect(focusHref(item({ code: "reservation-expiring", view: "booking" }))).toBe("/realestate/deals");
    expect(focusHref(item({ view: "unknown" }))).toBeNull();
  });
});
