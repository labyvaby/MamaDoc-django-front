import type { SalaryRules, CalculationResult } from '../employees/utils';
import type { SnapshotPayload } from './types';

// Explicit serializer: snapshot payload is a persistence contract, not a UI DTO.
// Decoupled from EmployeeSalaryData so that UI model changes don't silently
// corrupt historical snapshots.
export function serializeSnapshotPayload(
  rulesUsed: SalaryRules,
  result: CalculationResult,
  warnings: string[] = [],
): SnapshotPayload {
  return {
    rules_used: {
      fixed_salary: rulesUsed.fixed_salary
        ? {
            enabled:            rulesUsed.fixed_salary.enabled            ?? false,
            day_hourly_rate:    rulesUsed.fixed_salary.day_hourly_rate    ?? 0,
            night_hourly_rate:  rulesUsed.fixed_salary.night_hourly_rate  ?? 0,
            appointment_rate:   rulesUsed.fixed_salary.appointment_rate   ?? 0,
          }
        : undefined,
      dynamic_rules: (rulesUsed.dynamic_rules ?? []).map(r => ({
        services:     r.services,
        percent:      r.percent,
        fixed_amount: r.fixed_amount,
      })),
    },
    breakdown: {
      dayHours:               result.dayHours,
      nightHours:             result.nightHours,
      hoursSum:               result.hoursSum,
      dayHoursSum:            result.dayHoursSum,
      nightHoursSum:          result.nightHoursSum,
      distributedAppointments: result.distributedAppointments,
      createdByCount:         result.createdByCount,
      appointmentsCount:      result.appointmentsCount,
      percentSum:             result.percentSum,
      totalCount:             result.totalCount,
      waitingCount:           result.waitingCount,
      cancelledCount:         result.cancelledCount,
      discountedCount:        result.discountedCount,
      discountSum:            result.discountSum,
      paidCount:              result.paidCount,
      paidSum:                result.paidSum,
      expensesSum:            result.expensesSum,
      totalSalary:            result.totalSalary,
      hasWarning:             result.hasWarning ?? false,
    },
    warnings,
  };
}
