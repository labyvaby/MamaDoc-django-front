import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { DayPoint, EmployeeLoad, HourPoint } from "../../../api/load";
import {
  availableGranularities,
  buildBuckets,
  employeeLoadPct,
  employeeMeta,
  fitGranularity,
  formatHours,
  hourWindow,
  loadBarSegments,
  loadPct,
  scheduleBand,
  slotsLabel,
  sortByLoad,
} from "./loadBuckets";

const day = (
  date: string,
  count: number,
  scheduleMinutes: number,
  busyMinutes: number,
  outsideMinutes = 0,
): DayPoint => ({ date, count, scheduleMinutes, busyMinutes, outsideMinutes, scheduleSlots: 0, busySlots: 0 });
const hour = (h: number, count: number, scheduleMinutes = 0, busyMinutes = 0, outsideMinutes = 0): HourPoint => ({
  hour: h,
  count,
  scheduleMinutes,
  busyMinutes,
  outsideMinutes,
  scheduleSlots: 0,
  busySlots: 0,
});
const range = (from: string, to: string) => availableGranularities(dayjs(from), dayjs(to));

describe("loadPct", () => {
  it("нет смен — null; округление; сверх графика — больше 100", () => {
    expect(loadPct(10, 0)).toBeNull();
    expect(loadPct(45, 240)).toBe(19);
    expect(loadPct(300, 240)).toBe(125);
  });
});

describe("formatHours", () => {
  it("целые и десятые через запятую", () => {
    expect(formatHours(2820)).toBe("47");
    expect(formatHours(750)).toBe("12,5");
    expect(formatHours(0)).toBe("0");
  });

  it("от 100 ч — без десятых, чтобы подпись помещалась в плитку", () => {
    expect(formatHours(54924)).toBe("915");
    expect(formatHours(87444)).toBe((1457).toLocaleString("ru-RU"));
  });
});

describe("availableGranularities", () => {
  it("по длине периода", () => {
    expect(range("2026-10-03", "2026-10-03")).toEqual(["hourly"]);
    expect(range("2026-10-01", "2026-10-07")).toEqual(["hourly", "daily"]);
    expect(range("2026-09-28", "2026-10-04")).toEqual(["hourly", "daily"]);
    expect(range("2026-10-01", "2026-10-31")).toEqual(["hourly", "daily", "weekly"]);
    expect(range("2026-09-04", "2026-10-03")).toEqual(["hourly", "daily", "weekly", "monthly"]);
  });
});

describe("fitGranularity", () => {
  it("недоступная разбивка сходит на более мелкую", () => {
    expect(fitGranularity("monthly", ["hourly", "daily", "weekly"])).toBe("weekly");
    expect(fitGranularity("daily", ["hourly"])).toBe("hourly");
    expect(fitGranularity("weekly", ["hourly", "daily", "weekly", "monthly"])).toBe("weekly");
  });
});

describe("hourWindow", () => {
  it("8–20, расширяется по приёмам и сменам", () => {
    expect(hourWindow([hour(10, 0)])).toEqual([8, 20]);
    expect(hourWindow([hour(7, 2)])).toEqual([7, 20]);
    expect(hourWindow([hour(21, 0, 60)])).toEqual([8, 21]);
  });
});

describe("buildBuckets", () => {
  const daily = [
    day("2026-09-29", 1, 60, 30),
    day("2026-09-30", 2, 60, 60, 30),
    day("2026-10-01", 3, 0, 0, 20),
    day("2026-10-05", 4, 120, 30),
  ];

  it("дни: загрузка со временем сверх графика", () => {
    const b = buildBuckets("daily", [], daily);
    expect(b.map((x) => x.label)).toEqual(["29.09", "30.09", "01.10", "05.10"]);
    expect(b[1].utilization).toBe(150);
    expect(b[2].utilization).toBeNull();
    expect(b[1].title).toBe("Дата: 30.09");
  });

  it("недели пн–вс, края по периоду", () => {
    const b = buildBuckets("weekly", [], daily);
    expect(b.map((x) => x.label)).toEqual(["29.09–01.10", "05.10"]);
    expect(b[0]).toMatchObject({ count: 6, scheduleMinutes: 120, busyMinutes: 90, outsideMinutes: 50, utilization: 117 });
    expect(b[1]).toMatchObject({ count: 4, utilization: 25 });
  });

  it("месяцы", () => {
    const b = buildBuckets("monthly", [], daily);
    expect(b.map((x) => x.label)).toEqual(["сен 2026", "окт 2026"]);
    expect(b[0]).toMatchObject({ utilization: 100 });
    expect(b[1]).toMatchObject({ count: 7, scheduleMinutes: 120, busyMinutes: 30, outsideMinutes: 20, utilization: 42 });
  });

  it("часы в окне", () => {
    const b = buildBuckets("hourly", [hour(8, 0), hour(9, 1, 60, 30), hour(10, 1, 60, 60, 15)], []);
    expect(b[0].label).toBe("08:00");
    expect(b.find((x) => x.label === "09:00")).toMatchObject({ utilization: 50, title: "Время: 09:00" });
    expect(b.find((x) => x.label === "10:00")?.utilization).toBe(125);
  });

  it("бэк без поля outsideMinutes не ломает расчёт", () => {
    const legacy = [{ date: "2026-09-29", count: 1, scheduleMinutes: 60, busyMinutes: 30 }] as DayPoint[];
    expect(buildBuckets("daily", [], legacy)[0]).toMatchObject({ outsideMinutes: 0, utilization: 50 });
  });
});

