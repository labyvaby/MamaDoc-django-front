import type { CatalogModule, FeatureSignals, ModuleRequest } from "../api/tenancy";
import { missingRequirements } from "./moduleCatalogRequirements";
import {
  STOREFRONT_BUNDLES,
  STOREFRONT_CATEGORIES,
  STOREFRONT_CORE_MODULES,
  STOREFRONT_INCLUDED,
  STOREFRONT_PRODUCTS,
  type StorefrontBundle,
  type StorefrontCategory,
  type StorefrontCategoryId,
  type StorefrontIncluded,
  type StorefrontProduct,
  type StorefrontVertical,
} from "./moduleStorefront";

/** soon — в разработке: показываем, заявка — интерес до запуска. */
export type ProductStatus = "connected" | "requested" | "available" | "soon";

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
  /** «Неактивен»: клиникам не показывается, такой товар видит только оператор. */
  inactive: boolean;
  /** Почему скрыт; сервер отдаёт её только суперпользователю. */
  inactiveReason: string;
  /** Клиника попросила отключить платный товар — ждёт менеджера. */
  pendingDisconnect: boolean;
}

/** included — работает; off — модуль пакета выключен; requested — просили включить. */
export type IncludedStatus = "included" | "off" | "requested";

export interface IncludedItem {
  card: StorefrontIncluded;
  status: IncludedStatus;
  /** Модуль карточки из каталога; null — возможность без модуля, всегда в пакете. */
  module: CatalogModule | null;
  /** Модуль пакета (сервер: inPackage) — клиника с правом включает и выключает сама. */
  selfService: boolean;
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
  /** «Входит в ваш пакет». */
  included: IncludedItem[];
  categories: StorefrontCategory[];
  connectedCount: number;
  availableCount: number;
}

/** product/bundle — купить; soon — узнать о запуске; disconnect — отключить платное. */
export type RequestKind = "product" | "bundle" | "soon" | "disconnect";

