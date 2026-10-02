/**
 * Заявки с сайта, которые ждут подтверждения: бронь `hold` с source "website"
 * (так её создаёт публичная страница, PublicBooking на бэке) и не истёкшим
 * expiresAt. Номер держится 30 минут — потом заявка сгорает, а гость уверен,
 * что забронировал. Раньше её было видно, только если самому открыть
 * «Ресепшен → Все брони → Удержание».
 *
 * Опрос раз в 45 с, как у онлайн-записи клиники. Ключ один на счётчик в
 * меню, всплывающее уведомление и блок на ресепшене — запрос тоже один.
 * Ключ под ["hotel", "reservations"] — подтверждение или отмена брони его
 * инвалидирует, и заявка пропадает сразу, а не через 45 с.
 */
import { useQuery } from "@tanstack/react-query";

import { listReservations, type HotelReservation } from "../api/hotel";
import { PAGE_PERMISSIONS } from "../config/accessPermissions";
import { useCan } from "../hooks/useCan";
import { useHotelProperty } from "./useHotelProperty";

const POLL_MS = 45_000;

export const isPendingSiteRequest = (r: HotelReservation, now: number = Date.now()): boolean =>
  r.status === "hold" && r.source === "website" && (!r.expiresAt || Date.parse(r.expiresAt) > now);

export function useSiteRequests(enabled = true): { requests: HotelReservation[]; propertyId: number | undefined } {
  const { property } = useHotelProperty();
  const canSee = useCan(PAGE_PERMISSIONS.hotelReception);
  const propertyId = property?.id;
  const query = useQuery({
    queryKey: ["hotel", "reservations", "siteRequests", propertyId],
    queryFn: ({ signal }) => listReservations({ propertyId: propertyId!, status: "hold", source: "website", limit: 50 }, signal),
    enabled: enabled && canSee && propertyId != null,
    refetchInterval: POLL_MS,
    // Ресепшен держит CRM фоновой вкладкой — заявка должна прозвучать и там.
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });
  const now = Date.now();
  return { requests: (query.data?.results ?? []).filter((r) => isPendingSiteRequest(r, now)), propertyId };
}
