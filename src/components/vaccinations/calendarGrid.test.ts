import { describe, expect, it } from "vitest";
import type { CalendarCell, CalendarGroup } from "../../api/vaccinations";
import { calendarSummary, cellActionable, cellCaption } from "./calendarGrid";

const cell = (over: Partial<CalendarCell>): CalendarCell => ({
  templateId: 1,
  vaccineId: 1,
  vaccineName: "бОПВ",
  doseNumber: 1,
  dueDate: "2026-07-10",
  windowEnd: "2026-08-09",
  state: "planned",
  record: null,
  slotId: null,
  exemptionUntil: null,
  exemptionKind: null,
  refusalDate: null,
  refusalReason: null,
  ...over,
});

describe("cellCaption", () => {
  it("по состоянию", () => {
    expect(cellCaption(cell({ state: "planned" }))).toBe("10.07.2026");
    expect(cellCaption(cell({ state: "due" }))).toBe("до 09.08.2026");
    expect(
      cellCaption(
        cell({
          state: "done",
          record: { id: 1, administeredAt: "2026-07-15T10:00:00Z", isExternal: false, status: "pending" },
        }),
      ),
    ).toBe("15.07.2026");
    expect(cellCaption(cell({ state: "exempt" }))).toBe("постоянный");
    expect(cellCaption(cell({ state: "exempt", exemptionUntil: "2026-09-01" }))).toBe("до 01.09.2026");
  });
});

describe("cellActionable / calendarSummary", () => {
  it("сделанные — без действий, сводка считает по состояниям", () => {
    expect(cellActionable(cell({ state: "done" }))).toBe(false);
    expect(cellActionable(cell({ state: "overdue" }))).toBe(true);
    const groups: CalendarGroup[] = [
      { label: "2 месяца", ageDays: 61, cells: [cell({ state: "done" }), cell({ state: "overdue" })] },
      { label: "5 месяцев", ageDays: 152, cells: [cell({ state: "due" }), cell({ state: "planned" })] },
    ];
    expect(calendarSummary(groups)).toEqual({ done: 1, due: 1, overdue: 1, total: 4 });
  });
});
