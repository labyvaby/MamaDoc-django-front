import { describe, expect, it } from "vitest";

import type { PriceTag } from "../api/printforms";
import {
  LABEL_FONTS,
  barcodeElement,
  buildLayoutLabelsHtml,
  elementText,
  fitElement,
  layoutFromTemplate,
  layoutToTemplate,
  presetByKey,
  presetLayout,
  sheetGrid,
  textElement,
  type LabelLayout,
} from "./labelLayout";

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
const nbsp = (value: string) => value.replace(/\s/g, " ");

describe("текст элементов", () => {
  it("значение с префиксом и суффиксом, своё — как написано", () => {
    expect(nbsp(elementText(textElement("price"), tag()))).toBe("7 500 сом");
    expect(elementText(textElement("sku"), tag())).toBe("Арт. 1024");
    expect(elementText(textElement("size"), tag())).toBe("Размер M");
    expect(elementText(textElement("sizeColor"), tag())).toBe("M · Синий");
    expect(elementText(textElement("summary"), tag())).toBe("Арт. 1024 · Размер M · Синий");
    expect(elementText(textElement("brand"), tag())).toBe("Monogram");
    expect(elementText(textElement("organization"), tag(), "Monogram ЦУМ")).toBe("Monogram ЦУМ");
    expect(elementText(textElement("text", { text: "Хит сезона" }), tag())).toBe("Хит сезона");
    expect(elementText(textElement("price", { prefix: "Цена: ", suffix: " KGS" }), tag()).replace(/\s/g, " ")).toBe(
      "Цена: 7 500 KGS",
    );
  });

  it("пустое значение не печатает ни префикс, ни суффикс", () => {
    expect(elementText(textElement("sku"), tag({ sku: "" }))).toBe("");
    expect(elementText(textElement("brand"), tag({ attributes: [] }))).toBe("");
  });
});

