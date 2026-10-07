import { describe, expect, it, vi } from "vitest";

import { groupByPlan, sendQueue, type QueuedEdit } from "./priceQueue";

const edit = (ratePlanId: number, dateFrom: string): QueuedEdit => ({
  ratePlanId,
  ratePlanName: `plan ${ratePlanId}`,
  nights: 1,
  changes: [{ roomTypeId: 1, dateFrom, dateTo: `${dateFrom}x`, price: "100.00" }],
});

describe("priceQueue", () => {
  it("правки одного тарифа склеиваются, разные тарифы остаются отдельными", () => {
    const groups = groupByPlan([edit(1, "a"), edit(2, "b"), edit(1, "c")]);
    expect([...groups.keys()]).toEqual([1, 2]);
    expect(groups.get(1)?.map((c) => c.dateFrom)).toEqual(["a", "c"]);
  });

  it("на каждый тариф уходит один вызов, и все вызовы стартуют до первого ответа", async () => {
    const started: number[] = [];
    const release: (() => void)[] = [];
    const send = vi.fn((ratePlanId: number) => {
      started.push(ratePlanId);
      return new Promise<{ nights: number; changes: number }>((resolve) => release.push(() => resolve({ nights: 2, changes: 1 })));
    });
    const pending = sendQueue([edit(1, "a"), edit(2, "b"), edit(1, "c")], send as never);
    expect(started).toEqual([1, 2]);
    release.forEach((r) => r());
    expect(await pending).toEqual({ saved: 4, failed: [] });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("отказ по одному тарифу не отменяет остальные", async () => {
    const send = vi.fn((ratePlanId: number) => (ratePlanId === 2 ? Promise.reject(new Error("no")) : Promise.resolve({ nights: 3, changes: 1 })));
    const result = await sendQueue([edit(1, "a"), edit(2, "b")], send as never);
    expect(result.saved).toBe(3);
    expect(result.failed.map((f) => f.ratePlanId)).toEqual([2]);
  });
});
