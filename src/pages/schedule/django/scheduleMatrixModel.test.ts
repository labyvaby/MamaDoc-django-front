import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import type { ScheduleConflictAppointment, ScheduleException, ScheduleRule } from "../../../api/scheduling";
import {
  appointmentsLosingCoverage,
  buildWeekCells,
  cellsOf,
  employeeIssue,
  exceptionDetails,
  exceptionWhen,
  hh,
  hourPresets,
  issueRank,
  mondayOf,
  periodPresets,
  shortName,
  visitsOutOfSchedule,
  workingDaysInRange,
} from "./scheduleMatrixModel";
import { buildEmployeeSchedules, groupExceptions } from "./scheduleSettingsModel";

// Неделя 21.09–27.09.2026, «сегодня» — среда 23.09.
const TODAY = "2026-09-23";
const MONDAY = dayjs("2026-09-21");

const rule = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id: 1,
  employeeId: 10,
  employeeName: "Асанова Айгерим Бакытовна",
  branchId: 1,
  branchName: "Центр",
  dateFrom: "2026-01-01",
  dateTo: "2026-12-31",
  weekdays: [0, 1, 2, 3, 4],
  startTime: "09:00",
  endTime: "17:00",
  lunchStart: "13:00",
  lunchEnd: "14:00",
  comment: "",
  isActive: true,
  ...over,
});

const exc = (over: Partial<ScheduleException> = {}): ScheduleException => ({
  id: 100,
  employeeId: 10,
  employeeName: "Асанова Айгерим Бакытовна",
  branchId: 1,
  branchName: "Центр",
  date: "2026-09-24",
  kind: "day_off",
  startTime: null,
  endTime: null,
  comment: "",
  groupId: null,
  ...over,
});

describe("hh / shortName / mondayOf", () => {
  it("срезает нулевые минуты, оставляет половинки", () => {
    expect(hh("09:00")).toBe("09");
    expect(hh("15:30")).toBe("15:30");
  });
  it("Фамилия Имя без отчества", () => {
    expect(shortName("Асанова Айгерим Бакытовна")).toBe("Асанова Айгерим");
  });
  it("понедельник недели", () => {
    expect(mondayOf(dayjs(TODAY)).format("YYYY-MM-DD")).toBe("2026-09-21");
    expect(mondayOf(dayjs("2026-09-27")).format("YYYY-MM-DD")).toBe("2026-09-21");
  });
});

describe("buildWeekCells", () => {
  it("смена по графику, выходной, разовая смена и пустой день", () => {
    const cells = buildWeekCells(
      MONDAY,
      [rule()],
      [
        exc(), // чт 24.09 — выходной
        exc({ id: 101, date: "2026-09-26", kind: "extra", startTime: "10:00", endTime: "14:00" }),
        exc({ id: 102, date: "2026-09-25", kind: "override", startTime: "10:00", endTime: "15:30" }),
      ],
    );
    const row = cellsOf(cells, 10, MONDAY);
    expect(row[0]).toMatchObject({ variant: "shift", label: "09–17", sub: "обед 13", compact: "09\n17" });
    expect(row[3]).toMatchObject({ variant: "absence", label: "Выходной", compact: "вых." });
    expect(row[4]).toMatchObject({ variant: "oneoff", label: "10–15:30", sub: "замена" });
    expect(row[5]).toMatchObject({ variant: "oneoff", label: "10–14", sub: "разово" });
    expect(row[6]).toMatchObject({ variant: "empty", label: "—" });
    expect(row[0].aria).toBe("Понедельник 21.09: 09:00–17:00, обед 13:00–14:00");
  });

  it("два правила в день — через « · », отпуск важнее выходного", () => {
    const cells = buildWeekCells(
      MONDAY,
      [rule({ weekdays: [0], endTime: "13:00", lunchStart: null, lunchEnd: null }), rule({ id: 2, weekdays: [0], startTime: "15:00", endTime: "18:00", lunchStart: null, lunchEnd: null })],
      [exc({ date: "2026-09-22", kind: "day_off" }), exc({ id: 2, date: "2026-09-22", kind: "vacation" })],
    );
    const row = cellsOf(cells, 10, MONDAY);
    expect(row[0].label).toBe("09–13 · 15–18");
    expect(row[1].label).toBe("Отпуск");
  });

  it("смены другого филиала заполняют только пустые дни", () => {
    const own = rule({ weekdays: [0, 1], branchId: 13, branchName: "Мама Доктор Плюс" });
    const other = rule({ id: 2, weekdays: [1, 2], startTime: "10:00", endTime: "16:00", lunchStart: null, lunchEnd: null, branchId: 1, branchName: "Мама Доктор" });
    const row = cellsOf(
      buildWeekCells(MONDAY, [own], [exc({ date: "2026-09-24", branchId: 13 })], { rules: [other], exceptions: [] }),
      10,
      MONDAY,
    );
    expect(row[1].variant).toBe("shift"); // вт: своя смена важнее
    expect(row[2]).toMatchObject({ variant: "elsewhere", label: "10–16", sub: "Мама Доктор" });
    expect(row[3].variant).toBe("absence"); // чт: свой выходной
    expect(row[2].aria).toBe("Среда 23.09: 10:00–16:00, в филиале «Мама Доктор»");
  });

  it("сотрудник без смен — пустая неделя", () => {
    expect(cellsOf(new Map(), 99, MONDAY).every((c) => c.variant === "empty")).toBe(true);
  });
});