describe("шаблон ↔ раскладка", () => {
  it("элементы и размер переживают сохранение и чтение", () => {
    const layout: LabelLayout = {
      widthMm: 43,
      heightMm: 25,
      media: "roll",
      elements: [
        textElement("price", { x: 20, y: 2, w: 21, h: 8, fontSize: 16, font: "narrow", bold: true, align: "right" }),
        barcodeElement({ x: 2, y: 12, w: 39, h: 11, showDigits: false }),
      ],
    };
    const saved = layoutToTemplate(layout);
    expect(saved).toMatchObject({ widthMm: 43, heightMm: 25, pageSize: "label_58" });
    const back = layoutFromTemplate({ ...saved, fields: JSON.parse(JSON.stringify(saved.fields)) });
    expect(back).toEqual(layout);
  });

  it("лист A4 — pageSize A4, широкий рулон — label_80", () => {
    expect(layoutToTemplate({ ...presetByKey("a4-70x37") }).pageSize).toBe("A4");
    expect(layoutToTemplate(presetLayout(75, 50)).pageSize).toBe("label_80");
    expect(layoutFromTemplate({ widthMm: 70, heightMm: 37.1, pageSize: "A4", fields: [] }).media).toBe("sheet");
  });

  it("шаблон без элементов (стандартный с сервера) — заготовка его размера", () => {
    const layout = layoutFromTemplate({
      widthMm: 40,
      heightMm: 30,
      pageSize: "label_58",
      fields: [{ key: "name" }, { key: "price" }],
    });
    expect(layout.widthMm).toBe(40);
    expect(layout.heightMm).toBe(30);
    expect(layout.elements.map((e) => (e.kind === "field" ? e.source : e.kind))).toEqual([
      "brand",
      "name",
      "summary",
      "price",
      "barcode",
    ]);
  });

  it("битые элементы выпадают, чужие значения чинятся, всё прижато к этикетке", () => {
    const layout = layoutFromTemplate({
      widthMm: 58,
      heightMm: 40,
      pageSize: "label_58",
      fields: [
        null,
        "мусор",
        { kind: "field", source: "unknown" },
        { kind: "field", source: "name", x: 50, y: -5, w: 30, h: 100, font: "comic", fontSize: 500, lines: 99, align: "justify" },
      ],
    });
    expect(layout.elements).toHaveLength(1);
    const [name] = layout.elements;
    expect(name).toMatchObject({ x: 28, y: 0, w: 30, h: 40, font: "arial", fontSize: 72, lines: 6, align: "left" });
  });

  it("без размера — 58 × 40", () => {
    const layout = layoutFromTemplate({ widthMm: null, heightMm: null, pageSize: "label_58", fields: [] });
    expect([layout.widthMm, layout.heightMm]).toEqual([58, 40]);
  });

  it("заготовка не вылезает за этикетку на любом размере", () => {
    for (const [w, h] of [
      [58, 40],
      [43, 25],
      [30, 20],
      [100, 70],
    ]) {
      for (const element of presetLayout(w, h).elements) {
        expect(element.x + element.w).toBeLessThanOrEqual(w + 1e-9);
        expect(element.y + element.h).toBeLessThanOrEqual(h + 1e-9);
        expect(element.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("элемент прижимается к краю, а не обрезается в ноль", () => {
    expect(fitElement(textElement("name", { x: 55, y: 38, w: 20, h: 5 }), 58, 40)).toMatchObject({
      x: 38,
      y: 35,
      w: 20,
      h: 5,
    });
  });
});

describe("документ печати", () => {
  const layout: LabelLayout = {
    widthMm: 58,
    heightMm: 40,
    media: "roll",
    elements: [
      textElement("name", { x: 2, y: 2, w: 54, h: 8, font: "georgia", fontSize: 11, bold: false, italic: true, uppercase: true, lines: 2 }),
      textElement("price", { x: 2, y: 12, w: 54, h: 8, fontSize: 18, bold: true, align: "right", valign: "bottom" }),
      barcodeElement({ x: 2, y: 22, w: 54, h: 16, digitsSize: 6 }),
    ],
  };

  it("элементы стоят на своих мм со своим шрифтом и выравниванием", () => {
    const html = buildLayoutLabelsHtml([tag()], layout);
    expect(html).toContain("left:2mm;top:2mm;width:54mm;height:8mm;");
    expect(html).toContain(`font-family:${LABEL_FONTS.georgia.css.replace(/"/g, "&quot;")};`);
    expect(html).toContain("font-size:11pt;font-weight:400;font-style:italic;text-transform:uppercase;");
    expect(html).toContain("-webkit-line-clamp:2");
    expect(html).toContain("font-size:18pt;font-weight:700;");
    expect(html).toContain("text-align:right;");
    expect(html).toContain("justify-content:flex-end;");
    expect(html).toContain('<div class="d" style="font-size:6pt">4006381333931</div>');
    expect(html).toContain("@page { size: 58mm 40mm; margin: 0; }");
  });

  it("копии — по этикетке, лист A4 — по сетке наклеек", () => {
    expect(count(buildLayoutLabelsHtml([tag({ copies: 3 })], layout), 'class="label"')).toBe(3);
    const sheet = presetByKey("a4-70x37");
    expect(sheetGrid(sheet)).toEqual({ cols: 3, rows: 8 });
    const html = buildLayoutLabelsHtml([tag({ copies: 30 })], sheet);
    expect(count(html, 'class="sheet"')).toBe(2);
    expect(count(html, 'class="label"')).toBe(30);
    expect(html).toContain("@page { size: 210mm 297mm; margin: 0; }");
  });

  it("пустые поля и штрихкод без кода не рисуются", () => {
    const html = buildLayoutLabelsHtml([tag({ barcode: "", sku: "", name: "" })], layout);
    expect(html).not.toContain("<svg");
    expect(count(html, 'class="e t')).toBe(1);
  });

  it("цифры под штрихкодом можно убрать", () => {
    const noDigits = { ...layout, elements: [barcodeElement({ showDigits: false })] };
    expect(buildLayoutLabelsHtml([tag()], noDigits)).not.toContain('class="d"');
  });

  it("превью — одна этикетка без страниц", () => {
    const html = buildLayoutLabelsHtml([tag({ copies: 10 })], presetByKey("a4-70x37"), { preview: true });
    expect(count(html, 'class="label"')).toBe(1);
    expect(html).not.toContain("@page");
    expect(html).not.toContain('class="sheet"');
  });

  it("HTML из данных товара и своего текста экранируется", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const html = buildLayoutLabelsHtml([tag({ name: evil })], {
      ...layout,
      elements: [textElement("name"), textElement("text", { text: evil })],
    });
    expect(html).not.toContain("<img");
    expect(count(html, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")).toBe(2);
  });
});
