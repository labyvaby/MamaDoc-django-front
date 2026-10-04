import { apiRequest } from "./client";
import { realtyHeaders, type RealtyScope } from "./realestate";

/**
 * Меню застройщика (AIVIO): что показывать в сайдбаре, решает бэк —
 * `GET /api/v2/integrations/roles-matrix/me/`. Права здесь не дублируются:
 * матрица уже учитывает роль, переопределения членства и выключенные модули.
 * Ручке нужно только активное членство, отдельного права нет.
 */
export interface EstateAccess {
  /** Код роли прототипа (`sales`, `cfo`, …); null — своя роль организации. */
  role: string | null;
  /** Экраны, которые роль видит в меню: `inventory`, `billing`, `edo`, … */
  canSee: Record<string, boolean>;
  /** Уровень по экрану: none / view / edit / approve. */
  levels: Record<string, string>;
}

interface RawEstateAccess {
  role: string | null;
  canSee: Record<string, boolean>;
  permissions: Record<string, string>;
}

export async function getMyEstateAccess(scope?: RealtyScope, signal?: AbortSignal): Promise<EstateAccess> {
  const raw = await apiRequest<RawEstateAccess>("/v2/integrations/roles-matrix/me/", { headers: realtyHeaders(scope), signal });
  return { role: raw.role, canSee: raw.canSee ?? {}, levels: raw.permissions ?? {} };
}

export const estateAccessKeys = {
  me: (scope: RealtyScope | undefined) =>
    ["django", "estate-access", scope?.organizationId ?? "session", scope?.branchId ?? "all"] as const,
};
