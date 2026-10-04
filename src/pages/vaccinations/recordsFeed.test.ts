import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import type { VaccinationRecord } from "../../api/vaccinations";
import { ageAt, dayTitle, groupRecordsByDay } from "./recordsFeed";

const rec = (id: number, administeredAt: string) => ({ id, administeredAt }) as unknown as VaccinationRecord;

describe("recordsFeed", () => {
  const today = dayjs("2026-10-03T12:00:00");

  it("заголовки дней", () => {
    expect(dayTitle("2026-10-03", today)).toBe("Сегодня");
    expect(dayTitle("2026-10-02", today)).toBe("Вчера");
    expect(dayTitle("2026-09-14", today)).toBe("14 сентября");
    expect(dayTitle("2025-12-31", today)).toBe("31 декабря 2025");
  });

  it("группировка по дням с подсчётом", () => {
    const days = groupRecordsByDay(
      [rec(1, "2026-09-14T10:00:00"), rec(2, "2026-09-14T09:00:00"), rec(3, "2026-09-08T10:00:00")],
      today,
    );
    expect(days.map((d) => [d.day, d.countText, d.items.length])).toEqual([
      ["2026-09-14", "2 прививки", 2],
      ["2026-09-08", "1 прививка", 1],
    ]);
  });

  it("возраст на день прививки", () => {
    expect(ageAt("2026-07-01", "2026-09-14")).toBe("2 мес.");
    expect(ageAt("2025-06-01", "2026-09-14")).toBe("1 год 3 мес.");
    expect(ageAt("2015-01-01", "2026-09-14")).toBe("11 лет 8 мес.");
    expect(ageAt("2026-09-07", "2026-09-14")).toBe("7 дн.");
    expect(ageAt(null, "2026-09-14")).toBeNull();
  });
});