export interface RequestTarget {
  productId: string;
  title: string;
  modules: string[];
  extraRequirementNames: string[];
  kind: RequestKind;
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

/** Вид бизнеса витрины: прочие смотрят витрину клиники, как и словарь терминов. */
export function storefrontVertical(vertical: string | null | undefined): StorefrontVertical {
  return vertical === "beauty" || vertical === "retail" ? vertical : "clinic";
}

const suits = (verticals: readonly StorefrontVertical[] | undefined, vertical: StorefrontVertical) =>
  !verticals || verticals.includes(vertical);

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

/** Модуль без товара и карточки — оператору, чтобы его было чем переключить. */
function cardFromModule(module: CatalogModule): StorefrontIncluded {
  return { id: module.code, title: module.name, icon: "puzzle", tone: "blue", tagline: module.description, module: module.code };
}

/** Заявка покрывает товар: на него самого или на все его модули. */
const covers = (r: ModuleRequest, productId: string, codes: string[]) =>
  r.productId === productId || (codes.length > 0 && codes.every((code) => r.moduleCodes.includes(code)));

/** Открытая заявка на подключение; нет поля kind (старый бэк) — подключение. */
const isRequested = (productId: string, missing: string[], openRequests: ModuleRequest[]) =>
  openRequests.some((r) => r.kind !== "disconnect" && covers(r, productId, missing));

const isPendingDisconnect = (productId: string, codes: string[], openRequests: ModuleRequest[]) =>
  openRequests.some((r) => r.kind === "disconnect" && covers(r, productId, codes));

/** Недостающие требования модулей — в заявку, названия тех, что вне товара, — в окно заявки. */
function requirementsOf(codes: string[], own: string[], byCode: Map<string, CatalogModule>, catalog: CatalogModule[]) {
  const requirements = new Map<string, string>();
  for (const code of codes) {
    const module = byCode.get(code);
    if (!module) continue;
    for (const r of missingRequirements(module, catalog)) {
      if (!own.includes(r.code)) requirements.set(r.code, r.name);
    }
  }
  return { requestModules: [...requirements.keys(), ...codes], extraRequirementNames: [...requirements.values()] };
}

export function buildStorefront(input: {
  catalog: CatalogModule[];
  vertical: string | null | undefined;
  openRequests: ModuleRequest[];
  /** Признаки товаров без модуля; null — неизвестны, такие товары не показываем. */
  signals?: FeatureSignals | null;
  /** Оператор платформы видит и выключенное снятое с продажи, и модули без карточки. */
  operator?: boolean;
  /** Товары «Неактивен» (id → причина): клиникам их не показываем. */
  inactive?: Map<string, string> | null;
}): StorefrontView {
  const { catalog, openRequests, signals = null, operator = false } = input;
  const hidden = input.inactive ?? new Map<string, string>();
  const vertical = storefrontVertical(input.vertical);
  const byCode = new Map(catalog.map((m) => [m.code, m]));
  const configured = new Set(STOREFRONT_PRODUCTS.flatMap((p) => p.modules));
  const inPackage = new Set([
    ...STOREFRONT_CORE_MODULES,
    ...STOREFRONT_INCLUDED.flatMap((c) => (c.module ? [c.module] : [])),
  ]);
  const products = [
    ...STOREFRONT_PRODUCTS.filter((p) => suits(p.verticals, vertical)),
    ...catalog.filter((m) => !configured.has(m.code) && !inPackage.has(m.code)).map(productFromModule),
  ]
    .filter((p) => p.modules.every((code) => byCode.has(code)))
    // Неактивное клиникам не показываем; оператор видит с пометкой.
    .filter((p) => operator || !hidden.has(p.id));

  const base = products
    .map((p) => toItem(p, byCode, catalog, openRequests, signals))
    .filter((i): i is StorefrontItem => i !== null);
  const statusById = new Map(base.map((i) => [i.product.id, i.status]));
  const titleById = new Map(STOREFRONT_PRODUCTS.map((p) => [p.id, p.title]));
  const items = base.map((item) => {
    const freeWith = item.product.freeWith;
    return {
      ...item,
      free: Boolean(freeWith && statusById.get(freeWith) === "connected"),
      freeWithTitle: freeWith ? titleById.get(freeWith) ?? null : null,
      inactive: hidden.has(item.product.id),
      inactiveReason: hidden.get(item.product.id) ?? "",
    };
  });
  // Счётчики и подборки — по тому, что продаётся: у оператора они те же, что у клиники.
  const onSale = items.filter((i) => !i.inactive);
  const itemById = new Map(onSale.map((i) => [i.product.id, i]));
  const bundles = STOREFRONT_BUNDLES[vertical]
    .map((b) => toBundleView(b, itemById))
    .filter((v): v is StorefrontBundleView => v !== null)
    .slice(0, 2);
  const onShelf = new Set(items.flatMap((i) => i.product.modules));
  const present = new Set(items.map((i) => i.product.category));
  return {
    items,
    bundles,
    included: buildIncluded({ catalog, byCode, vertical, openRequests, operator, onShelf }),
    categories: STOREFRONT_CATEGORIES.filter((c) => present.has(c.id)),
    connectedCount: onSale.filter((i) => i.status === "connected").length,
    availableCount: onSale.filter((i) => i.status === "available" || i.status === "requested").length,
  };
}

function toItem(
  product: StorefrontProduct,
  byCode: Map<string, CatalogModule>,
  catalog: CatalogModule[],
  openRequests: ModuleRequest[],
  signals: FeatureSignals | null,
): StorefrontItem | null {
  const plain = {
    product,
    missingModules: [],
    requestModules: [],
    extraRequirementNames: [],
    free: false,
    freeWithTitle: null,
    inactive: false,
    inactiveReason: "",
    pendingDisconnect: false,
  };
  if (product.soon) {
    return { ...plain, status: isRequested(product.id, [], openRequests) ? "requested" : "soon" };
  }
  if (product.signal) {
    // Не знаем, пользуется ли клиника, — не предлагаем: вдруг уже работает.
    if (!signals) return null;
    const status = signals[product.signal] ? "connected" : isRequested(product.id, [], openRequests) ? "requested" : "available";
    return { ...plain, status };
  }
  const missingModules = product.modules.filter((code) => !byCode.get(code)?.isEnabled);
  const status: ProductStatus =
    missingModules.length === 0 ? "connected" : isRequested(product.id, missingModules, openRequests) ? "requested" : "available";
  return {
    ...plain,
    status,
    missingModules,
    ...requirementsOf(missingModules, product.modules, byCode, catalog),
    pendingDisconnect: isPendingDisconnect(product.id, product.modules, openRequests),
  };
}

function buildIncluded(input: {
  catalog: CatalogModule[];
  byCode: Map<string, CatalogModule>;
  vertical: StorefrontVertical;
  openRequests: ModuleRequest[];
  operator: boolean;
  /** Модули товаров на полке — оператору их не повторяем. */
  onShelf: Set<string>;
}): IncludedItem[] {
  const { catalog, byCode, vertical, openRequests, operator, onShelf } = input;
  const toIncluded = (card: StorefrontIncluded, module: CatalogModule | null): IncludedItem => {
    const selfService = module?.inPackage === true;
    if (!module || module.isEnabled) return { card, status: "included", module, selfService };
    return {
      card,
      status: isRequested(card.id, [module.code], openRequests) ? "requested" : "off",
      module,
      selfService,
    };
  };

  const items: IncludedItem[] = [];
  for (const card of STOREFRONT_INCLUDED) {
    if (!suits(card.verticals, vertical)) continue;
    const module = card.module ? byCode.get(card.module) : null;
    // Модуля нет в каталоге организации — этой возможности у неё быть не может.
    if (module === undefined) continue;
    const entry = toIncluded(card, module);
    if (card.hiddenWhenOff && entry.status !== "included" && !operator) continue;
    items.push(entry);
  }
  if (operator) {
    const shown = new Set([...onShelf, ...items.flatMap((i) => (i.module ? [i.module.code] : []))]);
    for (const module of catalog) {
      if (!shown.has(module.code)) items.push(toIncluded(cardFromModule(module), module));
    }
  }
  return items;
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
    kind: item.product.soon ? "soon" : "product",
  };
}

