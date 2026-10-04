/**
 * Активные сотрудники организации для пикеров отеля: исполнитель уборки,
 * проверяющий номер, получатель расхода в отчёте смены.
 *
 * organizationId обязателен: суперпользователю `/staff/employees/` без него
 * отвечает 400 «необходимо указать organizationId» — список молча оставался
 * пустым, и назначить было некого.
 */
import { useQuery } from "@tanstack/react-query";

import { getAllDjangoEmployees } from "../api/staff";
import { usePermissions } from "../hooks/usePermissions";

export function useHotelEmployees(enabled = true) {
  const { activeOrganization } = usePermissions();
  const orgId = activeOrganization?.id ?? null;
  return useQuery({
    queryKey: ["staff", "employees", "all", "active", orgId],
    queryFn: ({ signal }) => getAllDjangoEmployees({ status: "active", organizationId: orgId! }, signal),
    // Без staff.view запрос вернёт ошибку и пикер останется пустым — это допустимо,
    // поэтому повторов нет, а isError вызывающие намеренно не проверяют.
    enabled: enabled && orgId != null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
