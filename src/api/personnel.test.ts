import { describe, expect, it } from "vitest";

import { employeeBody, fromRawCard, fromRawEmployee, fromRawStaffing, fromRawSummary, fromRawTimesheet, fromRawVacancy, isWeekend, nextMark, tenure } from "./personnel";
import { fromRawPayslip, fromRawRun, payrollActions, previousMonth } from "./salaryPayroll";

describe("кадры", () => {
  it("сводка: ФОТ числом", () => {
    expect(fromRawSummary({ employees: 33, departments: 11, payrollFund: "3903000.00", absentToday: 2 })).toMatchObject({ employees: 33, payrollFund: 3_903_000, absentToday: 2, timesheetClosed: false });
  });

  it("сотрудник: оклад null у технической учётки", () => {
    expect(fromRawEmployee({ id: 40, name: "ben_dev", salary: null, vacationLeft: null })).toMatchObject({ salary: null, vacationLeft: 0, position: "", projectName: "" });
    expect(fromRawEmployee({ id: 3, salary: "95000.00" }).salary).toBe(95_000);
  });

  it("карточка: сотрудник внутри, события, месяц", () => {
    const c = fromRawCard({ employee: { id: 30, name: "Тимур" }, headName: "Бекзат", events: [{ id: 2, type: "note", text: "x" }], currentMonth: { worked: 3, workdays: 22 } });
    expect(c.employee.name).toBe("Тимур");
    expect(c.headName).toBe("Бекзат");
    expect(c.events).toHaveLength(1);
    expect(c.currentMonth).toMatchObject({ worked: 3, workdays: 22, vacation: 0 });
    expect(c.documents).toEqual([]);
  });

  it("табель: отметки по строковым дням, null-отметки отброшены, СКУД", () => {
    const ts = fromRawTimesheet({
      month: "2026-10",
      days: 31,
      rows: [{ employeeId: 3, marks: { 1: "Я", 2: null, 3: "В" }, acsDays: [1, 5], acsTimes: { 5: { checkIn: "08:55", checkOut: null } } }],
    });
    expect(ts.rows[0].marks).toEqual({ "1": "Я", "3": "В" });
    expect(ts.rows[0].acsDays).toEqual([1, 5]);
    expect(ts.rows[0].acsTimes["5"]).toEqual({ checkIn: "08:55", checkOut: null });
  });

  it("тело приёма без пустых полей", () => {
    expect(employeeBody({ name: " Айбек ", position: "Прораб", hired: "2026-10-06", deptId: null, projectId: 1, salary: "", phone: "", email: "", birthday: null, probation: true })).toEqual({
      name: "Айбек",
      position: "Прораб",
      hired: "2026-10-06",
      probation: true,
      projectId: 1,
    });
  });

  it("отметки по кругу", () => {
    expect(nextMark(undefined)).toBe("Я");
    expect(nextMark("Я")).toBe("В");
    expect(nextMark("Н")).toBe("Я");
  });

  it("стаж и выходные", () => {
    expect(tenure("2022-02-14", new Date(2026, 9, 6))).toEqual({ years: 4, months: 7 });
    expect(tenure("2026-10-07", new Date(2026, 9, 6))).toEqual({ years: 0, months: 0 });
    expect(tenure(null)).toBeNull();
    expect(isWeekend("2026-10", 3)).toBe(true); // суббота
    expect(isWeekend("2026-10", 5)).toBe(false);
  });
});

