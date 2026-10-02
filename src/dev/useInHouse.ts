/**
 * Сколько людей и номеров занято в ночь даты — по правилу hotelInHouse, а не
 * по сводке сервера (та считает проживающими и тех, кто не заехал). Один
 * запрос броней «живут на дату»; ключ под ["hotel","reservations"], поэтому
 * заселение, выезд и «Незаезд» обновляют цифру сами.
 */
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { fetchAllReservations } from "./hotelReportData";
import { inHouseCounts, type InHouseCounts } from "./hotelInHouse";

export function useInHouse(propertyId: number | undefined, date: string, enabled = true) {
  return useQuery<InHouseCounts>({
    queryKey: ["hotel", "reservations", "inHouseCounts", propertyId, date],
    enabled: enabled && propertyId != null,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { rows } = await fetchAllReservations({ propertyId: propertyId!, inHouseOn: date }, signal, 5);
      return inHouseCounts(rows, date, dayjs().format("YYYY-MM-DD"));
    },
  });
}
