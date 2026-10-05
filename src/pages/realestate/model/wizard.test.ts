import { describe, expect, it } from "vitest";

import { sectionKey } from "../../../api/realestate";
import { buildBoard } from "./board";
import {
  bulkUnitsBody,
  cloneSection,
  firstInvalidStep,
  initialWizardState,
  newRange,
  newSection,
  nextRange,
  planUnits,
  previewBoardData,
  projectBody,
  resizeFloor,
  validateStep,
  wizardTotals,
  type WizardState,
} from "./wizard";

const two = (overrides: Partial<WizardState> = {}): WizardState => ({
  ...initialWizardState("Корпус 1"),
  name: "Северный квартал",
  pricePerSqm: 100_000,
  sections: [
    newSection("Корпус 1", [newRange(2, 3, [{ rooms: 1, area: 40 }, { rooms: 2, area: 60 }])]),
    newSection("Корпус 2", [newRange(2, 2, [{ rooms: 3, area: 80.04 }])]),
  ],
  ...overrides,
});

const codes = (state: WizardState, step: Parameters<typeof validateStep>[1]) => validateStep(state, step).map((i) => i.code);

describe("planUnits", () => {
  it("раскладывает квартиры по этажам, slot сквозной по ЖК слева направо", () => {
    const units = planUnits(two());
    expect(units.map((u) => [u.sectionName, u.floor, u.position, u.slot])).toEqual([
      ["Корпус 1", 2, 1, 1],
      ["Корпус 1", 2, 2, 2],
      ["Корпус 2", 2, 1, 3],
      ["Корпус 1", 3, 1, 1],
      ["Корпус 1", 3, 2, 2],
    ]);
    // Пара «этаж + slot» уникальна — бэк это проверяет в пределах ЖК.
    expect(new Set(units.map((u) => `${u.floor}:${u.slot}`)).size).toBe(units.length);
  });

  it("нумерация по корпусам: корпус 1 снизу вверх, корпус 2 продолжает", () => {
    const units = planUnits(two());
    expect(units.map((u) => [u.sectionName, u.floor, u.position, u.number])).toEqual([
      ["Корпус 1", 2, 1, 1],
      ["Корпус 1", 2, 2, 2],
      ["Корпус 2", 2, 1, 5],
      ["Корпус 1", 3, 1, 3],
      ["Корпус 1", 3, 2, 4],
    ]);
  });

  it("нумерация «этаж × 100»: 201, 202, 203, 301…", () => {
    const units = planUnits(two({ numbering: "byFloor" }));
    expect(units.map((u) => u.number)).toEqual([201, 202, 203, 301, 302]);
  });

  it("цена: база на нижнем этаже + надбавка за этаж, площадь до 0.1 м²", () => {
    const units = planUnits(two({ floorStep: 2_000 }));
    const k2 = units.find((u) => u.sectionName === "Корпус 2")!;
    expect(k2.area).toBe(80);
    expect(k2.pricePerSqm).toBe(100_000);
    expect(k2.price).toBe(8_000_000);
    const top = units.find((u) => u.floor === 3 && u.position === 2)!;
    expect(top.pricePerSqm).toBe(102_000);
    expect(top.price).toBe(6_120_000);
  });

  it("этаж без диапазона — без квартир, но остальные этажи на месте", () => {
    const state = two({ sections: [newSection("А", [newRange(2, 2, [{ rooms: 1, area: 40 }]), newRange(5, 5, [{ rooms: 1, area: 40 }])])] });
    expect(planUnits(state).map((u) => u.floor)).toEqual([2, 5]);
  });

  it("итоги: число, площадь, сумма и разбивка по комнатности", () => {
    const totals = wizardTotals(planUnits(two()));
    expect(totals.units).toBe(5);
    expect(totals.area).toBe(280);
    expect(totals.price).toBe(28_000_000);
    expect(totals.byRooms).toEqual([
      { rooms: 1, count: 2 },
      { rooms: 2, count: 2 },
      { rooms: 3, count: 1 },
    ]);
  });
});

describe("правка раскладки", () => {
  it("resizeFloor повторяет последнюю квартиру и срезает справа", () => {
    const floor = [{ rooms: 1, area: 40 }, { rooms: 2, area: 60 }];
    expect(resizeFloor(floor, 3)).toEqual([...floor, { rooms: 2, area: 60 }]);
    expect(resizeFloor(floor, 1)).toEqual([floor[0]]);
    expect(resizeFloor(floor, 0)).toHaveLength(1);
    expect(resizeFloor(floor, 99)).toHaveLength(20);
  });

  it("nextRange начинается над последним диапазоном с той же раскладкой", () => {
    const section = newSection("А", [newRange(2, 10, [{ rooms: 1, area: 40 }])]);
    const next = nextRange(section);
    expect([next.from, next.to]).toEqual([11, 11]);
    expect(next.units).toEqual([{ rooms: 1, area: 40 }]);
  });

  it("cloneSection копирует диапазоны, а не ссылки на них", () => {
    const source = newSection("А", [newRange(2, 4, [{ rooms: 1, area: 40 }])]);
    const copy = cloneSection(source, "Б");
    copy.ranges[0]!.units[0]!.area = 99;
    expect(source.ranges[0]!.units[0]!.area).toBe(40);
    expect(copy.ranges[0]!.id).not.toBe(source.ranges[0]!.id);
  });
});

