import { describe, expect, it } from "vitest";

import type { AppointmentConsumptionWarning } from "../../api/appointments";
import { formatConsumptionWarnings } from "./consumptionWarnings";

/** Формат гайда §4a (списание по завершению приёма). */
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

/** Формат front_consumables_integration.md §1.3 (списание по оплате). */
const shortage = (
  patch: Partial<AppointmentConsumptionWarning>,
): AppointmentConsumptionWarning => ({
  code: "SHORTAGE",
  productId: 45,
  productName: "Шприц 5мл",
  warehouseId: 3,
  warehouseName: "Основной склад",
  requested: "10.000",
  available: "2.000",
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
    expect(
      formatConsumptionWarnings([warning({ resultingStock: null, stockOnHand: null })]),
    ).toBe("Гель: списано 2");
  });

  it("несколько предупреждений — одной строкой", () => {
    const out = formatConsumptionWarnings([
      warning({}),
      warning({ name: "Перчатки", required: "4.000", resultingStock: "-2.000" }),
    ]);
    expect(out).toBe("Гель: списано 2, остаток -1; Перчатки: списано 4, остаток -2");
  });

  // Второй формат бэка: другие имена полей и code = SHORTAGE. Остатка «после»
  // в нём нет — считаем сами из available − requested, иначе не сказать
  // главного: остаток ушёл в минус.
  it("формат оплаты: SHORTAGE с productName/requested/available", () => {
    expect(formatConsumptionWarnings([shortage({})])).toBe(
      "Шприц 5мл: списано 10, остаток -8, склад «Основной склад»",
    );
  });

  it("формат оплаты: без имени товара — обезличенно, без падения", () => {
    expect(
      formatConsumptionWarnings([
        shortage({ productName: null, warehouseName: null, available: null }),
      ]),
    ).toBe("Расходник: списано 10");
  });
});
