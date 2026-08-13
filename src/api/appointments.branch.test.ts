import { describe, expect, it } from "vitest";

import { normalizeAppointment } from "./appointments";

/**
 * Форма ответа живого API (прод, 14.08.2026): филиал приходит объектом
 * `branch`, отдельного `branchId` в ответе НЕТ. Пока фронт его не раскладывал,
 * `appointment.branchId` был undefined, и запросы со скоупом филиала уходили
 * без него — справочник способов безнала отдавал способы всех филиалов
 * организации, а автоподстановка единственного способа не срабатывала.
 */
describe("normalizeAppointment — филиал", () => {
  it("раскладывает branch в branchId/branchName", () => {
    const appt = normalizeAppointment({
      id: 1,
      organizationId: 1,
      branch: { id: 13, name: "Мама Доктор Плюс" },
      startsAt: "2026-08-14T09:00:00Z",
    });

    expect(appt.branchId).toBe(13);
    expect(appt.branchName).toBe("Мама Доктор Плюс");
  });

  it("отдаёт null, когда филиала нет (legacy-записи)", () => {
    const appt = normalizeAppointment({ id: 2, organizationId: 1, branch: null });

    expect(appt.branchId).toBeNull();
    expect(appt.branchName).toBeNull();
  });

  it("не затирает branchId, если бэк когда-нибудь начнёт его слать", () => {
    const appt = normalizeAppointment({
      id: 3,
      organizationId: 1,
      branchId: 7,
      branch: null,
    });

    expect(appt.branchId).toBe(7);
  });
});
