/**
 * Раскладка этикетки товара: что, где и каким шрифтом стоит на этикетке.
 *
 * Раскладка хранится в шаблоне печати организации (`PrintTemplate`, вид
 * `price_tag`): размер этикетки — `widthMm`/`heightMm`, элементы — массив
 * `fields`. Сервер элементы не разбирает (JSON без схемы), поэтому всё, что
 * пришло, здесь проверяется и чинится: битый элемент выпадает, координаты
 * прижимаются к этикетке, шаблон без единого элемента рисуется заготовкой.
 *
 * Координаты и размеры элементов — в миллиметрах от левого верхнего угла,
 * шрифт — в пунктах: так этикетка печатается одинаково на любом принтере.
 * HTML собирается здесь же чистыми функциями — его же показывает конструктор,
 * поэтому превью и печать не расходятся.
 */

import type { PriceTag, PrintTemplate } from "../api/printforms";
import { barcodeSvg, expandLabelCopies, formatLabelNumber, labelBarcode, labelBrand } from "./productLabels";

// ── Шрифты ──

/**
 * Только системные шрифты: окно печати не ждёт загрузки веб-шрифтов, а у
 * кассового компьютера может не быть интернета. Запасные имена — на случай,
 * когда шрифта нет (Mac, Linux, Windows без Office).
 */
export type LabelFontKey =
  | "arial"
  | "narrow"
  | "segoe"
  | "verdana"
  | "tahoma"
  | "trebuchet"
  | "georgia"
  | "times"
  | "courier";

