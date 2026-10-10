import { describe, expect, it } from "vitest";

import type { PriceTag } from "../api/printforms";
import {
  LABEL_FONTS,
  barcodeElement,
  buildLayoutLabelsHtml,
  elementText,
  fitElement,
  layoutFromTemplate,
  labelPreviewMarkup,
  layoutToTemplate,
  presetByKey,
  presetLayout,
  sheetGrid,
  splitCurrency,
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

  it("превью — одна этикетка для Shadow DOM: без страниц, тема CRM отрезана", () => {
    const markup = labelPreviewMarkup(tag({ copies: 10 }), presetByKey("a4-70x37"), "Monogram");
    expect(count(markup, 'class="label"')).toBe(1);
    expect(markup).toContain(":host { all: initial;");
    expect(markup).toContain("width: 70mm; height: 37.1mm;");
    expect(markup).not.toContain("@page");
    expect(markup).not.toContain('class="sheet"');
    expect(markup).not.toContain("<html");
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

describe("скидка и валюта", () => {
  const sale = (overrides: Partial<PriceTag> = {}) =>
    tag({ price: "74400.00", discountPrice: "52080.00", discountAmount: "22320.00", discountPercent: "30", ...overrides });

  it("цена — к оплате, старая и скидка — только когда скидка есть", () => {
    expect(nbsp(elementText(textElement("price"), sale()))).toBe("52 080 сом");
    expect(nbsp(elementText(textElement("oldPrice"), sale()))).toBe("74 400 сом");
    expect(elementText(textElement("discountPercent"), sale())).toBe("−30%");
    expect(nbsp(elementText(textElement("discountAmount"), sale()))).toBe("−22 320 сом");

    const regular = tag({ price: "74400.00" });
    expect(nbsp(elementText(textElement("price"), regular))).toBe("74 400 сом");
    expect(elementText(textElement("oldPrice"), regular)).toBe("");
    expect(elementText(textElement("discountPercent"), regular)).toBe("");
    expect(elementText(textElement("discountAmount"), regular)).toBe("");
  });

  it("копейки — по желанию, как на ценнике «74 400,00»", () => {
    expect(nbsp(elementText(textElement("price", { cents: true, suffix: "" }), tag({ price: "74400" })))).toBe("74 400,00");
    expect(nbsp(elementText(textElement("oldPrice", { cents: true }), sale()))).toBe("74 400,00 сом");
  });

  it("валюта — свой текст элемента", () => {
    expect(elementText(textElement("currency"), tag())).toBe("сом");
    expect(elementText(textElement("currency", { text: "KGS" }), tag())).toBe("KGS");
  });

  it("зачёркнуто и подчёркнуто уходят в CSS; старая цена зачёркнута сразу", () => {
    expect(textElement("oldPrice").strike).toBe(true);
    const layout: LabelLayout = {
      widthMm: 58,
      heightMm: 40,
      media: "roll",
      elements: [
        textElement("oldPrice", { x: 1, y: 1, w: 30, h: 5 }),
        textElement("currency", { x: 40, y: 1, w: 10, h: 4, underline: true }),
        textElement("name", { underline: true, strike: true }),
      ],
    };
    const html = buildLayoutLabelsHtml([sale()], layout);
    expect(html).toContain("text-decoration:line-through;");
    expect(html).toContain("text-decoration:underline;");
    expect(html).toContain("text-decoration:underline line-through;");
  });

  it("элемент «только при скидке» и «только без скидки»", () => {
    const layout: LabelLayout = {
      widthMm: 58,
      heightMm: 40,
      media: "roll",
      elements: [
        textElement("text", { text: "SALE", showWhen: "discount" }),
        textElement("text", { text: "НОВИНКА", showWhen: "regular" }),
        barcodeElement({ showWhen: "regular" }),
      ],
    };
    const onSale = buildLayoutLabelsHtml([sale()], layout);
    expect(onSale).toContain("SALE");
    expect(onSale).not.toContain("НОВИНКА");
    expect(onSale).not.toContain("<svg");
    const regular = buildLayoutLabelsHtml([tag()], layout);
    expect(regular).not.toContain("SALE");
    expect(regular).toContain("НОВИНКА");
    expect(regular).toContain("<svg");
  });

  it("«сом» выносится отдельным элементом: мелко, подчёркнуто, справа от цены", () => {
    const price = textElement("price", { x: 2, y: 10, w: 54, h: 9, fontSize: 20, showWhen: "discount" });
    const layout: LabelLayout = { widthMm: 58, heightMm: 40, media: "roll", elements: [price] };
    const { layout: next, currencyId } = splitCurrency(layout, price.id);
    expect(next.elements).toHaveLength(2);
    const [newPrice, currency] = next.elements;
    expect(newPrice).toMatchObject({ id: price.id, suffix: "" });
    expect(currency).toMatchObject({ id: currencyId, kind: "field", source: "currency", text: "сом", underline: true, showWhen: "discount", y: 10 });
    if (currency.kind !== "field" || newPrice.kind !== "field") throw new Error("kinds");
    expect(currency.fontSize).toBeLessThan(price.fontSize);
    expect(currency.x).toBeGreaterThanOrEqual(newPrice.x + newPrice.w);
    expect(currency.x + currency.w).toBeLessThanOrEqual(58);
  });

  it("новые свойства переживают сохранение, старые элементы получают значения по умолчанию", () => {
    const layout: LabelLayout = {
      widthMm: 58,
      heightMm: 40,
      media: "roll",
      elements: [textElement("oldPrice", { cents: true, underline: true, showWhen: "discount" })],
    };
    const saved = layoutToTemplate(layout);
    expect(layoutFromTemplate({ ...saved, fields: JSON.parse(JSON.stringify(saved.fields)) })).toEqual(layout);

    const legacy = layoutFromTemplate({
      widthMm: 58,
      heightMm: 40,
      pageSize: "label_58",
      fields: [{ kind: "field", source: "price", x: 1, y: 1, w: 20, h: 5 }],
    });
    expect(legacy.elements[0]).toMatchObject({ showWhen: "always", strike: false, underline: false, cents: false });
  });
});
