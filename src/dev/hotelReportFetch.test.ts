import { beforeEach, describe, expect, it, vi } from "vitest";

const listReservations = vi.fn();
vi.mock("../api/hotel", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/hotel")>()), listReservations }));

const { fetchAllReservations } = await import("./hotelReportData");

const page = (ids: number[], count: number) => ({ count, results: ids.map((id) => ({ id })) });
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
const offsetOf = (params: unknown) => (params as { offset?: number } | undefined)?.offset ?? 0;

describe("fetchAllReservations", () => {
  beforeEach(() => listReservations.mockReset());

  it("после первой страницы остальные идут параллельно, без дублей на стыке", async () => {
    // 650 броней; бронь 200 попадает и на первую, и на вторую страницу (список сдвинулся между запросами).
    listReservations.mockImplementation(async (params: unknown) => {
      const offset = offsetOf(params);
      if (offset === 0) return page(range(1, 200), 650);
      if (offset === 600) return page(range(600, 51), 650);
      return page(range(offset, 200), 650);
    });
    const res = await fetchAllReservations({ propertyId: 7, from: "2026-10-01", to: "2026-11-01" });
    expect(listReservations.mock.calls.map(([p]) => offsetOf(p))).toEqual([0, 200, 400, 600]);
    expect(res.truncated).toBe(false);
    expect(new Set(res.rows.map((r) => r.id)).size).toBe(res.rows.length);
    expect(res.rows).toHaveLength(650);
  });

  it("упёрлись в потолок страниц — truncated", async () => {
    listReservations.mockImplementation(async (params: unknown) => page(range(offsetOf(params) + 1, 200), 5000));
    const res = await fetchAllReservations({ propertyId: 7, from: "2026-01-01", to: "2027-01-01" }, undefined, 3);
    expect(listReservations).toHaveBeenCalledTimes(3);
    expect(res.truncated).toBe(true);
    expect(res.rows).toHaveLength(600);
  });

  it("одна неполная страница — один запрос", async () => {
    listReservations.mockResolvedValue(page(range(1, 16), 16));
    const res = await fetchAllReservations({ propertyId: 7, from: "2026-10-01", to: "2026-10-02" });
    expect(listReservations).toHaveBeenCalledTimes(1);
    expect(res.truncated).toBe(false);
    expect(res.rows).toHaveLength(16);
  });
});
