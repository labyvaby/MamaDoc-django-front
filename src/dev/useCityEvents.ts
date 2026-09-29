/**
 * События города для «Календаря событий». Пока бэк не отдаёт
 * /v2/hotel/city-events/, данные — демо (cityEventsMock.ts). Когда эндпоинт
 * появится, достаточно переключить CITY_EVENTS_FROM_API — страница, ключи
 * кэша и формы остаются теми же.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCityEvent, listCityEvents, type HotelCityEventCreateData } from "../api/hotel";
import { mockCreateCityEvent, mockListCityEvents } from "./cityEventsMock";

/** false — демо-данные; true — настоящий API бэка. */
export const CITY_EVENTS_FROM_API = false;

export function useCityEvents(propertyId: number | undefined, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["hotel", "cityEvents", CITY_EVENTS_FROM_API ? propertyId : "demo", dateFrom, dateTo],
    queryFn: ({ signal }) =>
      CITY_EVENTS_FROM_API
        ? listCityEvents({ propertyId: propertyId!, dateFrom, dateTo }, signal)
        : mockListCityEvents(dateFrom, dateTo),
    enabled: !CITY_EVENTS_FROM_API || propertyId != null,
    staleTime: 5 * 60_000,
  });
}

export function useCreateCityEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HotelCityEventCreateData) => (CITY_EVENTS_FROM_API ? createCityEvent(data) : mockCreateCityEvent(data)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["hotel", "cityEvents"] }),
  });
}
