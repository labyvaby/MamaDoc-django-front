import { describe, expect, it } from "vitest";

import type { Expense } from "../api/expenses";
import type { HotelStaffShift } from "../api/hotel";
import { advancesFromExpenses, computePayroll } from "./hotelStaffPayroll";

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
      { employeeId: 17, name: "Мунара", byRole: { housekeeping: 2, kitchen: 1 }, shifts: 3, earned: 6000, advance: 4000, toPay: 2000 },
      { employeeId: 42, name: "Биймырза", byRole: { reception: 1 }, shifts: 1, earned: 3000, advance: 5000, toPay: -2000 },
    ]);
    expect(result.totals).toEqual({ shifts: 4, earned: 9000, advance: 9000, toPay: 0 });
    expect(result.roles).toEqual(["housekeeping", "kitchen", "reception"]);
  });

  it("аванс без смен в месяце — строка с долгом сотрудника", () => {
    const result = computePayroll([], new Map([[5, 1000]]), new Map([[5, "Анара"]]));
    expect(result.rows).toEqual([{ employeeId: 5, name: "Анара", byRole: {}, shifts: 0, earned: 0, advance: 1000, toPay: -1000 }]);
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
