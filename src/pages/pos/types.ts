/** Типы модуля «Касса». Пока это форма моков — под неё же ляжет `/pos/` API. */

/** Вариант цвета товара. `hex` — данные товара, а не токен темы. */
export type PosColorOption = {
  id: string;
  label: string;
  hex: string;
};

/** Вариант размера. Недоступный показывается зачёркнутым. */
export type PosSizeOption = {
  id: string;
  label: string;
  available: boolean;
};

/** Строка чека. */
export type PosReceiptLine = {
  id: string;
  name: string;
  /** Бренд — бейдж рядом с названием, есть не у всех позиций. */
  brand?: string;
  sku: string;
  barcode: string;
  colors: PosColorOption[];
  selectedColorId: string;
  sizes: PosSizeOption[];
  selectedSizeId: string;
  quantity: number;
  price: number;
  /** Удалённая строка остаётся в чеке зачёркнутой — её можно вернуть. */
  removed?: boolean;
};

/** Карточка товара в полосе выбранной категории. */
export type PosCatalogItem = {
  id: string;
  name: string;
  brand?: string;
  price: number;
  colors: PosColorOption[];
  sizes: PosSizeOption[];
};

/** Уровень лояльности клиента. */
export type PosClient = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  discountPercent: number;
  bonuses: number;
  cashback: number;
  /** Прогресс до следующего уровня, 0–1. */
  tierProgress: number;
  nextTier: string;
  nextTierAmount: number;
};

/** Найденный клиент в футере поиска. */
export type PosClientSearchResult = PosClient;

/** Скидка из списка «Другая скидка». */
export type PosDiscount = {
  id: string;
  label: string;
  percent: number;
};

/** Отложенный чек. */
export type PosHeldReceipt = {
  id: string;
  createdAt: string;
  number: string;
  clientName: string;
  comment: string;
  total: number;
};

/** Товар, который касса предлагает добавить к покупке. */
export type PosRecommendation = {
  id: string;
  name: string;
  brand: string;
  price: number;
  colors: PosColorOption[];
  sizes: PosSizeOption[];
};
