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
export const CERTIFICATES_LABEL = "Продажа сертификатов";
export const DEBT_REPAYMENTS_LABEL = "Погашение долгов";
export const DEBT_REPAYMENTS_HINT =
  "Деньги, которые покупатели возвращают за товар, взятый в долг. Входят в остаток кассы, но не в выручку: выручкой был чек в день продажи.";
export const CERTIFICATES_HINT =
  "Не входит в остаток кассы и в выручку: деньги за подарочные карты откладывают отдельно. Выручка появится, когда сертификатом оплатят товар. Возвраты — при аннулировании карты.";

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

/**
 * Строка «Продажа сертификатов» — нетто: продано минус возвращено при
 * аннулировании. Деньги за карту двигают кассу, но выручкой не являются,
 * поэтому строка отдельная и с пояснением. Без движений строки нет вовсе:
 * у клиники без сертификатов не должно появиться «0 с» лишней строкой.
 */
function certificateRow(income: number, refunds: number, children: FlowSubRow[]): FlowBreakdownRow[] {
  if (income === 0 && refunds === 0) return [];
  const net = income - refunds;
  return [
    {
      key: "certificate",
      label: CERTIFICATES_LABEL,
      amount: Math.abs(net),
      direction: net < 0 ? -1 : 1,
      hint: CERTIFICATES_HINT,
      aside: true,
      children,
    },
  ];
}

/**
 * Строка «Погашение долгов»: деньги за товар, проданный в долг раньше. В
 * остаток кассы входят (бэк считает их в `netCashFlow` и `expectedCash`),
 * в выручку — нет. Без движений строки нет вовсе.
 */
function debtRepaymentRow(income: number, children: FlowSubRow[]): FlowBreakdownRow[] {
  if (income === 0) return [];
  return [
    {
      key: "debt",
      label: DEBT_REPAYMENTS_LABEL,
      amount: income,
      direction: 1,
      hint: DEBT_REPAYMENTS_HINT,
      children,
    },
  ];
}

/** Погашения долгов по терминалам — только безнал. */
function debtMethodSubRows(rows: CashlessMethodBreakdownRow[] | undefined): FlowSubRow[] {
  return (rows ?? [])
    .filter((r) => num(r.debtIncome) !== 0)
    .map((r) => ({
      key: `debt-${r.cashlessMethodId ?? "none"}`,
      label: r.cashlessMethodName ?? NO_METHOD_LABEL,
      amount: num(r.debtIncome),
      muted: r.cashlessMethodId == null,
      hint: r.cashlessMethodId == null ? NO_METHOD_HINT : undefined,
    }))
    .sort((a, b) => Number(a.muted) - Number(b.muted) || b.amount - a.amount);
}

/** Подстроки сертификатов: «Продано» и «Возвращено» — только если возвраты были. */
function certificateGrossSubRows(income: number, refunds: number): FlowSubRow[] {
  if (refunds === 0) return [];
  return [
    { key: "certificate-gross", label: "Продано", amount: income, direction: 1 },
    { key: "certificate-refunds", label: "Возвращено при аннулировании", amount: refunds, direction: -1 },
  ];
}

/** Сертификаты по способам безнала — нетто, как оплаты (`cardPaymentSubRows`). */
function certificateMethodSubRows(rows: CashlessMethodBreakdownRow[] | undefined): FlowSubRow[] {
  return (rows ?? [])
    .filter((r) => num(r.certificateIncome) !== 0 || num(r.certificateRefunds) !== 0)
    .map((r) => {
      const income = num(r.certificateIncome);
      const refunded = num(r.certificateRefunds);
      const net = income - refunded;
      const noMethod = r.cashlessMethodId == null;
      return {
        net,
        row: {
          key: `certificate-${r.cashlessMethodId ?? "none"}`,
          label: r.cashlessMethodName ?? NO_METHOD_LABEL,
          amount: Math.abs(net),
          direction: net < 0 ? -1 : 1,
          muted: noMethod,
          hint: noMethod ? NO_METHOD_HINT : undefined,
          note: refunded !== 0 ? `продано ${plain(income)} · возврат −${plain(refunded)}` : undefined,
        } satisfies FlowSubRow,
      };
    })
    .sort((a, b) => Number(a.row.muted) - Number(b.row.muted) || b.net - a.net)
    .map(({ row }): FlowSubRow => row);
}

// ── Безнал ────────────────────────────────────────────────────────────────────

