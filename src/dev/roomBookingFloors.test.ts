import { describe, expect, it } from "vitest";

import { floorGroupLabel, groupRoomsByFloor, pluralRooms } from "./roomBookingFloors";

const room = (number: string, floor: string) => ({ number, floor });

describe("groupRoomsByFloor", () => {
  it("группирует по этажу и сортирует этажи численно, а не по алфавиту", () => {
    const rooms = [room("101", "1"), room("201", "2"), room("1001", "10"), room("102", "1")];
    const groups = groupRoomsByFloor(rooms);
    expect(groups.map((g) => g.floor)).toEqual(["1", "2", "10"]);
  });

  it("сортирует номера внутри этажа численно, а не по алфавиту", () => {
    const rooms = [room("110", "1"), room("102", "1"), room("9", "1")];
    const groups = groupRoomsByFloor(rooms);
    expect(groups[0].rooms.map((r) => r.number)).toEqual(["9", "102", "110"]);
  });

  it("номера без этажа собираются в свою группу и идут последними", () => {
    const rooms = [room("101", "1"), room("999", ""), room("102", "1")];
    const groups = groupRoomsByFloor(rooms);
    expect(groups.map((g) => g.floor)).toEqual(["1", ""]);
    expect(groups[1].rooms.map((r) => r.number)).toEqual(["999"]);
  });

  it("этаж — пробелы приравниваются к пустому", () => {
    const rooms = [room("101", "  "), room("102", "1")];
    const groups = groupRoomsByFloor(rooms);
    expect(groups.map((g) => g.floor)).toEqual(["1", ""]);
  });

  it("пустой список — пустой результат", () => {
    expect(groupRoomsByFloor([])).toEqual([]);
  });
});

describe("floorGroupLabel", () => {
  it("число дополняется словом «этаж»", () => {
    expect(floorGroupLabel("1")).toBe("1 этаж");
    expect(floorGroupLabel("12")).toBe("12 этаж");
  });

  it("свободный текст остаётся как есть", () => {
    expect(floorGroupLabel("Мансарда")).toBe("Мансарда");
    expect(floorGroupLabel("Цоколь")).toBe("Цоколь");
  });

  it("пустой этаж — «Без этажа»", () => {
    expect(floorGroupLabel("")).toBe("Без этажа");
    expect(floorGroupLabel("   ")).toBe("Без этажа");
  });
});

describe("pluralRooms", () => {
  it("склоняет по стандартным русским правилам, включая исключения 11–14", () => {
    expect(pluralRooms(1)).toBe("номер");
    expect(pluralRooms(2)).toBe("номера");
    expect(pluralRooms(5)).toBe("номеров");
    expect(pluralRooms(11)).toBe("номеров");
    expect(pluralRooms(12)).toBe("номеров");
    expect(pluralRooms(14)).toBe("номеров");
    expect(pluralRooms(21)).toBe("номер");
    expect(pluralRooms(22)).toBe("номера");
    expect(pluralRooms(25)).toBe("номеров");
    expect(pluralRooms(101)).toBe("номер");
    expect(pluralRooms(0)).toBe("номеров");
  });
});
