import { isSingleBranchOrg } from "../../../utility/organization";

/**
 * Филиал для запроса зарплатного отчёта. В организации с одним филиалом
 * отчёт всегда по всей организации: сессия стоит в филиале, а заморозка,
 * пересчёт и снимки живут только в org-wide отчёте. Иначе — срез по
 * выбранному в сайдбаре филиалу, как на остальных страницах.
 */
export const salaryReportBranchId = (
  activeBranchId: number | null | undefined,
  org: { activeBranchCount?: number } | null | undefined,
): number | undefined => (isSingleBranchOrg(org) ? undefined : activeBranchId ?? undefined);

/**
 * Филиал для премии. В отличие от отчёта премия начисляется в конкретном
 * филиале и не имеет org-wide режима, поэтому, в отличие от
 * salaryReportBranchId, она следует за активным филиалом сессии даже в
 * организации с одним филиалом (там branchFilterId для отчёта — undefined).
 */
export const bonusBranchId = (
  activeBranchId: number | null | undefined,
): number | undefined => activeBranchId ?? undefined;
