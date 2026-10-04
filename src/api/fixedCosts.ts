import { apiRequest } from "./client";

/**
 * Постоянный расход (аренда, налоги) для отчёта «Прибыль по врачам».
 * Mirror server/apps/finance/fixed_costs/api/payloads.py. В кассу и раздел
 * «Расходы» не попадает.
 */
export interface FixedCost {
  id: number;
  name: string;
  amount: string;
  /** null — расход всей организации. */
  branchId: number | null;
  branchName: string | null;
  monthFrom: string; // YYYY-MM
  /** YYYY-MM; null — бессрочно. */
  monthTo: string | null;
  createdAt: string;
}

export interface FixedCostInput {
  name: string;
  amount: string;
  branchId: number | null;
  monthFrom: string;
  monthTo: string | null;
}

const BASE = "/v2/finance/fixed-costs/";

/** organizationId нужен только суперадмину — как у остальных отчётов. */
function withOrg(path: string, organizationId?: number, query = new URLSearchParams()): string {
  if (organizationId != null) query.set("organizationId", String(organizationId));
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getFixedCosts(
  params: { month?: string; branchId?: number; organizationId?: number },
  signal?: AbortSignal,
): Promise<FixedCost[]> {
  const q = new URLSearchParams();
  if (params.month) q.set("month", params.month);
  if (params.branchId != null) q.set("branchId", String(params.branchId));
  return apiRequest<FixedCost[]>(withOrg(BASE, params.organizationId, q), { signal });
}

export function createFixedCost(input: FixedCostInput, organizationId?: number): Promise<FixedCost> {
  return apiRequest<FixedCost>(withOrg(BASE, organizationId), { method: "POST", body: input });
}

export function updateFixedCost(
  id: number,
  input: Partial<FixedCostInput>,
  organizationId?: number,
): Promise<FixedCost> {
  return apiRequest<FixedCost>(withOrg(`${BASE}${id}/`, organizationId), {
    method: "PATCH",
    body: input,
  });
}

export function deleteFixedCost(id: number, organizationId?: number): Promise<void> {
  return apiRequest<void>(withOrg(`${BASE}${id}/`, organizationId), { method: "DELETE" });
}

/** Новая сумма с месяца: старая запись закрывается месяцем раньше. */
export function changeFixedCostAmount(
  id: number,
  month: string,
  amount: string,
  organizationId?: number,
): Promise<FixedCost> {
  return apiRequest<FixedCost>(withOrg(`${BASE}${id}/change-amount/`, organizationId), {
    method: "POST",
    body: { month, amount },
  });
}
