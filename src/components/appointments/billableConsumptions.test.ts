import { describe, expect, it } from "vitest";

import {
  billableConsumptionsTotal,
  consumptionLineTotal,
  type AppointmentConsumption,
  type AppointmentServiceLine,
} from "../../api/appointments";
import { billableRowsTotal, toConsumptionRow } from "./consumptionRows";

const consumption = (patch: Partial<AppointmentConsumption>): AppointmentConsumption => ({
  id: 1,
  productId: 50,
  name: "Импланон",
  unit: "шт",
  quantity: "1.000",
  autoWriteOff: true,
  source: "service_template",
  stockOnHand: "9.000",
  shortage: false,
  resultingStock: "8.000",
  ...patch,
});

const serviceLine = (consumptions: AppointmentConsumption[]): AppointmentServiceLine => ({
  id: 13727,
  service: null,
  employee: null,
  price: "1000.00",
  durationMinutes: 30,
  quantity: 1,
  unitPrice: "1000.00",
  discountAmount: "0.00",
  consumptions,
});

describe("consumptionLineTotal", () => {
  it("бесплатный расходник в деньги не идёт", () => {
    expect(
      consumptionLineTotal(
        consumption({ billable: false, unitPrice: "9000.00", lineTotal: "9000.00" }),
      ),
    ).toBe(0);
  });

  it("платный: берём lineTotal бэка как есть", () => {
    expect(
      consumptionLineTotal(
        consumption({ billable: true, unitPrice: "9000.00", lineTotal: "9000.00" }),
      ),
    ).toBe(9000);
  });

  it("платный без lineTotal: считаем unitPrice × quantity", () => {
    expect(
      consumptionLineTotal(consumption({ billable: true, unitPrice: "50.00", quantity: "5.000" })),
    ).toBe(250);
  });

  it("платный без цены (старый ответ бэка) — ноль, а не NaN", () => {
    expect(consumptionLineTotal(consumption({ billable: true }))).toBe(0);
  });

  it("отсутствие поля billable читается как «в цене услуги»", () => {
    expect(consumptionLineTotal(consumption({ unitPrice: "9000.00" }))).toBe(0);
  });
});

describe("billableConsumptionsTotal", () => {
  it("суммирует платные строки по всем строкам услуг", () => {
    const total = billableConsumptionsTotal([
      serviceLine([
        consumption({ id: 1, billable: true, unitPrice: "9000.00", lineTotal: "9000.00" }),
        consumption({ id: 2, billable: false, unitPrice: "50.00", lineTotal: "0.00" }),
      ]),
      serviceLine([
        consumption({ id: 3, billable: true, unitPrice: "50.00", quantity: "5.000" }),
      ]),
    ]);
    expect(total).toBe(9250);
  });

  it("приём без расходников — ноль", () => {
    expect(billableConsumptionsTotal([serviceLine([])])).toBe(0);
  });
});

describe("toConsumptionRow + billableRowsTotal", () => {
  it("цена восстанавливается из lineTotal, когда unitPrice не пришёл", () => {
    const row = toConsumptionRow(
      consumption({ billable: true, quantity: "5.000", lineTotal: "250.00" }),
    );
    expect(row.unitPrice).toBe(50);
    expect(billableRowsTotal([row])).toBe(250);
  });

  it("правка количества в форме пересчитывает сумму по той же цене", () => {
    const row = toConsumptionRow(
      consumption({ billable: true, unitPrice: "9000.00", lineTotal: "9000.00" }),
    );
    expect(billableRowsTotal([{ ...row, quantity: "2" }])).toBe(18000);
  });

  it("невалидное количество в поле ввода не ломает сумму", () => {
    const row = toConsumptionRow(consumption({ billable: true, unitPrice: "9000.00" }));
    expect(billableRowsTotal([{ ...row, quantity: "" }])).toBe(0);
  });
});
