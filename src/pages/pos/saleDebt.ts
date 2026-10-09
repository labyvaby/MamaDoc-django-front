import type { PosReceiptDebt, PosSavedReceipt } from "../../api/pos";

/**
 * Чек, проданный в долг: сколько не оплачено, сколько внесли сразу и срок.
 * Сразу после продажи долг приходит в ответе checkout; у чека, открытого из
 * истории, его нет — тогда сумму берём из строки оплаты «в долг», а срок
 * неизвестен (`dueDate: undefined`, смотреть в карточке клиента).
 */
export type SaleDebtSummary = {
  /** Не оплачено, сом. */
  debt: number;
  /** Внесено сразу (наличные, карта, бонусы…), сом. */
  paidNow: number;
  /** Последний день возврата; null — без срока; undefined — неизвестен. */
  dueDate: string | null | undefined;
};

export const saleDebtSummary = (
  receipt: Pick<PosSavedReceipt, "totalAmount" | "payments"> | null,
  debt: PosReceiptDebt | null,
): SaleDebtSummary | null => {
  if (!receipt) return null;
  const fromPayments = receipt.payments
    .filter((payment) => payment.method === "debt")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const amount = debt ? Number(debt.amount) : fromPayments;
  if (!(amount > 0)) return null;
  const total = Number(receipt.totalAmount);
  return {
    debt: Math.round(amount * 100) / 100,
    paidNow: Math.max(0, Math.round((total - amount) * 100) / 100),
    dueDate: debt ? debt.dueDate : undefined,
  };
};
