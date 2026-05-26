import { useState, useEffect } from 'react';
import { supabase } from '../../../utility/supabaseClient';
import type { SalaryPeriod } from '../types';

// Returns the salary period for the given month (YYYY-MM-01), or null if not yet created.
export function useSalaryPeriod(month: string | null) {
  const [period, setPeriod] = useState<SalaryPeriod | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!month) return;

    let cancelled = false;
    setLoading(true);

    supabase
      .from('salary_periods')
      .select('*')
      .eq('month', month)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setPeriod(data as SalaryPeriod | null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [month]);

  return { period, loading };
}
