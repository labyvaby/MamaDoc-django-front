import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogCache } from "./catalogCache";

afterEach(() => vi.useRealTimers());

describe("public catalogue cache", () => {
  it("shares an in-flight request and resolved value across consumers", async () => {
    const load = createCatalogCache();
    let resolve!: (value: string[]) => void;
    const fetchValue = vi.fn(() => new Promise<string[]>((r) => { resolve = r; }));
    const one = load("org:clinic-a", fetchValue);
    const two = load("org:clinic-a", fetchValue);
    expect(one).toBe(two);
    await Promise.resolve();
    resolve(["one"]);
    expect(await one).toEqual(["one"]);
    expect(await load("org:clinic-a", fetchValue)).toBe(await one);
    expect(fetchValue).toHaveBeenCalledTimes(1);
  });
  it("keeps tenants and catalogue types separate", async () => {
    const load = createCatalogCache();
    expect(await load("specialties:a:1", async () => [1])).toEqual([1]);
    expect(await load("specialties:b:1", async () => [2])).toEqual([2]);
    expect(await load("branches:a", async () => [3])).toEqual([3]);
  });
  it("evicts failed requests so the next navigation can retry", async () => {
    const load = createCatalogCache();
    await expect(load("org:a", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(await load("org:a", async () => "recovered")).toBe("recovered");
  });
  it("expires catalogues after the TTL rather than retaining stale flags forever", async () => {
    vi.useFakeTimers();
    const load = createCatalogCache(100);
    const fetchValue = vi.fn(async () => fetchValue.mock.calls.length);
    expect(await load("org:a", fetchValue)).toBe(1);
    vi.advanceTimersByTime(101);
    expect(await load("org:a", fetchValue)).toBe(2);
  });
});
