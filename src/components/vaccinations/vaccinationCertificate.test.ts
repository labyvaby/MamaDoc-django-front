import { describe, expect, it } from "vitest";
import type { VaccinationRecord } from "../../api/vaccinations";
import { certificateRows } from "./vaccinationCertificate";

const rec = (id: number, status: string, at: string) =>
  ({ id, status, administeredAt: at }) as unknown as VaccinationRecord;

describe("certificateRows", () => {
  it("только проведённые, по дате", () => {
    const rows = certificateRows([
      rec(1, "pending", "2026-05-01T10:00:00Z"),
      rec(2, "draft", "2026-04-01T10:00:00Z"),
      rec(3, "canceled", "2026-03-01T10:00:00Z"),
      rec(4, "pending", "2026-02-01T10:00:00Z"),
    ]);
    expect(rows.map((r) => r.id)).toEqual([4, 1]);
  });
});
