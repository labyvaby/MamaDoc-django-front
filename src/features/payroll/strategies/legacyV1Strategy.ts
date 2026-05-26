import { calculateEmployeeSalary } from '../../employees/utils';
import type { CalcStrategy, PayrollCalculationContext } from './types';

// Wraps the existing calculateEmployeeSalary without any changes to its logic.
// This is intentional: no rewrite, no regression risk.
export const legacyV1Strategy: CalcStrategy = {
  model: 'legacy_v1',
  calculate(ctx: PayrollCalculationContext) {
    return calculateEmployeeSalary(
      ctx.shifts as any[],
      ctx.appointments as any[],
      ctx.rules,
      ctx.employee.id,
      ctx.expenses as any[],
      ctx.distributedCountOverride,
    );
  },
};
