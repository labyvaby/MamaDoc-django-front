/**
 * Поиск товара по коду со сканера: точное совпадение со штрихкодом, любым из
 * дополнительных штрихкодов или артикулом. Регистр и пробелы по краям не важны —
 * при русской раскладке сканер может «напечатать» буквы артикула в другом регистре.
 */

export type ScannableProduct = {
  barcode?: string | null;
  barcodes?: readonly string[] | null;
  sku?: string | null;
};

export const normalizeScanCode = (value: string) => value.trim().toLowerCase();

/** Все коды товара в нормализованном виде (для поиска подстрокой и по точному коду). */
export function productScanCodes(product: ScannableProduct): string[] {
  const codes = [product.barcode, ...(product.barcodes ?? []), product.sku]
    .filter((code): code is string => Boolean(code && code.trim()))
    .map(normalizeScanCode);
  return Array.from(new Set(codes));
}

/** Сначала штрихкоды, потом артикул: штрихкод однозначнее. */
export function findProductByScanCode<T extends ScannableProduct>(
  items: readonly T[],
  code: string,
): T | undefined {
  const needle = normalizeScanCode(code);
  if (!needle) return undefined;
  const byBarcode = items.find((item) =>
    [item.barcode, ...(item.barcodes ?? [])].some((value) => value && normalizeScanCode(value) === needle),
  );
  return byBarcode ?? items.find((item) => item.sku && normalizeScanCode(item.sku) === needle);
}

/** Прокрутить к строке списка, если она уже нарисована. */
export function scrollRowIntoView(selector: string): boolean {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) return false;
  node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
}
