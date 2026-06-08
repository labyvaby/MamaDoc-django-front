import React from "react";
import { supabase } from "../utility/supabaseClient";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "./usePermissions";
import { useWorkShift } from "./useWorkShift";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { IS_DJANGO_BACKEND } from "../config/backend";

dayjs.extend(duration);

export interface WorkShift {
    id: string;
    employee_id: string;
    clock_in: string;
    clock_out: string | null;
    is_night_shift: boolean;
    created_at: string;
    employee?: {
        full_name: string;
    };
}

export const useSkudActions = (
    enableHistory: boolean = false,
    filterEmployeeId?: string | null,
    filterStartDate?: string | null,
    filterEndDate?: string | null
) => {
    const { isAdmin } = usePermissions();
    const { open: notify } = useNotification();
    const queryClient = useQueryClient();
    
    // Use centralized work shift state (deduplicated)
    const { activeShift, employeeId, loading: shiftLoading } = useWorkShift();
    const currentUserEmployeeId = employeeId;
    const currentShift = activeShift;

    // IP Logic
    // 1. Fetch User IP (Cached forever)
    const { data: userIp } = useQuery({
        queryKey: ['common', 'userIp'],
        queryFn: async () => {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip as string;
        },
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
    });

    // 2. Fetch Allowed IP from Settings (Cached 5 mins, Supabase only)
    const { data: dbAllowedIp } = useQuery({
        queryKey: ['appSettings', 'skud_api_url'],
        queryFn: async () => {
            if (IS_DJANGO_BACKEND) return null;
            const { data } = await supabase
                .from("app_settings")
                .select("value")
                .eq("key", "skud_api_url")
                .single();
            return (data?.value ?? null) as string | null;
        },
        staleTime: 5 * 60 * 1000,
    });

    const effectiveAllowedIp = dbAllowedIp || import.meta.env.VITE_OFFICE_IP || "";
    const isIpCorrect = !effectiveAllowedIp || userIp === effectiveAllowedIp;
    const [actionLoading, setActionLoading] = React.useState(false);

    // History Logic (Only fetch if enabled)
    const { data: shiftsData, isLoading: historyLoading, refetch: refetchShifts, isFetching: historyFetching } = useQuery({
        queryKey: ['workShifts', 'history', currentUserEmployeeId, filterEmployeeId, filterStartDate, filterEndDate],
        queryFn: async () => {
            if (IS_DJANGO_BACKEND) return [];
            // Need employee ID to fetch history
            if (!currentUserEmployeeId && !isAdmin()) return [];

            let query = supabase
                .from("WorkShifts")
                .select(`*, employee:Employees(full_name)`)
                .order("clock_in", { ascending: false });

            // If not admin, filter by own ID, otherwise apply selected employee filter
            if (!isAdmin() && currentUserEmployeeId) {
                query = query.eq("employee_id", currentUserEmployeeId);
            } else if (!isAdmin() && !currentUserEmployeeId) {
                return [];
            } else if (isAdmin() && filterEmployeeId) {
                 query = query.eq("employee_id", filterEmployeeId);
            }

            // Apply date filters if provided
            if (filterStartDate) {
                // We use clock_in to filter dates
                query = query.gte("clock_in", `${filterStartDate}T00:00:00Z`);
            }
            if (filterEndDate) {
                query = query.lte("clock_in", `${filterEndDate}T23:59:59Z`);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return data as unknown as WorkShift[];
        },
        enabled: enableHistory && !IS_DJANGO_BACKEND,
        staleTime: 5 * 60 * 1000, 
        placeholderData: keepPreviousData,
    });

    const shifts = shiftsData ?? [];
    const loading = shiftLoading || (enableHistory ? historyLoading : false);

    // Realtime Subscription for History and Dashboard Updates
    React.useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null;

        if (!IS_DJANGO_BACKEND && enableHistory) {
            channel = supabase
                .channel('workshifts-changes')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'WorkShifts' },
                    (payload) => {
                        console.log('Realtime update received for WorkShifts:', payload);
                        // Invalidate both history queries and active shift query
                        queryClient.invalidateQueries({ queryKey: ['workShifts'] });
                        queryClient.invalidateQueries({ queryKey: ['activeWorkShift'] });
                    }
                )
                .subscribe();
        }

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [enableHistory, queryClient]);

    // Helpers
    const isNightShiftTime = (clockIn: string) => {
        const hour = dayjs(clockIn).hour();
        return hour < 8 || hour >= 20;
    };

    // Actions
    const handleStartShift = async () => {
        if (IS_DJANGO_BACKEND) {
            notify?.({ type: "error", message: "СКУД ещё не перенесён на Django" });
            return;
        }
        if (!currentUserEmployeeId) return;

        if (!isIpCorrect) {
            notify?.({ type: "error", message: "Неверный IP адрес. Смена может быть начата только из офиса." });
            return;
        }

        try {
            setActionLoading(true);
            const now = new Date();
            const isNight = isNightShiftTime(now.toISOString());

            const { error } = await supabase.from("WorkShifts").insert({
                employee_id: currentUserEmployeeId,
                clock_in: now.toISOString(),
                is_night_shift: isNight,
            });
            if (error) throw error;

            notify?.({ type: "success", message: "Смена началась" });

            queryClient.invalidateQueries({ queryKey: ['workShift', 'current'] });
            if (enableHistory) queryClient.invalidateQueries({ queryKey: ['workShifts', 'history'] });

        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка начала смены" });
        } finally {
            setActionLoading(false);
        }
    };

    const handleEndShift = async () => {
        if (IS_DJANGO_BACKEND) {
            notify?.({ type: "error", message: "СКУД ещё не перенесён на Django" });
            return;
        }
        if (!currentShift) return;
        try {
            setActionLoading(true);
            const { error } = await supabase.from("WorkShifts").update({
                clock_out: new Date().toISOString(),
            }).eq("id", currentShift.id);

            if (error) throw error;

            notify?.({ type: "success", message: "Смена завершена" });

            queryClient.invalidateQueries({ queryKey: ['workShift', 'current'] });
            if (enableHistory) queryClient.invalidateQueries({ queryKey: ['workShifts', 'history'] });

        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка завершения смены" });
        } finally {
            setActionLoading(false);
        }
    };

    return {
        shifts,
        loading,
        isFetching: historyFetching,
        currentUserEmployeeId,
        actionLoading,
        effectiveAllowedIp,
        userIp,
        isIpCorrect,
        currentShift,
        fetchShifts: refetchShifts, // Alias refetch
        handleStartShift,
        handleEndShift,
        isNightShiftTime, 
    };
};
