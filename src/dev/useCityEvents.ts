/**
 * События города для «Календаря событий». Сначала — настоящий API бэка
 * (/v2/hotel/city-events/, контракт в docs/hotel-city-events-api.md). Пока
 * эндпоинта нет (404), показываем демо-данные (cityEventsMock.ts) с пометкой
 * isDemo: как только бэк выкатит эндпоинт, придут настоящие события — без
 * отдельного релиза фронта. Любая другая ошибка — честная ошибка, не демо.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCityEvent, listCityEvents, type HotelCityEvent, type HotelCityEventCreateData } from "../api/hotel";
import { ApiError } from "../api/client";
import { mockCreateCityEvent, mockListCityEvents } from "./cityEventsMock";

export interface CityEventsResult {
  events: HotelCityEvent[];
  /** true — бэк ещё не отдаёт события, показаны демо-данные. */
  isDemo: boolean;
}

/** Последний ответ списка: демо или API — туда же идёт и добавление события. */
let demoMode = false;

const isEndpointMissing = (err: unknown) => err instanceof ApiError && (err.status === 404 || err.status === 405);

export function useCityEvents(propertyId: number | undefined, dateFrom: string, dateTo: string) {
  return useQuery<CityEventsResult>({
    queryKey: ["hotel", "cityEvents", propertyId, dateFrom, dateTo],
    queryFn: async ({ signal }) => {
      try {
        const events = await listCityEvents({ propertyId: propertyId!, dateFrom, dateTo }, signal);
        demoMode = false;
        return { events, isDemo: false };
      } catch (err) {
        if (!isEndpointMissing(err)) throw err;
        demoMode = true;
        return { events: await mockListCityEvents(dateFrom, dateTo), isDemo: true };
      }
    },
    enabled: propertyId != null,
    staleTime: 5 * 60_000,
    // Нет эндпоинта — не повторяем, сразу демо.
    retry: (count, err) => !isEndpointMissing(err) && count < 1,
  });
}

export function useCreateCityEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HotelCityEventCreateData) => (demoMode ? mockCreateCityEvent(data) : createCityEvent(data)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["hotel", "cityEvents"] }),
  });
}
