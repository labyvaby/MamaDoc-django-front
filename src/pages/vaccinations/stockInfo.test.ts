import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import type { VaccineBatch } from "../../api/vaccinations";
import { batchUsed, countText, expiryInfo, stockByVaccine } from "./stockInfo";

const today = dayjs("2026-10-03");
const batch = (over: Partial<VaccineBatch>) => ({ vaccineId: 1, remaining: 10, expiresAt: "2027-09-27", ...over }) as VaccineBatch;

describe("stockInfo", () => {
  it("срок годности словами и тоном", () => {
    expect(expiryInfo("2027-09-27", today)).toEqual({ text: "ещё 11 месяцев", tone: "default" });
    expect(expiryInfo("2026-11-20", today)).toEqual({ text: "ещё 1 месяц", tone: "warning" });
    expect(expiryInfo("2026-10-10", today)).toEqual({ text: "ещё 7 дней", tone: "warning" });
    expect(expiryInfo("2026-10-03", today)).toEqual({ text: "истекает сегодня", tone: "error" });
    expect(expiryInfo("2026-09-30", today)).toEqual({ text: "истёк 3 дня назад", tone: "error" });
  });

  it("использовано доз", () => {
    expect(batchUsed({ quantityInitial: 50, remaining: 33, writtenOff: 2 })).toBe(15);
    expect(batchUsed({ quantityInitial: 50, remaining: 50 })).toBe(0);
  });

  it("остаток и ближайший срок по вакцине", () => {
    const m = stockByVaccine(
      [
        batch({ remaining: 10, expiresAt: "2027-09-27" }),
        batch({ remaining: 5, expiresAt: "2027-01-10" }),
        batch({ remaining: 0, expiresAt: "2026-12-01" }),
        batch({ remaining: 3, expiresAt: "2026-09-01" }),
      ],
      today,
    );
    expect(m.get(1)).toEqual({ batches: 4, remaining: 18, nearestExpiry: "2027-01-10" });
    expect(countText(2, "партия", "партии", "партий")).toBe("2 партии");
  });
});
