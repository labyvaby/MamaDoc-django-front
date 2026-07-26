import { useActiveScope } from "./useActiveScope";

/**
 * organizationId для API-запросов орг-скоупных модулей (tasks, achievements...).
 *
 * Тонкая обёртка вокруг useActiveScope().organizationId для обратной совместимости.
 */
export function useApiOrgId(): number | undefined {
  return useActiveScope().organizationId;
}

export default useApiOrgId;
