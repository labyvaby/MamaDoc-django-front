import { describe, expect, it } from "vitest";

import type {
  ProfessionalScheduleBranch,
  ProfessionalScheduleException,
  ProfessionalScheduleRule,
} from "../../../api/publicBooking";
import {
  branchHasSchedule,
  hhmm,
  lunchRange,
  ruleLabel,
  upcomingExceptions,
  weekdaysLabel,
} from "./schedule";

const rule = (patch: Partial<ProfessionalScheduleRule> = {}): ProfessionalScheduleRule => ({
  id: 1,
  scope: "branch",
  dateFrom: "2026-08-01",
  dateTo: "2026-12-31",
  weekdays: [0, 2, 4],
  startTime: "09:00",
  endTime: "18:00",
  lunchStart: null,
  lunchEnd: null,
  comment: "",
  ...patch,
});

const exception = (
  patch: Partial<ProfessionalScheduleException> = {},
): ProfessionalScheduleException => ({
  id: 1,
  scope: "branch",
  date: "2026-09-05",
  kind: "extra",
  startTime: "10:00",
  endTime: "14:00",
  comment: "",
  ...patch,
});

const branch = (patch: Partial<ProfessionalScheduleBranch> = {}): ProfessionalScheduleBranch => ({
  id: 13,
  slug: "branch-13",
  name: "Мама Доктор Плюс",
  address: "ул. Сейтек 9-10",
  timezone: "Asia/Bishkek",
  rules: [],
  exceptions: [],
  ...patch,
});

describe("weekdaysLabel", () => {
  // Инвариант контракта: 0 — понедельник, а не воскресенье, как у JS Date.
  it("нумерует дни с понедельника", () => {
    expect(weekdaysLabel([0], "Ежедневно")).toBe("Пн");
    expect(weekdaysLabel([6], "Ежедневно")).toBe("Вс");
  });

  it("перечисляет разрозненные дни", () => {
    expect(weekdaysLabel([0, 2, 4], "Ежедневно")).toBe("Пн, Ср, Пт");
  });

  it("сворачивает три и больше подряд в диапазон", () => {
    expect(weekdaysLabel([0, 1, 2, 3, 4], "Ежедневно")).toBe("Пн – Пт");
    expect(weekdaysLabel([0, 1], "Ежедневно")).toBe("Пн, Вт");
    expect(weekdaysLabel([0, 1, 2, 5], "Ежедневно")).toBe("Пн – Ср, Сб");
  });

  it("всю неделю называет одним словом", () => {
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6], "Ежедневно")).toBe("Ежедневно");
  });

  it("не падает на пустом и мусорном списке", () => {
    expect(weekdaysLabel([], "Ежедневно")).toBe("");
    expect(weekdaysLabel([9, 0, 0], "Ежедневно")).toBe("Пн");
  });
});

describe("ruleLabel", () => {
  it("собирает дни и время", () => {
    expect(ruleLabel(rule(), "Ежедневно")).toBe("Пн, Ср, Пт · 09:00 – 18:00");
  });

  it("режет секунды, если бэк их пришлёт", () => {
    expect(hhmm("09:00:00")).toBe("09:00");
    expect(ruleLabel(rule({ weekdays: [], startTime: "09:00:00" }), "Ежедневно")).toBe(
      "09:00 – 18:00",
    );
  });

  it("отдаёт перерыв только когда заданы обе границы", () => {
    expect(lunchRange(rule())).toBeNull();
    expect(lunchRange(rule({ lunchStart: "13:00" }))).toBeNull();
    expect(lunchRange(rule({ lunchStart: "13:00", lunchEnd: "14:00" }))).toBe("13:00 – 14:00");
  });
});

describe("upcomingExceptions", () => {
  it("оставляет будущие и сегодняшние, сортирует по дате", () => {
    const list = [
      exception({ id: 1, date: "2026-09-10" }),
      exception({ id: 2, date: "2026-08-01" }),
      exception({ id: 3, date: "2026-08-28" }),
    ];
    expect(upcomingExceptions(list, "2026-08-28").map((e) => e.id)).toEqual([3, 1]);
  });

  it("ограничивает количество", () => {
    const list = [
      exception({ id: 1, date: "2026-09-01" }),
      exception({ id: 2, date: "2026-09-02" }),
      exception({ id: 3, date: "2026-09-03" }),
    ];
    expect(upcomingExceptions(list, "2026-08-28", 2).map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("branchHasSchedule", () => {
  it("филиал без правил и смен считается без графика", () => {
    expect(branchHasSchedule(branch())).toBe(false);
    // Только выходные — рабочего времени всё равно нет (реальный случай прода:
    // врач 6, филиал 13 — три day_off и ни одного правила).
    expect(branchHasSchedule(branch({ exceptions: [exception({ kind: "day_off" })] }))).toBe(false);
  });

  it("правило или дополнительная смена дают график", () => {
    expect(branchHasSchedule(branch({ rules: [rule()] }))).toBe(true);
    expect(branchHasSchedule(branch({ exceptions: [exception({ kind: "extra" })] }))).toBe(true);
  });
});
