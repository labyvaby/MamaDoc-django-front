/**
 * Этикетки товаров: размеры, состав, сколько копий, HTML для печати.
 *
 * Данные этикеток (цена филиала, основной штрихкод, свойства) приходят с
 * сервера — `printPriceTags` в `api/printforms.ts`; здесь только раскладка.
 * Сборка HTML отделена от окна печати, чтобы её проверял тест: рендер-тестов
 * в проекте нет, логика живёт в чистых функциях (как `labLabels.ts`).
 *
 * Рулонная этикетка — это страница своего размера (`@page`), одна на лист:
 * так её понимает драйвер термопринтера. Для офиса без такого принтера —
 * лист A4 с наклейками 70×37 (3×8).
 */

import type { PriceTag, PriceTagAttribute } from "../api/printforms";
import type { DjangoProduct } from "../api/warehouse";
import { code128bModules } from "./barcode128";
import { bitsToModules, ean13Bits, isValidEan13 } from "./ean13";
import { productGroupValue } from "./productGroups";

export type LabelSizeKey = "58x40" | "58x30" | "40x30" | "43x25" | "a4";

type LabelGeometry = {
  label: string;
  /** Размер одной этикетки, мм. */
  width: number;
  height: number;
  /** Шрифты, pt, и высота штрихкода, мм. */
  nameFont: number;
  metaFont: number;
  priceFont: number;
  barcodeHeight: number;
  /** Лист с наклейками вместо рулона. */
  sheet?: { cols: number; rows: number; pageWidth: number; pageHeight: number };
};

export const LABEL_SIZES: Record<LabelSizeKey, LabelGeometry> = {
  "58x40": { label: "58 × 40 мм", width: 58, height: 40, nameFont: 9, metaFont: 7, priceFont: 14, barcodeHeight: 11 },
  "58x30": { label: "58 × 30 мм", width: 58, height: 30, nameFont: 8, metaFont: 6.5, priceFont: 12, barcodeHeight: 8 },
  "40x30": { label: "40 × 30 мм", width: 40, height: 30, nameFont: 7.5, metaFont: 6, priceFont: 11, barcodeHeight: 8 },
  "43x25": { label: "43 × 25 мм", width: 43, height: 25, nameFont: 7, metaFont: 5.5, priceFont: 10, barcodeHeight: 6.5 },
  a4: {
    label: "Лист A4, наклейки 70 × 37 мм (3 × 8)",
    width: 70,
    height: 37.125,
    nameFont: 9,
    metaFont: 7,
    priceFont: 14,
    barcodeHeight: 10,
    sheet: { cols: 3, rows: 8, pageWidth: 210, pageHeight: 297 },
  },
};

export type LabelContent = {
  name: boolean;
  price: boolean;
  barcode: boolean;
  sku: boolean;
  /** Размер и цвет — свойства варианта. */
  sizeColor: boolean;
  brand: boolean;
  organization: boolean;
};

export const LABEL_CONTENT_LABELS: Record<keyof LabelContent, string> = {
  name: "Название",
  price: "Цена",
  barcode: "Штрихкод",
  sku: "Артикул",
  sizeColor: "Размер и цвет",
  brand: "Бренд",
  organization: "Название магазина",
};

export const DEFAULT_LABEL_CONTENT: LabelContent = {
  name: true,
  price: true,
  barcode: true,
  sku: true,
  sizeColor: true,
  brand: true,
  organization: false,
};

export type LabelOptions = {
  size: LabelSizeKey;
  content: LabelContent;
  organizationName?: string;
};

/** Превью строится из карточки списка; на печать уходят данные сервера. */
export function priceTagFromProduct(product: DjangoProduct): PriceTag {
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    unit: product.unit ?? "",
    category: product.category ?? "",
    attributes: (product.attributes ?? []).map((a) => ({ name: a.attributeName, role: a.role, value: a.value })),
    price: String(product.price ?? 0),
    copies: 1,
  };
}

// ── Сколько печатать ──

export type LabelCopiesMode = "one" | "stock" | "each";

/** За раз сервер принимает не больше этикеток (`MAX_PRICE_TAG_COPIES`). */
export const MAX_LABELS_PER_PRINT = 10000;

/**
 * Копий на товар: одна, по остатку (на каждую штуку своя) или по N.
 * Дробный остаток (кг, м) даёт одну этикетку на целую часть, но не меньше
 * одной; 0 — товар пропускается.
 */
