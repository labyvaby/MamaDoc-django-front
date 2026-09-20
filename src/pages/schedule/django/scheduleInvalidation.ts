/**
 * Что сбрасывать в кэше после действий на странице расписания.
 *
 * Раньше любая правка исключения делала
 * `invalidateQueries(["django", "scheduling"])`, а под этим префиксом лежат
 * и `conflicts` — приёмы сотрудника в дни отсутствия. `useAbsenceConflicts`
 * держит по запросу на каждого сотрудника с отсутствиями, и каждый клик по
 * дню в календаре перезапрашивал их все (14–35 запросов по 0.2–1.3 с, см.
 * разбор 2026-09-19). Отметка выходного приёмы не меняет: какие дни считать
 * отсутствием, хук вычисляет сам из списка исключений, а диапазон нового
 * запроса даст новый ключ и подтянется сам. Conflicts меняются только вместе
 * с приёмами — их сбрасываем точечно, по сотруднику, из дровера разбора.
 */
import type { QueryKey } from "@tanstack/react-query";

const CONFLICTS_ROOT = ["django", "scheduling", "conflicts"] as const;

/** Правила, исключения, свободные окна — всё расписание, кроме conflicts. */
export function isScheduleQueryExceptConflicts(queryKey: QueryKey): boolean {
  return (
    queryKey[0] === "django" &&
    queryKey[1] === "scheduling" &&
    queryKey[2] !== CONFLICTS_ROOT[2]
  );
}

/** Conflicts одного сотрудника — после отмены/переноса его приёмов. */
export function isConflictsQueryOfEmployee(employeeId: number): (queryKey: QueryKey) => boolean {
  return (queryKey) => {
    if (
      queryKey[0] !== CONFLICTS_ROOT[0] ||
      queryKey[1] !== CONFLICTS_ROOT[1] ||
      queryKey[2] !== CONFLICTS_ROOT[2]
    ) {
      return false;
    }
    const params = queryKey[3];
    return (
      typeof params === "object" &&
      params !== null &&
      (params as { employeeId?: unknown }).employeeId === employeeId
    );
  };
}

/**
 * Conflicts нескольких сотрудников разом: исходный отсутствующий и коллеги,
 * которым передали его приёмы (у них тоже может быть отсутствие в этом окне).
 */
export function isConflictsQueryOfEmployees(
  employeeIds: Iterable<number>,
): (queryKey: QueryKey) => boolean {
  const predicates = Array.from(new Set(employeeIds), isConflictsQueryOfEmployee);
  return (queryKey) => predicates.some((matches) => matches(queryKey));
}
