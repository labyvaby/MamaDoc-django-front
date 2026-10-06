import { describe, it, expect } from "vitest";

import { applySearch, narrowLinesOf, type RegistryToken } from "./registryFilters";
import type { LinesOf } from "./registryStats";
import type { DjangoAppointment } from "../../../../api/appointments";

const DOCTOR = { id: 10, fullName: "Исаева Айсулуу" };
const NURSE = { id: 20, fullName: "Садыкова Гульмира" };
const UZI = { id: 1, name: "УЗИ" };
const LAB = { id: 2, name: "Анализы" };
const SHOT = { id: 3, name: "Инъекция" };

const appt = (id: number, services: [typeof UZI, typeof DOCTOR][]): DjangoAppointment =>
  ({
    id,
    patient: { id: 100 + id, fullName: `Пациент ${id}` },
    services: services.map(([service, employee], index) => ({
      id: id * 10 + index,
      service,
      employee,
      quantity: 1,
      lineTotal: "100.00",
    })),
  }) as unknown as DjangoAppointment;

const allLines: LinesOf = (a) => a.services.filter((sl) => sl.employee);

const items = [
  appt(1, [[UZI, DOCTOR]]),
  appt(2, [[LAB, DOCTOR]]),
  appt(3, [[SHOT, NURSE], [UZI, NURSE]]),
];

const service = (s: typeof UZI): RegistryToken => ({ kind: "service", id: s.id, label: s.name });
const employee = (e: typeof DOCTOR): RegistryToken => ({ kind: "employee", id: e.id, label: e.fullName });

describe("applySearch: условия-чипы", () => {
  it("две услуги — ИЛИ, а не пустой срез", () => {
    const found = applySearch(items, [service(UZI), service(LAB)], "", allLines);
    expect(found.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it("исполнитель и услуга проверяются на одной строке", () => {
    const found = applySearch(items, [employee(DOCTOR), service(UZI)], "", allLines);
    expect(found.map((a) => a.id)).toEqual([1]);
  });
});

describe("narrowLinesOf", () => {
  it("без условий на строки возвращает исходную функцию", () => {
    expect(narrowLinesOf(allLines, [])).toBe(allLines);
  });

  it("оставляет только строки выбранных услуг — деньги считаются по ним", () => {
    const lines = narrowLinesOf(allLines, [service(UZI)]);
    expect(lines(items[2]).map((l) => l.service?.name)).toEqual(["УЗИ"]);
  });
});