describe("зарплата", () => {
  it("ведомость и прогноз", () => {
    const run = fromRawRun({ id: 1, month: "2026-09", status: "paid", totals: { gross: "4869727.00", net: "3946429.00", employeesCount: 33 }, rows: [{ employeeId: 3, employeeName: "Анна", net: "264935.00" }] });
    expect(run).toMatchObject({ id: 1, status: "paid" });
    expect(run.totals).toMatchObject({ gross: 4_869_727, net: 3_946_429, employeesCount: 33 });
    expect(run.rows[0].net).toBe(264_935);
    const preview = fromRawRun({ month: "2026-10", runId: null, totals: {} }, true);
    expect(preview).toMatchObject({ id: null, status: "preview" });
  });

  it("расчётный листок", () => {
    expect(fromRawPayslip({ employeeId: 30, name: "Тимур", source: "payroll", net: "222410.00", withheld: "52090.00" })).toMatchObject({ name: "Тимур", employeeName: "Тимур", net: 222_410, withheld: 52_090 });
  });

  it("кнопки по статусу ведомости", () => {
    expect(payrollActions("preview")).toEqual(["calculate"]);
    expect(payrollActions("calculated")).toEqual(["recalculate", "approve"]);
    expect(payrollActions("approved")).toEqual(["pay"]);
    expect(payrollActions("paid")).toEqual([]);
  });

  it("прошлый месяц через год", () => {
    expect(previousMonth(new Date(2026, 9, 6))).toBe("2026-09");
    expect(previousMonth(new Date(2026, 0, 15))).toBe("2025-12");
  });
});

describe("штатное расписание и вакансии (test2, demo.hr 08.10)", () => {
  it("разбирает штатное: деньги — числа, занятые — из сотрудников", () => {
    const staffing = fromRawStaffing({
      totals: { positions: 27, headcount: 33, filled: 30, vacant: 3, over: 0, fund: "4186000.00", openVacancies: 3, unassigned: 3 },
      departments: [
        {
          deptId: 2,
          deptName: "Отдел продаж",
          headcount: 7,
          filled: 6,
          vacant: 1,
          fund: "778000.00",
          positions: [
            {
              id: 4,
              title: "Менеджер продаж",
              deptId: 2,
              deptName: "Отдел продаж",
              branchId: null,
              branchName: null,
              headcount: 4,
              salary: "95000.00",
              fund: "380000.00",
              filled: 3,
              vacant: 1,
              over: 0,
              inRecruitment: 1,
              employees: [{ id: 3, name: "Анна Котова", status: "active" }],
              note: "",
              sortOrder: 3,
            },
          ],
        },
      ],
    });
    expect(staffing.totals).toMatchObject({ positions: 27, headcount: 33, filled: 30, vacant: 3, fund: 4_186_000, unassigned: 3 });
    const p = staffing.departments[0].positions[0];
    expect(p).toMatchObject({ salary: 95_000, fund: 380_000, vacant: 1, inRecruitment: 1, branchName: "" });
    expect(p.employees[0].name).toBe("Анна Котова");
    expect(fromRawStaffing({}).departments).toEqual([]);
  });

  it("вакансия: тон и подпись бэка, оклад числом", () => {
    const v = fromRawVacancy({ id: 2, positionId: 4, title: "Менеджер продаж", deptId: 2, deptName: "Отдел продаж", openings: 1, hired: 0, status: "screening", statusLabel: "отбор", tone: "amber", isOpen: true, candidates: 0, responses: 11, countLabel: "11 откликов", salary: "95000.00", note: "", openedAt: "2026-09-26", closedAt: null });
    expect(v).toMatchObject({ positionId: 4, salary: 95_000, isOpen: true, tone: "amber", responses: 11 });
  });

  it("штатная единица уходит в тело приёма", () => {
    const body = employeeBody({ name: " Тест ", position: "Электрик", hired: "2026-10-08", deptId: 10, projectId: null, salary: "70000", phone: "", email: "", birthday: null, probation: true, staffingPositionId: 26 });
    expect(body).toMatchObject({ name: "Тест", staffingPositionId: 26 });
    expect(employeeBody({ name: "Тест", position: "", hired: "2026-10-08", deptId: null, projectId: null, salary: "", phone: "", email: "", birthday: null, probation: false })).not.toHaveProperty("staffingPositionId");
  });
});
