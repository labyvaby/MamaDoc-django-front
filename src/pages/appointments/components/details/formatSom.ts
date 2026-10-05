import { tt } from "../../../../i18n/t";

/**
 * Сумма так же, как в остальной карточке приёма («1 500 сом»): блок оплаты
 * наверху пишет «сом», и история под ним не должна вдруг перейти на «KGS».
 */
export function formatSom(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  const amount = (Number.isFinite(n) ? n : 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });
  return tt("appointments:details.amountWithCurrency", { amount });
}
