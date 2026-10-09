import dayjs from "dayjs";

import type { PosDebtTerms, PosTender } from "../../api/pos";
import { defaultCashlessId, parseAmountCents, type CashlessOption, type SplitKind } from "./splitPayment";

/**
 * Вкладка «В долг» окна оплаты: часть чека покупатель вносит сейчас (наличными,
 * картой или по QR), остальное становится его долгом со сроком возврата
 * (docs/client-debts-contract.md). Здесь только арифметика и проверки — без
 * React, чтобы правила покрывались тестами.
 */

/** Что кассир заполнил на вкладке «В долг». */
export type DebtDraft = {
  /** Сколько покупатель вносит сейчас; пусто — ничего. */
  paidNow: string;
  paidMethod: SplitKind;
  cashlessMethodId: number | null;
  /** Последний день возврата, YYYY-MM-DD; пусто — без срока. */
  dueDate: string;
  comment: string;
};

/** Быстрые сроки возврата, дней. */
export const DUE_QUICK_DAYS = [7, 14, 30] as const;
/** Срок по умолчанию: две недели — обычное «отдам с зарплаты». */
export const DEFAULT_DUE_DAYS = 14;

export const emptyDebtDraft = (kinds: readonly SplitKind[], terminals: readonly CashlessOption[]): DebtDraft => ({
  paidNow: "",
  paidMethod: kinds[0] ?? "cash",
  cashlessMethodId: defaultCashlessId(terminals),
  dueDate: dayjs().add(DEFAULT_DUE_DAYS, "day").format("YYYY-MM-DD"),
  comment: "",
});

export type DebtState = {
  /** Внесено сейчас, тыйыны. */
  paidNow: number;
  /** Уходит в долг, тыйыны. */
  debt: number;
  ready: boolean;
  problem: string | null;
};

/**
 * Проверка вкладки: внесённое — не больше суммы и не вся сумма (тогда это
 * обычная оплата), у карты и QR выбран терминал, срок не в прошлом.
 */
export const debtState = (
  due: number,
  draft: DebtDraft,
  { needTerminal = false }: { needTerminal?: boolean } = {},
): DebtState => {
  const paidNow = parseAmountCents(draft.paidNow);
  const fail = (problem: string): DebtState => ({ paidNow: Number.isFinite(paidNow) ? paidNow : 0, debt: 0, ready: false, problem });
  if (!Number.isFinite(paidNow)) return fail("Проверьте сумму «Вносит сейчас»");
  if (paidNow >= due) return fail("Вся сумма внесена — это обычная оплата, не долг");
  if (needTerminal && paidNow > 0 && draft.paidMethod !== "cash" && draft.cashlessMethodId === null)
    return fail("Выберите терминал для внесённой части");
  if (draft.dueDate && dayjs(draft.dueDate).isBefore(dayjs().startOf("day"))) return fail("Срок возврата не может быть в прошлом");
  return { paidNow, debt: due - paidNow, ready: true, problem: null };
};

/** Оплаты и условия долга для checkout: деньги сейчас (если есть) + строка «в долг». */
export const debtPayments = (due: number, draft: DebtDraft): { payments: PosTender[]; terms: PosDebtTerms } => {
  const state = debtState(due, draft);
  const payments: PosTender[] = [];
  if (state.paidNow > 0) {
    payments.push({
      method: draft.paidMethod,
      amount: (state.paidNow / 100).toFixed(2),
      ...(draft.paidMethod !== "cash" && draft.cashlessMethodId !== null ? { cashlessMethodId: draft.cashlessMethodId } : {}),
    });
  }
  payments.push({ method: "debt", amount: (state.debt / 100).toFixed(2) });
  return { payments, terms: { debtDueDate: draft.dueDate || null, debtComment: draft.comment.trim() } };
};
