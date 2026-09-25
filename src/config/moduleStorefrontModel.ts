import type { CatalogModule, ModuleRequest } from "../api/tenancy";
import { missingRequirements } from "./moduleCatalogRequirements";
import {
  STOREFRONT_BASE_MODULES,
  STOREFRONT_BUNDLES,
  STOREFRONT_CATEGORIES,
  STOREFRONT_HIDDEN_MODULES,
  STOREFRONT_PRODUCTS,
  type StorefrontBundle,
  type StorefrontCategory,
  type StorefrontCategoryId,
  type StorefrontProduct,
} from "./moduleStorefront";

export type ProductStatus = "connected" | "requested" | "available";

export interface StorefrontItem {
  product: StorefrontProduct;
  status: ProductStatus;
  /** Модули товара, которые ещё не подключены. */
  missingModules: string[];
  /** Что уйдёт в заявку: недостающие требования в порядке подключения, затем модули товара. */
  requestModules: string[];
  /** Требования вне товара — окно заявки их называет. */
  extraRequirementNames: string[];
  /** Товар бесплатен: подключён тот, с которым он идёт бесплатно. */
  free: boolean;
  /** Название товара из `freeWith`, для подписи «Бесплатно с …». */
  freeWithTitle: string | null;
}

export interface StorefrontBundleView {
  bundle: StorefrontBundle;
  items: StorefrontItem[];
  /** Сом в месяц за недостающее; null — «Цена по запросу». */
  price: number | null;
  requestModules: string[];
  extraRequirementNames: string[];
}

export interface StorefrontView {
  items: StorefrontItem[];
  bundles: StorefrontBundleView[];
  basePackage: CatalogModule[];
  categories: StorefrontCategory[];
  connectedCount: number;
  availableCount: number;
}

export interface RequestTarget {
  productId: string;
  title: string;
  modules: string[];
  extraRequirementNames: string[];
}

const BACKEND_CATEGORY: Record<string, StorefrontCategoryId> = {
  commerce: "clients",
  analytics: "clients",
  communication: "communication",
  integrations: "communication",
  hr: "team",
  core: "team",
  clinical: "medicine",
  finance: "trade",
  operations: "trade",
};

export function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} сом/мес`;
}

/** Модуль, которого нет в конфиге: продаём «по запросу» его же словами. */
function productFromModule(module: CatalogModule): StorefrontProduct {
  return {
    id: module.code,
    title: module.name,
    modules: [module.code],
    category: BACKEND_CATEGORY[module.category] ?? "clients",
    icon: "puzzle",
    price: null,
    tagline: module.description,
    features: [],
  };
}

export function buildStorefront(input: {
  catalog: CatalogModule[];
  vertical: string | null | undefined;
  openRequests: ModuleRequest[];
}): StorefrontView {
  const { catalog, vertical, openRequests } = input;
  const byCode = new Map(catalog.map((m) => [m.code, m]));
  const configured = new Set(STOREFRONT_PRODUCTS.flatMap((p) => p.modules));
  const notForSale = new Set([...STOREFRONT_BASE_MODULES, ...STOREFRONT_HIDDEN_MODULES]);
  const products = [
    ...STOREFRONT_PRODUCTS,
    ...catalog.filter((m) => !configured.has(m.code) && !notForSale.has(m.code)).map(productFromModule),
  ].filter((p) => p.modules.every((code) => byCode.has(code)));

  const base = products.map((p) => toItem(p, byCode, catalog, openRequests));
  const statusById = new Map(base.map((i) => [i.product.id, i.status]));
  const titleById = new Map(STOREFRONT_PRODUCTS.map((p) => [p.id, p.title]));
  const items = base.map((item) => {
    const freeWith = item.product.freeWith;
    return {
      ...item,
      free: Boolean(freeWith && statusById.get(freeWith) === "connected"),
      freeWithTitle: freeWith ? titleById.get(freeWith) ?? null : null,
    };
  });
  const itemById = new Map(items.map((i) => [i.product.id, i]));
  const bundles = (STOREFRONT_BUNDLES[vertical ?? ""] ?? STOREFRONT_BUNDLES.clinic)
    .map((b) => toBundleView(b, itemById))
    .filter((v): v is StorefrontBundleView => v !== null)
    .slice(0, 2);
  const present = new Set(items.map((i) => i.product.category));
  return {
    items,
    bundles,
    basePackage: catalog.filter((m) => m.isEnabled && notForSale.has(m.code)),
    categories: STOREFRONT_CATEGORIES.filter((c) => present.has(c.id)),
    connectedCount: items.filter((i) => i.status === "connected").length,
    availableCount: items.filter((i) => i.status !== "connected").length,
  };
}

function toItem(
  product: StorefrontProduct,
  byCode: Map<string, CatalogModule>,
  catalog: CatalogModule[],
  openRequests: ModuleRequest[],
): StorefrontItem {
  const missingModules = product.modules.filter((code) => !byCode.get(code)?.isEnabled);
  const requirements = new Map<string, string>();
  for (const code of missingModules) {
    const module = byCode.get(code);
    if (!module) continue;
    for (const r of missingRequirements(module, catalog)) {
      if (!product.modules.includes(r.code)) requirements.set(r.code, r.name);
    }
  }
  const requested =
    missingModules.length > 0 &&
    openRequests.some(
      (r) => r.productId === product.id || missingModules.every((code) => r.moduleCodes.includes(code)),
    );
  return {
    product,
    status: missingModules.length === 0 ? "connected" : requested ? "requested" : "available",
    missingModules,
    requestModules: [...requirements.keys(), ...missingModules],
    extraRequirementNames: [...requirements.values()],
    free: false,
    freeWithTitle: null,
  };
}

function toBundleView(bundle: StorefrontBundle, itemById: Map<string, StorefrontItem>): StorefrontBundleView | null {
  const items = bundle.products.map((id) => itemById.get(id)).filter((i): i is StorefrontItem => Boolean(i));
  const toConnect = items.filter((i) => i.status === "available");
  if (toConnect.length === 0) return null;
  const freeInBundle = (freeWith: string | undefined) =>
    Boolean(freeWith && (bundle.products.includes(freeWith) || itemById.get(freeWith)?.status === "connected"));
  let price: number | null = 0;
  for (const item of toConnect) {
    if (freeInBundle(item.product.freeWith)) continue;
    if (item.product.price === null) {
      price = null;
      break;
    }
    price += item.product.price;
  }
  return {
    bundle,
    items,
    price,
    requestModules: [...new Set(toConnect.flatMap((i) => i.requestModules))],
    extraRequirementNames: [...new Set(toConnect.flatMap((i) => i.extraRequirementNames))],
  };
}

export function itemTarget(item: StorefrontItem): RequestTarget {
  return {
    productId: item.product.id,
    title: item.product.title,
    modules: item.requestModules,
    extraRequirementNames: item.extraRequirementNames,
  };
}

export function bundleTarget(view: StorefrontBundleView): RequestTarget {
  return {
    productId: `bundle:${view.bundle.id}`,
    title: view.bundle.title,
    modules: view.requestModules,
    extraRequirementNames: view.extraRequirementNames,
  };
}

const SHELF_RANK: Record<ProductStatus, number> = { available: 0, requested: 1, connected: 2 };

/** Порядок на полке: что можно подключить, потом в заявках, потом подключённое. */
export function shelfOrder(items: StorefrontItem[]): StorefrontItem[] {
  return [...items].sort((a, b) => SHELF_RANK[a.status] - SHELF_RANK[b.status]);
}
