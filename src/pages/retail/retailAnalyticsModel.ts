import type { PosSavedReceipt } from "../../api/pos";
import type { DateRange } from "../../components/ui";
import { historyPreset } from "../pos/historyMeta";
import type { MatrixGaps, RetailCollection, SellThroughRow, SizeGridRow } from "../../api/retailAnalytics";
import { receiptNumber } from "../pos/historyMeta";

/**
 * Арифметика экрана «Аналитика магазина» — отдельно от компонентов, чтобы
 * её можно было проверить тестом без рендера.
 */

/** Диапазон пресета периода истории продаж. */
export const presetRange = (key: string): DateRange => {
  const [from, to] = historyPreset(key).range();
  return { from, to };
};

export const num = (value: string | number | null | undefined): number => {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Перенесённые из 1С чеки несут свой номер в комментарии: «Чек 1С НФРТ-000105.». */
const ONEC_NUMBER = /Чек 1С\s+(\S+?)\.?(?:\s|$)/;

/** Номер чека для людей: номер 1С, если чек оттуда, иначе короткий номер кассы. */
export const receiptLabel = (receipt: Pick<PosSavedReceipt, "number" | "id" | "comment">): string => {
  const match = ONEC_NUMBER.exec(receipt.comment ?? "");
  return match ? match[1] : receiptNumber(receipt);
};

/** Маржа в процентах от выручки; без выручки — null, а не ноль. */
export const marginPercent = (gross: number, revenue: number): number | null =>
  revenue > 0 ? (gross / revenue) * 100 : null;

export const formatPercent = (value: number | null, digits = 1): string =>
  value === null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} %`;

/** Русское склонение: plural(3, "позиция", "позиции", "позиций") → «позиции». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const formatQty = (value: number): string =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

// ── Сезоны ───────────────────────────────────────────────────────────────────

export const NO_SEASON = "";

/** «Все сезоны» — отсутствие фильтра, а не пустой сезон (пустой — «Без сезона»). */
export const ALL_SEASONS = "__all__";

/** Сезон для запроса: «все» — без параметра; пустой сезон сервер не фильтрует. */
export const seasonParam = (value: string): string | undefined =>
  value === ALL_SEASONS || value === NO_SEASON ? undefined : value;

/** Сезоны коллекций по убыванию года; «без сезона» — последним. */
export function seasonOptions(collections: RetailCollection[]): string[] {
  const latestYear = new Map<string, number>();
  for (const c of collections) {
    const year = c.year ?? 0;
    latestYear.set(c.season, Math.max(latestYear.get(c.season) ?? 0, year));
  }
  return [...latestYear.keys()].sort((a, b) => {
    if (a === NO_SEASON) return 1;
    if (b === NO_SEASON) return -1;
    return (latestYear.get(b) ?? 0) - (latestYear.get(a) ?? 0) || a.localeCompare(b, "ru");
  });
}

export const seasonLabel = (season: string) => (season === NO_SEASON ? "Без сезона" : season);

// ── Sell-through ─────────────────────────────────────────────────────────────

export type SellThroughSort = "sellThrough" | "sold" | "stock" | "name";

export type SellThroughTotals = {
  models: number;
  sold: number;
  returned: number;
  stock: number;
  /** Нетто-продано от «нетто-продано + остаток» по всем строкам. */
  sellThrough: number | null;
};

export function sellThroughTotals(rows: SellThroughRow[]): SellThroughTotals {
  let sold = 0;
  let returned = 0;
  let stock = 0;
  for (const row of rows) {
    sold += num(row.sold);
    returned += num(row.returned);
    stock += Math.max(num(row.stock), 0);
  }
  const net = sold - returned;
  const passed = net + stock;
  return {
    models: rows.length,
    sold,
    returned,
    stock,
    sellThrough: passed > 0 ? (net / passed) * 100 : null,
  };
}

/** Поиск по модели и коллекции и сортировка; «нечего делить» — всегда в конце. */
export function filterSellThrough(rows: SellThroughRow[], search: string, sort: SellThroughSort): SellThroughRow[] {
  const q = search.trim().toLowerCase();
  const found = q
    ? rows.filter((row) => row.modelName.toLowerCase().includes(q) || row.collectionName.toLowerCase().includes(q))
    : rows.slice();
  const pct = (row: SellThroughRow) => (row.sellThrough === null ? -1 : num(row.sellThrough));
  const by: Record<SellThroughSort, (a: SellThroughRow, b: SellThroughRow) => number> = {
    // При равном проценте выше то, чего продали больше: 100 % из ста штук
    // важнее 100 % из одной.
    sellThrough: (a, b) => pct(b) - pct(a) || num(b.sold) - num(a.sold),
    sold: (a, b) => num(b.sold) - num(a.sold),
    stock: (a, b) => num(b.stock) - num(a.stock),
    name: (a, b) => a.modelName.localeCompare(b.modelName, "ru"),
  };
  return found.sort((a, b) => by[sort](a, b) || a.modelName.localeCompare(b.modelName, "ru"));
}

// ── Размерная сетка ──────────────────────────────────────────────────────────

export type SizeShare = SizeGridRow & {
  soldQty: number;
  stockQty: number;
  /** Доля размера в продажах выборки, %. */
  soldShare: number;
  /** Сколько из прошедшего через полку этого размера продано, %. */
  sellThrough: number | null;
};

export function sizeShares(rows: SizeGridRow[]): SizeShare[] {
  const totalSold = rows.reduce((acc, row) => acc + Math.max(num(row.sold), 0), 0);
  return rows.map((row) => {
    const soldQty = Math.max(num(row.sold), 0);
    const stockQty = Math.max(num(row.stock), 0);
    const passed = soldQty + stockQty;
    return {
      ...row,
      soldQty,
      stockQty,
      soldShare: totalSold > 0 ? (soldQty / totalSold) * 100 : 0,
      sellThrough: passed > 0 ? (soldQty / passed) * 100 : null,
    };
  });
}

// ── Дыры в матрице ───────────────────────────────────────────────────────────

export type MatrixCellState = "ok" | "empty" | "missing";

/** Сетка цвет × размер: что есть, что кончилось, чего нет в каталоге. */
export function matrixGrid(gaps: MatrixGaps): MatrixCellState[][] {
  const key = (color: string, size: string) => `${color}\u0000${size}`;
  const missing = new Set(gaps.missing.map((cell) => key(cell.color, cell.size)));
  const empty = new Set(gaps.empty.map((cell) => key(cell.color, cell.size)));
  return gaps.colors.map((color) =>
    gaps.sizes.map((size) => {
      const k = key(color, size);
      if (missing.has(k)) return "missing";
      if (empty.has(k)) return "empty";
      return "ok";
    }),
  );
}
