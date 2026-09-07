import { describe, expect, it } from "vitest";

import { buildSalaryServiceOptions } from "./salaryServiceOptions";

/**
 * В правилах ЗП услугу, которую сотрудник не оказывает, назначать бессмысленно:
 * дровер приёма не даст поставить её этому исполнителю (canEmployeeProvideService),
 * значит ставка никогда не отработает. Поэтому список сужаем до закреплённых —
 * но только когда привязки реально загружены, и не теряя услуги из уже
 * созданных правил.
 */
const svc = (id: number, name = `Услуга ${id}`) => ({ id, name });

const CATALOG = [svc(1, "Забор крови"), svc(2, "Ингаляция"), svc(3, "Перевязка")];

describe("buildSalaryServiceOptions", () => {
  it("оставляет весь каталог, когда привязки не загружены", () => {
    expect(
      buildSalaryServiceOptions({
        allServices: CATALOG,
        assignedServices: [],
        ruleServiceIds: [],
        assignmentsKnown: false,
      }),
    ).toEqual(CATALOG);
  });

  it("сужает список до закреплённых услуг", () => {
    expect(
      buildSalaryServiceOptions({
        allServices: CATALOG,
        assignedServices: [CATALOG[1]],
        ruleServiceIds: [],
        assignmentsKnown: true,
      }),
    ).toEqual([CATALOG[1]]);
  });

  it("отдаёт пустой список сотруднику без закреплённых услуг", () => {
    expect(
      buildSalaryServiceOptions({
        allServices: CATALOG,
        assignedServices: [],
        ruleServiceIds: [],
        assignmentsKnown: true,
      }),
    ).toEqual([]);
  });

  it("сохраняет откреплённую услугу, если она уже упомянута в правиле", () => {
    expect(
      buildSalaryServiceOptions({
        allServices: CATALOG,
        assignedServices: [CATALOG[0]],
        ruleServiceIds: [3],
        assignmentsKnown: true,
      }),
    ).toEqual([CATALOG[0], CATALOG[2]]);
  });

  it("не дублирует услугу, которая и закреплена, и есть в правиле", () => {
    expect(
      buildSalaryServiceOptions({
        allServices: CATALOG,
        assignedServices: [CATALOG[0]],
        ruleServiceIds: [1],
        assignmentsKnown: true,
      }),
    ).toEqual([CATALOG[0]]);
  });

  it("молча пропускает id из правила, которого нет в каталоге", () => {
    expect(
      buildSalaryServiceOptions({
        allServices: CATALOG,
        assignedServices: [],
        ruleServiceIds: [999],
        assignmentsKnown: true,
      }),
    ).toEqual([]);
  });
});
