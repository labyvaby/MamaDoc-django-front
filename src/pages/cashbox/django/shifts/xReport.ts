/**
 * X-отчёт — срез кассовой смены, снятый не закрывая её.
 *
 * От «Итогов смены» отличается не данными (ручка одна — `shifts/<id>/summary/`),
 * а подачей: кассиру нужна матрица «операция × способ оплаты», по которой он
 * сверяет ящик, а не список пар «подпись — сумма». Поэтому здесь только
 * раскладка, без запросов и без MUI: то же самое печатается на бумагу.
 */
import type { CashboxShiftSummary } from "../../../../api/cashboxShifts";
import type { CashlessMethodBreakdownRow } from "../../../../api/cashbox";

/** Безнал по способам — подстроки операции. */
export interface XReportMethodRow {
  key: string;
  name: string;
  amount: number;
  /** Операции без способа: до появления справочника или мимо него. */
  muted?: boolean;
}

export interface XReportRow {
  key: string;
  label: string;
  /** Суммы со знаком: приход положительный, расход отрицательный. */
  cash: number;
  cashless: number;
  balance: number;
  total: number;
  /** Сколько операций; null у строк, которые операциями не являются. */
  count: number | null;
  methods: XReportMethodRow[];
}

export interface XReport {
  opening: number;
  rows: XReportRow[];
  /** Движение за смену — сумма операций, без остатка на начало. */
  movement: XReportRow;
  /** Сколько наличных должно быть в ящике по версии бэка. */
  expectedCash: number;
  /** Столько же по нашему расчёту: остаток на начало + движение наличных. */
  computedCash: number;
  /**
   * Расхождение расчёта с бэком. В норме 0; ненулевое значит, что в
   * `expectedCash` учтено что-то, чего нет в разложенных строках (например
   * внесения и изъятия — своих полей у них в сводке нет), поэтому число
   * показываем, а не прячем.
   */
  mismatch: number;
}

const NO_METHOD_LABEL = "Без способа";

export function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Копейки съедают сравнение сумм, поэтому округляем до них же. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Суммы в разрезе приходят строками-decimal, как и везде в кассе. */
type MethodPick = (row: CashlessMethodBreakdownRow) => string | number;

function methodRows(
  breakdown: CashlessMethodBreakdownRow[] | undefined,
  pick: MethodPick,
  sign: 1 | -1,
): XReportMethodRow[] {
  return (breakdown ?? [])
    .map((row) => ({
      key: String(row.cashlessMethodId ?? "none"),
      name: row.cashlessMethodName ?? NO_METHOD_LABEL,
      amount: round2(sign * num(pick(row))),
      muted: row.cashlessMethodId == null,
    }))
    .filter((row) => row.amount !== 0);
}

function row(
  key: string,
  label: string,
  cash: number,
  cashless: number,
  balance: number,
  count: number | null,
  methods: XReportMethodRow[] = [],
): XReportRow {
  return {
    key,
    label,
    cash: round2(cash),
    cashless: round2(cashless),
    balance: round2(balance),
    total: round2(cash + cashless + balance),
    count,
    methods,
  };
}

/**
 * Строки отчёта из сводки смены.
 *
 * Знак задаёт смысл: всё, что уносит деньги из кассы (возвраты, закупки,
 * расходы), приходит из API положительным числом и здесь становится
 * отрицательным — иначе колонку «Всего» нельзя просто сложить.
 */
export function buildXReport(summary: CashboxShiftSummary): XReport {
  const b = summary.byCashlessMethod;

  const rows: XReportRow[] = [
    row(
      "payments",
      "Оплаты услуг",
      num(summary.cashIncome),
      num(summary.cardIncome),
      num(summary.balancePayments),
      summary.paymentCount,
      methodRows(b, (r) => r.income, 1),
    ),
    row(
      "refunds",
      "Возвраты",
      -num(summary.cashRefunds),
      -num(summary.cardRefunds),
      -num(summary.balanceRefunds),
      summary.refundCount,
      methodRows(b, (r) => r.refunds, -1),
    ),
    row(
      "sales",
      "Продажи товаров",
      num(summary.salesCash),
      num(summary.salesCard),
      0,
      summary.saleCount,
      // Способ у продаж появился позже самих продаж: пока бэк его не отдаёт,
      // строка остаётся без разреза (см. salesIncome в разрезе кассы).
      methodRows(b, (r) => r.salesIncome ?? 0, 1),
    ),
    row(
      "supplies",
      "Закупки",
      -num(summary.supplyCash),
      -num(summary.supplyCard),
      0,
      summary.supplyCount,
      methodRows(b, (r) => r.supplyExpenses, -1),
    ),
    row(
      "expenses",
      "Расходы",
      -num(summary.cashExpenses),
      -num(summary.cardExpenses),
      0,
      summary.expenseCount,
      methodRows(b, (r) => r.expenses, -1),
    ),
  ];

  const sum = (pick: (r: XReportRow) => number) => round2(rows.reduce((acc, r) => acc + pick(r), 0));
  const movement = row(
    "movement",
    "Движение за смену",
    sum((r) => r.cash),
    sum((r) => r.cashless),
    sum((r) => r.balance),
    rows.reduce((acc, r) => acc + (r.count ?? 0), 0),
  );

  const opening = round2(num(summary.shift.openingCash));
  const computedCash = round2(opening + movement.cash);
  const expectedCash = round2(num(summary.expectedCash));

  return {
    opening,
    rows,
    movement,
    expectedCash,
    computedCash,
    mismatch: round2(expectedCash - computedCash),
  };
}

/** Строки с нулями по всем колонкам — их прячем, чтобы отчёт читался. */
export function isEmptyRow(r: XReportRow): boolean {
  return r.cash === 0 && r.cashless === 0 && r.balance === 0;
}

export function formatAmount(value: number): string {
  const sign = value < 0 ? "− " : "";
  return `${sign}${Math.abs(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** «—» вместо нуля: пустая клетка в матрице читается быстрее нуля. */
export function formatCell(value: number): string {
  return value === 0 ? "—" : formatAmount(value);
}
