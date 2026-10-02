import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import {
  ageLabel,
  allergyLine,
  controlState,
  dayOfLife,
  gestationLabel,
  isChild,
  isPremature,
  onDispensary,
  severityTone,
} from "./healthMeta";

describe("healthMeta", () => {
  it("counts the day of life from the birth day as the first", () => {
    expect(dayOfLife("2026-09-01", "2026-09-01")).toBe(1);
    expect(dayOfLife("2026-09-01", "2026-09-04")).toBe(4);
    expect(dayOfLife("2026-09-05", "2026-09-04")).toBeNull();
    expect(dayOfLife(null, "2026-09-04")).toBeNull();
  });

  it("labels the gestational age and premature birth", () => {
    expect(gestationLabel(38, 3)).toBe("38 нед. 3 дн.");
    expect(gestationLabel(40, 0)).toBe("40 нед.");
    expect(gestationLabel(null, 2)).toBe("");
    expect(isPremature(36)).toBe(true);
    expect(isPremature(37)).toBe(false);
  });

  it("tells the state of the next dispensary control", () => {
    const today = dayjs("2026-10-02");
    const base = { isDispensary: true, dispensaryEndedOn: null };
    expect(controlState({ ...base, nextControlOn: "2026-09-30" }, today)).toBe("overdue");
    expect(controlState({ ...base, nextControlOn: "2026-10-10" }, today)).toBe("soon");
    expect(controlState({ ...base, nextControlOn: "2026-12-01" }, today)).toBe("planned");
    expect(controlState({ ...base, dispensaryEndedOn: "2026-09-01", nextControlOn: "2026-09-30" }, today)).toBeNull();
    expect(onDispensary({ isDispensary: true, dispensaryEndedOn: null, status: "refuted" })).toBe(false);
  });

  it("shows child blocks under 18 or without a birth date", () => {
    const today = dayjs("2026-10-02");
    expect(isChild(null, today)).toBe(true);
    expect(isChild("2010-01-01", today)).toBe(true);
    expect(isChild("1998-05-01", today)).toBe(false);
  });

  it("formats an age and allergy lines", () => {
    expect(ageLabel("2025-03-26", "2026-06-30")).toBe("1 год 3 мес.");
    expect(ageLabel("2026-09-01", "2026-09-20")).toBe("19 дн.");
    expect(ageLabel("2023-01-01", "2026-01-15")).toBe("3 года");
    expect(allergyLine({ allergen: "Амоксициллин", reaction: "Сыпь" })).toBe("Амоксициллин — сыпь");
    expect(severityTone("anaphylaxis")).toBe("error");
    expect(severityTone("unknown")).toBe("default");
  });
});
