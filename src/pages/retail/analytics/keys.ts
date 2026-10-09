/** Ключи react-query «Аналитики магазина»: организация в ключе — кэш не путает арендаторов. */
export const retailKeys = {
  all: ["retail-analytics"] as const,
  collections: (organizationId: number | undefined) => ["retail-analytics", organizationId, "collections"] as const,
  pnl: (organizationId: number | undefined, dateFrom: string | undefined, dateTo: string | undefined) =>
    ["retail-analytics", organizationId, "pnl", dateFrom ?? null, dateTo ?? null] as const,
  receipts: (organizationId: number | undefined) => ["retail-analytics", organizationId, "receipts"] as const,
  sellThrough: (organizationId: number | undefined, filters: Record<string, unknown>) =>
    ["retail-analytics", organizationId, "sell-through", filters] as const,
  sizeGrid: (organizationId: number | undefined, filters: Record<string, unknown>) =>
    ["retail-analytics", organizationId, "size-grid", filters] as const,
  matrix: (organizationId: number | undefined, modelId: number | null) =>
    ["retail-analytics", organizationId, "matrix", modelId] as const,
};
