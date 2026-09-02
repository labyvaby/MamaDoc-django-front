import { describe, expect, it } from "vitest";

import { sortCleaningRecords, type CleaningRecord } from "./cleaning";

function record(id: number, performedAt: string, createdAt: string): CleaningRecord {
  return {
    id,
    typeId: 1,
    typeName: "Ежедневная уборка",
    employeeId: 1,
    employeeName: "Уборщица",
    status: "pending",
    photos: [],
    createdAt,
    performedAt,
    branchId: null,
    branchName: null,
    rejectReason: "",
    reviewedByName: null,
    reviewedAt: null,
  };
}

describe("sortCleaningRecords", () => {
  it("ставит запись задним числом на её день, а не наверх списка", () => {
    // Бэк отдаёт список в порядке создания: уборку за 10-е отметили позже всех.
    const backdated = record(30, "2026-08-10T12:00:00Z", "2026-08-26T09:00:00Z");
    const fresh = record(20, "2026-08-25T06:00:00Z", "2026-08-25T06:10:00Z");
    const older = record(10, "2026-08-05T06:00:00Z", "2026-08-05T06:10:00Z");

    expect(sortCleaningRecords([backdated, fresh, older]).map((r) => r.id)).toEqual([20, 30, 10]);
  });

  it("при одной дате уборки свежая запись выше", () => {
    const early = record(1, "2026-08-20T12:00:00Z", "2026-08-20T07:00:00Z");
    const late = record(2, "2026-08-20T12:00:00Z", "2026-08-20T19:00:00Z");

    expect(sortCleaningRecords([early, late]).map((r) => r.id)).toEqual([2, 1]);
  });

  it("работает на средах без performedAt (дата уборки = момент создания)", () => {
    const a = { ...record(1, "", "2026-08-01T07:00:00Z"), performedAt: undefined };
    const b = { ...record(2, "", "2026-08-09T07:00:00Z"), performedAt: undefined };

    expect(sortCleaningRecords([a, b]).map((r) => r.id)).toEqual([2, 1]);
  });
});