/** «1 001» — сумма для пояснения под строкой, без валюты: она уже в колонке. */
const plain = (n: number): string => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/**
 * Разрез оплат безнала по способам — нетто: сумма способа уже за вычетом его
 * возвратов, а под ней пояснение «оплачено 1 001 · возврат −300». Возврат
 * стоит рядом со своим терминалом, столбец складывается в строку оплат, а
 * цифра сходится с выпиской банка по терминалу.
 *
 * Возвраты, которые разрез не покрыл (бэк не отдал `byCashlessMethod` или
 * суммы разошлись), идут общей строкой «Возвраты» — иначе итог не сойдётся.
 */
function cardPaymentSubRows(
  rows: CashlessMethodBreakdownRow[] | undefined,
  refunds: number,
): FlowSubRow[] {
  const byMethod = (rows ?? [])
    .filter((r) => num(r.income) !== 0 || num(r.refunds) !== 0)
    .map((r) => {
      const income = num(r.income);
      const refunded = num(r.refunds);
      const net = income - refunded;
      const noMethod = r.cashlessMethodId == null;
      return {
        net,
        row: {
          key: `income-${r.cashlessMethodId ?? "none"}`,
          label: r.cashlessMethodName ?? NO_METHOD_LABEL,
          amount: Math.abs(net),
          direction: net < 0 ? -1 : 1,
          muted: noMethod,
          hint: noMethod ? NO_METHOD_HINT : undefined,
          note:
            refunded !== 0
              ? `оплачено ${plain(income)} · возврат −${plain(refunded)}`
              : undefined,
        } satisfies FlowSubRow,
      };
    })
    // «Без способа» — всегда последним: это остаток, а не способ.
    .sort((a, b) => Number(a.row.muted) - Number(b.row.muted) || b.net - a.net)
    .map(({ row }): FlowSubRow => row);

  const covered = (rows ?? []).reduce((acc, r) => acc + num(r.refunds), 0);
  const rest = Math.round((refunds - covered) * 100) / 100;
  if (rest > 0) {
    byMethod.push({ key: "payment-refunds", label: REFUNDS_LABEL, amount: rest, direction: -1 });
  }
  return byMethod;
}

/**
 * Разбивка безналичного потока по типам операций.
 *
 * Возвраты живут внутри оплат: возвращают всегда конкретный платёж, и отдельной
 * строкой расхода они читались бы как самостоятельные деньги. Поэтому строка
 * оплат — нетто, а возврат виден у своего способа (`cardPaymentSubRows`); итог карточки от этого не
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
  // Сертификаты: аванс, не выручка — но безнал за них пришёл на терминал.
  const certificates = num(s?.certificateCardIncome);
  const certificateRefunds = num(s?.certificateCardRefunds);
  const certificateMethods = certificateMethodSubRows(methods);
  // Погашения долгов картой и QR: деньги ящика, выручкой был чек.
  const debts = num(s?.debtRepaymentCardIncome);

  return {
    inflow: payments - refunds + sales + debts,
    outflow: expenses + supplies,
    breakdown: [
      paymentsRow(payments, refunds, cardPaymentSubRows(methods, refunds)),
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
      ...debtRepaymentRow(debts, debtMethodSubRows(methods)),
      ...certificateRow(
        certificates,
        certificateRefunds,
        certificateMethods.length ? certificateMethods : certificateGrossSubRows(certificates, certificateRefunds),
      ),
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

/**
 * Наличный остаток по учёту: всё с начала записей до сегодня. Деньги за
 * подарочные сертификаты в остаток не входят (магазин откладывает их
 * отдельно) — бэк так же не включает их в `netCashFlow` и `expectedCash`.
 */
export function cashNet(s: CashboxSummary): number {
  return (
    num(s.cashIncome) +
    num(s.salesCashIncome) +
    num(s.debtRepaymentCashIncome) -
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
  const certificates = num(s?.certificateCashIncome);
  const certificateRefunds = num(s?.certificateCashRefunds);
  const debts = num(s?.debtRepaymentCashIncome);

  return {
    inflow: payments - refunds + sales + debts,
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
      ...debtRepaymentRow(debts, []),
      ...certificateRow(certificates, certificateRefunds, certificateGrossSubRows(certificates, certificateRefunds)),
      { key: "expense", label: "Расходы", amount: expenses, direction: -1 },
      { key: "supply", label: "Закупки товара", amount: supplies, direction: -1 },
    ],
  };
}
