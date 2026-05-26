import { supabase } from '../../utility/supabaseClient';
import type { PayrollMonthSettings } from './types';

interface JsRow {
  id: string;
  full_name: string;
  role_name: string;
  day_hours: number;
  night_hours: number;
  day_hours_sum: number;
  night_hours_sum: number;
  hours_sum: number;
  appointments_count: number;
  distributed_appointments: number;
  created_by_count: number;
  percent_sum: number;
  expenses_sum: number;
  total_salary: number;
  total_count: number;
}

interface SqlRow {
  employee_id: string;
  full_name: string;
  role_name: string;
  day_hours: number;
  night_hours: number;
  day_hours_sum: number;
  night_hours_sum: number;
  hours_sum: number;
  appointments_count: number;
  distributed_appointments: number;
  created_by_count: number;
  percent_sum: number;
  expenses_sum: number;
  total_salary: number;
  total_count: number;
}

// Fields compared with numeric tolerance
const NUMERIC_FIELDS: (keyof JsRow & keyof SqlRow)[] = [
  'day_hours', 'night_hours',
  'day_hours_sum', 'night_hours_sum', 'hours_sum',
  'appointments_count', 'distributed_appointments', 'created_by_count',
  'percent_sum', 'expenses_sum', 'total_salary',
  'total_count',
];

const TOLERANCE = 0.02; // сомы

const FIELD_TOLERANCE: Partial<Record<keyof JsRow & keyof SqlRow, number>> = {};

function diff(a: number, b: number): number {
  return Math.abs(a - b);
}

/**
 * Runs SQL calculate_payroll_month() in parallel with the already-computed JS results.
 * Never throws, never blocks UI. Check console → filter "[sql-shadow]".
 */
export async function shadowValidateSql(
  jsData: JsRow[],
  month: string,          // 'YYYY-MM-DD'
  settings: PayrollMonthSettings,
): Promise<void> {
  try {
    // Ensure YYYY-MM-DD format — function expects a date, not 'YYYY-MM'
    const monthDate = month.length === 7 ? `${month}-01` : month;

    const { data: sqlRows, error } = await supabase.rpc('calculate_payroll_month', {
      p_month:    monthDate,
      p_settings: settings,
    });

    if (error) {
      console.warn('[sql-shadow] RPC error:', error.message);
      return;
    }

    if (!sqlRows || sqlRows.length === 0) {
      console.warn('[sql-shadow] SQL returned 0 rows');
      return;
    }

    const sqlMap = new Map<string, SqlRow>(
      (sqlRows as SqlRow[]).map(r => [r.employee_id, r])
    );
    const jsMap = new Map<string, JsRow>(
      jsData.map(r => [r.id, r])
    );

    const diffs: object[] = [];
    let matchCount = 0;

    // Check every JS row against SQL
    jsMap.forEach((js, empId) => {
      const sql = sqlMap.get(empId);

      if (!sql) {
        diffs.push({ employee: js.full_name, issue: 'missing in SQL' });
        return;
      }

      const fieldDiffs: Record<string, { js: number; sql: number; delta: number }> = {};

      NUMERIC_FIELDS.forEach(field => {
        const jsVal = Number(js[field] ?? 0);
        const sqlVal = Number((sql as any)[field] ?? 0);
        const delta = diff(jsVal, sqlVal);
        const tol = FIELD_TOLERANCE[field] ?? TOLERANCE;
        if (delta > tol) {
          fieldDiffs[field] = { js: jsVal, sql: sqlVal, delta: Math.round(delta * 100) / 100 };
        }
      });

      if (Object.keys(fieldDiffs).length > 0) {
        diffs.push({ employee: js.full_name, role: js.role_name, diffs: fieldDiffs });
      } else {
        matchCount++;
      }
    });

    // Check SQL rows missing in JS
    sqlMap.forEach((sql, empId) => {
      if (!jsMap.has(empId)) {
        diffs.push({ employee: sql.full_name, issue: 'extra in SQL (not in JS)' });
      }
    });

    const total = jsMap.size;
    const diffCount = diffs.length;

    if (diffCount === 0) {
      console.log(
        `%c[sql-shadow] ✅ ${matchCount}/${total} сотрудников совпадают`,
        'color: green; font-weight: bold'
      );
    } else {
      console.warn(
        `%c[sql-shadow] ⚠️ ${diffCount} расхождений из ${total} сотрудников`,
        'color: orange; font-weight: bold'
      );
      console.table(diffs);
    }

  } catch (e) {
    console.warn('[sql-shadow] unexpected error:', e);
  }
}