export function bundleTarget(view: StorefrontBundleView): RequestTarget {
  return {
    productId: `bundle:${view.bundle.id}`,
    title: view.bundle.title,
    modules: view.requestModules,
    extraRequirementNames: view.extraRequirementNames,
    kind: "bundle",
  };
}

/** Заявка отключить подключённый платный товар: оплата прекращается вместе с ним. */
export function disconnectTarget(item: StorefrontItem): RequestTarget {
  return {
    productId: item.product.id,
    title: item.product.title,
    modules: item.product.modules,
    extraRequirementNames: [],
    kind: "disconnect",
  };
}

const SHELF_RANK: Record<ProductStatus, number> = { available: 0, requested: 1, soon: 2, connected: 3 };
const INACTIVE_RANK = 4;

/**
 * Порядок на полке: что можно подключить, потом в заявках, потом «Скоро», потом
 * подключённое; неактивное (его видит только оператор) — в самом конце.
 */
export function shelfOrder(items: StorefrontItem[]): StorefrontItem[] {
  const rank = (i: StorefrontItem) => (i.inactive ? INACTIVE_RANK : SHELF_RANK[i.status]);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

export interface SearchResult<T> {
  item: T;
  /** Части, в которых нашлось слово, — карточка их выделяет. */
  parts: string[];
}

const normalize = (text: string) => text.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");

function match(words: string[], doc: { title: string; tagline: string; features?: string[]; parts?: string[] }) {
  const fields = [doc.title, doc.tagline, ...(doc.features ?? []), ...(doc.parts ?? [])].map(normalize);
  if (!words.every((word) => fields.some((field) => field.includes(word)))) return null;
  return (doc.parts ?? []).filter((part) => words.some((word) => normalize(part).includes(word)));
}

/** Поиск по названию, пользе, возможностям и частям; все слова запроса должны найтись. */
export function searchStorefront(
  view: StorefrontView,
  query: string,
): { items: SearchResult<StorefrontItem>[]; included: SearchResult<IncludedItem>[] } {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const hits = <T>(list: T[], docOf: (item: T) => Parameters<typeof match>[1]): SearchResult<T>[] =>
    list.flatMap((item) => {
      const parts = words.length === 0 ? [] : match(words, docOf(item));
      return parts === null ? [] : [{ item, parts }];
    });
  return {
    items: hits(shelfOrder(view.items), (i) => i.product),
    included: hits(view.included, (i) => i.card),
  };
}
