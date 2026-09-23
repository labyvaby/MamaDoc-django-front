import { describe, expect, it } from "vitest";
import type { ScheduleException, ScheduleRule } from "../../../api/scheduling";
import {
  buildEmployeeSchedules,
  formatWeeklyHours,
  groupExceptions,
  ruleStatus,
  ruleWeeklyMinutes,
  weekdaysShort,
} from "./scheduleSettingsModel";

// 2026-09-23 — среда (weekday-индекс 2)
const TODAY = "2026-09-23";

const rule = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id: 1,
  employeeId: 10,
  employeeName: "Иванова Анна",
  branchId: 1,
  branchName: "Центр",
  dateFrom: "2026-01-01",
  dateTo: "2026-12-31",
  weekdays: [0, 1, 2, 3, 4],
  startTime: "09:00",
  endTime: "18:00",
  lunchStart: "13:00",
  lunchEnd: "14:00",
  comment: "",
  isActive: true,
  ...over,
});

const exc = (over: Partial<ScheduleException> = {}): ScheduleException => ({
  id: 100,
  employeeId: 10,
  employeeName: "Иванова Анна",
  branchId: 1,
  branchName: "Центр",
  date: TODAY,
  kind: "day_off",
  startTime: null,
  endTime: null,
  comment: "",
  groupId: null,
  ...over,
});

describe("ruleWeeklyMinutes", () => {
  it("вычитает обед", () => {
    expect(ruleWeeklyMinutes(rule())).toBe(5 * 8 * 60);
  });
  it("без обеда — вся смена", () => {
    expect(ruleWeeklyMinutes(rule({ lunchStart: null, lunchEnd: null, weekdays: [5] }))).toBe(9 * 60);
  });
});

describe("ruleStatus", () => {
  it("различает действующее, истекающее, будущее и закончившееся", () => {
    expect(ruleStatus(rule(), TODAY)).toBe("active");
    expect(ruleStatus(rule({ dateTo: "2026-10-10" }), TODAY)).toBe("expiring");
    expect(ruleStatus(rule({ dateFrom: "2026-10-01" }), TODAY)).toBe("upcoming");
    expect(ruleStatus(rule({ dateTo: "2026-09-22" }), TODAY)).toBe("ended");
    // Последний день правила — ещё действует.
    expect(ruleStatus(rule({ dateTo: TODAY }), TODAY)).toBe("expiring");
  });
});

describe("groupExceptions", () => {
  it("склеивает пачку периода в одну строку, одиночные — отдельно", () => {
    const items = groupExceptions([
      exc({ id: 3, date: "2026-10-03", kind: "vacation", groupId: "g1" }),
      exc({ id: 1, date: "2026-10-01", kind: "vacation", groupId: "g1" }),
      exc({ id: 2, date: "2026-10-02", kind: "vacation", groupId: "g1" }),
      exc({ id: 4, date: "2026-09-25" }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ dateFrom: "2026-09-25", dateTo: "2026-09-25", groupId: null });
    expect(items[1]).toMatchObject({ dateFrom: "2026-10-01", dateTo: "2026-10-03", groupId: "g1" });
    expect(items[1].days.map((d) => d.id)).toEqual([1, 2, 3]);
  });
});

describe("buildEmployeeSchedules", () => {
  it("одна карточка на сотрудника, часы только по действующим правилам", () => {
    const [card] = buildEmployeeSchedules(
      [
        rule({ id: 1 }),
        rule({ id: 2, weekdays: [5], startTime: "10:00", endTime: "14:00", lunchStart: null, lunchEnd: null }),
        rule({ id: 3, dateTo: "2026-06-30" }), // закончилось
      ],
      [],
      TODAY,
    );
    expect(card.rules.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(card.weeklyMinutes).toBe(40 * 60 + 4 * 60);
    expect(card.worksToday).toBe(true);
    expect(card.expiring).toBe(false);
    expect(card.noActiveRules).toBe(false);
  });

  it("выходной на весь день снимает «работает сегодня», частичный — нет", () => {
    const [full] = buildEmployeeSchedules([rule()], [exc()], TODAY);
    expect(full.worksToday).toBe(false);
    expect(full.absentToday).toBe(true);

    const [partial] = buildEmployeeSchedules(
      [rule()],
      [exc({ startTime: "14:00", endTime: "16:00" })],
      TODAY,
    );
    expect(partial.worksToday).toBe(true);
    expect(partial.absentToday).toBe(true);
  });

  it("истекает, только если нет продолжения", () => {
    const [alone] = buildEmployeeSchedules([rule({ dateTo: "2026-10-10" })], [], TODAY);
    expect(alone.expiring).toBe(true);

    const [continued] = buildEmployeeSchedules(
      [rule({ dateTo: "2026-10-10" }), rule({ id: 2, dateFrom: "2026-10-11", dateTo: "2027-10-10" })],
      [],
      TODAY,
    );
    expect(continued.expiring).toBe(false);
  });

  it("сотрудники без графика — в конце, внутри групп по ФИО", () => {
    const list = buildEmployeeSchedules(
      [rule(), rule({ id: 2, employeeId: 12, employeeName: "Жумабаева Аида" })],
      [],
      TODAY,
      [{ id: 11, fullName: "Абдыкадырова Айгуль" }],
    );
    expect(list.map((c) => c.employeeId)).toEqual([12, 10, 11]);
    expect(list[2].noActiveRules).toBe(true);
    expect(list[2].rules).toEqual([]);
  });
});

describe("weekdaysShort", () => {
  it("схлопывает подряд идущие дни от трёх", () => {
    expect(weekdaysShort([4, 0, 1, 2, 3])).toBe("Пн–Пт");
    expect(weekdaysShort([0, 1, 2, 4])).toBe("Пн–Ср, Пт");
    expect(weekdaysShort([5, 6])).toBe("Сб, Вс");
    expect(weekdaysShort([0, 2, 4])).toBe("Пн, Ср, Пт");
  });
});

describe("formatWeeklyHours", () => {
  it("целые без дробной части, половинки через запятую", () => {
    expect(formatWeeklyHours(38 * 60)).toBe("38 ч");
    expect(formatWeeklyHours(37 * 60 + 30)).toBe("37,5 ч");
  });
});