export function labelCopies(mode: LabelCopiesMode, stock: number, each: number): number {
  if (mode === "one") return 1;
  if (mode === "each") return Number.isInteger(each) && each > 0 ? each : 0;
  if (!(stock > 0)) return 0;
  return Math.max(1, Math.floor(stock));
}

export function planLabelCopies(
  items: readonly { productId: number; stock: number }[],
  mode: LabelCopiesMode,
  each: number,
): { lines: { productId: number; copies: number }[]; total: number; skipped: number } {
  const lines: { productId: number; copies: number }[] = [];
  let total = 0;
  for (const item of items) {
    const copies = labelCopies(mode, item.stock, each);
    if (copies > 0) {
      lines.push({ productId: item.productId, copies });
      total += copies;
    }
  }
  return { lines, total, skipped: items.length - lines.length };
}

// ── Что на этикетке ──

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (value: string): string => value.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);

const attributeOf = (attributes: readonly PriceTagAttribute[], role: string): string =>
  attributes.find((a) => a.role === role && a.value.trim())?.value.trim() ?? "";

/** Бренд — generic-свойство «Бренд», как его заводят импорт 1С и накладные. */
export function labelBrand(tag: Pick<PriceTag, "productId" | "attributes">): string {
  return (
    productGroupValue(
      {
        id: tag.productId,
        attributes: tag.attributes.map((a) => ({ attributeName: a.name, role: a.role, value: a.value })),
      },
      "brand",
    ) ?? ""
  );
}

/** Строка под названием: «Арт. 1024 · Размер M · Синий». */
export function labelMetaLine(tag: Pick<PriceTag, "sku" | "attributes">, content: LabelContent): string {
  const parts: string[] = [];
  if (content.sku && tag.sku.trim()) parts.push(`Арт. ${tag.sku.trim()}`);
  if (content.sizeColor) {
    const size = attributeOf(tag.attributes, "size");
    const color = attributeOf(tag.attributes, "color");
    if (size) parts.push(`Размер ${size}`);
    if (color) parts.push(color);
  }
  return parts.join(" · ");
}

export function formatLabelPrice(price: string | number): string {
  const value = Number(price);
  if (!Number.isFinite(value)) return "";
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} сом`;
}

/**
 * Что кодировать: штрихкод товара, а без него — артикул (касса находит товар
 * и по нему). Валидный EAN-13 рисуется как EAN-13, остальное — Code 128.
 */
export function labelBarcode(tag: Pick<PriceTag, "barcode" | "sku">): { value: string; modules: number[] } | null {
  const value = (tag.barcode || tag.sku || "").trim();
  if (!value) return null;
  if (isValidEan13(value)) return { value, modules: bitsToModules(ean13Bits(value)) };
  const modules = code128bModules(value);
  // Только старт, контрольный символ и стоп — печатать нечего (не-ASCII).
  return modules.length > 19 ? { value, modules } : null;
}

/** Полосы в единицах модуля; растягивается по ширине этикетки. */
function barcodeSvg(modules: readonly number[]): string {
  const quiet = 6;
  const total = modules.reduce((sum, m) => sum + m, 0) + quiet * 2;
  let x = quiet;
  const bars: string[] = [];
  modules.forEach((m, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${m}" height="10"/>`);
    x += m;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 10" preserveAspectRatio="none">${bars.join("")}</svg>`;
}

function labelHtml(tag: PriceTag, options: LabelOptions): string {
  const { content } = options;
  const parts: string[] = [];
  if (content.organization && options.organizationName?.trim()) {
    parts.push(`<div class="org">${esc(options.organizationName.trim())}</div>`);
  }
  const brand = content.brand ? labelBrand(tag) : "";
  if (brand) parts.push(`<div class="brand">${esc(brand)}</div>`);
  if (content.name) parts.push(`<div class="name">${esc(tag.name)}</div>`);
  const meta = labelMetaLine(tag, content);
  if (meta) parts.push(`<div class="meta">${esc(meta)}</div>`);
  parts.push('<div class="spacer"></div>');
  if (content.price) {
    const price = formatLabelPrice(tag.price);
    if (price) parts.push(`<div class="price">${esc(price)}</div>`);
  }
  const barcode = content.barcode ? labelBarcode(tag) : null;
  if (barcode) {
    parts.push(
      `<div class="code">${barcodeSvg(barcode.modules)}<div class="digits">${esc(barcode.value)}</div></div>`,
    );
  }
  return `<div class="label">${parts.join("")}</div>`;
}

