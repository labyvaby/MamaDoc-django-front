import { useState, useEffect } from 'react';
import { supabase } from '../../../utility/supabaseClient';
import type { SalarySnapshot } from '../types';

// Fetches all active snapshots for a locked period.
// Only call this when period.status === 'locked'.
export function usePayrollSnapshots(periodId: string | null) {
  const [snapshots, setSnapshots] = useState<SalarySnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!periodId) {
      setSnapshots([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from('salary_snapshots')
      .select('*')
      .eq('period_id', periodId)
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setSnapshots((data ?? []) as SalarySnapshot[]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [periodId]);

  return { snapshots, loading };
}
