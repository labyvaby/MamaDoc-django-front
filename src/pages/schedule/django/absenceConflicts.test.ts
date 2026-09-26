import { describe, expect, it } from "vitest";

import type { ScheduleConflictAppointment, ScheduleException } from "../../../api/scheduling";
import { buildAbsenceDays, collectAbsenceConflicts } from "./useAbsenceConflicts";

// Прод 19.09.2026, сотрудник 16: выходной в «Мама Доктор Плюс» (филиал 13),
// доп. смена 14:00–23:59 в «Мама Доктор» (филиал 1) и пять приёмов в ней.
const EMPLOYEE = 16;
const DATE = "2026-09-19";

const exc = (over: Partial<ScheduleException>): ScheduleException => ({
  id: 462,
  employeeId: EMPLOYEE,
  employeeName: "Джураева Б.",
  branchId: 13,
  branchName: "Мама Доктор Плюс",
  date: DATE,
  kind: "day_off",
  startTime: null,
  endTime: null,
  comment: "",
  ...over,
});

const appt = (id: number, start: string, branchId: number): ScheduleConflictAppointment => ({
  id,
  startsAt: `${DATE}T${start}:00+06:00`,
  endsAt: `${DATE}T${start}:00+06:00`,
  status: "confirmed",
  branchId,
  branchName: branchId === 1 ? "Мама Доктор" : "Мама Доктор Плюс",
  patientId: id,
  patientName: "Пациент",
  patientPhone: "+996700000000",
  services: [],
  paidTotal: "0.00",
  isPerformerPrimary: true,
  absenceReviewedAt: null,
  absenceReviewedBy: null,
});

const IN_BRANCH_1 = [
  appt(22085, "14:00", 1),
  appt(22095, "14:30", 1),
  appt(22107, "15:00", 1),
  appt(22121, "15:30", 1),
  appt(22113, "16:00", 1),
];

describe("buildAbsenceDays", () => {
  it("интервал отсутствия несёт филиал исключения", () => {
    const days = buildAbsenceDays([exc({})]);
    expect(days.get(`${EMPLOYEE}:${DATE}`)).toEqual([
      { startTime: null, endTime: null, branchId: 13 },
    ]);
  });

  it("рабочие исключения (extra/override) не считаются отсутствием", () => {
    const days = buildAbsenceDays([
      exc({ id: 534, branchId: 1, kind: "extra", startTime: "14:00", endTime: "23:59" }),
    ]);
    expect(days.size).toBe(0);
  });
});

describe("collectAbsenceConflicts", () => {
  it("выходной в филиале 13 не собирает приёмы из смены в филиале 1", () => {
    const conflicts = collectAbsenceConflicts(
      buildAbsenceDays([exc({})]),
      [[EMPLOYEE, IN_BRANCH_1]],
    );
    expect(conflicts.size).toBe(0);
  });

  it("выходной без филиала собирает приёмы отовсюду", () => {
    const conflicts = collectAbsenceConflicts(
      buildAbsenceDays([exc({ branchId: null, branchName: null })]),
      [[EMPLOYEE, IN_BRANCH_1]],
    );
    expect(conflicts.get(`${EMPLOYEE}:${DATE}`)).toHaveLength(5);
  });

  it("собирает только приёмы своего филиала и только в дни отсутствия", () => {
    const conflicts = collectAbsenceConflicts(
      buildAbsenceDays([exc({})]),
      [
        [
          EMPLOYEE,
          [
            ...IN_BRANCH_1,
            appt(1, "11:00", 13),
            { ...appt(2, "11:00", 13), startsAt: "2026-09-20T11:00:00+06:00" },
          ],
        ],
      ],
    );
    expect(conflicts.get(`${EMPLOYEE}:${DATE}`)?.map((a) => a.id)).toEqual([1]);
    expect(conflicts.has(`${EMPLOYEE}:2026-09-20`)).toBe(false);
  });
});
