import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { birthdayCountdownLabel, daysUntilBirthday } from "./age";

describe("daysUntilBirthday", () => {
  const now = dayjs("2026-09-29T15:30:00");

  it("is zero on the birthday itself, whatever the time of day", () => {
    expect(daysUntilBirthday("1996-09-29", now)).toBe(0);
  });

  it("counts forward within the year", () => {
    expect(daysUntilBirthday("1990-10-02", now)).toBe(3);
  });

  it("rolls a birthday already past this year over to the next one", () => {
    expect(daysUntilBirthday("1990-09-28", now)).toBe(364);
  });

  it("has nothing to count without a date", () => {
    expect(daysUntilBirthday(null, now)).toBeNull();
    expect(daysUntilBirthday("not-a-date", now)).toBeNull();
  });
});

describe("birthdayCountdownLabel", () => {
  it("names today and tomorrow and declines the rest", () => {
    expect(birthdayCountdownLabel(0)).toBe("сегодня");
    expect(birthdayCountdownLabel(1)).toBe("завтра");
    expect(birthdayCountdownLabel(3)).toBe("через 3 дня");
    expect(birthdayCountdownLabel(5)).toBe("через 5 дней");
  });
});
