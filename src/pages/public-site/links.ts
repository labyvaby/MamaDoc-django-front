import { BOOKING_ORG_SLUG } from "../../api/publicBooking";
import { BOOKING_PUBLIC_ORIGIN } from "../public-booking/format";
import { LANDING_PREVIEW_PARAM } from "./landingConfig";

/**
 * Публичный адрес лендинга — тот, что дают клиентам и вставляют в рекламу.
 *
 * Организация стоит в пути (`/site/klinika-21`), а не в query: ссылку
 * `/site?org=klinika-21` неудобно диктовать и печатать на визитке. Для
 * организации по умолчанию slug опускаем — короткий `/site` работает так же.
 *
 * Origin берётся из `BOOKING_PUBLIC_ORIGIN`: с локальной машины и с тестового
 * стенда `window.location.origin` дал бы адрес, который клиенту не открыть
 * (см. комментарий в `../public-booking/format.ts`).
 */
export function landingUrl(
  orgSlug: string | null | undefined,
  options: { preview?: boolean } = {},
): string {
  const slug = orgSlug?.trim();
  const path = !slug || slug === BOOKING_ORG_SLUG ? "/site" : `/site/${encodeURIComponent(slug)}`;
  const query = options.preview ? `?${LANDING_PREVIEW_PARAM}=1` : "";
  return `${BOOKING_PUBLIC_ORIGIN}${path}${query}`;
}
