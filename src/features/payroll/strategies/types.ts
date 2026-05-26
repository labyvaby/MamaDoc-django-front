import type { SalaryRules, CalculationResult } from '../../employees/utils';
import type { CalcModel } from '../types';

export interface PayrollCalculationContext {
  employee: { id: string; role_name: string };
  rules: SalaryRules;
  shifts: unknown[];
  appointments: unknown[];
  expenses: unknown[];
  distributedCountOverride?: number;
  month: string;   // 'YYYY-MM-01'
}

export interface CalcStrategy {
  model: CalcModel;
  calculate(ctx: PayrollCalculationContext): CalculationResult;
}