describe("employeeIssue", () => {
  const scheduleOf = (rules: ScheduleRule[], exceptions: ScheduleException[] = []) =>
    buildEmployeeSchedules(rules, exceptions, TODAY)[0];

  it("записи без разбора важнее конца графика", () => {
    const s = scheduleOf(
      [rule({ dateTo: "2026-10-15" })],
      [
        exc({ id: 1, date: "2026-10-06", kind: "vacation", groupId: "g" }),
        exc({ id: 2, date: "2026-10-07", kind: "vacation", groupId: "g" }),
      ],
    );
    const issue = employeeIssue(s, () => 2);
    expect(issue).toMatchObject({ tone: "error", actionLabel: "Разобрать" });
    expect(issue?.text).toBe("Отпуск 06.10–07.10: 2 записи пациентов без разбора");
  });

  it("график заканчивается → продлить самое позднее правило", () => {
    const s = scheduleOf([rule({ dateTo: "2026-10-15" }), rule({ id: 2, dateTo: "2026-10-01" })]);
    const issue = employeeIssue(s, () => 0);
    expect(issue?.tone).toBe("warning");
    expect(issue?.text).toBe("График заканчивается 15.10 — после этого окон для записи не будет");
    expect(issue?.action).toMatchObject({ kind: "extend", rule: { id: 1 } });
  });

  it("графика нет → neutral; всё в порядке → null", () => {
    expect(employeeIssue(scheduleOf([rule({ dateTo: "2026-01-31" })]), () => 0)?.tone).toBe("neutral");
    expect(employeeIssue(scheduleOf([rule()]), () => 0)).toBeNull();
  });

  it("ранг сортировки", () => {
    expect(issueRank({ tone: "error" } as never)).toBeLessThan(issueRank({ tone: "warning" } as never));
    expect(issueRank({ tone: "warning" } as never)).toBeLessThan(issueRank(null));
    expect(issueRank(null)).toBeLessThan(issueRank({ tone: "neutral" } as never));
  });
});

describe("подписи исключений", () => {
  it("день и период", () => {
    const [single, period] = groupExceptions([
      exc({ id: 1, date: "2026-09-25" }),
      exc({ id: 2, date: "2026-10-06", kind: "vacation", groupId: "g" }),
      exc({ id: 3, date: "2026-10-19", kind: "vacation", groupId: "g" }),
    ]);
    expect(exceptionWhen(single)).toBe("25.09, пт");
    expect(exceptionDetails(single)).toBe("весь день");
    expect(exceptionWhen(period)).toBe("06.10 – 19.10");
    expect(exceptionDetails(period)).toBe("14 дней");
  });
});

describe("periodPresets", () => {
  it("create: от начала минус день, конец года между полугодом и годом", () => {
    expect(periodPresets("2026-09-23", "create")).toEqual([
      { label: "3 мес", value: "2026-12-22" },
      { label: "6 мес", value: "2027-03-22" },
      { label: "До конца года", value: "2026-12-31" },
      { label: "1 год", value: "2027-09-22" },
    ]);
  });
  it("extend: от старого конца ровно на срок", () => {
    expect(periodPresets("2026-10-15", "extend").find((p) => p.label === "1 год")?.value).toBe("2027-10-15");
  });
  it("31 декабря — без «До конца года»", () => {
    expect(periodPresets("2026-12-31", "extend").map((p) => p.label)).toEqual(["3 мес", "6 мес", "1 год"]);
  });
});

