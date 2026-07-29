import { describe, expect, it } from "vitest";

import type { AppointmentConsumptionWarning } from "../../api/appointments";
import { formatConsumptionWarnings } from "./consumptionWarnings";

const warning = (
  patch: Partial<AppointmentConsumptionWarning>,
): AppointmentConsumptionWarning => ({
  code: "insufficient_stock",
  branchId: null,
  productId: 50,
  name: "Гель",
  warehouseId: 3,
  required: "2.000",
  stockOnHand: "1.000",
  resultingStock: "-1.000",
  ...patch,
});

describe("formatConsumptionWarnings", () => {
  it("пустой массив не даёт тоста", () => {
    expect(formatConsumptionWarnings([])).toBeNull();
    expect(formatConsumptionWarnings(undefined)).toBeNull();
  });

  it("нехватка: сколько списано и каким стал остаток", () => {
    expect(formatConsumptionWarnings([warning({})])).toBe(
      "Гель: списано 2, остаток -1",
    );
  });

  it("склада у филиала нет — про товар не сообщаем (все поля null)", () => {
    const w = warning({
      code: "warehouse_not_found",
      branchId: 7,
      productId: null,
      name: null,
      warehouseId: null,
      required: null,
      stockOnHand: null,
      resultingStock: null,
    });
    expect(formatConsumptionWarnings([w])).toBe(
      "У филиала нет склада — расходники не списаны",
    );
  });

  it("остаток неизвестен — упоминаем только списание", () => {
    expect(formatConsumptionWarnings([warning({ resultingStock: null })])).toBe(
      "Гель: списано 2",
    );
  });

  it("несколько предупреждений — одной строкой", () => {
    const out = formatConsumptionWarnings([
      warning({}),
      warning({ name: "Перчатки", required: "4.000", resultingStock: "-2.000" }),
    ]);
    expect(out).toBe("Гель: списано 2, остаток -1; Перчатки: списано 4, остаток -2");
  });
});
