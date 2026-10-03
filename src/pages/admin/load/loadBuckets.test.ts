import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { DayPoint, EmployeeLoad, HourPoint } from "../../../api/load";
import {
  availableGranularities,
  buildBuckets,
  employeeMeta,
  fitGranularity,
  formatHours,
  hourWindow,
  utilizationPct,
} from "./loadBuckets";

const day = (date: string, count: number, scheduleMinutes: number, busyMinutes: number): DayPoint => ({
  date,
  count,
  scheduleMinutes,
  busyMinutes,
});
const hour = (h: number, count: number, scheduleMinutes = 0, busyMinutes = 0): HourPoint => ({
  hour: h,
  count,
  scheduleMinutes,
  busyMinutes,
});
const range = (from: string, to: string) => availableGranularities(dayjs(from), dayjs(to));

describe("utilizationPct", () => {
  it("нет смен — null; округление; не выше 100", () => {
    expect(utilizationPct(10, 0)).toBeNull();
    expect(utilizationPct(45, 240)).toBe(19);
    expect(utilizationPct(300, 240)).toBe(100);
  });
});

describe("formatHours", () => {
  it("целые и десятые через запятую", () => {
    expect(formatHours(2820)).toBe("47");
    expect(formatHours(750)).toBe("12,5");
    expect(formatHours(0)).toBe("0");
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
    day("2026-09-30", 2, 60, 60),
    day("2026-10-01", 3, 0, 0),
    day("2026-10-05", 4, 120, 30),
  ];

  it("дни", () => {
    const b = buildBuckets("daily", [], daily);
    expect(b.map((x) => x.label)).toEqual(["29.09", "30.09", "01.10", "05.10"]);
    expect(b[2].utilization).toBeNull();
    expect(b[1].title).toBe("Дата: 30.09");
  });

  it("недели пн–вс, края по периоду", () => {
    const b = buildBuckets("weekly", [], daily);
    expect(b.map((x) => x.label)).toEqual(["29.09–01.10", "05.10"]);
    expect(b[0]).toMatchObject({ count: 6, scheduleMinutes: 120, busyMinutes: 90, utilization: 75 });
    expect(b[1]).toMatchObject({ count: 4, utilization: 25 });
  });

  it("месяцы", () => {
    const b = buildBuckets("monthly", [], daily);
    expect(b.map((x) => x.label)).toEqual(["сен 2026", "окт 2026"]);
    expect(b[1]).toMatchObject({ count: 7, scheduleMinutes: 120, busyMinutes: 30, utilization: 25 });
  });

  it("часы в окне", () => {
    const b = buildBuckets("hourly", [hour(8, 0), hour(9, 1, 60, 30), hour(10, 0)], []);
    expect(b[0].label).toBe("08:00");
    expect(b.find((x) => x.label === "09:00")).toMatchObject({ utilization: 50, title: "Время: 09:00" });
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
    ).toBe("18 приёмов · 34 из 47 ч · СКУД 80% · +6 ч вне графика");
  });
});
