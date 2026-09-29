import { describe, expect, it } from "vitest";

import {
  fromRawProject,
  fromRawUnit,
  fromRawUnitDetails,
  withSectionPositions,
  type RawProject,
  type RawUnit,
  type RawUnitDetails,
} from "./realestate";
import { buildBoard, withUnitLayout } from "../pages/realestate/model/board";

// Фикстуры — урезанные ответы /api/v2/realty на test2.crm.operator.kg (28.09.2026).
const rawProject: RawProject = {
  id: 1,
  name: "Ала-Тоо Residence",
  queue: "I очередь",
  stage: "Монолитный каркас 9–12 этажи",
  floors: 14,
  startFloor: 1,
  sections: [],
  finish: "White box",
  deadlineLabel: "IV квартал 2027",
  manager: null,
};

function rawUnit(id: number, section: string, floor: number, slot: number, extra: Partial<RawUnit> = {}): RawUnit {
  return {
    id,
    projectId: 1,
    number: id,
    floor,
    slot,
    section,
    rooms: 2,
    area: 65.5,
    insideArea: 40,
    price: "6681000.00",
    pricePerSqm: "102000.00",
    status: "free",
    orientation: "Юг",
    view: "На горы",
    balconyType: "loggia",
    balconyArea: 4,
    terrace: null,
    terraceArea: null,
    ceiling: 3,
    bathrooms: 1,
    panoramic: true,
    corner: true,
    roomData: [],
    layoutVariant: 0,
    reservation: null,
    contract: null,
    ...extra,
  };
}

describe("переходники realty → модель шахматки", () => {
  it("ЖК: id строкой, срок сдачи из deadlineLabel, пустые секции остаются пустыми", () => {
    const project = fromRawProject(rawProject);
    expect(project).toMatchObject({
      id: "1",
      floorsCount: 14,
      firstResidentialFloor: 1,
      sections: [],
      completionLabel: "IV квартал 2027",
      manager: "",
    });
  });

  it("квартира: деньги из строк-decimal, площади и лоджия", () => {
    const unit = fromRawUnit(rawUnit(1, "А", 2, 1), "АЛ-2A");
    expect(unit).toMatchObject({
      id: "1",
      projectId: "1",
      number: "1",
      price: 6_681_000,
      pricePerSqm: 102_000,
      totalArea: 65.5,
      livingArea: 40,
      outdoor: { type: "loggia", area: 4 },
      ceilingHeight: 3,
      isCorner: true,
      hasPanoramicWindows: true,
      layoutCode: "АЛ-2A",
      axis: 1,
    });
  });

  it("slot сквозной по этажу: место в секции Б считается от её левой оси", () => {
    const units = withSectionPositions([
      fromRawUnit(rawUnit(1, "А", 2, 1)),
      fromRawUnit(rawUnit(4, "А", 2, 4)),
      fromRawUnit(rawUnit(53, "Б", 2, 5)),
      fromRawUnit(rawUnit(56, "Б", 2, 8)),
    ]);
    expect(units.map((u) => `${u.section}${u.position}`)).toEqual(["А1", "А4", "Б1", "Б4"]);
    expect(units.map((u) => u.axis)).toEqual([1, 4, 5, 8]);
  });

  it("секции и первый этаж ЖК достраиваются по квартирам", () => {
    const units = withSectionPositions([
      fromRawUnit(rawUnit(53, "Б", 2, 5)),
      fromRawUnit(rawUnit(1, "А", 2, 1)),
      fromRawUnit(rawUnit(49, "А", 14, 1)),
    ]);
    const project = withUnitLayout(fromRawProject(rawProject), units);
    expect(project.sections).toEqual(["А", "Б"]);
    expect(project.firstResidentialFloor).toBe(2);

    const board = buildBoard(project, units);
    expect(board.floors[0]).toBe(14);
    expect(board.floors.at(-1)).toBe(2);
    expect(board.sections.map((s) => [s.name, s.columns])).toEqual([
      ["А", 1],
      ["Б", 1],
    ]);
  });

  it("карточка: бронь, договор, история с человеческими датами, скидка числом", () => {
    const raw: RawUnitDetails = {
      ...rawUnit(1, "А", 2, 1, {
        status: "reserved",
        reservation: {
          id: 7,
          buyer: "Бакыт Усупов",
          phone: "+996700333444",
          type: "prepaid",
          term: 72,
          amount: "100000.00",
          paymentStatus: "paid",
          expiresAt: "2026-10-01T20:53:36.426801+06:00",
          offerId: "installment-24",
          finalPrice: "6681000.00",
        },
        contract: {
          number: "ДКП-2026-001",
          buyer: "Чынара Молдокулова",
          payment: "installment",
          paymentLabel: "Рассрочка 24 месяца",
          signedAt: "2026-09-23T20:53:36.466470+06:00",
        },
      }),
      history: [
        {
          id: 1,
          type: "reserve",
          title: "Бронь оформлена",
          date: "2026-09-28T20:53:36.455722+06:00",
          actor: "Менеджер",
          buyer: "Бакыт Усупов",
          stage: "Бронирование",
          details: null,
        },
      ],
      offers: [
        {
          id: "installment-24",
          tone: "green",
          icon: "🏠",
          badge: "Хит",
          title: "Рассрочка 24 мес. без %",
          discount: "0.00",
          until: "до 31.12.2026",
          text: "Оплатите 30% и въезжайте.",
        },
      ],
    };
    const details = fromRawUnitDetails(raw);
    expect(details.reservation).toMatchObject({ id: "7", termHours: 72, amount: 100_000, finalPrice: 6_681_000 });
    expect(details.building).toBe("А");
    expect(details.reservation?.expiresAt).toMatch(/^\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    expect(details.contract).toMatchObject({ number: "ДКП-2026-001", payment: "Рассрочка 24 месяца" });
    expect(details.contract?.signedAt).toMatch(/^\d{2}\.09\.2026 \d{2}:\d{2}$/);
    expect(details.history[0]).toMatchObject({ id: "1", details: "" });
    expect(details.history[0].date).toMatch(/^\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    expect(details.offers[0].discount).toBe(0);
  });

  it("секции ЖК — объекты по порядку; дом = название секции", () => {
    const project = fromRawProject({
      ...rawProject,
      sections: [
        { id: 1, name: "А", floors: 13, progress: 60, deadline: null, deadlineLabel: "III квартал 2027" },
        { id: 2, name: "Б", floors: 13, progress: 40, deadline: null, deadlineLabel: "IV квартал 2027" },
      ],
    });
    expect(project.sections).toEqual(["А", "Б"]);
    expect(project.buildings).toEqual(["А", "Б"]);
  });

  it("площадь помещения читается из size", () => {
    const unit = fromRawUnit(rawUnit(1, "А", 2, 1, { roomData: [{ name: "Гостиная", size: 22.5, width: 4.5, length: 5 }] }));
    expect(unit.roomsBreakdown).toEqual([{ name: "Гостиная", area: 22.5, width: 4.5, length: 5 }]);
  });
});
