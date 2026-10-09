import type { ClientDebtPaymentMethod } from "../../api/clients";
import { parseAmountCents } from "../pos/splitPayment";

/**
 * Окно «Принять оплату долга»: сколько покупатель вносит и чем — одним
 * способом или частями (наличные + карта + QR). Здесь только арифметика в
 * тыйынах и проверки; что уйдёт в `repay/` — `parts`.
 */

export type RepayMode = "single" | "split";
export const REPAY_METHODS: readonly ClientDebtPaymentMethod[] = ["cash", "card", "cashless"];
export const REPAY_METHOD_LABELS: Record<ClientDebtPaymentMethod, string> = { cash: "Наличные", card: "Карта", cashless: "QR" };

export type RepayDraft = {
  mode: RepayMode;
  /** Одним способом: сумма и способ. */
  amount: string;
  method: ClientDebtPaymentMethod;
  /** Частями: сумма по каждому способу; пусто — ноль. */
  split: Record<ClientDebtPaymentMethod, string>;
  /** Терминал банка для карты и для QR (у наличных его нет). */
  terminals: Record<"card" | "cashless", number | null>;
  reference: string;
  comment: string;
};

export type RepayPart = { method: ClientDebtPaymentMethod; amount: number; cashlessMethodId: number | null };

export type RepayPlan = {
  parts: RepayPart[];
  /** Вносит сейчас, тыйыны. */
  total: number;
  /** Останется долга после этой оплаты, тыйыны. */
  rest: number;
  ready: boolean;
  problem: string | null;
};

export const emptyRepayDraft = (outstandingCents: number, defaultTerminal: number | null): RepayDraft => ({
  mode: "single",
  amount: centsToText(outstandingCents),
  method: "cash",
  split: { cash: "", card: "", cashless: "" },
  terminals: { card: defaultTerminal, cashless: defaultTerminal },
  reference: "",
  comment: "",
});

/** «4900», «4900.50» — для поля ввода. */
export const centsToText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

const terminalOf = (draft: RepayDraft, method: ClientDebtPaymentMethod) =>
  method === "cash" ? null : draft.terminals[method];

export const repayPlan = (
  outstandingCents: number,
  draft: RepayDraft,
  { needTerminal = false }: { needTerminal?: boolean } = {},
): RepayPlan => {
  const entries: Array<{ method: ClientDebtPaymentMethod; text: string }> =
    draft.mode === "single"
      ? [{ method: draft.method, text: draft.amount }]
      : REPAY_METHODS.map((method) => ({ method, text: draft.split[method] }));
  const fail = (problem: string, total = 0): RepayPlan => ({
    parts: [],
    total,
    rest: Math.max(0, outstandingCents - total),
    ready: false,
    problem,
  });
  const parts: RepayPart[] = [];
  for (const entry of entries) {
    const cents = parseAmountCents(entry.text);
    if (!Number.isFinite(cents)) return fail(`Проверьте сумму «${REPAY_METHOD_LABELS[entry.method]}»`);
    if (cents > 0) parts.push({ method: entry.method, amount: cents, cashlessMethodId: terminalOf(draft, entry.method) });
  }
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (total <= 0) return fail(draft.mode === "single" ? "Введите сумму" : "Внесите сумму хотя бы одним способом");
  if (total > outstandingCents) return fail(`Больше остатка долга на ${centsToText(total - outstandingCents)} с`, total);
  const unbound = parts.find((part) => needTerminal && part.method !== "cash" && part.cashlessMethodId === null);
  if (unbound) return fail(`Выберите терминал для «${REPAY_METHOD_LABELS[unbound.method]}»`, total);
  return { parts, total, rest: outstandingCents - total, ready: true, problem: null };
};

/** Тело `repay/`: одна часть — прежним форматом, несколько — `parts`. */
export const repayBody = (plan: RepayPlan, draft: RepayDraft) => {
  const toPart = (part: RepayPart) => ({
    method: part.method,
    amount: (part.amount / 100).toFixed(2),
    ...(part.method !== "cash" && part.cashlessMethodId !== null ? { cashlessMethodId: part.cashlessMethodId } : {}),
    ...(part.method !== "cash" && draft.reference.trim() ? { reference: draft.reference.trim() } : {}),
  });
  const comment = draft.comment.trim();
  if (plan.parts.length === 1) return { ...toPart(plan.parts[0]), ...(comment ? { comment } : {}) };
  return { parts: plan.parts.map(toPart), ...(comment ? { comment } : {}) };
};

/** «Остаток сюда»: способ забирает то, чего не хватает до остатка долга. */
export const fillRest = (outstandingCents: number, draft: RepayDraft, method: ClientDebtPaymentMethod): RepayDraft => {
  const others = REPAY_METHODS.filter((item) => item !== method).reduce((sum, item) => {
    const cents = parseAmountCents(draft.split[item]);
    return sum + (Number.isFinite(cents) ? cents : 0);
  }, 0);
  const rest = Math.max(0, outstandingCents - others);
  return { ...draft, split: { ...draft.split, [method]: rest ? centsToText(rest) : "" } };
};
