import React from "react";
import { useNavigate, useSearchParams } from "react-router";

import { BOOKING_ORG_SLUG } from "../../api/publicBooking";

/**
 * Клиника публичной витрины `/book/*`.
 *
 * Витрина живёт на домене CRM, а CRM обслуживает несколько организаций, поэтому
 * клиника берётся из адреса (`/book?org=klinika-21`), а не из сборки. Раньше её
 * задавала только переменная `VITE_BOOKING_ORG_SLUG`, и регистратура «Клиники
 * 21» по кнопке «Сайт записи» попадала на витрину «Мама Доктора» — с чужими
 * врачами, филиалами и пулом пациентов при входе по SMS.
 *
 * Без параметра остаётся организация по умолчанию из env: ссылки, уже
 * разошедшиеся пациентам «Мама Доктора», продолжают работать как раньше.
 */

/** Имя query-параметра клиники в адресе витрины. */
export const BOOKING_ORG_PARAM = "org";

/** Клиника из адреса; пустое значение — организация по умолчанию. */
export function orgSlugFromSearch(search: string | URLSearchParams): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get(BOOKING_ORG_PARAM)?.trim() || BOOKING_ORG_SLUG;
}

/**
 * Путь внутри витрины с сохранением клиники: без этого первый же переход
 * («врачи», «мои записи», стрелка «назад») терял `?org=` и уводил гостя на
 * витрину организации по умолчанию.
 *
 * Для организации по умолчанию параметр не добавляем — адрес остаётся коротким
 * и совпадает с тем, что уже разослан пациентам.
 */
export function bookPath(path: string, orgSlug: string): string {
  if (!orgSlug || orgSlug === BOOKING_ORG_SLUG) return path;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(BOOKING_ORG_PARAM, orgSlug);
  return `${pathname}?${params.toString()}`;
}

/** Клиника текущей страницы витрины. */
export function useBookingOrgSlug(): string {
  const [searchParams] = useSearchParams();
  return orgSlugFromSearch(searchParams);
}

export interface BookingNav {
  /** Slug клиники, к которой скоупится страница. */
  orgSlug: string;
  /** Ссылка внутри витрины (для href/`to`) с сохранённой клиникой. */
  to: (path: string) => string;
  /** Переход внутри витрины с сохранённой клиникой. */
  go: (path: string) => void;
}

/** Навигация витрины: любые внутренние переходы идут только через неё. */
export function useBookingNav(): BookingNav {
  const orgSlug = useBookingOrgSlug();
  const navigate = useNavigate();

  const to = React.useCallback((path: string) => bookPath(path, orgSlug), [orgSlug]);
  const go = React.useCallback((path: string) => navigate(to(path)), [navigate, to]);

  return React.useMemo(() => ({ orgSlug, to, go }), [orgSlug, to, go]);
}
