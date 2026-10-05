import { describe, expect, it } from "vitest";

import { realtyTaskStats, type RealtyTaskItem } from "./realtyTasks";

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