describe("workingDaysInRange", () => {
  it("только дни по графику сотрудника", () => {
    expect(workingDaysInRange(10, "2026-09-25", "2026-09-29", [rule()], [])).toEqual([
      "2026-09-25",
      "2026-09-28",
      "2026-09-29",
    ]);
    expect(workingDaysInRange(11, "2026-09-25", "2026-09-29", [rule()], [])).toEqual([]);
  });
});

describe("hourPresets", () => {
  it("частые часы организации впереди, добивка типовыми без повторов", () => {
    const presets = hourPresets([
      rule({ startTime: "08:00", endTime: "17:00" }),
      rule({ id: 2, startTime: "10:00", endTime: "19:00" }),
      rule({ id: 3, startTime: "10:00", endTime: "19:00" }),
    ]);
    // 10–19 у двух правил — частые; 08–17 у одного — идёт уже как типовой.
    expect(presets).toEqual([
      { start: "10:00", end: "19:00" },
      { start: "09:00", end: "18:00" },
      { start: "08:00", end: "17:00" },
      { start: "09:00", end: "17:00" },
    ]);
  });
});

describe("appointmentsLosingCoverage", () => {
  const appt = (startsAt: string, over: Partial<ScheduleConflictAppointment> = {}): ScheduleConflictAppointment => ({
    id: 1,
    startsAt,
    endsAt: startsAt,
    status: "scheduled",
    branchId: 1,
    branchName: "Центр",
    patientId: 5,
    patientName: "Иванова Анна",
    patientPhone: "",
    services: [],
    paidTotal: "0",
    isPerformerPrimary: true,
    absenceReviewedAt: null,
    absenceReviewedBy: null,
    ...over,
  });

  it("сузили часы — вечерние записи выпадают, утренние нет", () => {
    const before = [rule()]; // 09–17
    const after = [rule({ endTime: "14:00" })];
    const lost = appointmentsLosingCoverage(
      [appt("2026-09-24T10:00:00"), appt("2026-09-24T15:30:00", { id: 2 })],
      before,
      after,
      [],
    );
    expect(lost.map((a) => a.id)).toEqual([2]);
  });

  it("убрали день и удалили правило", () => {
    const thu = appt("2026-09-24T10:00:00");
    expect(appointmentsLosingCoverage([thu], [rule()], [rule({ weekdays: [0, 1, 2, 4] })], [])).toHaveLength(1);
    expect(appointmentsLosingCoverage([thu], [rule()], [], [])).toHaveLength(1);
  });

  it("запись, которая и так была вне графика, не считается", () => {
    const sat = appt("2026-09-26T10:00:00");
    expect(appointmentsLosingCoverage([sat], [rule()], [], [])).toEqual([]);
  });

  it("перенос правила в другой филиал оставляет записи старого вне графика", () => {
    const a = appt("2026-09-24T10:00:00", { branchId: 1 });
    expect(appointmentsLosingCoverage([a], [rule()], [rule({ branchId: 2 })], [])).toHaveLength(1);
    expect(appointmentsLosingCoverage([a], [rule()], [rule({ branchId: null })], [])).toHaveLength(0);
  });

  it("разовая смена того дня продолжает покрывать запись", () => {
    const a = appt("2026-09-24T10:00:00");
    const extra = exc({ date: "2026-09-24", kind: "extra", startTime: "09:00", endTime: "13:00" });
    expect(appointmentsLosingCoverage([a], [rule()], [], [extra])).toEqual([]);
  });
});

describe("visitsOutOfSchedule", () => {
  it("глагол согласуется с числом", () => {
    expect(visitsOutOfSchedule(1)).toBe("1 запись окажется вне графика");
    expect(visitsOutOfSchedule(3)).toBe("3 записи окажутся вне графика");
    expect(visitsOutOfSchedule(11)).toBe("11 записей окажутся вне графика");
  });
});
