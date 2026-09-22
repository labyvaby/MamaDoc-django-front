import { describe, expect, it } from "vitest";

import { REGULAR_ROOM_ICON_KEYS, buildRoomCategoryIconKeys, roomCategoryIconKey } from "./roomCategoryIcons";

describe("roomCategoryIconKey", () => {
  it("люкс всегда получает корону, независимо от индекса", () => {
    expect(roomCategoryIconKey(0, true)).toBe("luxury");
    expect(roomCategoryIconKey(5, true)).toBe("luxury");
  });

  it("обычные категории идут по кругу из фиксированного набора", () => {
    expect(roomCategoryIconKey(0, false)).toBe(REGULAR_ROOM_ICON_KEYS[0]);
    expect(roomCategoryIconKey(1, false)).toBe(REGULAR_ROOM_ICON_KEYS[1]);
    expect(roomCategoryIconKey(REGULAR_ROOM_ICON_KEYS.length, false)).toBe(REGULAR_ROOM_ICON_KEYS[0]);
  });
});

describe("buildRoomCategoryIconKeys", () => {
  it("назначает иконки по sortOrder, люксу — всегда корону", () => {
    const map = buildRoomCategoryIconKeys([
      { id: 1, isLuxury: false, sortOrder: 2 },
      { id: 2, isLuxury: true, sortOrder: 1 },
      { id: 3, isLuxury: false, sortOrder: 3 },
    ]);
    expect(map.get(2)).toBe("luxury");
    expect(map.get(1)).toBe(REGULAR_ROOM_ICON_KEYS[0]);
    expect(map.get(3)).toBe(REGULAR_ROOM_ICON_KEYS[1]);
  });

  it("при равном sortOrder порядок решает id", () => {
    const map = buildRoomCategoryIconKeys([
      { id: 5, isLuxury: false, sortOrder: 1 },
      { id: 2, isLuxury: false, sortOrder: 1 },
    ]);
    expect(map.get(2)).toBe(REGULAR_ROOM_ICON_KEYS[0]);
    expect(map.get(5)).toBe(REGULAR_ROOM_ICON_KEYS[1]);
  });

  it("люксовые категории не занимают место в общем круге обычных", () => {
    const map = buildRoomCategoryIconKeys([
      { id: 1, isLuxury: true, sortOrder: 1 },
      { id: 2, isLuxury: false, sortOrder: 2 },
    ]);
    expect(map.get(1)).toBe("luxury");
    expect(map.get(2)).toBe(REGULAR_ROOM_ICON_KEYS[0]);
  });

  it("пустой список — пустая карта", () => {
    expect(buildRoomCategoryIconKeys([]).size).toBe(0);
  });
});
