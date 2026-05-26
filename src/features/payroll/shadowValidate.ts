import { supabase } from '../../utility/supabaseClient';
import type { SalarySnapshot } from './types';

// Structural type — matches EmployeeSalaryData without importing the page-level interface
export interface LiveRow {
  id: string;
  full_name: string;
  total_salary: number;
  day_hours: number;
  night_hours: number;
  appointments_count: number;
  expenses_sum: number;
  hours_sum: number;
  percent_sum: number;
}

interface Diff {
  employee_id: string;
  full_name: string;
  field: string;
  live: number;
  snapshot: number;
  delta: number;
}

// Runs silently in the background. Never throws — shadow validation must never
// affect the live UI. All output goes to console.group so it's easy to find.
export async function shadowValidate(
  liveData: LiveRow[],
  month: string,   // 'YYYY-MM'
): Promise<void> {
  try {
    const monthStart = `${month}-01`;

    // 1. Find the period for this month
    const { data: period, error: periodErr } = await supabase
      .from('salary_periods')
      .select('id, status')
      .eq('month', monthStart)
      .maybeSingle();

    if (periodErr || !period) {
      // No period yet — nothing to compare against
      console.debug('[shadow] No salary period found for', month, '— skipping validation');
      return;
    }

    if (period.status !== 'locked') {
      console.debug('[shadow] Period', month, 'is draft — skipping snapshot comparison');
      return;
    }

    // 2. Fetch active snapshots for this period
    const { data: snapshots, error: snapErr } = await supabase
      .from('salary_snapshots')
      .select('employee_id, total_salary, total_hours, total_appointments, total_expenses, hours_pay, percent_pay, revision, snapshot_version')
      .eq('period_id', period.id)
      .eq('is_active', true);

    if (snapErr || !snapshots?.length) {
      console.warn('[shadow] Could not fetch snapshots for period', period.id, snapErr);
      return;
    }

    const snapMap = new Map<string, typeof snapshots[0]>(
      (snapshots as SalarySnapshot[]).map(s => [s.employee_id, s as any])
    );

    const diffs: Diff[] = [];
    const EPSILON = 0.01;  // rounding tolerance in KGS

    for (const row of liveData) {
      const snap = snapMap.get(row.id);
      if (!snap) {
        console.warn(`[shadow] Employee ${row.full_name} (${row.id}) has no snapshot for ${month}`);
        continue;
      }

      const checks: Array<{ label: string; live: number; snapshot: number }> = [
        { label: 'К выплате',     live: row.total_salary,       snapshot: Number(snap.total_salary) },
        { label: 'Часы',          live: row.day_hours + row.night_hours, snapshot: Number(snap.total_hours) },
        { label: 'Приёмы',        live: row.appointments_count, snapshot: Number(snap.total_appointments) },
        { label: 'Расходы',       live: row.expenses_sum,       snapshot: Number(snap.total_expenses) },
        { label: 'Оплата за часы',live: row.hours_sum,          snapshot: Number(snap.hours_pay) },
        { label: 'Проценты',      live: row.percent_sum,        snapshot: Number(snap.percent_pay) },
      ];

      for (const c of checks) {
        const delta = Math.abs(c.live - c.snapshot);
        if (delta > EPSILON) {
          diffs.push({
            employee_id: row.id,
            full_name:   row.full_name,
            field:       c.label,
            live:        c.live,
            snapshot:    c.snapshot,
            delta,
          });
        }
      }
    }

    // 3. Report results
    if (diffs.length === 0) {
      console.log(`%c[shadow] ✅ ${month}: live calc matches snapshot (${liveData.length} employees)`, 'color: green');
      return;
    }

    console.group(`%c[shadow] ⚠️ ${month}: ${diffs.length} divergence(s) found`, 'color: orange; font-weight: bold');
    console.table(diffs.map(d => ({
      Сотрудник: d.full_name,
      Поле:      d.field,
      Live:      d.live,
      Snapshot:  d.snapshot,
      Δ:         `${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)}`,
    })));
    console.warn(
      '[shadow] Divergences mean the locked snapshot and live recalculation differ. ' +
      'Possible causes: salary_rules changed after lock, timezone drift, expense re-categorization.'
    );
    console.groupEnd();

  } catch (err) {
    // Never propagate — shadow mode must be invisible to the user
    console.error('[shadow] Unexpected error during validation:', err);
  }
}
