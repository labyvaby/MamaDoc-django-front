import { useQuery } from "@tanstack/react-query";

import { estateAccessKeys, getMyEstateAccess, type EstateAccess } from "../api/estateAccess";
import { useRealtyScope } from "./useRealtyScope";

/** Матрица ролей застройщика (`roles-matrix/me`); `undefined` — ещё не пришла или ручка недоступна. */
export function useEstateAccess(enabled = true): EstateAccess | undefined {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: estateAccessKeys.me(scope),
    queryFn: ({ signal }) => getMyEstateAccess(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  }).data;
}

/**
 * Видимость пунктов меню застройщика по матрице ролей бэка (`canSee`).
 * Пока матрица не пришла или ручка недоступна — `null`: меню решает по
 * правам и модулям, как раньше, чтобы сбой матрицы не прятал всё меню.
 *
 * Экран, которого в матрице нет вовсе, матрица не прячет — решают права.
 * «Документы CRM» бэк добавил в `canSee` 09.10.2026 (`documents`), запасной
 * `?? true` оставлен для будущих экранов.
 */
export function useEstateNav(enabled = true): ((screen: string) => boolean) | null {
  const access = useEstateAccess(enabled);
  if (!access) return null;
  return (screen) => access.canSee[screen] ?? true;
}
