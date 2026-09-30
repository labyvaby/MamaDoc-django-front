import { describe, expect, it } from "vitest";
import { seedProjects as projects, seedUnits as units } from "../../../api/realestate.mocks";
import { autoBoardView, buildBoard } from "./board";
import { priceListCsv } from "./priceList";
import { parseRange, formatRange, PRICE_SCALE } from "./useChessboardParams";

const projectById = (id: string) => projects.find((p) => p.id === id)!;
const unitsOf = (id: string) => units.filter((u) => u.projectId === id);

describe("buildBoard", () => {
  it("раскладывает каждую квартиру ровно в одну ячейку", () => {
    for (const project of projects) {
      const board = buildBoard(project, unitsOf(project.id));
      let placed = 0;
      for (const section of board.sections)
        for (const floor of board.floors)
          for (let pos = 1; pos <= section.columns; pos++) if (section.unitAt(floor, pos)) placed++;
      expect(placed).toBe(unitsOf(project.id).length);
    }
  });

  it("этажи идут сверху вниз от последнего до первого жилого", () => {
    const project = projectById("ala");
    const { floors } = buildBoard(project, unitsOf("ala"));
    expect(floors[0]).toBe(project.floorsCount);
    expect(floors[floors.length - 1]).toBe(project.firstResidentialFloor);
  });

  it("этажи и секции без квартир не рисуются", () => {
    const project = { ...projectById("ala"), sections: ["А", "Б", "В"] };
    const onlyThird = unitsOf("ala").filter((u) => u.floor === 3);
    const board = buildBoard(project, onlyThird);
    expect(board.floors).toEqual([3]);
    expect(board.sections.map((s) => s.name)).toEqual(["А", "Б"]);
  });

  it("квартира стоит в своей колонке секции, даже когда на этаже квартир меньше", () => {
    const board = buildBoard(projectById("ala"), unitsOf("ala"));
    const [a] = board.sections;
    // На 14-м этаже Ала-Тоо две квартиры, на 2-м — шесть: колонок у секции столько, сколько на самом широком.
    expect(a.columns).toBe(3);
    expect(a.unitAt(14, 1)).toBeDefined();
    expect(a.unitAt(14, 2)).toBeUndefined();
  });

  it("широкий корпус по умолчанию показывается компактно", () => {
    expect(autoBoardView(buildBoard(projectById("ordo"), unitsOf("ordo")))).toBe("compact");
    expect(autoBoardView(buildBoard(projectById("ala"), unitsOf("ala")))).toBe("detailed");
  });
});

describe("мок-данные", () => {
  it("id квартир уникальны", () => {
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("номера как в прототипе: <№ ЖК><этаж><место>", () => {
    expect(units.find((u) => u.id === "ala-14-2")?.number).toBe("1142");
    expect(units.find((u) => u.id === "north-2-1")?.number).toBe("3021");
  });

  // В Ордо Park до 24 мест на этаже, поэтому номера там повторяются — как и в прототипе.
  it.each(["ala", "north"])("номера квартир уникальны в ЖК %s", (id) => {
    const numbers = unitsOf(id).map((u) => u.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("priceListCsv", () => {
  it("выгружает все квартиры корпуса сверху вниз, через «;»", () => {
    const ala = unitsOf("ala");
    const lines = priceListCsv(ala).split("\r\n");
    expect(lines).toHaveLength(ala.length + 1);
    expect(lines[0]).toMatch(/^Номер;Секция;Этаж/);
    expect(lines[1]).toBe("1141;А;14;3-комн.;115,9;13155000;113500;Забронирована;Восток;Терраса 18,6");
  });
});

describe("диапазоны в URL", () => {
  it("цена хранится в млн и переводится в сомы туда и обратно", () => {
    const range = parseRange("5.2-9.4", PRICE_SCALE)!;
    expect(range).toEqual([5_200_000, 9_400_000]);
    expect(formatRange(range, PRICE_SCALE)).toBe("5.2-9.4");
  });

  it("перевёрнутый или битый диапазон игнорируется", () => {
    expect(parseRange("9-5")).toBeNull();
    expect(parseRange("abc")).toBeNull();
  });
});
