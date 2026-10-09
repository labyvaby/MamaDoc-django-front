/**
 * Какие способы оплаты роль может принять на кассе. Каждый способ — своё
 * право (`pos.cash`, `pos.card`, `pos.cashless`); без них окно оплаты молча
 * показывало бы только то, что разрешено (например, одну кнопку «В долг»),
 * и кассир решал бы, что обычная продажа пропала.
 */

export type PosActions = Record<string, boolean | undefined>;

/** Денежные способы: наличные, карта, QR. */
export const MONEY_METHOD_KEYS = ["cash", "card", "cashless"] as const;

/** Роль не может принять деньги ни одним способом. */
export const hasNoMoneyMethods = (actions: PosActions) => MONEY_METHOD_KEYS.every((key) => !actions[key]);

/**
 * Подсказка для окна оплаты, когда денежных способов нет; `null` — хотя бы
 * один есть, подсказка не нужна.
 */
export const moneyAccessNote = (actions: PosActions): { title: string; text: string } | null => {
  if (!hasNoMoneyMethods(actions)) return null;
  const others = [actions.debt ? "в долг" : "", actions.certificate ? "сертификатом" : ""].filter(Boolean);
  return {
    title: "Наличные, карта и QR недоступны вашей роли",
    text:
      (others.length ? `Сейчас можно оформить только ${others.join(" или ")}. ` : "Принять оплату сейчас нечем. ") +
      "Попросите управляющего выдать роли права «Касса магазина: наличная оплата», «оплата картой» и «безналичная оплата» в разделе ролей и доступов.",
  };
};
