import type { SalaryRules } from '../employees/utils';
import type { SalaryOverride } from './types';

// Returns the effective SalaryRules for an employee in a given month.
// The DB EXCLUDE constraint guarantees at most ONE override per employee per month,
// so there's no sorting or precedence logic needed here.
export function resolveEffectiveRules(
  baseRules: SalaryRules,
  // Pass the single active override for this employee+month, or null if none.
  // Query: SELECT * FROM employee_salary_overrides
  //        WHERE employee_id = $1
  //          AND valid_from <= $month AND (valid_until IS NULL OR valid_until > $month)
  override: SalaryOverride | null,
): SalaryRules {
  if (!override) return baseRules;

  const result: SalaryRules = structuredClone(baseRules);
  const { fixed_salary, dynamic_rules, flags } = override.overrides;

  if (fixed_salary) {
    result.fixed_salary = { ...result.fixed_salary, ...fixed_salary };
  }

  // dynamic_rules replaces entirely when present (no partial merge)
  if (dynamic_rules !== undefined) {
    result.dynamic_rules = dynamic_rules;
  }

  if (flags?.disable_night_hours) {
    result.fixed_salary = { ...result.fixed_salary, night_hourly_rate: 0 };
  }

  if (flags?.disable_dynamic_rules) {
    result.dynamic_rules = [];
  }

  return result;
}
