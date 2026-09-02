import { describe, expect, it } from "vitest";

import type {
  CalendarDay,
  ProfessionalScheduleBranch,
  ProfessionalScheduleException,
  ProfessionalScheduleRule,
} from "../../../api/publicBooking";
import {
  branchHasSchedule,
  dayOffDates,
  hhmm,
  lunchRange,
  nearestAvailableDate,
  pickBranchWithSlots,
  pickDefaultBranchId,
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

describe("dayOffDates", () => {
  // 2026-08-31 — понедельник (0 у бэка), 2026-09-05 — суббота (5).
  const workdays = branch({ rules: [rule({ weekdays: [0, 1, 2, 3, 4] })] });

  it("нерабочий день недели — выходной, рабочий — нет", () => {
    const off = dayOffDates(workdays, ["2026-08-31", "2026-09-05", "2026-09-06"]);
    expect([...off]).toEqual(["2026-09-05", "2026-09-06"]);
  });

  it("без правил графика ничего не утверждаем", () => {
    expect(dayOffDates(branch(), ["2026-09-05"]).size).toBe(0);
    expect(dayOffDates(null, ["2026-09-05"]).size).toBe(0);
  });

  it("смена важнее правила: day_off закрывает рабочий день, extra открывает выходной", () => {
    const withExceptions = branch({
      rules: [rule({ weekdays: [0, 1, 2, 3, 4] })],
      exceptions: [
        exception({ id: 1, date: "2026-08-31", kind: "day_off" }),
        exception({ id: 2, date: "2026-09-05", kind: "extra" }),
      ],
    });
    const off = dayOffDates(withExceptions, ["2026-08-31", "2026-09-05"]);
    expect([...off]).toEqual(["2026-08-31"]);
  });

  it("отпуск считается выходным", () => {
    const onVacation = branch({
      rules: [rule({ weekdays: [0, 1, 2, 3, 4] })],
      exceptions: [exception({ date: "2026-09-01", kind: "vacation" })],
    });
    expect([...dayOffDates(onVacation, ["2026-09-01"])]).toEqual(["2026-09-01"]);
  });
});

// ── Филиал по свободным окнам ────────────────────────────────────────────────

const day = (date: string, isAvailable: boolean): CalendarDay => ({
  date,
  label: date,
  isAvailable,
  slotsCount: isAvailable ? 4 : 0,
  times: isAvailable ? ["09:00", "09:30"] : [],
});

/** Филиал 1 — «домашний», 13 — второй. */
const home = branch({ id: 1, name: "Мама Доктор" });
const second = branch({ id: 13, name: "Мама Доктор Плюс" });

describe("nearestAvailableDate", () => {
  it("берёт первый день со свободным временем", () => {
    expect(
      nearestAvailableDate([day("2026-09-02", false), day("2026-09-04", true), day("2026-09-05", true)]),
    ).toBe("2026-09-04");
  });

  it("нет свободных дней или календарь не загружен — null", () => {
    expect(nearestAvailableDate([day("2026-09-02", false)])).toBeNull();
    expect(nearestAvailableDate([])).toBeNull();
    expect(nearestAvailableDate(undefined)).toBeNull();
  });
});

describe("pickDefaultBranchId", () => {
  it("филиал с более ранним окном выигрывает у домашнего", () => {
    // Ровно жалоба 02.09.2026: в домашнем филиале окон нет, а карточка
    // открывалась именно на нём и говорила «окон нет».
    const picked = pickDefaultBranchId([home, second], { 1: null, 13: "2026-09-03" }, 1);
    expect(picked).toBe(13);
  });

  it("при равных датах впереди домашний филиал — привычный адрес", () => {
    const picked = pickDefaultBranchId(
      [second, home],
      { 1: "2026-09-03", 13: "2026-09-03" },
      1,
    );
    expect(picked).toBe(1);
  });

  it("окон нет нигде — остаёмся в домашнем филиале", () => {
    expect(pickDefaultBranchId([home, second], { 1: null, 13: null }, 1)).toBe(1);
  });

  it("окон нет и домашнего филиала в списке нет — первый с графиком", () => {
    const noSchedule = branch({ id: 12, name: "Тестовый", rules: [] });
    const withSchedule = branch({ id: 13, rules: [rule()] });
    expect(pickDefaultBranchId([noSchedule, withSchedule], { 12: null, 13: null }, 1)).toBe(13);
  });

  it("филиалов нет — выбирать нечего", () => {
    expect(pickDefaultBranchId([], {}, 1)).toBeNull();
  });

  it("график в филиале есть, но свободных дней нет — выигрывает филиал с окнами", () => {
    // Прежняя эвристика смотрела на наличие правил и оставалась здесь.
    const busy = branch({ id: 1, rules: [rule({ weekdays: [0, 1, 2, 3, 4] })] });
    expect(pickDefaultBranchId([busy, second], { 1: null, 13: "2026-09-10" }, 1)).toBe(13);
  });
});

describe("pickBranchWithSlots", () => {
  it("предлагает филиал с ближайшим окном, кроме текущего", () => {
    const found = pickBranchWithSlots([home, second], { 1: null, 13: "2026-09-03" }, 1);
    expect(found?.branch.id).toBe(13);
    expect(found?.date).toBe("2026-09-03");
  });

  it("из нескольких кандидатов берёт самый ранний", () => {
    const third = branch({ id: 12, name: "Третий" });
    const found = pickBranchWithSlots(
      [home, second, third],
      { 1: null, 13: "2026-09-10", 12: "2026-09-04" },
      1,
    );
    expect(found?.branch.id).toBe(12);
  });

  it("окна только в текущем филиале — предлагать нечего", () => {
    expect(pickBranchWithSlots([home, second], { 1: "2026-09-03", 13: null }, 1)).toBeNull();
  });

  it("окон нет нигде — null", () => {
    expect(pickBranchWithSlots([home, second], { 1: null, 13: null }, 1)).toBeNull();
  });
});
