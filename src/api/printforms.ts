import { apiRequest } from "./client";

/**
 * Печатные формы: этикетки (ценники) товаров. Бэк:
 * `POST /api/v2/printforms/price-tags/` (server/apps/printforms).
 *
 * Сервер не рисует лист — он отдаёт данные этикеток: цену **филиала**
 * (`branchId`), основной штрихкод, свойства товара — и записывает, что и когда
 * напечатали (журнал `jobs/`). Раскладку на этикетке собирает фронт
 * (`utility/productLabels.ts`): ширину рулона знает тот, кто стоит у принтера.
 *
 * Право — `printforms.print` («Печать этикеток товаров и бланков»), модуль
 * `printforms`. Без настроенного шаблона сервер при первой печати сам заводит
 * стандартный «Этикетка товара».
 */

const BASE = "/v2/printforms";

export const PRINTFORMS_PERMISSIONS = {
  print: "printforms.print",
} as const;

export type PriceTagAttribute = {
  name: string;
  /** generic | color | size */
  role: string;
  value: string;
};

export type PriceTag = {
  productId: number;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  category: string;
  attributes: PriceTagAttribute[];
  /** Деньги строкой («5000.00»), как во всём v2. */
  price: string;
  copies: number;
};

export type PriceTagPrintResult = {
  templateId: number;
  kind: string;
  pageSize: string;
  orientation: string;
  data: { branchId: number | null; tags: PriceTag[] };
};

export type PriceTagLine = { productId: number; copies: number };

/** Напечатать этикетки пачкой: строки в порядке печати, цена — филиала `branchId`. */
export function printPriceTags(
  products: PriceTagLine[],
  branchId?: number | null,
): Promise<PriceTagPrintResult> {
  return apiRequest<PriceTagPrintResult>(`${BASE}/price-tags/`, {
    method: "POST",
    body: { products, branchId: branchId ?? null },
  });
}