export const LABEL_FONTS: Record<LabelFontKey, { label: string; css: string }> = {
  arial: { label: "Arial", css: 'Arial, "Helvetica Neue", sans-serif' },
  narrow: { label: "Arial Narrow — узкий", css: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", Arial, sans-serif' },
  segoe: { label: "Segoe UI", css: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  verdana: { label: "Verdana — широкий", css: "Verdana, Geneva, sans-serif" },
  tahoma: { label: "Tahoma", css: "Tahoma, Verdana, sans-serif" },
  trebuchet: { label: "Trebuchet MS", css: '"Trebuchet MS", Arial, sans-serif' },
  georgia: { label: "Georgia — с засечками", css: "Georgia, serif" },
  times: { label: "Times New Roman", css: '"Times New Roman", Times, serif' },
  courier: { label: "Courier New — моноширинный", css: '"Courier New", Courier, monospace' },
};

export const DEFAULT_LABEL_FONT: LabelFontKey = "arial";

// ── Элементы ──

export type LabelFieldSource =
  | "name"
  | "price"
  | "sku"
  | "size"
  | "color"
  | "sizeColor"
  | "summary"
  | "brand"
  | "category"
  | "organization"
  | "text";

/** Что умеет выводить текстовый элемент; префикс и суффикс — по умолчанию. */
export const LABEL_FIELD_SOURCES: Record<LabelFieldSource, { label: string; prefix: string; suffix: string }> = {
  name: { label: "Название", prefix: "", suffix: "" },
  price: { label: "Цена", prefix: "", suffix: " сом" },
  sku: { label: "Артикул", prefix: "Арт. ", suffix: "" },
  size: { label: "Размер", prefix: "Размер ", suffix: "" },
  color: { label: "Цвет", prefix: "", suffix: "" },
  sizeColor: { label: "Размер и цвет", prefix: "", suffix: "" },
  summary: { label: "Артикул, размер и цвет в строку", prefix: "", suffix: "" },
  brand: { label: "Бренд", prefix: "", suffix: "" },
  category: { label: "Категория", prefix: "", suffix: "" },
  organization: { label: "Название магазина", prefix: "", suffix: "" },
  text: { label: "Свой текст", prefix: "", suffix: "" },
};

export type LabelAlign = "left" | "center" | "right";
export type LabelVAlign = "top" | "middle" | "bottom";

type LabelBox = { id: string; x: number; y: number; w: number; h: number };

export type LabelTextElement = LabelBox & {
  kind: "field";
  source: LabelFieldSource;
  /** Текст элемента «Свой текст». */
  text: string;
  prefix: string;
  suffix: string;
  font: LabelFontKey;
  /** Пункты. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  align: LabelAlign;
  valign: LabelVAlign;
  /** Сколько строк уместить, дальше — обрезка. */
  lines: number;
};

export type LabelBarcodeElement = LabelBox & {
  kind: "barcode";
  showDigits: boolean;
  /** Пункты. */
  digitsSize: number;
};

export type LabelElement = LabelTextElement | LabelBarcodeElement;

/** Рулон — каждая этикетка своей страницей; лист — сетка наклеек на A4. */
export type LabelMedia = "roll" | "sheet";

export type LabelLayout = {
  widthMm: number;
  heightMm: number;
  media: LabelMedia;
  elements: LabelElement[];
};

export const LABEL_SIDE_MM = { min: 10, max: 300 } as const;
export const FONT_SIZE_PT = { min: 4, max: 72 } as const;
export const MAX_LABEL_LINES = 6;
/** Как у сервера (`MAX_TEMPLATE_FIELDS`). */
export const MAX_LABEL_ELEMENTS = 200;
const A4_MM = { width: 210, height: 297 } as const;

// ── Заготовки ──

export type LabelPresetKey = "58x40" | "58x30" | "40x30" | "43x25" | "a4-70x37";

export const LABEL_PRESETS: Record<LabelPresetKey, { label: string; widthMm: number; heightMm: number; media: LabelMedia }> = {
  "58x40": { label: "Рулон 58 × 40 мм", widthMm: 58, heightMm: 40, media: "roll" },
  "58x30": { label: "Рулон 58 × 30 мм", widthMm: 58, heightMm: 30, media: "roll" },
  "40x30": { label: "Рулон 40 × 30 мм", widthMm: 40, heightMm: 30, media: "roll" },
  "43x25": { label: "Рулон 43 × 25 мм", widthMm: 43, heightMm: 25, media: "roll" },
  "a4-70x37": { label: "Лист A4, наклейки 70 × 37 мм", widthMm: 70, heightMm: 37.1, media: "sheet" },
};

const round = (value: number, step = 0.1): number => Math.round(value / step) * step;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
/** Высота строки текста в мм: пункт — 0,3528 мм, плюс межстрочный. */
const lineMm = (pt: number, lines = 1): number => pt * 0.3528 * 1.2 * lines;

export function newElementId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? random.slice(0, 8) : Math.random().toString(36).slice(2, 10);
}

/** Текстовый элемент с разумными значениями; остальное — из `patch`. */
export function textElement(source: LabelFieldSource, patch: Partial<LabelTextElement> = {}): LabelTextElement {
  return {
    id: newElementId(),
    kind: "field",
    source,
    text: source === "text" ? "Текст" : "",
    prefix: LABEL_FIELD_SOURCES[source].prefix,
    suffix: LABEL_FIELD_SOURCES[source].suffix,
    x: 2,
    y: 2,
    w: 30,
    h: 5,
    font: DEFAULT_LABEL_FONT,
    fontSize: 8,
    bold: source === "price" || source === "name" || source === "brand",
    italic: false,
    uppercase: source === "brand",
    align: source === "price" ? "right" : "left",
    valign: "top",
    lines: 1,
    ...patch,
  };
}

export function barcodeElement(patch: Partial<LabelBarcodeElement> = {}): LabelBarcodeElement {
  return { id: newElementId(), kind: "barcode", x: 2, y: 2, w: 40, h: 12, showDigits: true, digitsSize: 7, ...patch };
}

/**
 * Заготовка под размер: бренд, название в две строки, артикул с размером и
 * цветом, цена справа и штрихкод внизу. Шрифты растут вместе с этикеткой.
 */
export function presetLayout(widthMm: number, heightMm: number, media: LabelMedia = "roll"): LabelLayout {
  const k = Math.min(widthMm / 58, heightMm / 40);
  const pt = (base: number) => clamp(round(base * k, 0.5), FONT_SIZE_PT.min, FONT_SIZE_PT.max);
  const metaPt = pt(7);
  const namePt = pt(9);
  const pricePt = pt(14);
  const padX = 2;
  const padY = 1.5;
  const inner = round(widthMm - padX * 2);

  const brandH = round(lineMm(metaPt));
  const nameH = round(lineMm(namePt, 2));
  const summaryH = round(lineMm(metaPt));
  const barcodeH = round(Math.max(5, (11 * heightMm) / 40) + lineMm(metaPt));
  const priceH = round(lineMm(pricePt));
  const barcodeY = round(heightMm - padY - barcodeH);

  const elements: LabelElement[] = [
    textElement("brand", { x: padX, y: padY, w: inner, h: brandH, fontSize: metaPt }),
    textElement("name", { x: padX, y: round(padY + brandH), w: inner, h: nameH, fontSize: namePt, lines: 2 }),
    textElement("summary", { x: padX, y: round(padY + brandH + nameH), w: inner, h: summaryH, fontSize: metaPt }),
    textElement("price", { x: padX, y: round(barcodeY - priceH), w: inner, h: priceH, fontSize: pricePt, valign: "bottom" }),
    barcodeElement({ x: padX, y: barcodeY, w: inner, h: barcodeH, digitsSize: metaPt }),
  ];
  return { widthMm, heightMm, media, elements };
}

export function presetByKey(key: LabelPresetKey): LabelLayout {
  const preset = LABEL_PRESETS[key];
  return presetLayout(preset.widthMm, preset.heightMm, preset.media);
}

// ── Шаблон ↔ раскладка ──

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Элемент не вылезает за этикетку и не схлопывается в точку. */
export function fitElement<T extends LabelElement>(element: T, widthMm: number, heightMm: number): T {
  const w = clamp(element.w, 1, widthMm);
  const h = clamp(element.h, 1, heightMm);
  return { ...element, w, h, x: clamp(element.x, 0, widthMm - w), y: clamp(element.y, 0, heightMm - h) };
}

function parseElement(raw: unknown, widthMm: number, heightMm: number): LabelElement | null {
  if (!isRecord(raw)) return null;
  const box = {
    id: str(raw.id, "") || newElementId(),
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: num(raw.w, 10),
    h: num(raw.h, 5),
  };
  if (raw.kind === "barcode") {
    return fitElement(
      {
        ...box,
        kind: "barcode",
        showDigits: bool(raw.showDigits, true),
        digitsSize: clamp(num(raw.digitsSize, 7), FONT_SIZE_PT.min, FONT_SIZE_PT.max),
      },
      widthMm,
      heightMm,
    );
  }
  if (raw.kind !== "field") return null;
  const sources = Object.keys(LABEL_FIELD_SOURCES) as LabelFieldSource[];
  if (!sources.includes(raw.source as LabelFieldSource)) return null;
  const source = raw.source as LabelFieldSource;
  return fitElement(
    {
      ...textElement(source),
      ...box,
      text: str(raw.text, ""),
      prefix: str(raw.prefix, LABEL_FIELD_SOURCES[source].prefix),
      suffix: str(raw.suffix, LABEL_FIELD_SOURCES[source].suffix),
      font: oneOf(raw.font, Object.keys(LABEL_FONTS) as LabelFontKey[], DEFAULT_LABEL_FONT),
      fontSize: clamp(num(raw.fontSize, 8), FONT_SIZE_PT.min, FONT_SIZE_PT.max),
      bold: bool(raw.bold, false),
      italic: bool(raw.italic, false),
      uppercase: bool(raw.uppercase, false),
      align: oneOf(raw.align, ["left", "center", "right"] as const, "left"),
      valign: oneOf(raw.valign, ["top", "middle", "bottom"] as const, "top"),
      lines: clamp(Math.round(num(raw.lines, 1)), 1, MAX_LABEL_LINES),
    },
    widthMm,
    heightMm,
  );
}

/**
 * Раскладка шаблона. Шаблон без своих элементов (стандартный, который сервер
 * заводит при первой печати, или созданный не конструктором) — заготовка под
 * его размер.
 */
export function layoutFromTemplate(
  template: Pick<PrintTemplate, "widthMm" | "heightMm" | "pageSize" | "fields">,
): LabelLayout {
  const media: LabelMedia = template.pageSize === "A4" ? "sheet" : "roll";
  const widthMm = clamp(num(template.widthMm, media === "sheet" ? 70 : 58), LABEL_SIDE_MM.min, LABEL_SIDE_MM.max);
  const heightMm = clamp(num(template.heightMm, media === "sheet" ? 37.1 : 40), LABEL_SIDE_MM.min, LABEL_SIDE_MM.max);
  const elements = (Array.isArray(template.fields) ? template.fields : [])
    .map((raw) => parseElement(raw, widthMm, heightMm))
    .filter((element): element is LabelElement => element !== null)
    .slice(0, MAX_LABEL_ELEMENTS);
  return elements.length > 0 ? { widthMm, heightMm, media, elements } : presetLayout(widthMm, heightMm, media);
}

/** Поля шаблона для сохранения: размер, лист, элементы как есть. */
export function layoutToTemplate(layout: LabelLayout): {
  widthMm: number;
  heightMm: number;
  pageSize: string;
  fields: LabelElement[];
} {
  return {
    widthMm: round(layout.widthMm),
    heightMm: round(layout.heightMm),
    pageSize: layout.media === "sheet" ? "A4" : layout.widthMm <= 60 ? "label_58" : "label_80",
    fields: layout.elements.map((element) => ({
      ...element,
      x: round(element.x),
      y: round(element.y),
      w: round(element.w),
      h: round(element.h),
    })),
  };
}

// ── Текст элементов ──

const attributeOf = (tag: PriceTag, role: string): string =>
  tag.attributes.find((a) => a.role === role && a.value.trim())?.value.trim() ?? "";

/** Значение без префикса и суффикса; пустое — элемент на этикетку не ставится. */
export function sourceValue(source: LabelFieldSource, tag: PriceTag, organizationName = ""): string {
  switch (source) {
    case "name":
      return tag.name.trim();
    case "price":
      return formatLabelNumber(tag.price);
    case "sku":
      return tag.sku.trim();
    case "size":
      return attributeOf(tag, "size");
    case "color":
      return attributeOf(tag, "color");
    case "sizeColor":
      return [attributeOf(tag, "size"), attributeOf(tag, "color")].filter(Boolean).join(" · ");
    case "summary": {
      const size = attributeOf(tag, "size");
      return [tag.sku.trim() && `Арт. ${tag.sku.trim()}`, size && `Размер ${size}`, attributeOf(tag, "color")]
        .filter(Boolean)
        .join(" · ");
    }
    case "brand":
      return labelBrand(tag);
    case "category":
      return tag.category.trim();
    case "organization":
      return organizationName.trim();
    case "text":
      return "";
  }
}

export function elementText(element: LabelTextElement, tag: PriceTag, organizationName = ""): string {
  if (element.source === "text") return element.text;
  const value = sourceValue(element.source, tag, organizationName);
  return value ? `${element.prefix}${value}${element.suffix}` : "";
}

// ── HTML ──

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (value: string): string => value.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);
const mm = (value: number): string => `${round(value)}mm`;

