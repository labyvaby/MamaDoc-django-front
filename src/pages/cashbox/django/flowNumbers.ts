import type { CashboxSummary, CashlessMethodBreakdownRow } from "../../../api/cashbox";
import { tt } from "../../../i18n/t";
import type { FlowBreakdownRow, FlowSubRow } from "./FlowBreakdown";

/**
 * Сводка кассы → строки разбивки карточек. Отдельно от компонентов, потому что
 * вся неочевидная арифметика живёт здесь: возвраты сидят внутри оплат, приход
 * считается нетто, а разрез по способам приходит от бэка и может не прийти.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlowNumbers = {
  /** Приход за окно; нетто, поэтому теоретически бывает отрицательным. */
  inflow: number;
  /** Расход за окно (положительное число). Возвраты сюда НЕ входят. */
  outflow: number;
  breakdown: FlowBreakdownRow[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const NO_METHOD_LABEL = "Без способа";
export const NO_METHOD_HINT = "Безнал до появления справочника или проведённый мимо него";
export const SALES_NO_METHOD_HINT =
  "В продаже указывают нал или карту, но не конкретный терминал — поэтому в разрезе по способам её нет";
const REFUNDS_LABEL = "Возвраты";

// ── Helpers ───────────────────────────────────────────────────────────────────

const num = (s: string | null | undefined): number => {
  const n = parseFloat(s ?? "0");
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Одно из направлений разреза способа: приход, возвраты, расходы, закупки,
 * продажи товаров. `salesIncome` приходит только после доработки бэка — пока
 * его нет, подстроки продаж пусты и строка показывается с подписью.
 */
type MethodField = "income" | "refunds" | "expenses" | "supplyExpenses" | "salesIncome";

/**
 * Подгруппы строки операции — тот же тип операции в разрезе по способам.
 * Счётчик операций в подстроки не выносим: `count` разреза считает все
 * операции способа сразу (оплаты + возвраты + расходы + закупки), и рядом с
 * суммой одного направления он бы врал.
 */
function methodSubRows(
  rows: CashlessMethodBreakdownRow[] | undefined,
  field: MethodField,
): FlowSubRow[] {
  return (rows ?? [])
    .map((r) => ({
      key: `${field}-${r.cashlessMethodId ?? "none"}`,
      label: r.cashlessMethodName ?? NO_METHOD_LABEL,
      amount: num(r[field]),
      muted: r.cashlessMethodId == null,
      hint: r.cashlessMethodId == null ? NO_METHOD_HINT : undefined,
    }))
    .filter((row) => row.amount !== 0)
    // «Без способа» — всегда последним: это остаток, а не способ, и наверху
    // списка он читался бы как главный терминал клиники.
    .sort((a, b) => Number(a.muted) - Number(b.muted) || b.amount - a.amount);
}

/** Строка оплат: нетто и знак. Возвратов за окно бывает больше, чем оплат. */
function paymentsRow(payments: number, refunds: number, children: FlowSubRow[]): FlowBreakdownRow {
  const net = payments - refunds;
  return {
    key: "payment",
    label: tt("cashbox:paymentsBreakdown"),
    amount: Math.abs(net),
    direction: net < 0 ? -1 : 1,
    children,
  };
}

// ── Безнал ────────────────────────────────────────────────────────────────────

/**
 * Разбивка безналичного потока по типам операций.
 *
 * Возвраты живут внутри оплат: возвращают всегда конкретный платёж, и отдельной
 * строкой расхода они читались бы как самостоятельные деньги. Поэтому строка
 * оплат — нетто, а возврат виден в её разрезе; итог карточки от этого не
 * меняется, но «Приход» в шапке секции сходится с суммой строк под ним.
 */
export function cardFlowNumbers(s: CashboxSummary | undefined): FlowNumbers {
  const payments = num(s?.cardIncome);
  const sales = num(s?.salesCardIncome);
  const refunds = num(s?.cardRefunds);
  const expenses = num(s?.cardExpenses);
  const supplies = num(s?.supplyCardExpenses);
  const methods = s?.byCashlessMethod;
  // Пусто, пока бэк не отдаёт `salesIncome`: тогда вместо разреза — подпись,
  // почему его нет (см. SALES_NO_METHOD_HINT).
  const saleSubRows = methodSubRows(methods, "salesIncome");

  return {
    inflow: payments - refunds + sales,
    outflow: expenses + supplies,
    breakdown: [
      paymentsRow(payments, refunds, [
        ...methodSubRows(methods, "income"),
        ...(refunds !== 0
          ? [{ key: "payment-refunds", label: REFUNDS_LABEL, amount: refunds, direction: -1 as const }]
          : []),
      ]),
      {
        key: "sale",
        label: "Продажи товаров",
        amount: sales,
        direction: 1,
        children: saleSubRows,
        // Пока склад не хранит способ (только суммы нал/карта), объясняем
        // отсутствие разреза — иначе продажи выглядят как потерянные деньги.
        hint: sales > 0 && saleSubRows.length === 0 ? SALES_NO_METHOD_HINT : undefined,
      },
      {
        key: "expense",
        label: "Расходы",
        amount: expenses,
        direction: -1,
        children: methodSubRows(methods, "expenses"),
      },
      {
        key: "supply",
        label: "Закупки товара",
        amount: supplies,
        direction: -1,
        children: methodSubRows(methods, "supplyExpenses"),
      },
    ],
  };
}

// ── Наличные ──────────────────────────────────────────────────────────────────

/** Наличный остаток по учёту: всё с начала записей до сегодня. */
export function cashNet(s: CashboxSummary): number {
  return (
    num(s.cashIncome) +
    num(s.salesCashIncome) -
    num(s.cashRefunds) -
    num(s.cashExpenses) -
    num(s.supplyCashExpenses)
  );
}

/**
 * Наличный поток за окно — те же строки, что у безнала, но по cash-полям.
 * Способов у наличных нет, поэтому разрез оплат состоит из двух подстрок:
 * сколько приняли и сколько из этого вернули.
 */
export function cashFlowNumbers(s: CashboxSummary | undefined): FlowNumbers {
  const payments = num(s?.cashIncome);
  const sales = num(s?.salesCashIncome);
  const refunds = num(s?.cashRefunds);
  const expenses = num(s?.cashExpenses);
  const supplies = num(s?.supplyCashExpenses);

  return {
    inflow: payments - refunds + sales,
    outflow: expenses + supplies,
    breakdown: [
      paymentsRow(
        payments,
        refunds,
        refunds !== 0
          ? [
              { key: "payment-gross", label: "Оплачено", amount: payments, direction: 1 },
              { key: "payment-refunds", label: REFUNDS_LABEL, amount: refunds, direction: -1 },
            ]
          : [],
      ),
      { key: "sale", label: "Продажи товаров", amount: sales, direction: 1 },
      { key: "expense", label: "Расходы", amount: expenses, direction: -1 },
      { key: "supply", label: "Закупки товара", amount: supplies, direction: -1 },
    ],
  };
}
