import { supabase } from '../../utility/supabaseClient';
import type { CalcModel, SnapshotInput } from './types';

// Calls lock_payroll_period() RPC — atomic transaction.
// Caller identity is resolved from auth.uid() inside the RPC, never passed from client.
// Raises if period is already locked — use recalculateLockedPeriod() in that case.
export async function lockPeriod(params: {
  month: string;           // 'YYYY-MM-01'
  calcModel: CalcModel;
  notes: string;
  snapshots: SnapshotInput[];
  snapshotVersion?: number;
}): Promise<string> {      // returns period id
  const { month, calcModel, notes, snapshots, snapshotVersion = 1 } = params;

  const { data, error } = await supabase.rpc('lock_payroll_period', {
    p_month:            month,
    p_calc_model:       calcModel,
    p_notes:            notes,
    p_snapshots:        snapshots,
    p_snapshot_version: snapshotVersion,
  });

  if (error) throw error;
  return data as string;
}

// Recalculates snapshots for an already-locked period.
// Reason is mandatory — shows in audit trail.
export async function recalculateLockedPeriod(params: {
  periodId: string;
  reason: string;
  snapshots: SnapshotInput[];
  snapshotVersion?: number;
}): Promise<void> {
  const { periodId, reason, snapshots, snapshotVersion = 1 } = params;

  const { error } = await supabase.rpc('recalculate_locked_period', {
    p_period_id:        periodId,
    p_reason:           reason,
    p_snapshots:        snapshots,
    p_snapshot_version: snapshotVersion,
  });

  if (error) throw error;
}
