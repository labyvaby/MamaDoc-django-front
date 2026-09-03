/** Общие типы и палитра фильтров журнала реестров. */
import type { Theme } from "@mui/material/styles";

import type { PaymentStatus } from "../../../../api/payments";
import { getStatusAccent } from "../../../../config/appointmentStatuses";
import type { AppointmentMoneyFlag } from "../listFilters";

/** Фильтр по статусу оплаты: плитки сводки и чипы над лентой. */
export type PaymentFilter = "all" | PaymentStatus;

/** Режим просмотра одного и того же среза. */
export type RegistryViewMode = "feed" | "table" | "insights";

/**
 * Раскладка ленты: по дням (общая) либо по пациентам и курсам — вторая нужна
 * процедурам, где пять капельниц одного пациента иначе рассыпаны по пяти дням.
 */
export type FeedGrouping = "days" | "courses";

/** Порядок чипов оплаты: от закрытых чеков к проблемным. */
export const PAYMENT_FILTERS: PaymentFilter[] = ["all", "paid", "partial", "unpaid", "refunded"];

/**
 * Ключ кликабельной плитки сводки: статус оплаты либо флаг оси цены.
 *
 * «Со скидкой» ушло из оси оплаты во флаг `discount`: статус `discounted` бэк
 * ставит только при закрытии чека, и плитка не показывала скидку, за которую
 * ещё не заплатили (см. MONEY_FLAG_OPTIONS в listFilters).
 */
export type RegistryTileKey = PaymentFilter | AppointmentMoneyFlag;

export const isMoneyFlagKey = (key: RegistryTileKey): key is AppointmentMoneyFlag =>
  key === "discount" || key === "price_up" || key === "price_down";

/**
 * Цвет статуса оплаты.
 *
 * Берём его через код статуса приёма (`getStatusAccent`), а не своей таблицей
 * тонов — иначе фильтр «Со скидкой» и чип в строке под ним расходятся в цвете,
 * на чём уже ловился прежний реестр. «Не оплачено» и «Возврат» своего кода не
 * имеют и остаются нейтральными: красить треть журнала красным не за что —
 * приём просто ещё не оплачен.
 */
export function paymentAccent(value: RegistryTileKey, theme: Theme): string | null {
  switch (value) {
    case "paid":
      return getStatusAccent("paid", theme).main;
    case "discount":
      return getStatusAccent("discounted", theme).main;
    case "partial":
      return getStatusAccent("debt", theme).main;
    default:
      return null;
  }
}
