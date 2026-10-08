import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { estateAccessKeys } from "../../api/estateAccess";
import { estateSettingsKeys } from "../../api/estateSettings";
import { useCanChecker } from "../../hooks/useCan";
import { refreshAuthContext } from "../../hooks/usePermissions";

/**
 * Кнопки «Настроек» (гайд frontend-settings §2–5): чтение — `integrations.view`,
 * любое действие — `integrations.manage`, у ролей и пользователей ещё `rbac.*`.
 * Кнопку без права скрываем, не делаем disabled.
 */
export function useSettingsCan() {
  const { can } = useCanChecker();
  const view = can("integrations.view");
  const manage = can("integrations.manage");
  return {
    view,
    manage,
    rolesView: view && can("rbac.roles.view"),
    rolesEdit: manage && can("rbac.roles.update"),
    usersView: view && can("rbac.memberships.view"),
    usersCreate: manage && can("rbac.memberships.create"),
    usersUpdate: manage && can("rbac.memberships.update"),
    // Безопасность (`frontend-new-modules.md` §3): завершить — manage ИЛИ rbac.memberships.update, сбросить 2FA — оба.
    sessionsTerminate: view && (manage || can("rbac.memberships.update")),
    twoFaReset: manage && can("rbac.memberships.update"),
  };
}

/** Перечитать экраны настроек; после правки прав — ещё матрицу меню и `/auth/me/` (могли поменять свою роль). */
export function useRefreshSettings() {
  const queryClient = useQueryClient();
  return React.useCallback(
    (opts: { access?: boolean } = {}) => {
      void queryClient.invalidateQueries({ queryKey: estateSettingsKeys.all });
      if (opts.access) {
        void queryClient.invalidateQueries({ queryKey: estateAccessKeys.me(undefined).slice(0, 2) });
        void refreshAuthContext();
      }
    },
    [queryClient],
  );
}

export const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