/** Каждая строка повторяется `copies` раз — одна этикетка на вешалку. */
export function expandLabelCopies(tags: readonly PriceTag[]): PriceTag[] {
  return tags.flatMap((tag) => Array.from({ length: Math.max(0, tag.copies) }, () => tag));
}

function labelStyles(geometry: LabelGeometry, preview: boolean): string {
  const { width, height, sheet } = geometry;
  const page = sheet
    ? `@page { size: ${sheet.pageWidth}mm ${sheet.pageHeight}mm; margin: 0; }`
    : `@page { size: ${width}mm ${height}mm; margin: 0; }`;
  const layout = sheet
    ? `.sheet { width: ${sheet.pageWidth}mm; height: ${sheet.pageHeight}mm; display: grid;
         grid-template-columns: repeat(${sheet.cols}, ${width}mm); grid-auto-rows: ${height}mm;
         justify-content: center; align-content: center; break-after: page; }
       .sheet:last-child { break-after: auto; }`
    : `.label { break-after: page; }
       .label:last-child { break-after: auto; }`;
  const screen = preview
    ? `body { background: transparent; display: flex; justify-content: center; padding: 4px; }
       .label { background: #fff; box-shadow: 0 0 0 1px #d0d0d0; border-radius: 1.5mm; }`
    : "";
  return `${page}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; background: #fff;
    font-family: Arial, "Helvetica Neue", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label { width: ${width}mm; height: ${height}mm; padding: 1.5mm 2mm; overflow: hidden;
    display: flex; flex-direction: column; }
  ${layout}
  .org { font-size: ${geometry.metaFont}pt; text-transform: uppercase; letter-spacing: .04em; color: #333;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand { font-size: ${geometry.metaFont}pt; font-weight: 700; text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name { font-size: ${geometry.nameFont}pt; font-weight: 700; line-height: 1.15;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { font-size: ${geometry.metaFont}pt; line-height: 1.2; margin-top: .4mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .spacer { flex: 1; min-height: .5mm; }
  .price { font-size: ${geometry.priceFont}pt; font-weight: 800; line-height: 1.1; text-align: right; }
  .code { margin-top: .5mm; }
  .code svg { display: block; width: 100%; height: ${geometry.barcodeHeight}mm; fill: #000; }
  .digits { font-family: "Courier New", monospace; font-size: ${geometry.metaFont}pt; text-align: center;
    letter-spacing: .08em; line-height: 1.1; }
  ${screen}`;
}

/**
 * Готовый документ печати. `tags` — ответ сервера: копии уже в `copies`.
 * `preview` — один экземпляр для окна настройки, без разрывов страниц.
 */
export function buildProductLabelsHtml(
  tags: readonly PriceTag[],
  options: LabelOptions,
  { preview = false }: { preview?: boolean } = {},
): string {
  const geometry = LABEL_SIZES[options.size];
  const labels = (preview ? tags.slice(0, 1) : expandLabelCopies(tags)).map((tag) => labelHtml(tag, options));
  let body: string;
  if (geometry.sheet && !preview) {
    const perPage = geometry.sheet.cols * geometry.sheet.rows;
    const pages: string[] = [];
    for (let i = 0; i < labels.length; i += perPage) {
      pages.push(`<div class="sheet">${labels.slice(i, i + perPage).join("")}</div>`);
    }
    body = pages.join("");
  } else {
    body = labels.join("");
  }
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Этикетки</title>
<style>${labelStyles(geometry, preview)}</style></head><body>${body}</body></html>`;
}

// ── Окно печати ──

const PRINT_DELAY_MS = 300;

/**
 * Окно открывается сразу по клику, до ответа сервера: открытое после `await`
 * браузер считает непрошеным попапом и блокирует. null — заблокировано всё
 * равно, вызывающий код обязан сказать об этом.
 */
export function openLabelsWindow(): Window | null {
  const win = window.open("", "_blank", "width=520,height=720");
  if (!win) return null;
  win.document.write(
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Этикетки</title></head>' +
      '<body style="font-family:sans-serif;padding:24px;color:#555">Готовлю этикетки…</body></html>',
  );
  win.document.close();
  return win;
}

export function fillLabelsWindow(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), PRINT_DELAY_MS);
}
