import { describe, it, expect } from "vitest";

import { buildPositions, matchedVariantIds, positionMatches } from "./productPositions";
import type { DjangoProduct } from "../../../api/warehouse";

/**
 * Инварианты сборки списка SKU в позиции. Данные — срез теста Monogram:
 * пальто из двух цветов и трёх размеров, ремень без модели.
 */

let nextId = 1;

const product = (patch: Partial<DjangoProduct> & { name: string }): DjangoProduct => ({
    id: nextId++,
    organizationId: 1,
    category: "Верхняя одежда",
    barcode: "",
    unit: "шт",
    price: 24900,
    isInfusion: false,
    isVaccine: false,
    description: "",
    comment: "",
    isForSale: true,
    isActive: true,
    imageUrl: null,
    stock: 6,
    branchStock: null,
    createdAt: "2026-08-01",
    updatedAt: "2026-08-01",
    ...patch,
});

const attr = (attributeId: number, attributeName: string, role: "color" | "size" | "generic", value: string) =>
    ({ attributeId, attributeName, role, valueId: attributeId * 100 + value.length, value });

const coat = (color: string, size: string, patch: Partial<DjangoProduct> = {}) =>
    product({
        name: `Пальто шерстяное oversize, ${color}, ${size}`,
        modelId: 7,
        sku: "MONO-PLT",
        attributes: [
            attr(1, "Цвет", "color", color),
            attr(2, "Размер", "size", size),
            attr(3, "Бренд", "generic", "Monogram"),
        ],
        ...patch,
    });

describe("buildPositions", () => {
    it("склеивает варианты одной модели в одну позицию", () => {
        const positions = buildPositions(
            [coat("Чёрный", "42"), coat("Чёрный", "44"), coat("Бежевый", "42")],
            [{
                id: 7, organizationId: 1, name: "Пальто шерстяное oversize", skuPrefix: "MONO-PLT",
                categoryId: 1, categoryName: "Верхняя одежда", description: "", isActive: true,
                productCount: 3, createdAt: "", updatedAt: "",
            }],
        );
        expect(positions).toHaveLength(1);
        expect(positions[0].name).toBe("Пальто шерстяное oversize");
        expect(positions[0].variants).toHaveLength(3);
        expect(positions[0].single).toBe(false);
    });

    it("осью считает только атрибут с несколькими значениями", () => {
        const [position] = buildPositions([coat("Чёрный", "42"), coat("Чёрный", "44")]);
        // Цвет у обоих один — это не разрез, а свойство позиции.
        expect(position.axes.map((a) => a.name)).toEqual(["Размер"]);
        expect(position.constants.map((c) => c.value).sort()).toEqual(["Monogram", "Чёрный"]);
    });

    it("собирает две оси и подписывает варианты по ним", () => {
        const [position] = buildPositions([coat("Чёрный", "42"), coat("Бежевый", "44")]);
        expect(position.axes.map((a) => a.name)).toEqual(["Цвет", "Размер"]);
        expect(position.variants.map((v) => v.label)).toEqual(["Чёрный · 42", "Бежевый · 44"]);
    });

    it("товар без модели остаётся одиночной позицией", () => {
        const [position] = buildPositions([
            product({ name: "Ремень кожаный узкий", category: "Аксессуары", price: 4900, stock: 18 }),
        ]);
        expect(position.single).toBe(true);
        expect(position.axes).toHaveLength(0);
        expect(position.priceMin).toBe(position.priceMax);
    });

    it("считает диапазон цены, остаток и нули по вариантам", () => {
        const [position] = buildPositions([
            coat("Чёрный", "42", { price: 24900, stock: 6 }),
            coat("Чёрный", "46", { price: 26900, stock: 0 }),
        ]);
        expect([position.priceMin, position.priceMax]).toEqual([24900, 26900]);
        expect(position.stock).toBe(6);
        expect(position.outCount).toBe(1);
    });

    it("предпочитает остаток филиала общему", () => {
        const [position] = buildPositions([
            coat("Чёрный", "42", { stock: 100, branchStock: 2 }),
            coat("Чёрный", "44", { stock: 100, branchStock: 0 }),
        ]);
        expect(position.stock).toBe(2);
        expect(position.outCount).toBe(1);
    });

    it("собирает все штрихкоды позиции", () => {
        const [position] = buildPositions([
            coat("Чёрный", "42", { barcode: "111", barcodes: ["111", "999"] }),
            coat("Чёрный", "44", { barcode: "222" }),
        ]);
        expect(position.barcodes.sort()).toEqual(["111", "222", "999"]);
    });

    it("без атрибутов подписывает вариант хвостом названия", () => {
        const [position] = buildPositions([
            product({ name: "Платье миди, Хаки, 42", modelId: 9, attributes: [] }),
            product({ name: "Платье миди, Хаки, 44", modelId: 9, attributes: [] }),
        ]);
        expect(position.axes).toHaveLength(0);
        expect(position.variants.map((v) => v.label)).toEqual(["Хаки, 42", "Хаки, 44"]);
    });
});

describe("positionMatches", () => {
    const [position] = buildPositions([
        coat("Чёрный", "42", { barcode: "2000000116006" }),
        coat("Хаки", "46", { barcode: "2000000118000" }),
    ]);

    it("находит по названию позиции", () => {
        expect(positionMatches(position, "пальто")).toBe(true);
    });

    it("находит по значению внутри варианта", () => {
        expect(positionMatches(position, "хаки")).toBe(true);
        expect(positionMatches(position, "46")).toBe(true);
    });

    it("находит по штрихкоду варианта, которого нет у позиции", () => {
        expect(positionMatches(position, "2000000118000")).toBe(true);
    });

    it("не находит чужое", () => {
        expect(positionMatches(position, "шприц")).toBe(false);
    });

    it("подсвечивает только совпавшие варианты", () => {
        const ids = matchedVariantIds(position, "2000000118000");
        expect(ids.size).toBe(1);
    });
});
