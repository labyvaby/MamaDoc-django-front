import type { SalaryRules } from '../employees/utils';
import type { PayrollMonthSettings } from './types';

/**
 * Applies month-level period settings on top of a single employee's base rules.
 * Returns a new SalaryRules object — never mutates the input.
 *
 * Priority (highest to lowest):
 *   1. period settings (disable flags, role_rate_overrides)
 *   2. employee base rules (salary_rules from Employees table)
 *
 * Called once per employee per fetchData run, before calculateEmployeeSalary().
 */
export function resolvePeriodRules(
  baseRules: SalaryRules,
  settings: PayrollMonthSettings,
  roleName: string,
): SalaryRules {
  if (!settings || Object.keys(settings).length === 0) return baseRules;

  const fixed = baseRules.fixed_salary ? { ...baseRules.fixed_salary } : undefined;
  let dynamic_rules = baseRules.dynamic_rules;

  // Apply role_rate_overrides — replaces hourly rates for this role
  const roleOverride = settings.role_rate_overrides?.[roleName];
  if (roleOverride && fixed) {
    if (roleOverride.day_hourly_rate !== undefined)
      fixed.day_hourly_rate = roleOverride.day_hourly_rate;
    if (roleOverride.night_hourly_rate !== undefined)
      fixed.night_hourly_rate = roleOverride.night_hourly_rate;
  }

  // disable_night_hours zeroes out the night rate entirely
  if (settings.disable_night_hours && fixed) {
    fixed.night_hourly_rate = 0;
  }

  // disable_dynamic_rules drops the dynamic_rules array
  if (settings.disable_dynamic_rules) {
    dynamic_rules = [];
  }

  return {
    ...baseRules,
    ...(fixed !== undefined ? { fixed_salary: fixed } : {}),
    dynamic_rules,
  };
}

/**
 * Applies month_bonus_multiplier to a final salary total.
 * Called AFTER calculateEmployeeSalary(), not before.
 */
export function applyMonthBonusMultiplier(
  totalSalary: number,
  settings: PayrollMonthSettings,
): number {
  const m = settings?.month_bonus_multiplier;
  if (!m || m === 1) return totalSalary;
  return totalSalary * m;
}