const JUSTIFY: Record<LabelVAlign, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

function boxStyle(element: LabelElement): string {
  return `left:${mm(element.x)};top:${mm(element.y)};width:${mm(element.w)};height:${mm(element.h)};`;
}

function elementHtml(element: LabelElement, tag: PriceTag, organizationName: string): string {
  if (element.kind === "barcode") {
    const barcode = labelBarcode(tag);
    if (!barcode) return "";
    const digits = element.showDigits
      ? `<div class="d" style="font-size:${element.digitsSize}pt">${esc(barcode.value)}</div>`
      : "";
    return `<div class="e b" style="${boxStyle(element)}">${barcodeSvg(barcode.modules)}${digits}</div>`;
  }
  const text = elementText(element, tag, organizationName);
  if (!text) return "";
  const style =
    boxStyle(element) +
    `justify-content:${JUSTIFY[element.valign]};font-family:${esc(LABEL_FONTS[element.font].css)};` +
    `font-size:${element.fontSize}pt;font-weight:${element.bold ? 700 : 400};` +
    `font-style:${element.italic ? "italic" : "normal"};text-transform:${element.uppercase ? "uppercase" : "none"};` +
    `text-align:${element.align};`;
  const clampCss = element.lines > 1 ? ` style="-webkit-line-clamp:${element.lines}"` : "";
  return `<div class="e t${element.lines === 1 ? " one" : ""}" style="${style}"><div class="x"${clampCss}>${esc(text)}</div></div>`;
}