describe("validateStep", () => {
  it("ЖК: название обязательно", () => {
    expect(codes(two({ name: "  " }), "project")).toEqual(["nameRequired"]);
    expect(codes(two(), "project")).toEqual([]);
  });

  it("корпуса: имя обязательно, уникально без учёта регистра и не длиннее 16 символов", () => {
    const state = two({ sections: [newSection("Корпус 1"), newSection("корпус  1"), newSection(""), newSection("Очень длинное имя корпуса")] });
    expect(codes(state, "sections")).toEqual(["sectionNameDuplicate", "sectionNameRequired", "sectionNameTooLong"]);
  });

  it("этажи: перевёрнутый диапазон, пересечение, границы и площадь", () => {
    const state = two({
      sections: [
        newSection("А", [newRange(5, 3), newRange(2, 4, [{ rooms: 1, area: 5 }]), newRange(4, 6), newRange(0, 1)]),
      ],
    });
    expect(codes(state, "floors").sort()).toEqual(
      ["areaOutOfBounds", "floorOutOfBounds", "floorRangeInverted", "floorRangesOverlap", "floorRangesOverlap"].sort(),
    );
  });

  it("одинаковая ошибка у нескольких квартир показывается один раз", () => {
    const state = two({ sections: [newSection("А", [newRange(2, 2, [{ rooms: 1, area: 1 }, { rooms: 1, area: 2 }])])] });
    expect(codes(state, "floors")).toEqual(["areaOutOfBounds"]);
  });

  it("цены: база обязательна; «этаж × 100» не больше 99 квартир на этаже", () => {
    expect(codes(two({ pricePerSqm: 0 }), "prices")).toEqual(["priceRequired"]);
    const wide = two({
      numbering: "byFloor",
      sections: Array.from({ length: 6 }, (_, i) => newSection(`К${i}`, [newRange(2, 2, resizeFloor([], 20))])),
    });
    expect(codes(wide, "prices")).toEqual(["byFloorTooWide"]);
  });

  it("firstInvalidStep — первый шаг с ошибкой", () => {
    expect(firstInvalidStep(two())).toBeNull();
    expect(firstInvalidStep(two({ pricePerSqm: 0 }))).toBe("prices");
    expect(firstInvalidStep(two({ name: "" }))).toBe("project");
  });
});

describe("тела запросов", () => {
  it("projectBody: этажи ЖК и секций выводятся из диапазонов, срок секции наследует срок ЖК", () => {
    const state = two({ deadline: "2027-06-30" });
    state.sections[1]!.deadline = "2027-12-31";
    expect(projectBody(state)).toEqual({
      name: "Северный квартал",
      address: "",
      deadline: "2027-06-30",
      pricePerSqm: "100000",
      startFloor: 2,
      floors: 3,
      sections: [
        { name: "Корпус 1", startFloor: 2, floors: 2, deadline: "2027-06-30" },
        { name: "Корпус 2", startFloor: 2, floors: 1, deadline: "2027-12-31" },
      ],
    });
  });

  it("bulkUnitsBody: секция по id созданной секции, деньги и площадь строками", () => {
    const ids = new Map([[sectionKey("Корпус 1"), 11], [sectionKey("Корпус 2"), 12]]);
    const [first, , third] = bulkUnitsBody(planUnits(two()), ids);
    expect(first).toEqual({
      number: 1, floor: 2, slot: 1, section: "Корпус 1", sectionId: 11, rooms: 1,
      area: "40.0", price: "4000000", pricePerSqm: "100000",
    });
    expect(third!.sectionId).toBe(12);
  });
});

describe("предпросмотр", () => {
  it("рисуется той же моделью шахматки: корпуса, этажи сверху вниз, позиции", () => {
    const state = two();
    const { project, units } = previewBoardData(state, planUnits(state));
    const board = buildBoard(project, units);
    expect(board.floors).toEqual([3, 2]);
    expect(board.sections.map((s) => [s.name, s.columns])).toEqual([["Корпус 1", 2], ["Корпус 2", 1]]);
    expect(board.sections[1]!.unitAt(2, 1)?.number).toBe("5");
  });
});
