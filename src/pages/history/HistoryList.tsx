import React from "react";
import {
    Box,
    Paper,
    Typography,
    Grid2,
    TextField,
    MenuItem,
    Button,
    Stack,
    List,
    ListItemButton,
    Avatar,
    useTheme,
    useMediaQuery
} from "@mui/material";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, AppBottomSheet } from "../../components/ui";
import { formatDateRu } from "../../utility/format";
import { supabase } from "../../utility/supabaseClient";
import AppointmentsList from "../home/components/AppointmentsList";
import AppointmentDetailsCard from "../home/components/AppointmentDetailsCard";
import { DoctorConclusionPanel } from "../doctor/components/DoctorConclusionPanel";
import DoctorWorkDrawer from "../../components/home/DoctorWorkDrawer";
import { mapAggregatedRowToAppointment, Appointment, AggregatedAppointmentRow } from "../home/types";
import { fetchMedicalStaff } from "../../services/employees";
import { EmployeesRow } from "../expenses/types";
import dayjs from "dayjs";

// Names for months in Russian
const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const HistoryList: React.FC = () => {
    usePageTitle("История приемов");
    const { isAdmin, isSuperAdmin, isDoctor, isRegistrator, employeeId } = usePermissions();
    const canViewAll = isAdmin() || isSuperAdmin() || isRegistrator();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    // State
    const [history, setHistory] = React.useState<Appointment[]>([]);
    const [doctors, setDoctors] = React.useState<EmployeesRow[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Filters State
    const [selectedYear, setSelectedYear] = React.useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = React.useState<string | null>(null);
    const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    // UI State for Details/Conclusion
    const [conclusionOpen, setConclusionOpen] = React.useState(false);

    // Additional admin filters
    const [searchQuery, setSearchQuery] = React.useState("");
    const [selectedEmployee, setSelectedEmployee] = React.useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = React.useState(false);

    // Fetch Data
    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            // Fetch Doctors for avatars
            if (doctors.length === 0) {
                const docs = await fetchMedicalStaff();
                setDoctors(docs);
            }

            let query = supabase
                .from("HistoryAppointments")
                .select("*")
                .order("appointment_at", { ascending: false });

            // Apply Role Filters
            if (!canViewAll) {
                // For logic, if user is restricted, we ALWAYS apply filter.
                // The issue might be that `AppointmentsAggregated` DOES NOT have performer_ids column?
                // Or user is falling into 'canViewAll' unexpectedly.
                // Assuming AppointmentsAggregated HAS performer_ids as String[] since mapped types say so.
                // Let's filter effectively.
                query = query.contains("performer_ids", [employeeId]);
            } else if (selectedEmployee) {
                // Admin filter
                query = query.or(`doctor_id.eq.${selectedEmployee},performer_ids.cs.{${selectedEmployee}}`);
            }

            // Temporarily limit fetch to recent 2000 records to avoid overload
            query = query.limit(2000);

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                // Map to Appointment type
                const mapped = (data as AggregatedAppointmentRow[]).map(mapAggregatedRowToAppointment);
                setHistory(mapped);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoading(false);
        }
    }, [canViewAll, employeeId, selectedEmployee, doctors.length, isDoctor]);

    React.useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployee, canViewAll, employeeId, doctors.length]);


    // --- Derived State (Client-Side Grouping) ---

    // 1. Filter by Search Query
    const filteredHistory = React.useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return history;
        return history.filter(h =>
            (h.patient_name || "").toLowerCase().includes(q) ||
            (h.doctor_name || "").toLowerCase().includes(q) ||
            (h.service_names || "").toLowerCase().includes(q)
        );
    }, [history, searchQuery]);

    // 2. Available Years
    const availableYears = React.useMemo(() => {
        const years = new Set<string>();
        filteredHistory.forEach(h => {
            if (h.appointment_at) {
                years.add(new Date(h.appointment_at).getFullYear().toString());
            }
        });
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [filteredHistory]);

    // 3. Available Months (for selected Year)
    const availableMonths = React.useMemo(() => {
        if (!selectedYear) return [];
        const monthMap = new Map<string, number>();

        filteredHistory.forEach(h => {
            if (!h.appointment_at) return;
            const d = new Date(h.appointment_at);
            const y = d.getFullYear().toString();
            if (y !== selectedYear) return;

            const mIdx = d.getMonth();
            const key = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
            monthMap.set(key, mIdx);
        });

        return Array.from(monthMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([value, monthIndex]) => ({ value, monthIndex }));
    }, [filteredHistory, selectedYear]);

    // 4. Group by Day (for list in Left Panel)
    const groupedByDay = React.useMemo(() => {
        const dayMap = new Map<string, Appointment[]>();

        // Filter by Year/Month first
        const relevant = filteredHistory.filter(h => {
            if (!h.appointment_at) return false;
            const d = dayjs(h.appointment_at).tz("Asia/Bishkek");
            const y = d.format("YYYY");
            if (selectedYear && y !== selectedYear) return false;

            if (selectedMonth) {
                const m = d.format("YYYY-MM");
                if (m !== selectedMonth) return false;
            }
            return true;
        });

        relevant.forEach(h => {
            const d = dayjs(h.appointment_at).tz("Asia/Bishkek");
            const key = d.format("YYYY-MM-DD");

            if (!dayMap.has(key)) dayMap.set(key, []);
            dayMap.get(key)!.push(h);
        });

        return Array.from(dayMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0])) // Descending dates
            .map(([date, items]) => ({
                date,
                items,
                total: items.length
            }));
    }, [filteredHistory, selectedYear, selectedMonth]);

    // 5. Final Display List (Middle Panel)
    const displayList = React.useMemo(() => {
        // Start with filtered by Year/Month from groupedByDay logic
        // Then apply selectedDate if present
        let list: Appointment[] = [];

        // If no date selected, show all valid for current Year/Month filters
        if (!selectedDate) {
            // Return flat list of all relevant
            list = filteredHistory.filter(h => {
                if (!h.appointment_at) return false;
                const d = dayjs(h.appointment_at).tz("Asia/Bishkek");
                const y = d.format("YYYY");
                if (selectedYear && y !== selectedYear) return false;
                if (selectedMonth) {
                    const m = d.format("YYYY-MM");
                    if (m !== selectedMonth) return false;
                }
                return true;
            });
        } else {
            // Filter by date
            list = filteredHistory.filter(h => {
                if (!h.appointment_at) return false;
                const d = dayjs(h.appointment_at).tz("Asia/Bishkek");
                return d.format("YYYY-MM-DD") === selectedDate;
            });
        }

        return list.sort((a, b) => dayjs(b.appointment_at).valueOf() - dayjs(a.appointment_at).valueOf());
    }, [filteredHistory, selectedYear, selectedMonth, selectedDate]);


    return (
        <Box
            sx={(theme) => ({
                minHeight: { xs: theme.appLayout.viewportOffset.employees.minHeightMobile, md: "auto" },
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
                overflow: "visible",
            })}
        >
            <PageHeader
                title="История приемов"
                showTitle={false}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск пациента, услуги..."
                actions={
                    canViewAll ? (
                        <TextField
                            size="small"
                            placeholder="ID Сотрудника"
                            value={selectedEmployee || ""}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            sx={{ width: 150 }}
                        />
                    ) : undefined
                }
            >
            </PageHeader>

            <Box
                sx={(theme) => ({
                    px: theme.appLayout.page.paddingX,
                    pb: theme.appLayout.page.paddingY,
                })}
            >
                <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

                    {/* LEFT COLUMN: PERIOD FILTER */}
                    <Grid2
                        size={{ xs: 12, md: 2 }}
                        sx={(theme) => ({
                            position: { md: "sticky" },
                            top: { md: theme.spacing(2) },
                            alignSelf: "flex-start",
                            height: {
                                xs: "auto",
                                md: `calc(100dvh - ${theme.appLayout.viewportOffset.employees.desktopOffset}px)`,
                            },
                            display: "flex",
                            flexDirection: "column",
                        })}
                    >
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}
                        >
                            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Период</Typography>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setSelectedYear(null);
                                        setSelectedMonth(null);
                                        setSelectedDate(null);
                                    }}
                                    sx={{ textTransform: 'none' }}
                                >
                                    Сброс
                                </Button>
                            </Box>

                            <Box sx={{ overflowY: "auto", flex: 1, p: 2 }}>
                                <Stack spacing={2}>
                                    <Stack spacing={0.5}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600}>Год</Typography>
                                        <TextField
                                            select
                                            size="small"
                                            fullWidth
                                            value={selectedYear ?? ""}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setSelectedYear(v || null);
                                                setSelectedMonth(null);
                                                setSelectedDate(null);
                                            }}
                                            SelectProps={{ displayEmpty: true }}
                                        >
                                            <MenuItem value=""><Typography variant="body2" color="text.secondary">Все годы</Typography></MenuItem>
                                            {availableYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                        </TextField>
                                    </Stack>

                                    {selectedYear && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600}>Месяц</Typography>
                                            <TextField
                                                select
                                                size="small"
                                                fullWidth
                                                value={selectedMonth ?? ""}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setSelectedMonth(v || null);
                                                    setSelectedDate(null);
                                                }}
                                                SelectProps={{ displayEmpty: true }}
                                                disabled={availableMonths.length === 0}
                                            >
                                                <MenuItem value=""><Typography variant="body2" color="text.secondary">Все месяцы</Typography></MenuItem>
                                                {availableMonths.map(m => (
                                                    <MenuItem key={m.value} value={m.value}>{MONTH_NAMES[m.monthIndex]}</MenuItem>
                                                ))}
                                            </TextField>
                                        </Stack>
                                    )}

                                    {selectedMonth && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600}>День</Typography>
                                            <List dense sx={{ py: 0 }}>
                                                {groupedByDay.map(day => (
                                                    <ListItemButton
                                                        key={day.date}
                                                        selected={selectedDate === day.date}
                                                        onClick={() => setSelectedDate(day.date)}
                                                        sx={{ borderRadius: 1, mb: 0.5 }}
                                                    >
                                                        <Typography variant="body2" sx={{ flex: 1 }}>{formatDateRu(day.date)}</Typography>
                                                        <Typography variant="caption" color="text.secondary">({day.total})</Typography>
                                                    </ListItemButton>
                                                ))}
                                            </List>
                                        </Stack>
                                    )}
                                </Stack>
                            </Box>
                        </Paper>
                    </Grid2>

                    {/* MIDDLE COLUMN: LIST */}
                    <Grid2
                        size={{ xs: 12, md: 5 }}
                        sx={(theme) => ({
                            position: { md: "sticky" },
                            top: { md: theme.spacing(2) },
                            alignSelf: "flex-start",
                            height: {
                                xs: "auto",
                                md: `calc(100dvh - ${theme.appLayout.viewportOffset.employees.desktopOffset}px)`,
                            },
                        })}
                    >
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}
                        >
                            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                    Список приемов ({displayList.length})
                                </Typography>
                            </Box>
                            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                <AppointmentsList
                                    titleDate={selectedDate ? formatDateRu(selectedDate) : "Выбранный период"}
                                    loading={loading}
                                    errorMsg={null}
                                    items={displayList}
                                    onOpenFilters={() => { }} // No specific filters for history list yet
                                    onItemClick={(id) => {
                                        setSelectedId(id);
                                        setConclusionOpen(false); // Reset conclusion view on change
                                    }}
                                    doctors={doctors}
                                    // No gaps or adding slots in history
                                    onAddSlot={undefined}
                                    shifts={[]}
                                    hideDoctorFilter={true} // Hide the instagram-like stories
                                />
                            </Box>
                        </Paper>
                    </Grid2>

                    {/* RIGHT COLUMN: DETAILS */}
                    {!isMobile && (
                        <Grid2
                            size={{ xs: 12, md: 5 }}
                            sx={(theme) => ({
                                position: { md: "sticky" },
                                top: { md: theme.spacing(2) },
                                alignSelf: "flex-start",
                                height: {
                                    md: `calc(100dvh - ${theme.appLayout.viewportOffset.employees.desktopOffset}px)`,
                                },
                            })}
                        >
                            {conclusionOpen ? (
                                <DoctorConclusionPanel
                                    appointmentId={selectedId!}
                                    onClose={() => setConclusionOpen(false)}
                                    // Read-only essentially, but saving allowed if permissable
                                    onSaveSuccess={() => fetchData()}
                                    hideCloseButton={false}
                                    onEditClick={() => setDrawerOpen(true)}
                                    readOnly={true}
                                />
                            ) : (
                                <AppointmentDetailsCard
                                    appointmentId={selectedId}
                                    onClose={() => setSelectedId(null)}
                                    // Update is useless in read-only but keeps consistency
                                    onUpdate={() => fetchData()}
                                    showPaymentAction={false} // Hide payment action specifically
                                    readOnly={true} // Enforce read-only mode (hides edit/buttons)
                                    isConclusionVisible={conclusionOpen}
                                    onToggleConclusion={() => setConclusionOpen(!conclusionOpen)}
                                />
                            )}
                        </Grid2>
                    )}
                </Grid2>
            </Box>

            {/* Mobile Sheet */}
            {isMobile && (
                <AppBottomSheet open={!!selectedId} onClose={() => setSelectedId(null)}>
                    <Box sx={{ p: 0, height: '80vh' }}>
                        {conclusionOpen ? (
                            <DoctorConclusionPanel
                                appointmentId={selectedId!}
                                onClose={() => setConclusionOpen(false)}
                                onSaveSuccess={() => fetchData()}
                                hideCloseButton={false}
                                onEditClick={() => setDrawerOpen(true)}
                                readOnly={true}
                            />
                        ) : (
                            <AppointmentDetailsCard
                                appointmentId={selectedId}
                                onClose={() => setSelectedId(null)}
                                onUpdate={() => fetchData()}
                                showPaymentAction={false}
                                readOnly={true}
                                isConclusionVisible={conclusionOpen}
                                onToggleConclusion={() => setConclusionOpen(!conclusionOpen)}
                            />
                        )}
                    </Box>
                </AppBottomSheet>
            )}

            <DoctorWorkDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                appointment={history.find(h => h.id === selectedId) || null}
                onSuccess={() => {
                    fetchData();
                    setDrawerOpen(false);
                }}
            />
        </Box>
    );
};

export default HistoryList;
