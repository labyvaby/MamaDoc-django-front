import { useQuery } from "@tanstack/react-query";
import { getAllDjangoEmployees, type DjangoEmployeeListItem } from "../api/staff";
import { useApiOrgId } from "./useApiOrgId";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../api/queryKeys";

const EMPTY: DjangoEmployeeListItem[] = [];

export interface AllActiveEmployeesResult {
  employees: DjangoEmployeeListItem[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Только врачи (`clinicalRole`, профессиональный тип, не RBAC-роль). В пикерах
 * «чьё окно ждём» регистраторам, уборщицам и бухгалтерам делать нечего;
 * медсёстры тоже не показываются — очередь ведётся к врачу.
 *
 * Если клиническая роль не проставлена никому (карточки сотрудников заполнены
 * по умолчанию `other`), возвращаем список как есть: пустой селект хуже
 * лишних строк — выбрать было бы вообще некого.
 */
export function doctorEmployeesOnly(
  employees: DjangoEmployeeListItem[],
): DjangoEmployeeListItem[] {
  const doctors = employees.filter((e) => e.clinicalRole === "doctor");
  return doctors.length > 0 ? doctors : employees;
}

/**
 * Полный список активных сотрудников организации — все страницы за один раз.
 *
 * Пикеры сотрудников раньше искали по серверу с `pageSize: 20` и со строкой
 * ввода в ключе запроса: список молча обрезался на 20 первых по алфавиту, а в
 * сеть уходил запрос на каждую набранную букву. Здесь справочник тянется
 * целиком (getAllDjangoEmployees идёт по всем страницам) и живёт в
 * кэше 10 минут, поэтому фильтрация ввода становится локальной и мгновенной.
 *
 * Филиальный скоуп остаётся за бэком: при выбранном активном филиале
 * /staff/employees/ сам режет выдачу по нему, и сотрудники других филиалов без
 * branch access не вернутся ни при каком `pageSize` — это не лечится на фронте.
 */
export function useAllActiveEmployees(enabled: boolean = true): AllActiveEmployeesResult {
  const orgId = useApiOrgId();
  const query = useQuery({
    queryKey: djangoQueryKeys.staff.activeEmployees(orgId),
    queryFn: ({ signal }) =>
      getAllDjangoEmployees({ status: "active", organizationId: orgId }, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  return {
    employees: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export default useAllActiveEmployees;