export function labelHtml(layout: LabelLayout, tag: PriceTag, organizationName = ""): string {
  const inner = layout.elements.map((element) => elementHtml(element, tag, organizationName)).join("");
  return `<div class="label">${inner}</div>`;
}

/**
 * Короткий отпечаток документа — ключ iframe превью. Chrome пропускает смену
 * `srcdoc`, пока iframe ещё грузит предыдущий документ, и превью застывает
 * на старой раскладке; новый ключ пересоздаёт iframe.
 */
export function htmlKey(html: string): string {
  let hash = 0;
  for (let i = 0; i < html.length; i += 1) hash = (hash * 31 + html.charCodeAt(i)) | 0;
  return `${html.length}:${hash}`;
}

/** Наклеек на лист A4: сетка по размеру этикетки, по центру листа. */
export function sheetGrid(layout: Pick<LabelLayout, "widthMm" | "heightMm">): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor(A4_MM.width / layout.widthMm)),
    rows: Math.max(1, Math.floor(A4_MM.height / layout.heightMm)),
  };
}

function layoutStyles(layout: LabelLayout, preview: boolean): string {
  const { widthMm: w, heightMm: h } = layout;
  const sheet = layout.media === "sheet" && !preview;
  const grid = sheetGrid(layout);
  const page = preview
    ? ""
    : sheet
      ? `@page { size: ${A4_MM.width}mm ${A4_MM.height}mm; margin: 0; }`
      : `@page { size: ${w}mm ${h}mm; margin: 0; }`;
  const flow = sheet
    ? `.sheet { width: ${A4_MM.width}mm; height: ${A4_MM.height}mm; display: grid;
         grid-template-columns: repeat(${grid.cols}, ${w}mm); grid-auto-rows: ${h}mm;
         justify-content: center; align-content: center; break-after: page; }
       .sheet:last-child { break-after: auto; }`
    : `.label { break-after: page; } .label:last-child { break-after: auto; }`;
  // Окно превью ровно в размер этикетки: дробные пиксели иначе рисуют полосы прокрутки.
  const screen = preview ? `html, body { background: transparent; overflow: hidden; }` : "";
  return `${page}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; background: #fff;
    font-family: ${LABEL_FONTS[DEFAULT_LABEL_FONT].css}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { position: relative; width: ${w}mm; height: ${h}mm; overflow: hidden; background: #fff; }
  ${flow}
  .e { position: absolute; overflow: hidden; display: flex; flex-direction: column; }
  .t { line-height: 1.15; }
  .t .x { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .t.one .x { display: block; white-space: nowrap; text-overflow: ellipsis; }
  .b svg { display: block; flex: 1 1 0; min-height: 0; width: 100%; fill: #000; }
  .b .d { font-family: "Courier New", monospace; text-align: center; letter-spacing: .06em; line-height: 1.1; }
  ${screen}`;
}

/**
 * Документ печати. `tags` — ответ сервера: копии уже в `copies`.
 * `preview` — одна этикетка в левом верхнем углу, без страниц: для превью
 * в окне печати и в конструкторе.
 */
export function buildLayoutLabelsHtml(
  tags: readonly PriceTag[],
  layout: LabelLayout,
  { organizationName = "", preview = false }: { organizationName?: string; preview?: boolean } = {},
): string {
  const labels = (preview ? tags.slice(0, 1) : expandLabelCopies(tags)).map((tag) =>
    labelHtml(layout, tag, organizationName),
  );
  let body = labels.join("");
  if (layout.media === "sheet" && !preview) {
    const grid = sheetGrid(layout);
    const perPage = grid.cols * grid.rows;
    const pages: string[] = [];
    for (let i = 0; i < labels.length; i += perPage) {
      pages.push(`<div class="sheet">${labels.slice(i, i + perPage).join("")}</div>`);
    }
    body = pages.join("");
  }
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Этикетки</title>
<style>${layoutStyles(layout, preview)}</style></head><body>${body}</body></html>`;
}