describe("загрузка врача и полоса", () => {
  const row = (scheduleMinutes: number, busyMinutes: number, outsideMinutes: number) => ({
    scheduleMinutes,
    busyMinutes,
    outsideMinutes,
  });

  it("процент с учётом приёмов сверх графика", () => {
    expect(employeeLoadPct(row(210, 210, 30))).toBe(114);
    expect(employeeLoadPct(row(0, 0, 90))).toBeNull();
  });

  it("до 100% — шкала по графику, без черты", () => {
    expect(loadBarSegments(row(100, 60, 10))).toEqual({ inside: 60, outside: 10, marker: null });
    expect(loadBarSegments(row(0, 0, 90))).toEqual({ inside: 0, outside: 0, marker: null });
  });

  it("больше 100% — полоса целиком, черта на конце графика", () => {
    const s = loadBarSegments(row(210, 210, 30));
    expect(s.inside + s.outside).toBeCloseTo(100);
    expect(s.inside).toBeCloseTo(87.5);
    expect(s.marker).toBeCloseTo(87.5);
    const big = loadBarSegments(row(540, 480, 4200));
    expect(big.marker).toBeCloseTo(11.54, 1);
  });

  it("сортировка: сверх графика выше полной смены, без графика — в конце", () => {
    const base: EmployeeLoad = {
      employeeId: 0,
      fullName: "",
      appointments: 0,
      hours: "0",
      scheduleMinutes: 0,
      busyMinutes: 0,
      outsideMinutes: 0,
      scheduleSlots: 0,
      busySlots: 0,
      utilizationPct: null,
      attendanceUtilizationPct: null,
    };
    const rows: EmployeeLoad[] = [
      { ...base, employeeId: 1, fullName: "Полная", ...row(60, 60, 0) },
      { ...base, employeeId: 2, fullName: "Без графика", appointments: 50, ...row(0, 0, 600) },
      { ...base, employeeId: 3, fullName: "Сверх", ...row(60, 30, 60) },
      { ...base, employeeId: 4, fullName: "Половина", ...row(60, 30, 0) },
    ];
    expect(sortByLoad(rows).map((r) => r.employeeId)).toEqual([3, 1, 4, 2]);
  });
});

describe("employeeMeta", () => {
  const base: EmployeeLoad = {
    employeeId: 1,
    fullName: "A",
    appointments: 18,
    hours: "0",
    scheduleMinutes: 0,
    busyMinutes: 0,
    outsideMinutes: 0,
    scheduleSlots: 0,
    busySlots: 0,
    utilizationPct: null,
    attendanceUtilizationPct: null,
  };

  it("только непустые части", () => {
    expect(employeeMeta(base, "18 приёмов")).toBe("18 приёмов");
    expect(
      employeeMeta(
        { ...base, scheduleMinutes: 2820, busyMinutes: 2040, outsideMinutes: 360, attendanceUtilizationPct: 80 },
        "18 приёмов",
      ),
    ).toBe("18 приёмов · 34 из 47 ч · СКУД 80% · +13% вне графика");
  });

  it("вне графика — процент от времени по графику, может быть больше 100", () => {
    const sched = { ...base, scheduleMinutes: 9 * 60, busyMinutes: 8 * 60 };
    expect(employeeMeta({ ...sched, outsideMinutes: 70 * 60 }, "437 приёмов")).toBe(
      "437 приёмов · 8 из 9 ч · +778% вне графика",
    );
    expect(employeeMeta({ ...sched, outsideMinutes: 3 }, "5 приёмов")).toBe("5 приёмов · 8 из 9 ч · +<1% вне графика");
  });

  it("без графика процент не от чего — часы", () => {
    expect(employeeMeta({ ...base, outsideMinutes: 90 }, "3 приёма")).toBe("3 приёма · +1,5 ч вне графика");
  });
});

describe("слоты и полоса смены", () => {
  it("подпись слотов с правильным окончанием", () => {
    expect(slotsLabel(2, 2)).toBe("2 из 2 слотов");
    expect(slotsLabel(1, 1)).toBe("1 из 1 слота");
    expect(slotsLabel(5, 21)).toBe("5 из 21 слота");
    expect(slotsLabel(3, 11)).toBe("3 из 11 слотов");
  });

  it("слоты складываются в отрезки, бэк без поля — 0", () => {
    const daily = [
      { ...day("2026-09-29", 1, 60, 60), scheduleSlots: 2, busySlots: 2 },
      { ...day("2026-09-30", 1, 60, 30), scheduleSlots: 2, busySlots: 1 },
    ];
    expect(buildBuckets("weekly", [], daily)[0]).toMatchObject({ scheduleSlots: 4, busySlots: 3 });
    const legacy = [{ date: "2026-09-29", count: 1, scheduleMinutes: 60, busyMinutes: 30 }] as DayPoint[];
    expect(buildBuckets("daily", [], legacy)[0]).toMatchObject({ scheduleSlots: 0, busySlots: 0 });
  });

  it("полоса смены: от часа начала до часа конца, подпись с минутами", () => {
    const buckets = buildBuckets("hourly", Array.from({ length: 24 }, (_, h) => hour(h, 0, h >= 10 && h <= 16 ? 60 : 0)), []);
    expect(scheduleBand({ startMinute: 600, endMinute: 990 }, buckets)).toEqual({
      x1: "10:00",
      x2: "17:00",
      label: "График 10:00–16:30",
    });
    expect(scheduleBand(null, buckets)).toBeNull();
    expect(scheduleBand({ startMinute: 0, endMinute: 1440 }, buckets)?.label).toBe("График 00:00–24:00");
  });
});
