/**
 * Этикетки товаров: общее для печати и конструктора — данные для превью,
 * сколько копий, цена, штрихкод, окно печати.
 *
 * Данные этикеток (цена филиала, основной штрихкод, свойства) приходят с
 * сервера — `printPriceTags` в `api/printforms.ts`. Где и чем они стоят на
 * этикетке — раскладка шаблона, `labelLayout.ts`.
 */

import type { PriceTag } from "../api/printforms";
import type { DjangoProduct } from "../api/warehouse";
import { code128bModules } from "./barcode128";
import { bitsToModules, ean13Bits, isValidEan13 } from "./ean13";
import { productGroupValue } from "./productGroups";

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

/** Число цены с разрядами: «7 500», «99,5». */
export function formatLabelNumber(price: string | number): string {
  const value = Number(price);
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function formatLabelPrice(price: string | number): string {
  const number = formatLabelNumber(price);
  return number ? `${number} сом` : "";
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

/** Полосы в единицах модуля; растягивается по ширине элемента. */
export function barcodeSvg(modules: readonly number[]): string {
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

/** Каждая строка повторяется `copies` раз — одна этикетка на вешалку. */
export function expandLabelCopies(tags: readonly PriceTag[]): PriceTag[] {
  return tags.flatMap((tag) => Array.from({ length: Math.max(0, tag.copies) }, () => tag));
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
