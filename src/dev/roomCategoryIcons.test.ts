import { describe, expect, it } from "vitest";

import { buildRoomCategoryIconKeys, roomCapacityBucket, roomCategoryIconKey } from "./roomCategoryIcons";

describe("roomCapacityBucket", () => {
  it("дети в категории — всегда «семейный», даже при небольшой общей вместимости", () => {
    expect(roomCapacityBucket(2, 1)).toBe("family");
    expect(roomCapacityBucket(6, 2)).toBe("family");
  });

  it("без детей — по общей вместимости", () => {
    expect(roomCapacityBucket(1, 0)).toBe("single");
    expect(roomCapacityBucket(0, 0)).toBe("single");
    expect(roomCapacityBucket(2, 0)).toBe("double");
    expect(roomCapacityBucket(3, 0)).toBe("multi");
    expect(roomCapacityBucket(4, 0)).toBe("multi");
    expect(roomCapacityBucket(5, 0)).toBe("large");
    expect(roomCapacityBucket(10, 0)).toBe("large");
  });
});

describe("roomCategoryIconKey", () => {
  it("идёт по кругу внутри своей группы, а не по общему списку всех иконок", () => {
    expect(roomCategoryIconKey("single", 0)).toBe("singleBed");
    expect(roomCategoryIconKey("single", 1)).toBe("chair");
    expect(roomCategoryIconKey("single", 2)).toBe("singleBed");
    expect(roomCategoryIconKey("double", 3)).toBe(roomCategoryIconKey("double", 0));
  });

  it("у разных групп вместимости не пересекаются используемые иконки", () => {
    const groups: Array<"single" | "double" | "family" | "multi" | "large"> = ["single", "double", "family", "multi", "large"];
    const seen = new Map<string, string>();
    for (const g of groups) {
      for (let i = 0; i < 5; i++) {
        const key = roomCategoryIconKey(g, i);
        if (seen.has(key)) expect(seen.get(key)).toBe(g);
        else seen.set(key, g);
      }
    }
  });
});

describe("buildRoomCategoryIconKeys", () => {
  const rt = (id: number, isLuxury: boolean, sortOrder: number, capacity: number, childrenCapacity = 0) => ({
    id,
    isLuxury,
    sortOrder,
    capacity,
    childrenCapacity,
  });

  it("люкс всегда получает корону, независимо от вместимости", () => {
    const map = buildRoomCategoryIconKeys([rt(1, true, 1, 2), rt(2, true, 2, 6, 2)]);
    expect(map.get(1)).toBe("luxury");
    expect(map.get(2)).toBe("luxury");
  });

  it("категории с разной вместимостью получают разные иконки", () => {
    const map = buildRoomCategoryIconKeys([rt(1, false, 1, 1), rt(2, false, 2, 2), rt(3, false, 3, 6)]);
    const icons = new Set([map.get(1), map.get(2), map.get(3)]);
    expect(icons.size).toBe(3);
  });

  it("категории с ОДИНАКОВОЙ вместимостью (частый случай — тарифы отличаются только ценой) всё равно получают разные иконки", () => {
    const map = buildRoomCategoryIconKeys([rt(1, false, 1, 2), rt(2, false, 2, 2), rt(3, false, 3, 2)]);
    expect(map.get(1)).toBe("kingBed");
    expect(map.get(2)).toBe("bed");
    expect(map.get(3)).toBe("roomPreferences");
  });

  it("при равном sortOrder порядок решает id", () => {
    const map = buildRoomCategoryIconKeys([rt(5, false, 1, 2), rt(2, false, 1, 2)]);
    expect(map.get(2)).toBe("kingBed");
    expect(map.get(5)).toBe("bed");
  });

  it("люксовые категории не занимают место в круге своей группы вместимости", () => {
    const map = buildRoomCategoryIconKeys([rt(1, true, 1, 2), rt(2, false, 2, 2)]);
    expect(map.get(1)).toBe("luxury");
    expect(map.get(2)).toBe("kingBed");
  });

  it("дети в категории дают «семейную» иконку, а не по общей вместимости", () => {
    const map = buildRoomCategoryIconKeys([rt(1, false, 1, 4, 2)]);
    expect(map.get(1)).toBe("crib");
  });

  it("пустой список — пустая карта", () => {
    expect(buildRoomCategoryIconKeys([]).size).toBe(0);
  });
});
