import { useEffect } from 'react';
import { supabase } from '../utility/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '../hooks/usePermissions';

interface WorkShift {
    id: string;
    employee_id: string;
    clock_in: string;
    clock_out: string | null;
}

const fetchWorkShift = async (employeeId: string | null): Promise<{ activeShift: WorkShift | null; employeeId: string | null }> => {
    if (!employeeId) {
        return { activeShift: null, employeeId: null };
    }

    // 3. Check for active shift
    const { data: activeShift, error: shiftError } = await supabase
        .from('WorkShifts')
        .select('*')
        .eq('employee_id', employeeId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (shiftError) {
        console.error('[useWorkShift] Error fetching shift:', shiftError);
    }

    return { activeShift: activeShift as WorkShift | null, employeeId };
};  

export const useWorkShift = () => {
    const queryClient = useQueryClient();
    const { employeeId: globalEmployeeId } = usePermissions();

    const { data, isLoading } = useQuery({
        queryKey: ['workShift', 'current', globalEmployeeId],
        queryFn: () => fetchWorkShift(globalEmployeeId ?? null),
        enabled: !!globalEmployeeId,
        // Don't refetch too aggressively, relies on realtime
        staleTime: 5 * 60 * 1000, 
    });

    useEffect(() => {
        // Subscribe to work shifts changes to invalidate cache
        const channel = supabase
            .channel('work-shifts-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'WorkShifts',
                },
                () => {
                    // Invalidate query to refetch data
                    queryClient.invalidateQueries({ queryKey: ['workShift'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return {
        activeShift: data?.activeShift ?? null,
        hasActiveShift: !!data?.activeShift,
        loading: isLoading,
        employeeId: data?.employeeId ?? null
    };
};
