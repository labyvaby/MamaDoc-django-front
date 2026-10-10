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
  /** Шаблоны: видеть список (нужно окну печати). */
  view: "printforms.view",
  /** Шаблоны: создавать и менять — конструктор этикетки. */
  manage: "printforms.manage",
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
  /** Раскладка шаблона, которым напечатано (`utility/labelLayout.ts`). */
  fields: unknown[];
  widthMm: number | null;
  heightMm: number | null;
  data: { branchId: number | null; tags: PriceTag[] };
};

/** Шаблон печати организации; у этикетки `fields` — элементы раскладки. */
export type PrintTemplate = {
  id: number;
  organizationId: number;
  name: string;
  kind: string;
  pageSize: string;
  orientation: string;
  fields: unknown[];
  background: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
  widthMm: number | null;
  heightMm: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PrintTemplateWrite = {
  name?: string;
  pageSize?: string;
  widthMm?: number;
  heightMm?: number;
  fields?: unknown[];
  isActive?: boolean;
};

export const PRICE_TAG_KIND = "price_tag";

/** Шаблоны этикеток организации (вместе с выключенными — фильтр на вызывающем). */
export function getPriceTagTemplates(signal?: AbortSignal): Promise<PrintTemplate[]> {
  return apiRequest<PrintTemplate[]>(`${BASE}/templates/?kind=${PRICE_TAG_KIND}`, { signal });
}

export function createPriceTagTemplate(data: PrintTemplateWrite & { name: string; isDefault?: boolean }) {
  return apiRequest<PrintTemplate>(`${BASE}/templates/`, {
    method: "POST",
    body: { ...data, kind: PRICE_TAG_KIND },
  });
}

export function updatePrintTemplate(id: number, data: PrintTemplateWrite) {
  return apiRequest<PrintTemplate>(`${BASE}/templates/${id}/`, { method: "PATCH", body: data });
}

/** Шаблон по умолчанию — им печатают, когда шаблон не выбран. */
export function setDefaultPrintTemplate(id: number) {
  return apiRequest<PrintTemplate>(`${BASE}/templates/${id}/default/`, { method: "POST" });
}

export type PriceTagLine = { productId: number; copies: number };

/**
 * Напечатать этикетки пачкой: строки в порядке печати, цена — филиала
 * `branchId`. Без `templateId` — шаблон по умолчанию (нет ни одного —
 * сервер заводит стандартный).
 */
export function printPriceTags(
  products: PriceTagLine[],
  branchId?: number | null,
  templateId?: number | null,
): Promise<PriceTagPrintResult> {
  return apiRequest<PriceTagPrintResult>(`${BASE}/price-tags/`, {
    method: "POST",
    body: { products, branchId: branchId ?? null, templateId: templateId ?? null },
  });
}
