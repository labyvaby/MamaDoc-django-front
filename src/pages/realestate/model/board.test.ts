import { describe, expect, it } from "vitest";
import { seedProjects as projects, seedUnits as units } from "../../../api/realestate.mocks";
import { autoBoardView, buildBoard, factsLine, priceScale, projectFacts } from "./board";
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

  it("факты ЖК для шапки: секции, этажи, сроки без повторов, цена за м²", () => {
    const project = {
      ...projectById("ala"),
      sectionRefs: [
        { id: "1", name: "А", completionLabel: "I квартал 2027" },
        { id: "2", name: "Б", completionLabel: "I квартал 2027" },
      ],
    };
    const ala = unitsOf("ala");
    const facts = projectFacts(project, buildBoard(project, ala), ala);
    expect(facts.sections).toBe(2);
    expect(facts.floors).toEqual([project.firstResidentialFloor, project.floorsCount]);
    expect(facts.completion).toEqual(["I квартал 2027"]);
    expect(facts.pricePerSqm[0]).toBe(Math.min(...ala.map((u) => u.pricePerSqm)));
  });

  it("строка фактов: корпуса, этажи, срок, цена за м²", () => {
    const facts = { sections: 2, floors: [2, 14] as const, completion: ["I квартал 2027", "II квартал 2027"], pricePerSqm: [102_400, 118_900] as const };
    expect(factsLine(facts, ["Корпус А", "Корпус Б"])).toBe(
      "2 корпуса · этажи 2–14 · сдача I квартал 2027 / II квартал 2027 · 102–119 тыс. сом/м²",
    );
    expect(factsLine({ ...facts, sections: 5, floors: [1, 1], completion: [] }, ["2", "3", "4", "5", "6"])).toBe(
      "5 секций · 1 этаж · 102–119 тыс. сом/м²",
    );
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

describe("priceScale", () => {
  const withPrice = (pricePerSqm: number) => ({ ...unitsOf("ala")[0]!, pricePerSqm });

  it("пять ступеней по квантилям: дешёвые — 0, дорогие — 4", () => {
    const scale = priceScale(Array.from({ length: 10 }, (_, i) => withPrice(100_000 + i * 1000)));
    expect(scale.stepOf(100_000)).toBe(0);
    expect(scale.stepOf(109_000)).toBe(4);
    expect(scale.ranges).toHaveLength(5);
    expect(scale.ranges[0]![0]).toBe(100_000);
    expect(scale.ranges[4]![1]).toBe(109_000);
  });

  it("пара дорогих пентхаусов не сбивает шкалу в одну ступень", () => {
    const units = [...Array.from({ length: 8 }, (_, i) => withPrice(100_000 + i * 500)), withPrice(300_000), withPrice(320_000)];
    const scale = priceScale(units);
    const steps = new Set(units.slice(0, 8).map((u) => scale.stepOf(u.pricePerSqm)));
    expect(steps.size).toBeGreaterThanOrEqual(3);
  });

  it("без цен — пустая шкала", () => {
    expect(priceScale([]).ranges).toEqual([]);
  });
});
