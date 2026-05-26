import { useState, useEffect } from "react";
import { supabase } from "../utility/supabaseClient";

/**
 * Returns a Set of active 'YYYY-MM' month keys for appointments (last 3 years).
 * Uses get_active_appointment_months() RPC — aggregation happens in DB,
 * so only a small list of month strings is transferred instead of 50k rows.
 *
 * Parameters `table` and `dateColumn` are kept for backward compat but ignored.
 */
export function useActiveMonths(
    _table: string,
    _dateColumn: string,
    enabled: boolean = true
): Set<string> | null {
    const [activeMonths, setActiveMonths] = useState<Set<string> | null>(null);

    useEffect(() => {
        if (!enabled) {
            setActiveMonths(null);
            return;
        }

        let cancelled = false;

        const fetchMonths = async () => {
            try {
                const { data, error } = await supabase
                    .rpc("get_active_appointment_months");

                if (error || cancelled) return;

                const months = new Set<string>(
                    (data || []).map((row: { month: string }) => row.month)
                );
                setActiveMonths(months);
            } catch (e) {
                console.error('useActiveMonths error:', e);
            }
        };

        fetchMonths();

        return () => { cancelled = true; };
    }, [enabled]);

    return activeMonths;
}
