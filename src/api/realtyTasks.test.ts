import { describe, expect, it } from "vitest";

import { fromRawFocus, realtyTaskStats, type RealtyTaskItem } from "./realtyTasks";

const task = (patch: Partial<RealtyTaskItem>): RealtyTaskItem => ({
  id: 1,
  kind: "task",
  date: "2026-10-06",
  time: "10:00",
  text: "",
  meta: "",
  done: false,
  doneAt: null,
  status: "",
  statusLabel: "",
  overdue: false,
  leadId: null,
  leadClient: null,
  unitId: null,
  unitNumber: null,
  managerId: null,
  manager: null,
  ...patch,
});

describe("realtyTaskStats", () => {
  it("KPI «Мой день» по гайду: показы и встречи — по kind и только открытые, просрочка — без выполненных", () => {
    const stats = realtyTaskStats([
      task({ kind: "show" }),
      task({ kind: "meeting", done: true }),
      // Слово «показ» в тексте не делает задачу показом (макет считал по словам).
      task({ kind: "call", text: "Перезвонить после показа", overdue: true }),
      task({ kind: "task", overdue: true, done: true }),
    ]);
    expect(stats).toEqual({ total: 4, done: 2, visits: 1, overdue: 1 });
  });
});

describe("fromRawFocus", () => {
  it("разбирает «Фокус дня» (test2, demo.sales 08.10) и терпит пустой ответ", () => {
    const focus = fromRawFocus({
      date: "2026-10-08",
      scope: "mine",
      managerId: 3,
      canAct: true,
      items: [
        { code: "billing-overdue", tone: "red", icon: "▦", title: "Просрочка по рассрочке: 2", text: "…", count: 2, view: "billing", leadId: null, taskId: null, reservationId: null, billingAccountId: 5, amount: "404800.00", at: null },
        null,
      ],
    });
    expect(focus.canAct).toBe(true);
    expect(focus.items).toHaveLength(1);
    expect(focus.items[0]).toMatchObject({ code: "billing-overdue", billingAccountId: 5, amount: 404_800, leadId: null });
    expect(fromRawFocus({})).toEqual({ scope: "", canAct: false, items: [] });
  });
});
