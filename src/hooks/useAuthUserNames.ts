import { useQuery } from "@tanstack/react-query";
import { getDjangoEmployees } from "../api/staff";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../api/queryKeys";

const EMPTY: Record<number, string> = {};

/**
 * Справочник «auth-user id → ФИО сотрудника».
 *
 * Приёмы приходят с бэка только с `createdById`/`updatedById` (id auth-user'а,
 * без имени); имя достаём по `authUserId` из списка сотрудников. Если у
 * пользователя нет доступа к /staff/employees/ (403), молча возвращаем пустой
 * справочник — подписи просто останутся без имён.
 */
export function useAuthUserNames(enabled: boolean = true): Record<number, string> {
  const q = useQuery({
    queryKey: djangoQueryKeys.staff.userNames,
    queryFn: async ({ signal }) => {
      const map: Record<number, string> = {};
      let page: number | null = 1;
      while (page != null) {
        const res = await getDjangoEmployees({ page, pageSize: 200 }, signal);
        for (const emp of res.results) {
          if (emp.authUserId != null) map[emp.authUserId] = emp.fullName;
        }
        page = res.nextPage;
      }
      return map;
    },
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });
  return q.data ?? EMPTY;
}
