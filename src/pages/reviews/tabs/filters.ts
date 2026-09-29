import type { ReviewStatsFilters } from "../../../api/reviews";

/** Период и (для суперадмина) организация — общие для всех вкладок. */
export type ReviewPeriod = ReviewStatsFilters;

export interface TabProps {
  period: ReviewPeriod;
}

export function periodKey(period: ReviewPeriod): Record<string, unknown> {
  return {
    from: period.from,
    to: period.to,
    orgId: period.organizationId ?? null,
  };
}
