import { describe, expect, it } from "vitest";

import type { PriceTag } from "../api/printforms";
import {
  DEFAULT_LABEL_CONTENT,
  buildProductLabelsHtml,
  expandLabelCopies,
  formatLabelPrice,
  labelBarcode,
  labelBrand,
  labelCopies,
  labelMetaLine,
  planLabelCopies,
} from "./productLabels";

const tag = (overrides: Partial<PriceTag> = {}): PriceTag => ({
  productId: 1,
  name: "Платье миди",
  sku: "1024",
  barcode: "4006381333931",
  unit: "шт",
  category: "Платья",
  attributes: [
    { name: "Размер", role: "size", value: "M" },
    { name: "Цвет", role: "color", value: "Синий" },
    { name: "Бренд", role: "generic", value: "Monogram" },
  ],
  price: "7500.00",
  copies: 1,
  ...overrides,
});

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("сколько этикеток", () => {
  it("по одной, по остатку и по N", () => {
    expect(labelCopies("one", 0, 0)).toBe(1);
    expect(labelCopies("stock", 5, 0)).toBe(5);
    expect(labelCopies("stock", 0, 0)).toBe(0);
    expect(labelCopies("stock", -2, 0)).toBe(0);
    expect(labelCopies("stock", 2.5, 0)).toBe(2);
    expect(labelCopies("stock", 0.4, 0)).toBe(1);
    expect(labelCopies("each", 9, 3)).toBe(3);
    expect(labelCopies("each", 9, 0)).toBe(0);
    expect(labelCopies("each", 9, 1.5)).toBe(0);
  });

  it("товары без остатка пропускаются и считаются", () => {
    const plan = planLabelCopies(
      [
        { productId: 1, stock: 3 },
        { productId: 2, stock: 0 },
        { productId: 3, stock: 1 },
      ],
      "stock",
      0,
    );
    expect(plan.lines).toEqual([
      { productId: 1, copies: 3 },
      { productId: 3, copies: 1 },
    ]);
    expect(plan.total).toBe(4);
    expect(plan.skipped).toBe(1);
  });
});

describe("что на этикетке", () => {
  it("строка под названием: артикул, размер, цвет", () => {
    expect(labelMetaLine(tag(), DEFAULT_LABEL_CONTENT)).toBe("Арт. 1024 · Размер M · Синий");
    expect(labelMetaLine(tag(), { ...DEFAULT_LABEL_CONTENT, sku: false })).toBe("Размер M · Синий");
    expect(labelMetaLine(tag({ attributes: [] }), DEFAULT_LABEL_CONTENT)).toBe("Арт. 1024");
  });

  it("бренд — свойство «Бренд», без учёта регистра имени", () => {
    expect(labelBrand(tag())).toBe("Monogram");
    expect(labelBrand(tag({ attributes: [{ name: "brand", role: "generic", value: "Zara" }] }))).toBe("Zara");
    expect(labelBrand(tag({ attributes: [] }))).toBe("");
  });

  it("цена — сомы с разделителем разрядов", () => {
    expect(formatLabelPrice("7500.00").replace(/\s/g, " ")).toBe("7 500 сом");
    expect(formatLabelPrice("99.50")).toBe("99,5 сом");
    expect(formatLabelPrice("abc")).toBe("");
  });

  it("EAN-13 — 95 модулей, иначе Code 128, без штрихкода — артикул", () => {
    const ean = labelBarcode(tag());
    expect(ean?.modules.reduce((s, m) => s + m, 0)).toBe(95);
    const code128 = labelBarcode(tag({ barcode: "MG-1024" }));
    expect(code128?.value).toBe("MG-1024");
    expect(code128?.modules.reduce((s, m) => s + m, 0)).toBeGreaterThan(95);
    expect(labelBarcode(tag({ barcode: "" }))?.value).toBe("1024");
    expect(labelBarcode(tag({ barcode: "", sku: "" }))).toBeNull();
    expect(labelBarcode(tag({ barcode: "Ёлка", sku: "" }))).toBeNull();
  });
});

describe("документ печати", () => {
  it("копии раскладываются по этикеткам, по одной на страницу рулона", () => {
    const tags = [tag({ copies: 3 }), tag({ productId: 2, name: "Шарф", copies: 2 })];
    expect(expandLabelCopies(tags)).toHaveLength(5);
    const html = buildProductLabelsHtml(tags, { size: "58x40", content: DEFAULT_LABEL_CONTENT });
    expect(count(html, 'class="label"')).toBe(5);
    expect(html).toContain("@page { size: 58mm 40mm; margin: 0; }");
    expect(html).toContain("Шарф");
  });

  it("лист A4 — по 24 наклейки на страницу", () => {
    const html = buildProductLabelsHtml([tag({ copies: 30 })], { size: "a4", content: DEFAULT_LABEL_CONTENT });
    expect(count(html, 'class="sheet"')).toBe(2);
    expect(count(html, 'class="label"')).toBe(30);
    expect(html).toContain("@page { size: 210mm 297mm; margin: 0; }");
  });

  it("выключенные поля не печатаются", () => {
    const html = buildProductLabelsHtml([tag()], {
      size: "40x30",
      content: { ...DEFAULT_LABEL_CONTENT, price: false, barcode: false, brand: false },
    });
    expect(html).not.toContain('class="price"');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("Monogram");
  });

  it("название магазина — только если включено и известно", () => {
    const on = { ...DEFAULT_LABEL_CONTENT, organization: true };
    expect(buildProductLabelsHtml([tag()], { size: "58x30", content: on, organizationName: "Monogram ЦУМ" })).toContain(
      "Monogram ЦУМ",
    );
    expect(buildProductLabelsHtml([tag()], { size: "58x30", content: on })).not.toContain('class="org"');
  });

  it("HTML из данных товара экранируется", () => {
    const html = buildProductLabelsHtml([tag({ name: '<img src=x onerror="alert(1)">' })], {
      size: "58x40",
      content: DEFAULT_LABEL_CONTENT,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("превью — одна этикетка, даже если копий много", () => {
    const html = buildProductLabelsHtml([tag({ copies: 10 })], { size: "a4", content: DEFAULT_LABEL_CONTENT }, { preview: true });
    expect(count(html, 'class="label"')).toBe(1);
    expect(html).not.toContain('class="sheet"');
  });
});
