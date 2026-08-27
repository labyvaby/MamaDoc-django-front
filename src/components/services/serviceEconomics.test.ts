import { describe, expect, it } from "vitest";

import { computeServiceEconomics } from "./serviceEconomics";
import type { Service, ServiceRelatedProduct } from "../../api/catalog";

function product(over: Partial<ServiceRelatedProduct> = {}): ServiceRelatedProduct {
  return {
    id: 1,
    name: "Гель для УЗИ",
    price: 100,
    stock: 10,
    unit: "шт",
    quantity: 1,
    autoWriteOff: true,
    billable: false,
    ...over,
  };
}

function service(over: Partial<Service> = {}): Service {
  return {
    id: 1,
    organizationId: 1,
    name: "УЗИ",
    slug: "uzi",
    description: null,
    durationMinutes: 30,
    basePrice: "1000.00",
    isActive: true,
    onlineBookingVisible: true,
    allowPriceOverride: false,
    imageUrl: null,
    sortOrder: 0,
    category: null,
    relatedProductId: null,
    relatedProduct: null,
    relatedProducts: [],
    branches: [],
    hasHiddenBranches: false,
    createdAt: "2026-08-27T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
    ...over,
  };
}

describe("computeServiceEconomics", () => {
  it("считает себестоимость и маржу по неплатным расходникам", () => {
    const result = computeServiceEconomics(
      service({ relatedProducts: [product({ price: 100, quantity: 2 })] }),
    );

    expect(result.cost).toBe(200);
    expect(result.margin).toBe(800);
    expect(result.marginPercent).toBe(80);
  });

  it("не берёт в себестоимость платные расходники — их оплачивают сверх цены", () => {
    const result = computeServiceEconomics(
      service({
        relatedProducts: [
          product({ id: 1, price: 100, quantity: 1 }),
          product({ id: 2, name: "Имплант", price: 5000, quantity: 1, billable: true }),
        ],
      }),
    );

    expect(result.cost).toBe(100);
    expect(result.margin).toBe(900);
  });

  it("без цены услуги не считает процент", () => {
    const result = computeServiceEconomics(
      service({ basePrice: "0.00", relatedProducts: [product()] }),
    );

    expect(result.marginPercent).toBeNull();
    expect(result.margin).toBe(-100);
  });

  it("предупреждает о нехватке остатка только по списываемым позициям", () => {
    const result = computeServiceEconomics(
      service({
        relatedProducts: [
          product({ id: 1, name: "Хватает", stock: 5, quantity: 2 }),
          product({ id: 2, name: "Не хватает", stock: 1, quantity: 2 }),
          product({ id: 3, name: "Не списывается", stock: 0, quantity: 2, autoWriteOff: false }),
        ],
      }),
    );

    expect(result.outOfStock.map((p) => p.name)).toEqual(["Не хватает"]);
  });

  it("на пустой услуге не падает", () => {
    const result = computeServiceEconomics(null);

    expect(result).toEqual({ cost: 0, margin: 0, marginPercent: null, outOfStock: [] });
  });
});
