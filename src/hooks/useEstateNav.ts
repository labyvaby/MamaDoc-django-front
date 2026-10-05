import { useQuery } from "@tanstack/react-query";

import { estateAccessKeys, getMyEstateAccess } from "../api/estateAccess";
import { useRealtyScope } from "./useRealtyScope";

/**
 * Видимость пунктов меню застройщика по матрице ролей бэка (`canSee`).
 * Пока матрица не пришла или ручка недоступна — `null`: меню решает по
 * правам и модулям, как раньше, чтобы сбой матрицы не прятал всё меню.
 *
 * Экран, которого в матрице нет вовсе, матрица не прячет — решают права.
 * Так было с «Документами CRM»: ключа `documents` в `canSee` нет (test2,
 * 06.10.2026), и пункт пропал из меню у всех ролей, даже у суперадмина.
 */
export function useEstateNav(enabled = true): ((screen: string) => boolean) | null {
  const scope = useRealtyScope();
  const access = useQuery({
    queryKey: estateAccessKeys.me(scope),
    queryFn: ({ signal }) => getMyEstateAccess(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  }).data;
  if (!access) return null;
  return (screen) => access.canSee[screen] ?? true;
}
