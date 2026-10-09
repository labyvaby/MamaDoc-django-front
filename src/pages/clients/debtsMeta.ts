import type { ClientDebt, ClientDebtPayment } from "../../api/clients";
import type { ToneName } from "../../components/ui";

/** Подписи и ключи карточки долгов — без React, чтобы делить с вкладками страницы. */

export const DEBT_METHOD_LABELS: Record<string, string> = { cash: "Наличные", card: "Карта", cashless: "QR" };

export const debtsQueryKey = (organizationId: number | null, clientId: number | null) =>
  ["client-debts", organizationId, clientId] as const;

/** Сколько открытых долгов — бейдж на вкладке «Долги». */
export const openDebtsCount = (debts: ClientDebt[] | undefined) => debts?.filter((debt) => debt.status === "open").length ?? 0;

export const debtStatusMeta = (debt: ClientDebt): { label: string; tone: ToneName } => {
  if (debt.status === "paid") return { label: "Погашен", tone: "success" };
  if (debt.status === "canceled") return { label: "Списан", tone: null };
  if (debt.overdue) return { label: "Просрочен", tone: "error" };
  return { label: "Открыт", tone: "warning" };
};

/** «Карта · POS Бакай», «Возврат товара», «Списание». */
export const paymentRowLabel = (row: ClientDebtPayment) => {
  if (row.kind === "return") return "Возврат товара";
  if (row.kind === "write_off") return "Списание";
  const method = DEBT_METHOD_LABELS[row.method] ?? row.method;
  return row.cashlessMethodName ? `${method} · ${row.cashlessMethodName}` : method;
};
