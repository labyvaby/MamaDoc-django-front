import { describe, expect, it } from "vitest";

import type { Expense } from "../api/expenses";
import type { HotelStaffShift } from "../api/hotel";
import { advancesFromExpenses, computePayroll, findShiftOverlaps } from "./hotelStaffPayroll";

/** Смена дня `date` 09:00–21:00, если время не задано явно. */
const shift = (over: Partial<HotelStaffShift>): HotelStaffShift => ({
  id: 1,
  propertyId: 7,
  postId: 1,
  postName: "1 этаж",
  role: "housekeeping",
  date: "2026-09-01",
  employeeId: 17,
  employeeName: "Мунара",
  startsAt: "2026-09-01T09:00:00+06:00",
  endsAt: "2026-09-01T21:00:00+06:00",
  rate: "2000.00",
  status: "planned",
  note: "",
  ...over,
  ...(over.date && !over.startsAt ? { startsAt: `${over.date}T09:00:00+06:00`, endsAt: `${over.date}T21:00:00+06:00` } : {}),
});

describe("computePayroll", () => {
  it("смены по ролям, начислено по ставкам, аванс и к выплате — как в таблице отеля", () => {
    const result = computePayroll(
      [
        shift({ id: 1 }),
        shift({ id: 2, date: "2026-09-02" }),
        shift({ id: 3, postName: "Кухня", role: "kitchen", date: "2026-09-08" }),
        shift({ id: 4, employeeId: 42, employeeName: "Биймырза", role: "reception", rate: "3000.00" }),
        shift({ id: 5, employeeId: 42, employeeName: "Биймырза", role: "reception", rate: "3000.00", status: "absent" }),
      ],
      new Map([
        [17, 4000],
        [42, 5000],
      ]),
      new Map(),
    );
    expect(result.rows).toEqual([
      { employeeId: 17, name: "Мунара", byRole: { housekeeping: 2, kitchen: 1 }, shifts: 3, earned: 6000, advance: 4000, toPay: 2000, overlapShifts: 0, overlapAmount: 0 },
      { employeeId: 42, name: "Биймырза", byRole: { reception: 1 }, shifts: 1, earned: 3000, advance: 5000, toPay: -2000, overlapShifts: 0, overlapAmount: 0 },
    ]);
    expect(result.totals).toEqual({ shifts: 4, earned: 9000, advance: 9000, toPay: 0 });
    expect(result.roles).toEqual(["housekeeping", "kitchen", "reception"]);
  });

  it("аванс без смен в месяце — строка с долгом сотрудника", () => {
    const result = computePayroll([], new Map([[5, 1000]]), new Map([[5, "Анара"]]));
    expect(result.rows).toEqual([{ employeeId: 5, name: "Анара", byRole: {}, shifts: 0, earned: 0, advance: 1000, toPay: -1000, overlapShifts: 0, overlapAmount: 0 }]);
  });
});

describe("пересечения смен", () => {
  it("два поста в одни часы — внахлёст; ночная до 09:00 и дневная с 09:00 — нет; «не вышел» не считается", () => {
    const shifts = [
      shift({ id: 1, date: "2026-10-03" }),
      shift({ id: 2, postId: 3, postName: "3 этаж", date: "2026-10-03" }),
      shift({ id: 3, postId: 5, postName: "Ресепшн", date: "2026-10-04", startsAt: "2026-10-04T21:00:00+06:00", endsAt: "2026-10-05T09:00:00+06:00" }),
      shift({ id: 4, date: "2026-10-05" }),
      shift({ id: 5, postId: 3, date: "2026-10-05", status: "absent" }),
    ];
    const overlaps = findShiftOverlaps(shifts);
    expect([...overlaps.keys()].sort()).toEqual([1, 2]);
    expect(overlaps.get(1)?.map((s) => s.postName)).toEqual(["3 этаж"]);
    const row = computePayroll(shifts, new Map(), new Map(), Date.parse("2026-11-01T00:00:00+06:00")).rows[0];
    expect([row.shifts, row.earned, row.overlapShifts, row.overlapAmount]).toEqual([4, 8000, 1, 2000]);
  });
});

describe("что начисляется", () => {
  it("будущие запланированные смены месяца ещё не начислены, «отработал» — да", () => {
    const now = Date.parse("2026-10-03T12:00:00+06:00");
    const shifts = [
      shift({ id: 1, date: "2026-10-02" }),
      shift({ id: 2, date: "2026-10-03" }),
      shift({ id: 3, date: "2026-10-04" }),
      shift({ id: 4, date: "2026-10-03", postId: 9, status: "worked", startsAt: "2026-10-03T00:00:00+06:00", endsAt: "2026-10-03T08:00:00+06:00" }),
    ];
    const row = computePayroll(shifts, new Map(), new Map(), now).rows[0];
    expect([row.shifts, row.earned]).toEqual([2, 4000]);
  });
});

describe("advancesFromExpenses", () => {
  it("только категория «Аванс» на сотрудника, без аннулированных", () => {
    const e = (over: Partial<Expense>) => ({ id: 1, amount: "0", categoryKind: "general", employeeId: null, isVoided: false, ...over }) as Expense;
    const map = advancesFromExpenses([
      e({ amount: "3000", categoryKind: "advance", employeeId: 17 }),
      e({ amount: "1500", categoryKind: "advance", employeeId: 17 }),
      e({ amount: "999", categoryKind: "advance", employeeId: 17, isVoided: true }),
      e({ amount: "880", categoryKind: "general", employeeId: 17 }),
      e({ amount: "500", categoryKind: "advance", employeeId: null }),
    ]);
    expect([...map]).toEqual([[17, 4500]]);
  });
});
