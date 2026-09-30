import { describe, expect, it } from "vitest";
import type { Unit } from "../../../api/realestate";
import { countByStatus, defaultUnitFilters, holdLeft, matchesUnitFilters } from "./units";

const unit = (patch: Partial<Unit>): Unit => ({
  id: "u",
  projectId: "p",
  section: "А",
  floor: 2,
  position: 1,
  axis: 1,
  number: "1",
  rooms: 1,
  totalArea: 40,
  livingArea: 36,
  price: 4_000_000,
  pricePerSqm: 100_000,
  status: "free",
  orientation: "Север",
  view: "На город",
  outdoor: null,
  ceilingHeight: 3,
  bathrooms: 1,
  isCorner: false,
  hasPanoramicWindows: false,
  roomsBreakdown: [],
  layoutCode: "AT-1A",
  layoutVariant: 0,
  ...patch,
});

describe("matchesUnitFilters", () => {
  it("пропускает всё при фильтрах по умолчанию", () => {
    expect(matchesUnitFilters(unit({ status: "sold" }), defaultUnitFilters)).toBe(true);
  });

  it("«4+» включает квартиры с 4 и более комнатами", () => {
    const filters = { ...defaultUnitFilters, rooms: "4" as const };
    expect(matchesUnitFilters(unit({ rooms: 5 }), filters)).toBe(true);
    expect(matchesUnitFilters(unit({ rooms: 3 }), filters)).toBe(false);
  });

  it("студии — это 0 комнат", () => {
    const filters = { ...defaultUnitFilters, rooms: "0" as const };
    expect(matchesUnitFilters(unit({ rooms: 0 }), filters)).toBe(true);
    expect(matchesUnitFilters(unit({ rooms: 1 }), filters)).toBe(false);
  });

  it("«балкон» включает лоджии, но не террасы", () => {
    const filters = { ...defaultUnitFilters, feature: "balcony" as const };
    expect(matchesUnitFilters(unit({ outdoor: { type: "loggia", area: 4 } }), filters)).toBe(true);
    expect(matchesUnitFilters(unit({ outdoor: { type: "terrace", area: 20 } }), filters)).toBe(false);
  });

  it("«южная сторона» включает юго-восток", () => {
    const filters = { ...defaultUnitFilters, feature: "south" as const };
    expect(matchesUnitFilters(unit({ orientation: "Юго-восток" }), filters)).toBe(true);
    expect(matchesUnitFilters(unit({ orientation: "Восток" }), filters)).toBe(false);
  });

  it("фильтры комбинируются через «и»", () => {
    const filters = {
      ...defaultUnitFilters,
      status: "free",
      rooms: "2",
      feature: "panoramic",
    } as const;
    expect(matchesUnitFilters(unit({ rooms: 2, hasPanoramicWindows: true }), filters)).toBe(true);
    expect(
      matchesUnitFilters(unit({ rooms: 2, status: "sold", hasPanoramicWindows: true }), filters),
    ).toBe(false);
  });
});

describe("countByStatus", () => {
  it("считает квартиры по статусам", () => {
    const units = [unit({ status: "free" }), unit({ status: "free" }), unit({ status: "sold" })];
    expect(countByStatus(units)).toEqual({ all: 3, free: 2, reserved: 0, sold: 1 });
  });
});

describe("диапазоны", () => {
  it("фильтруют по цене, площади и этажу включительно", () => {
    const u = unit({ price: 5_000_000, totalArea: 50, floor: 5 });
    const f = (patch: Partial<typeof defaultUnitFilters>) =>
      matchesUnitFilters(u, { ...defaultUnitFilters, ...patch });
    expect(f({ price: [5_000_000, 6_000_000] })).toBe(true);
    expect(f({ price: [5_100_000, 6_000_000] })).toBe(false);
    expect(f({ area: [40, 50] })).toBe(true);
    expect(f({ area: [51, 90] })).toBe(false);
    expect(f({ floor: [2, 4] })).toBe(false);
  });
});

describe("holdLeft", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("часы, минуты, дни", () => {
    expect(holdLeft(at(5 * 3_600_000 + 20 * 60_000), now)).toEqual({ label: "5 ч", urgent: false, expired: false });
    expect(holdLeft(at(40 * 60_000), now)).toEqual({ label: "40 мин", urgent: true, expired: false });
    expect(holdLeft(at(72 * 3_600_000), now)?.label).toBe("3 дн");
  });

  it("меньше двух часов — горит, после срока — истекла", () => {
    expect(holdLeft(at(119 * 60_000), now)?.urgent).toBe(true);
    expect(holdLeft(at(-1), now)).toEqual({ label: "истекла", urgent: true, expired: true });
  });

  it("нет срока или он битый — таймера нет", () => {
    expect(holdLeft(null, now)).toBeNull();
    expect(holdLeft("завтра", now)).toBeNull();
  });
});
