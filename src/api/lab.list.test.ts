import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, apiRequest: vi.fn() };
});

import { apiRequest } from "./client";
import {
  getLabClientTypes,
  getLabDoctors,
  getLabTestCard,
  getLabInstruments,
  getLabPreparation,
  getLabProfiles,
  getLabQuestions,
  getLabTests,
} from "./lab";

const mocked = vi.mocked(apiRequest);

/**
 * Списочные ручки раздела отдают ГОЛЫЙ массив, а не конверт `{results}`.
 *
 * Клиент читал `data.results`, получал `undefined` и раздавал экрану пустоту:
 * дровер приёма показывал «Каталог анализов пуст» при двух с лишним тысячах
 * анализов в зеркале. Ошибка не видна ни по коду ответа, ни в консоли —
 * только по пустому списку, поэтому контракт закреплён тестом.
 */
describe("списочные ручки лаборатории читают массив", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("getLabTests отдаёт анализы", async () => {
    mocked.mockResolvedValue([{ id: 1, title: "Глюкоза" }]);

    await expect(getLabTests()).resolves.toEqual([
      { id: 1, title: "Глюкоза" },
    ]);
  });

  it("getLabProfiles отдаёт профили", async () => {
    mocked.mockResolvedValue([{ id: 2, title: "Биохимия", testIds: [1] }]);

    await expect(getLabProfiles()).resolves.toEqual([
      { id: 2, title: "Биохимия", testIds: [1] },
    ]);
  });

  it("getLabInstruments отдаёт пробирки набора", async () => {
    mocked.mockResolvedValue([{ id: 3, title: "ЭДТА", price: "15.00" }]);

    await expect(getLabInstruments([1])).resolves.toEqual([
      { id: 3, title: "ЭДТА", price: "15.00" },
    ]);
  });

  it("getLabQuestions отдаёт вопросы набора", async () => {
    mocked.mockResolvedValue([{ id: 4, title: "Срок" }]);

    await expect(getLabQuestions([1])).resolves.toEqual([
      { id: 4, title: "Срок" },
    ]);
  });

  it("getLabPreparation отдаёт памятки набора", async () => {
    mocked.mockResolvedValue(["Натощак 8 часов"]);

    await expect(getLabPreparation([1])).resolves.toEqual([
      "Натощак 8 часов",
    ]);
  });
});

describe("карточка анализа", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("getLabTestCard ходит по id и отдаёт карточку как есть", async () => {
    mocked.mockResolvedValue({
      id: 7,
      title: "Глюкоза",
      biomaterial: "Кровь",
      priceStandard: "250.00",
      priceExpress: "400.00",
      requiredDay: 1,
      requiresDoctor: false,
      preparation: null,
      questions: [],
      knowledgeItems: [],
    });

    const card = await getLabTestCard(7);

    expect(mocked.mock.calls[0][0]).toBe("/lab/tests/7/");
    expect(card.title).toBe("Глюкоза");
  });
});

describe("справочник врачей ЛИС", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("без запроса идёт на /lab/doctors/ без параметров", async () => {
    mocked.mockResolvedValue([
      { id: 3, lisId: 7759, fullName: "Тулегенова Нургуль", qualification: "" },
    ]);

    const doctors = await getLabDoctors();

    expect(mocked.mock.calls[0][0]).toBe("/lab/doctors/");
    expect(doctors[0].lisId).toBe(7759);
  });

  it("запрос уходит в ?q= с экранированием", async () => {
    // Фамилии кириллицей и с пробелами: без encodeURIComponent запрос
    // ломался бы на первом же «Жолдошова Шахрибану».
    mocked.mockResolvedValue([]);

    await getLabDoctors(" Жолдошова Ш ");

    expect(mocked.mock.calls[0][0]).toBe(
      `/lab/doctors/?q=${encodeURIComponent("Жолдошова Ш")}`,
    );
  });
});

describe("типы клиента ЛИС", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("getLabClientTypes читает массив с /lab/client-types/", async () => {
    mocked.mockResolvedValue([
      { id: 1, lisId: 16, title: "СТАНДАРТ", discountPercent: 0 },
    ]);

    const types = await getLabClientTypes();

    expect(mocked.mock.calls[0][0]).toBe("/lab/client-types/");
    expect(types[0].discountPercent).toBe(0);
  });
});
