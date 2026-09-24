import type { RegistryRow } from "../../api/registry";

export type RowAction =
  | "pay"
  | "renew"
  | "markExamined"
  | "unmarkExamined"
  | "book"
  | "call"
  | "changeDoctor"
  | "cancel"
  | "openBook";

/** Действия строки реестра: снятым и тем, кто только смотрит, — только книжка. */
export function actionsForRow(row: RegistryRow, canManage: boolean): RowAction[] {
  if (!canManage || row.status === "cancelled") return ["openBook"];
  const actions: RowAction[] = [];
  if (row.paymentState !== "paid") actions.push("pay");
  actions.push("renew");
  actions.push(row.onboardingCompletedAt ? "unmarkExamined" : "markExamined");
  actions.push("book", "call", "changeDoctor", "cancel", "openBook");
  return actions;
}
