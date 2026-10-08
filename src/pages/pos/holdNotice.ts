import type { PosSavedReceipt } from "../../api/pos";

/** Подтверждение «Чек отложен» после кнопки «Отложить». */
export type HeldNotice = {
  key: number;
  /** «Чек №3f2a8b1c отложен» — номер, по которому чек найдут в списке. */
  title: string;
  /** Комментарий кассира — по нему отложенный чек узнают. */
  comment: string;
};

/**
 * Отложенный чек не оплачен — окна «Оплата прошла» для него нет. Кассир
 * видит, что чек ушёл в отложенные, под каким номером и с каким комментарием.
 */
export const heldNoticeFor = (receipt: PosSavedReceipt | null, comment: string): HeldNotice => {
  const number = receipt?.number ? receipt.number.slice(0, 8) : "";
  return {
    key: Date.now(),
    title: number ? `Чек №${number} отложен` : "Чек отложен",
    comment: comment.trim(),
  };
};
