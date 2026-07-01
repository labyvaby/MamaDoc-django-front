import type { SalaryRules, CalculationResult } from '../employees/utils';

export type PeriodStatus = 'draft' | 'locked';

// Mirror of Postgres ENUM payroll_calc_model.
// To add a new model: ALTER TYPE payroll_calc_model ADD VALUE '...' in SQL,
// then add the literal here.
export type CalcModel =
  | 'legacy_v1'
  | 'registrator_v2'
  | 'no_night_hours';

// Increment when calculateEmployeeSalary logic changes in a way that produces
// different numbers for the same input. Allows stale snapshot detection.
export const CURRENT_SNAPSHOT_VERSION = 1;

// ---------------------------------------------------------------------------
// Month-level settings — applied on top of every employee's base rules.
// Stored in salary_periods.settings jsonb.
// ---------------------------------------------------------------------------

export interface PayrollMonthSettings {
  disable_night_hours?: boolean;
  merge_night_into_day?: boolean;
  disable_dynamic_rules?: boolean;
  distribution_model?: 'monthly_hours' | 'daily_hours';
  month_bonus_multiplier?: number;
  role_rate_overrides?: {
    [roleName: string]: {
      day_hourly_rate?: number;
      night_hourly_rate?: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Salary Period
// ---------------------------------------------------------------------------

export interface SalaryPeriod {
  id: string;
  month: string;          // always 'YYYY-MM-01'
  status: PeriodStatus;
  calc_model: CalcModel;
  settings: PayrollMonthSettings;
  locked_at?: string;
  locked_by?: string;
  notes?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Snapshot payload — this is the persistence contract.
// Its shape must remain stable across app versions.
// rules_used is critical: stores rules as they were at lock time.
// ---------------------------------------------------------------------------

export interface SnapshotPayload {
  rules_used: SalaryRules;
  breakdown: CalculationResult;
  warnings: string[];
}

export interface SalarySnapshot {
  id: string;
  period_id: string;
  employee_id: string;
  revision: number;
  is_active: boolean;
  snapshot_version: number;
  total_salary: number;
  total_hours: number;
  total_appointments: number;
  total_expenses: number;
  hours_pay: number;
  percent_pay: number;
  payload: SnapshotPayload;
  calculated_at: string;
  recalculated_by?: string;
  recalculation_reason?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Employee Salary Override
// ---------------------------------------------------------------------------

export interface SalaryOverride {
  id: string;
  employee_id: string;
  valid_from: string;    // 'YYYY-MM-01', inclusive
  valid_until?: string;  // 'YYYY-MM-01', exclusive (half-open). Null = no expiry.
  overrides: SalaryOverridePayload;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface SalaryOverridePayload {
  fixed_salary?: Partial<NonNullable<SalaryRules['fixed_salary']>>;
  // If present, replaces dynamic_rules entirely (not merged)
  dynamic_rules?: NonNullable<SalaryRules['dynamic_rules']>;
  flags?: {
    disable_night_hours?: boolean;
    disable_dynamic_rules?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Calculation context — passed to every strategy.
// Adding new fields here never breaks existing strategy signatures.
// ---------------------------------------------------------------------------

export interface PayrollCalculationContext {
  employee: {
    id: string;
    role_name: string;
  };
  rules: SalaryRules;          // already resolved (base + override)
  shifts: unknown[];
  appointments: unknown[];
  expenses: unknown[];
  distributedCountOverride?: number;
  month: string;               // 'YYYY-MM-01'
}

// ---------------------------------------------------------------------------
// Input shape for lock_payroll_period() RPC
// ---------------------------------------------------------------------------

export interface SnapshotInput {
  employee_id: string;
  total_salary: number;
  total_hours: number;
  total_appointments: number;
  total_expenses: number;
  hours_pay: number;
  percent_pay: number;
  payload: SnapshotPayload;
  calculated_at: string;
}
