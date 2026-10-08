import type { PosQuote } from "../../api/pos";
import { formatPosAmount } from "./format";

/**
 * Что показывает карточка «Акции» в панели оплаты. Кнопка не должна молча
 * ничего не делать: нет акций — она неактивна и так и подписана; акции
 * есть, но к чеку ни одна не подошла — после нажатия об этом сказано;
 * применилась — видно, какая и на сколько.
 */
export type PromotionCardView = {
  hint: string;
  /** `warning` — включено, но скидки нет; `applied` — скидка есть. */
  tone: "dim" | "warning" | "applied";
  applied: boolean;
  /** Подпись кнопки вместо «Применить»; null — обычная. */
  buttonLabel: string | null;
  disabled: boolean;
};

const plural = (count: number, one: string, few: string, many: string) => {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
};

/** «2 активные акции». */
export const activePromotionsLabel = (count: number) =>
  `${count} ${plural(count, "активная акция", "активные акции", "активных акций")}`;

/** ««Осень −10%» −500 с, «Пятница» −100 с». */
export const appliedPromotionsLabel = (quote: PosQuote | undefined): string => {
  const parts = (quote?.appliedPromotions ?? [])
    .filter((item) => Number(item.amount) > 0)
    .map((item) => `«${item.name}» −${formatPosAmount(Number(item.amount))} с`);
  if (parts.length) return parts.join(", ");
  return `Скидка по акции −${formatPosAmount(Number(quote?.discount ?? 0))} с`;
};

export const promotionCardView = ({
  count,
  enabled,
  quote,
  busy,
  frozen,
  manualDiscount,
  clientDiscount,
}: {
  /** `activePromotionsCount` бутстрапа; undefined — старый бэкенд, число неизвестно. */
  count: number | undefined;
  /** Кассир нажал «Применить» (`promotions` в quote). */
  enabled: boolean;
  quote: PosQuote | undefined;
  busy: boolean;
  frozen: boolean;
  /** Ручная скидка на чек или позицию: сервер с ней акции не считает. */
  manualDiscount: boolean;
  /** Включена скидка уровня клиента: акция берётся, только если она больше. */
  clientDiscount: boolean;
}): PromotionCardView => {
  if (count === 0)
    return {
      hint: enabled ? "Активных акций больше нет" : "Нет активных акций",
      tone: "dim",
      applied: false,
      buttonLabel: enabled ? "Отменить" : null,
      // Включённое без акций всё ещё можно снять — иначе флаг застрянет в чеке.
      disabled: frozen || !enabled,
    };
  const idle = count ? `${activePromotionsLabel(count)} — скидка сама подберётся к чеку` : "автоматические скидки по акциям";
  if (!enabled) return { hint: idle, tone: "dim", applied: false, buttonLabel: null, disabled: frozen };
  if (busy || !quote) return { hint: "Проверяем подходящие акции…", tone: "dim", applied: false, buttonLabel: "Отменить", disabled: frozen };
  if (quote.promotionApplied)
    return { hint: appliedPromotionsLabel(quote), tone: "applied", applied: true, buttonLabel: null, disabled: frozen };
  const hint = manualDiscount
    ? "Акции не сочетаются с ручной скидкой — уберите её, чтобы применить акцию"
    : clientDiscount
      ? "Ни одна акция не даёт скидку больше скидки клиента"
      : "Ни одна акция не подходит к этому чеку";
  return { hint, tone: "warning", applied: false, buttonLabel: "Отменить", disabled: frozen };
};
