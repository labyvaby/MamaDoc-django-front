import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dayjs from "dayjs";
import {
    Box,
    Grid,
    useMediaQuery,
    useTheme,
    Button,
    Stack,
    Typography,
    IconButton,
    Tabs,
    Tab
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import MedicalServicesOutlined from "@mui/icons-material/MedicalServicesOutlined";
import { useNotification } from "@refinedev/core";
import { usePageTitle } from "../../hooks/usePageTitle";
import { supabase } from "../../utility/supabaseClient";
import type { Appointment, AggregatedAppointmentRow } from "../home/types";
import { mapAggregatedRowToAppointment, compareAppointmentsByStatus } from "../home/types";
import AppointmentsList from "../home/components/AppointmentsList";
import { AppointmentDetailsCard } from "../home/components/AppointmentDetailsCard";
import { DB_TABLES } from "../../utility/constants";
import { DoctorConclusionPanel } from "./components/DoctorConclusionPanel";
import { PageHeader, AppBottomSheet, DateNavigation } from "../../components/ui";
import { useRefresh } from "../../contexts/refresh-context";
import DoctorWorkDrawer from "../../components/home/DoctorWorkDrawer";
import { usePermissions } from "../../hooks/usePermissions";
import { fetchDoctors } from "../../services/employees";
import type { EmployeesRow } from "../expenses/types";

const DoctorWorkPage: React.FC = () => {
    usePageTitle("Кабинет врача");
    useNotification();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { setOnRefresh } = useRefresh();
    const { isAdmin, isRegistrator, employeeId } = usePermissions();

    // State
    const [loading, setLoading] = useState(true);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
    const [doctorWorkOpen, setDoctorWorkOpen] = useState(false);
    const [doctors, setDoctors] = useState<EmployeesRow[]>([]);

    // Tab state for mobile view
    const [activeTab, setActiveTab] = useState(0);
    const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

    // Контроллеры для отмены запросов
    const apptsCtrlRef = useRef<AbortController | null>(null);
    const countsCtrlRef = useRef<AbortController | null>(null);

    // Кэш для приемов и счетчиков
    const appointmentsCache = useRef<Record<string, Appointment[]>>({});
    const countsCache = useRef<Record<string, Record<string, number>>>({});

    // Filter Date (Default Today)
    const [date, setDate] = useState(() => {
        const t = new Date();
        const yyyy = t.getFullYear();
        const mm = String(t.getMonth() + 1).padStart(2, "0");
        const dd = String(t.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    });

    // Derived
    const ruDateFromInput = useMemo(() => {
        if (!date) return "";
        const [yyyy, mm, dd] = date.split("-");
        return `${dd}.${mm}.${yyyy}`;
    }, [date]);


    // Fetch Appointments for Current Doctor (Optimized with Cache)
    const fetchAppointments = useCallback(async (forceRefetch = false) => {
        const selDate = date;

        // Проверяем кэш
        if (!forceRefetch && appointmentsCache.current[selDate]) {
            setAppointments(appointmentsCache.current[selDate]);
            setLoading(false);
            return;
        }

        const prev = apptsCtrlRef.current;
        if (prev) prev.abort();
        const ctrl = new AbortController();
        apptsCtrlRef.current = ctrl;

        try {
            setLoading(true);

            // Оптимизация: используем данные из usePermissions
            const doctorId = employeeId;

            if (!doctorId) {
                console.warn("Doctor ID not found in permissions");
                setAppointments([]);
                setLoading(false);
                return;
            }

            // Используем get_home_appointments — ранняя фильтрация по дате Bishkek на уровне БД.
            // Для врача передаём p_employee_id — БД вернёт только его приёмы.
            // Для admin/registrator передаём null — возвращаются все приёмы.
            const isPrivileged = isAdmin() || isRegistrator();
            const { data, error } = await supabase
                .rpc("get_home_appointments", {
                    p_date: selDate,
                    p_employee_id: isPrivileged ? null : doctorId,
                });
            if (error) throw error;

            if (!ctrl.signal.aborted) {
                // Мапим данные из агрегированной вьюхи в тип Appointment
                const results = (data || []).map((row: any) => mapAggregatedRowToAppointment(row as AggregatedAppointmentRow));
                appointmentsCache.current[selDate] = results;
                setAppointments(results);
            }

        } catch (e) {
            if (!isAbortError(e)) console.error(e);
        } finally {
            if (!ctrl.signal.aborted) setLoading(false);
        }
    }, [date, employeeId, isAdmin]);

    function isAbortError(e: unknown): boolean {
        return !!e && typeof e === "object" && (e as any).name === "AbortError";
    }

    useEffect(() => {
        fetchAppointments();
    }, [fetchAppointments]);

    useEffect(() => {
        if (isAdmin() || isRegistrator()) {
            fetchDoctors().then(setDoctors);
        }
    }, [isAdmin, isRegistrator]);

    // Загрузка количества приемов для диапазона дней (с оптимизацией кэширования)
    const fetchRangeCounts = useCallback(async (forceRefetch = false) => {
        const currentMonth = dayjs(date).format('YYYY-M');

        if (!forceRefetch && countsCache.current[currentMonth]) {
            setDayCounts(countsCache.current[currentMonth]);
            return;
        }

        const prev = countsCtrlRef.current;
        if (prev) prev.abort();
        const ctrl = new AbortController();
        countsCtrlRef.current = ctrl;

        try {
            const doctorId = employeeId;
            if (!doctorId) return;

            const startDay = dayjs(date).subtract(15, 'day').format('YYYY-MM-DD');
            const endDay = dayjs(date).add(15, 'day').format('YYYY-MM-DD');
            const isPrivileged = isAdmin() || isRegistrator();

            const { data, error } = await supabase.rpc('get_appointment_day_counts', {
                p_start: startDay,
                p_end: endDay,
                p_employee_id: isPrivileged ? null : doctorId,
            });

            if (error) throw error;

            if (!ctrl.signal.aborted) {
                const counts: Record<string, number> = {};
                (data || []).forEach((item: { day: string; cnt: number }) => {
                    counts[item.day] = Number(item.cnt);
                });
                countsCache.current[currentMonth] = counts;
                setDayCounts(prev => ({ ...prev, ...counts }));
            }
        } catch (e) {
            if (!isAbortError(e)) console.error("Error fetching day counts:", e);
        }
    }, [date, employeeId, isAdmin, isRegistrator]);

    useEffect(() => {
        fetchRangeCounts();
        return () => {
            if (countsCtrlRef.current) countsCtrlRef.current.abort();
        };
    }, [fetchRangeCounts]);

    // Регистрация функции обновления для кнопки в Header и Realtime подписка
    useEffect(() => {
        const handleRefresh = () => {
            // Очищаем кэш при ручном обновлении
            delete appointmentsCache.current[date];
            delete countsCache.current[`${new Date(date).getFullYear()}-${new Date(date).getMonth() + 1}`];
            fetchAppointments(true);
        };
        setOnRefresh(() => handleRefresh);

        // --- REALTIME SUBSCRIPTION ---
        let realtimeTimeout: ReturnType<typeof setTimeout> | null = null;
        const debouncedRealtime = () => {
            if (realtimeTimeout) return;
            realtimeTimeout = setTimeout(() => {
                realtimeTimeout = null;
                delete appointmentsCache.current[date];
                countsCache.current = {};
                fetchAppointments(true);
                fetchRangeCounts(true);
            }, 5000);
        };

        const channel = supabase
            .channel(`doctor-appointments-realtime-${employeeId || 'all'}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "Appointments" }, debouncedRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "AppointmentServices" }, debouncedRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "MedicalConclusions" }, debouncedRealtime)
            .subscribe();

        return () => {
            setOnRefresh(null);
            if (realtimeTimeout) clearTimeout(realtimeTimeout);
            supabase.removeChannel(channel);
        };
    }, [setOnRefresh, fetchAppointments, fetchRangeCounts, date, employeeId]);



    // Frontend filtering by date to handle timezones correctly
    const filteredAppointments = useMemo(() => {
        return appointments.filter(a => {
            if (date && !dayjs(a.appointment_at).isSame(dayjs(date), 'day')) return false;

            // Filter by doctor if admin/superadmin
            if ((isAdmin() || isRegistrator()) && doctors.length > 0) {
                const pIds: string[] = Array.isArray(a.performer_ids) ? a.performer_ids : [];
                const isDoctorInvolved = pIds.some(id => doctors.some(d => d.id === id));
                if (!isDoctorInvolved) return false;
            }

            return true;
        }).sort(compareAppointmentsByStatus);
    }, [appointments, date, doctors, isAdmin, isRegistrator]);

    const selectedAppointment = useMemo(() =>
        appointments.find(a => a.id === selectedAppointmentId) || null,
        [appointments, selectedAppointmentId]);

    // Check if selected appointment has conclusion (from MedicalConclusions table)
    const [hasConclusion, setHasConclusion] = useState(false);
    const prevAppointmentIdRef = useRef<string | null>(null);

    useEffect(() => {
        // Only reset to false when the selected appointment actually changes,
        // not when appointments array updates (e.g. payment change).
        // This prevents the conclusion panel (and printer icon) from flickering/disappearing.
        if (prevAppointmentIdRef.current !== selectedAppointmentId) {
            setHasConclusion(false);
            prevAppointmentIdRef.current = selectedAppointmentId;
        }

        if (!selectedAppointmentId) {
            return;
        }

        const checkConclusion = async () => {
            // First, trust the flag from the aggregated view if it's there
            if (selectedAppointment?.has_conclusion || selectedAppointment?.conclusion || selectedAppointment?.diagnosis_code) {
                setHasConclusion(true);
                return;
            }

            const { count, error } = await supabase
                .from(DB_TABLES.MEDICAL_CONCLUSIONS)
                .select("id", { count: "exact", head: true })
                .eq("appointment_id", selectedAppointmentId);

            if (!error) {
                setHasConclusion((count ?? 0) > 0);
            }
        };

        checkConclusion();
    }, [selectedAppointmentId, appointments]);

    return (
        <Box
            sx={(theme) => ({
                height: {
                    xs: `calc(100dvh - ${theme.appLayout.viewportOffset.home.mobileOffset}px)`,
                    md: `calc(100dvh - ${theme.appLayout.viewportOffset.home.desktopOffset}px)`,
                },
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
            })}
        >
            <PageHeader
                title="Кабинет врача"
                showTitle={false}
                dateNavigation={
                    <DateNavigation
                        date={date}
                        setDate={setDate}
                        dayCounts={dayCounts}
                    />
                }
            />


            {/* Columns */}
            <Box sx={(theme) => ({
                flex: 1,
                overflow: "hidden",
                px: theme.appLayout.page.paddingX,
            })}>
                <Grid container spacing={2} sx={{
                    alignItems: "flex-start",
                    height: "100%",
                    boxSizing: "border-box"
                }}>
                    {/* Column 1: Appointments List */}
                    <Grid item xs={12} md={4} sx={{
                        height: '100%',
                        overflow: 'hidden',
                        pr: { md: 1 }
                    }}>
                        <AppointmentsList
                            titleDate={ruDateFromInput}
                            loading={loading}
                            errorMsg={null}
                            items={filteredAppointments}
                            doctors={doctors}
                            onOpenFilters={() => { }}
                            onItemClick={(id) => {
                                setSelectedAppointmentId(id);
                                setActiveTab(0);
                            }}
                            hideDoctorFilter={!(isAdmin() || isRegistrator())}
                            restrictToDoctorId={(isAdmin() || isRegistrator()) ? undefined : (employeeId ?? undefined)}
                        />
                    </Grid>

                    {/* Column 2: Appointment Details (Desktop) */}
                    {!isMobile && (
                        <Grid item xs={12} md={4} sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            pl: { md: 1 },
                            pr: { md: 1 }
                        }}>
                            {selectedAppointmentId ? (
                                <AppointmentDetailsCard
                                    appointmentId={selectedAppointmentId}
                                    onClose={() => setSelectedAppointmentId(null)}
                                    onUpdate={fetchAppointments}
                                />
                            ) : (
                                <Box
                                    sx={{
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: "1px dashed",
                                        borderColor: "divider",
                                        borderRadius: 1,
                                        color: "text.secondary",
                                        bgcolor: "background.paper"
                                    }}
                                >
                                    Выберите прием из списка
                                </Box>
                            )}
                        </Grid>
                    )}

                    {/* Column 3: Conclusion Panel (Desktop) */}
                    {!isMobile && (
                        <Grid item xs={12} md={4} sx={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            pl: { md: 1 }
                        }}>
                            {selectedAppointmentId && hasConclusion ? (
                                <DoctorConclusionPanel
                                    appointmentId={selectedAppointmentId}
                                    onClose={() => { }}
                                    onSaveSuccess={fetchAppointments}
                                    hideCloseButton={true}
                                    onEditClick={() => setDoctorWorkOpen(true)}
                                />
                            ) : (
                                <Box
                                    sx={{
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: "1px dashed",
                                        borderColor: "divider",
                                        borderRadius: 1,
                                        color: "text.secondary",
                                        bgcolor: "background.paper"
                                    }}
                                >
                                    {selectedAppointmentId ? "Заключение отсутствует" : "Выберите прием для просмотра заключения"}
                                </Box>
                            )}
                        </Grid>
                    )}
                </Grid>
            </Box>

            {/* Mobile Bottom Sheet for Details */}
            {isMobile && (
                <AppBottomSheet
                    open={Boolean(selectedAppointmentId)}
                    onClose={() => {
                        setSelectedAppointmentId(null);
                    }}
                >
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tabs
                            value={activeTab}
                            onChange={(_, v) => setActiveTab(v)}
                            variant="fullWidth"
                            scrollButtons="auto"
                        >
                            <Tab label="Прием" />
                            {hasConclusion && <Tab label="Заключение" />}
                        </Tabs>
                    </Box>

                    <Box sx={{ p: 0, height: 'calc(100% - 49px)', overflowY: 'auto' }}>
                        {activeTab === 0 && (
                            <AppointmentDetailsCard
                                appointmentId={selectedAppointmentId}
                                onClose={() => setSelectedAppointmentId(null)}
                                onUpdate={fetchAppointments}
                                isConclusionVisible={false}
                            />
                        )}
                        {activeTab === 1 && (
                            <DoctorConclusionPanel
                                appointmentId={selectedAppointmentId}
                                onClose={() => setActiveTab(0)}
                                onSaveSuccess={fetchAppointments}
                                hideCloseButton={true}
                                onEditClick={() => setDoctorWorkOpen(true)}
                            />
                        )}
                    </Box>
                </AppBottomSheet>
            )}

            {/* Doctor Work Drawer for editing conclusions */}
            <DoctorWorkDrawer
                open={doctorWorkOpen}
                onClose={() => setDoctorWorkOpen(false)}
                appointment={selectedAppointment}
                onSuccess={() => {
                    fetchAppointments();
                    setDoctorWorkOpen(false);
                }}
            />
        </Box>
    );
};

export default DoctorWorkPage;
