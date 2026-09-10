import { useParams, useSearchParams } from "react-router";

/**
 * Организация клиентского ЛК (`/lk/*`).
 *
 * Кабинет живёт на домене CRM, а CRM обслуживает несколько организаций, и
 * ручки входа скоупятся по slug в самом пути (`/api/client-portal/<slug>/...`).
 * Дефолтной организации у биллинга нет — в отличие от витрины записи, где есть
 * `VITE_BOOKING_ORG_SLUG`: клиент «Клиники 21», попавший в чужой пул, увидел бы
 * чужие деньги, поэтому лучше честно показать «ссылка без организации».
 *
 * Два адреса, как у лендинга: `/lk/<slug>` для ссылок наружу (его рассылают
 * клиентам) и `/lk?org=<slug>` для совместимости с остальной витриной.
 */

/** Имя query-параметра организации. */
export const PORTAL_ORG_PARAM = "org";

/**
 * Организация по умолчанию. Пусто, если env не задан — тогда без slug в адресе
 * кабинет не открыть, и это нормально.
 */
export const PORTAL_ORG_SLUG: string = import.meta.env.VITE_PORTAL_ORG_SLUG || "";

/** Slug из адреса: путь приоритетнее query, дальше — env. Пусто — не задан. */
export function usePortalOrgSlug(): string {
  const [searchParams] = useSearchParams();
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  return orgSlug?.trim() || searchParams.get(PORTAL_ORG_PARAM)?.trim() || PORTAL_ORG_SLUG;
}
