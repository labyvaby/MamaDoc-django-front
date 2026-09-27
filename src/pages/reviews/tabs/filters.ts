import type { ReviewStatsFilters } from "../../../api/reviews";

/** Период, филиал и (для суперадмина) организация — общие для всех вкладок. */
export type ReviewPeriod = ReviewStatsFilters;

export interface TabProps {
  period: ReviewPeriod;
  /** Филиалов больше одного — показывать колонку «Филиал». */
  multiBranch: boolean;
}

export function periodKey(period: ReviewPeriod): Record<string, unknown> {
  return {
    from: period.from,
    to: period.to,
    branchId: period.branchId ?? null,
    orgId: period.organizationId ?? null,
  };
}
