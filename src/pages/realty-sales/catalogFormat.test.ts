import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { fromRawCatalogProject } from "../../api/realtyCatalog";
import { matchesProjectSearch, parseAmount, projectForm, projectPatch, roomsKey } from "./catalogFormat";

describe("parseAmount", () => {
  it("пробелы и запятая", () => {
    expect(parseAmount("5 000 000")).toBe(5_000_000);
    expect(parseAmount("64,5")).toBe(64.5);
  });
  it("пусто, мусор и минус — фильтр не применяется", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});

describe("roomsKey", () => {
  it("4 и больше — одна группа", () => {
    expect([0, 1, 4, 6].map(roomsKey)).toEqual(["0", "1", "4", "4"]);
  });
});

describe("matchesProjectSearch", () => {
  const p = { name: "Ала-Тоо Residence", address: "г. Бишкек, ул. Сухэ-Батора, 18", district: "Асанбай", code: "ala" };
  it("по названию, адресу, району, коду — без учёта регистра", () => {
    expect(matchesProjectSearch(p, "ала-тоо")).toBe(true);
    expect(matchesProjectSearch(p, "сухэ")).toBe(true);
    expect(matchesProjectSearch(p, "АСАНБАЙ")).toBe(true);
    expect(matchesProjectSearch(p, "ordo")).toBe(false);
  });
});

describe("projectPatch", () => {
  const project = fromRawCatalogProject({
    id: 1,
    name: "Ала-Тоо Residence",
    progress: 68,
    deadline: "2027-12-30",
    pricePerSqm: "102000.00",
    defaultReservationAmount: "50000.00",
    sections: [],
    roomStats: [],
  });
  const before = projectForm(project);
  it("без изменений — пустой PATCH", () => {
    expect(projectPatch(before, { ...before })).toEqual({});
  });
  it("только изменённые поля, числа и даты в формате бэка", () => {
    expect(
      projectPatch(before, { ...before, name: " Ала-Тоо 2 ", progress: "70", deadline: dayjs("2028-03-31"), pricePerSqm: "105 000", reservationAmount: "" }),
    ).toEqual({ name: "Ала-Тоо 2", progress: 70, deadline: "2028-03-31", pricePerSqm: "105000", defaultReservationAmount: null });
  });
});
