import type { PosTender } from "../../api/pos";
import { formatPosAmount } from "./format";

/**
 * Оплата частями в окне оплаты кассы: строка на каждый способ — наличные,
 * карта (через POS-терминал банка), QR. Здесь только арифметика в тыйынах:
 * сколько внесено, сколько осталось, сколько сдачи и что уйдёт в
 * `payments[]` checkout. Сдача бывает только с наличных — сервер записывает
 * в кассу то, что ему прислали, поэтому наличные шлём уже за вычетом сдачи.
 */

export type SplitKind = "cash" | "card" | "cashless";
export type SplitRow = {
  kind: SplitKind;
  /** Как ввёл кассир: «1200», «1 200,50»; пусто — ноль. */
  amount: string;
  /** Терминал банка из `bootstrap.cashlessMethods`; у наличных всегда null. */
  cashlessMethodId: number | null;
};
export type CashlessOption = { id: number; name: string; isDefault?: boolean };

export const SPLIT_LABELS: Record<SplitKind, string> = { cash: "Наличные", card: "Карта", cashless: "QR" };

/** Сумма из поля ввода в тыйынах: пусто — 0, мусор — NaN. Пробелы-разряды допустимы. */
export const parseAmountCents = (value: string): number => {
  const text = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!text) return 0;
  if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return Number.NaN;
  return Math.round(Number(text) * 100);
};

/** Тыйыны в строку для поля ввода: «1200», «1200.5» → «1200.50». */
export const centsToInput = (value: number): string =>
  value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2);

/** «1 200 с» — для подписей кнопки и подсказок (не JSX). */
export const formatCents = (value: number): string => `${formatPosAmount(value / 100)} с`;

/** Терминал по умолчанию: отмеченный `isDefault`, иначе первый в списке. */
export const defaultCashlessId = (methods: readonly CashlessOption[]): number | null =>
  (methods.find((item) => item.isDefault) ?? methods[0])?.id ?? null;

export type SplitState = {
  /** Внесено всего, включая лишние наличные. */
  entered: number;
  cash: number;
  /** Карта + QR. */
  noncash: number;
  /** Сколько ещё не хватает до суммы к оплате. */
  remaining: number;
  /** Сдача с наличных. */
  change: number;
  /** Всё сходится, можно принимать оплату. */
  ready: boolean;
  /** Почему нельзя принять оплату — текст для кнопки и подсказки. */
  problem: string | null;
  /** Строка, к которой относится проблема (подсветить поле). */
  problemKind: SplitKind | null;
};

export const splitState = (
  due: number,
  rows: readonly SplitRow[],
  { needTerminal = false }: { needTerminal?: boolean } = {}
): SplitState => {
  const amounts = rows.map((row) => parseAmountCents(row.amount));
  const broken = rows.findIndex((_row, index) => !Number.isFinite(amounts[index]));
  const value = (index: number) => (Number.isFinite(amounts[index]) ? amounts[index] : 0);
  const sum = (kinds: SplitKind[]) =>
    rows.reduce((total, row, index) => total + (kinds.includes(row.kind) ? value(index) : 0), 0);
  const cash = sum(["cash"]);
  const noncash = sum(["card", "cashless"]);
  const entered = cash + noncash;
  const remaining = Math.max(0, due - entered);
  // Сдачу даём только с наличных: безнал сверх суммы — ошибка, а не сдача.
  const change = noncash <= due ? Math.max(0, entered - due) : 0;
  const base = { entered, cash, noncash, remaining, change };
  const fail = (problem: string, problemKind: SplitKind | null = null): SplitState => ({
    ...base,
    ready: false,
    problem,
    problemKind,
  });

  if (broken >= 0) return fail(`Проверьте сумму в строке «${SPLIT_LABELS[rows[broken].kind]}»`, rows[broken].kind);
  if (noncash > due)
    return fail(
      `Картой и QR на ${formatCents(noncash - due)} больше суммы — сдача только с наличных`,
      rows.find((row, index) => row.kind !== "cash" && value(index) > 0)?.kind ?? null
    );
  if (remaining > 0) return fail(entered ? `Осталось внести ${formatCents(remaining)}` : `Внесите ${formatCents(due)}`);
  const unbound = rows.find(
    (row, index) => needTerminal && row.kind !== "cash" && value(index) > 0 && row.cashlessMethodId === null
  );
  if (unbound) return fail(`Выберите терминал для строки «${SPLIT_LABELS[unbound.kind]}»`, unbound.kind);
  return { ...base, ready: true, problem: null, problemKind: null };
};

/**
 * Что уйдёт в `payments[]`: по строке на способ с ненулевой суммой.
 * Наличные — за вычетом сдачи: в кассе остаётся только то, что покрыло чек.
 */
export const splitPayments = (due: number, rows: readonly SplitRow[]): PosTender[] => {
  const state = splitState(due, rows);
  let change = state.change;
  const payments: PosTender[] = [];
  for (const row of rows) {
    let cents = parseAmountCents(row.amount);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    if (row.kind === "cash" && change > 0) {
      const kept = Math.min(change, cents);
      cents -= kept;
      change -= kept;
      if (cents <= 0) continue;
    }
    payments.push({
      method: row.kind,
      amount: (cents / 100).toFixed(2),
      ...(row.kind !== "cash" && row.cashlessMethodId !== null ? { cashlessMethodId: row.cashlessMethodId } : {}),
    });
  }
  return payments;
};

/** «Остаток сюда»: строка забирает то, чего не хватает до суммы к оплате. */
export const fillRemainder = (due: number, rows: readonly SplitRow[], kind: SplitKind): SplitRow[] => {
  const { remaining } = splitState(due, rows);
  return rows.map((row) => {
    if (row.kind !== kind || remaining <= 0) return row;
    const current = parseAmountCents(row.amount);
    return { ...row, amount: centsToInput((Number.isFinite(current) ? current : 0) + remaining) };
  });
};

/** «Всё наличными / картой / QR»: вся сумма в одну строку, остальные — пусто. */
export const payAllWith = (due: number, rows: readonly SplitRow[], kind: SplitKind): SplitRow[] =>
  rows.map((row) => ({ ...row, amount: row.kind === kind ? centsToInput(due) : "" }));

/** Пустые строки для доступных способов: терминал по умолчанию уже выбран. */
export const initialSplitRows = (kinds: readonly SplitKind[], methods: readonly CashlessOption[]): SplitRow[] =>
  kinds.map((kind) => ({ kind, amount: "", cashlessMethodId: kind === "cash" ? null : defaultCashlessId(methods) }));
