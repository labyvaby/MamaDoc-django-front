import type {
  PosCatalogItem,
  PosClient,
  PosClientSearchResult,
  PosColorOption,
  PosDiscount,
  PosHeldReceipt,
  PosRecommendation,
  PosReceiptLine,
  PosSizeOption,
} from "./types";

/**
 * Моки модуля «Касса» — ровно те данные, что стоят в макете Monogram.
 * Их место позже займёт `/pos/` (`src/api/retail.ts`); форма типов уже под это.
 */

export const POS_COLORS: PosColorOption[] = [
  { id: "white", label: "Белый", hex: "#FFFFFF" },
  { id: "black", label: "Черный", hex: "#111111" },
  { id: "violet", label: "Фиолетовый", hex: "#C13FD6" },
  { id: "blue", label: "Синий", hex: "#2F80ED" },
  { id: "green", label: "Зеленый", hex: "#27AE60" },
];

export const POS_SIZES: PosSizeOption[] = [
  { id: "xs", label: "XS", available: true },
  { id: "s", label: "S", available: true },
  { id: "m", label: "M", available: true },
  { id: "l", label: "L", available: true },
  { id: "xl", label: "XL", available: false },
  { id: "xxl", label: "XXL", available: false },
];

export const POS_CATEGORIES = ["Верх", "Низ", "Платья и юбки", "Обувь"];

export const POS_CASHIER = { desk: "Касса №3", name: "Эмир" };

export const POS_RECEIPT_NUMBER = "135753";

const BRANDS = [
  undefined,
  "BALENCIAGA",
  undefined,
  "ZARA",
  "DENIM",
  undefined,
  undefined,
  "BISHKEKCHANKA",
  undefined,
  undefined,
  undefined,
];

export const POS_RECEIPT_LINES: PosReceiptLine[] = BRANDS.map((brand, index) => ({
  id: `line-${index + 1}`,
  name: "Футболка оверсайз",
  brand,
  sku: "TSH-153731",
  barcode: "4600000000130",
  colors: POS_COLORS,
  selectedColorId: "white",
  sizes: POS_SIZES,
  selectedSizeId: "xs",
  quantity: 2,
  price: 1000,
}));

export const POS_CLIENT: PosClient = {
  id: "client-1",
  name: "Автандил Эмиров",
  phone: "+996 700 700 700",
  tier: "Золото",
  discountPercent: 5,
  bonuses: 350,
  cashback: 350,
  tierProgress: 0.62,
  nextTier: "Платина",
  nextTierAmount: 15000,
};

export const POS_CLIENT_SEARCH_RESULTS: PosClientSearchResult[] = [
  { ...POS_CLIENT, id: "client-1", name: "Автандил Эмиров", discountPercent: 3, bonuses: 120 },
  { ...POS_CLIENT, id: "client-2", name: "Автандил Майоров", discountPercent: 3, bonuses: 120 },
  { ...POS_CLIENT, id: "client-3", name: "Автандил Эмиров", discountPercent: 3, bonuses: 120 },
];

export const POS_DISCOUNTS: PosDiscount[] = [
  { id: "birthday", label: "День рождения", percent: 5 },
  { id: "staff", label: "Скидка сотрудника", percent: 10 },
  { id: "season", label: "Сезонная акция", percent: 30 },
];

/** Промокод, который касса принимает; всё остальное — «не найден или истёк». */
export const POS_VALID_PROMO = "PROMIK123";

/** Сумма, которую даёт сертификат из макета. */
export const POS_CERTIFICATE_AMOUNT = 5000;

export const POS_HELD_RECEIPTS: PosHeldReceipt[] = [
  { id: "held-1", createdAt: "12.08.2026, 12:44", number: "Чек №135753", clientName: "Бектур Касанов", comment: "Клиент с розовыми очками", total: 2456 },
  { id: "held-2", createdAt: "12.08.2026, 12:44", number: "Чек №135753", clientName: "Бектур Касанов", comment: "Клиент с розовыми очками", total: 2456 },
  { id: "held-3", createdAt: "12.08.2026, 12:44", number: "Чек №135753", clientName: "Бектур Касанов", comment: "Клиент с розовыми очками", total: 2456 },
];

export const POS_RECOMMENDATION: PosRecommendation = {
  id: "reco-1",
  name: "Штаны Ничегосебе",
  brand: "LOEWE",
  price: 2000,
  colors: POS_COLORS.slice(0, 4),
  sizes: POS_SIZES.slice(1, 4),
};

export const POS_CATALOG: PosCatalogItem[] = Array.from({ length: 5 }, (_, index) => ({
  id: `catalog-${index + 1}`,
  name: "Футболка оверсайз",
  brand: "BALENCIAGA",
  price: 2000,
  colors: POS_COLORS.slice(0, 3),
  sizes: POS_SIZES.slice(1, 3),
}));
