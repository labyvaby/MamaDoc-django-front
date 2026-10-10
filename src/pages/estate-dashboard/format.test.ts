import { describe, expect, it } from "vitest";

import { focusHref } from "./format";

describe("focusHref", () => {
  const item = (patch: Partial<Parameters<typeof focusHref>[0]>) => ({ code: "", view: "", leadId: null, billingAccountId: null, ...patch });

  it("заявка — карточка лида, в том числе из просроченной задачи («today» с leadId)", () => {
    expect(focusHref(item({ code: "new-lead", view: "leads", leadId: 12 }))).toBe("/realestate/leads?lead=12");
    expect(focusHref(item({ code: "overdue-tasks", view: "today", leadId: 3 }))).toBe("/realestate/leads?lead=3");
    expect(focusHref(item({ code: "overdue-tasks", view: "today" }))).toBe("/realestate/today");
  });

  it("задача без заявки — «Мой день» на её дату с подсветкой", () => {
    expect(focusHref(item({ code: "overdue-tasks", view: "today", taskId: 10, date: "2026-10-09" }))).toBe("/realestate/today?date=2026-10-09&task=10");
    expect(focusHref(item({ code: "shows-today", view: "today", taskId: 12, date: "2026-10-09" }))).toBe("/realestate/today?date=2026-10-09&task=12");
    // Показы дня — всегда «Мой день», хотя бэк кладёт leadId ближайшего показа.
    expect(focusHref(item({ code: "shows-today", view: "today", leadId: 26, taskId: 23, date: "2026-10-10" }))).toBe("/realestate/today?date=2026-10-10&task=23");
  });

  it("счёт — биллинг с открытым счётом, сделки без дела — фильтр лидов", () => {
    expect(focusHref(item({ code: "billing-overdue", view: "billing", billingAccountId: 5 }))).toBe("/finance/billing?account=5");
    expect(focusHref(item({ code: "no-next-step", view: "leads" }))).toBe("/realestate/leads?filter=notask");
    expect(focusHref(item({ code: "shows-today", view: "showings" }))).toBe("/realestate/today");
    expect(focusHref(item({ code: "reservation-expiring", view: "booking" }))).toBe("/realestate/deals");
    expect(focusHref(item({ view: "unknown" }))).toBeNull();
  });
});
