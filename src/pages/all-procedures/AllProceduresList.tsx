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
    ListItemText,
    Collapse,
    useTheme,
    useMediaQuery,
    ToggleButtonGroup,
    ToggleButton,
    Chip,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { useActiveMonths } from "../../hooks/useActiveMonths";
import { PageHeader, AppBottomSheet } from "../../components/ui";
import { formatDateRu } from "../../utility/format";
import { supabase } from "../../utility/supabaseClient";
import AppointmentsList from "../home/components/AppointmentsList";
import AppointmentDetailsCard from "../home/components/AppointmentDetailsCard";
import { DoctorConclusionPanel } from "../doctor/components/DoctorConclusionPanel";
import DoctorWorkDrawer from "../../components/home/DoctorWorkDrawer";
import { mapAggregatedRowToAppointment, Appointment, AggregatedAppointmentRow } from "../home/types";
import { fetchNurses } from "../../services/employees";
import { EmployeesRow } from "../expenses/types";
import dayjs from "dayjs";

// Names for months in Russian
const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

export const AllProceduresList: React.FC = () => {
    usePageTitle("Все процедуры");
    const { isAdmin, isSuperAdmin, isRegistrator, employeeId } = usePermissions();
    const canViewAll = isAdmin() || isSuperAdmin() || isRegistrator();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const activeMonthsSet = useActiveMonths("Appointments", "appointment_at", true);
    // State
    const [history, setHistory] = React.useState<Appointment[]>([]);
    const [doctors, setDoctors] = React.useState<EmployeesRow[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Filters State - Default to current year and month
    const [selectedYear, setSelectedYear] = React.useState<string | null>(dayjs().year().toString());
    const [selectedMonth, setSelectedMonth] = React.useState<string | null>(dayjs().format("YYYY-MM"));
    const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    // UI State for Details/Conclusion
    const [conclusionOpen, setConclusionOpen] = React.useState(false);

    const [searchQuery, setSearchQuery] = React.useState("");
    const [selectedEmployeeFilter, setSelectedEmployeeFilter] = React.useState<string | null>(null);
    const [expandedEmployee, setExpandedEmployee] = React.useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = React.useState(false);

    // Filter mode: "date" | "services"
    const [filterMode, setFilterMode] = React.useState<"date" | "services">("date");
    // Services mode: selected employee and service to drill down
    const [selectedServiceEmployee, setSelectedServiceEmployee] = React.useState<string | null>(null);
    const [selectedServiceName, setSelectedServiceName] = React.useState<string | null>(null);

    // Fetch Data
    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            if (doctors.length === 0) {
                const docs = await fetchNurses();
                setDoctors(docs);
            }

            let query = supabase
                .from("HistoryAppointments")
                .select("id, appointment_at, patient_id, patient_name, doctor_id, doctor_name, status, total_amount, total_cost, paid_cash, paid_card, discount, debt, estimated_total, is_night, diagnosis_code, has_conclusion, performer_ids, service_names, services_json, created_at")
                .order("appointment_at", { ascending: false });

            // Fetch exactly what fits the selected period, fall back to limit if none.
            if (selectedMonth) {
                const start = dayjs.tz(selectedMonth, "Asia/Bishkek").startOf('month').toISOString();
                const end = dayjs.tz(selectedMonth, "Asia/Bishkek").endOf('month').toISOString();
                query = query.gte('appointment_at', start).lte('appointment_at', end).limit(5000);
            } else if (selectedYear) {
                const start = dayjs.tz(`${selectedYear}-01-01`, "Asia/Bishkek").startOf('year').toISOString();
                const end = dayjs.tz(`${selectedYear}-12-31`, "Asia/Bishkek").endOf('year').toISOString();
                query = query.gte('appointment_at', start).lte('appointment_at', end).limit(5000);
            } else {
                query = query.limit(2000);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                const mapped = (data as AggregatedAppointmentRow[]).map(mapAggregatedRowToAppointment);
                const nurseIds = doctors.map((n) => n.id);

                const proceduresOnly = mapped.filter((app) => {
                    if (!app.performer_ids || !Array.isArray(app.performer_ids)) return false;
                    if (!canViewAll) {
                        return !!employeeId
                            && app.performer_ids.includes(employeeId)
                            && app.performer_ids.some((id: string) => nurseIds.includes(id));
                    }
                    return app.performer_ids.some((id: string) => nurseIds.includes(id));
                });

                setHistory(proceduresOnly);
            }
        } catch (error) {
            console.error("Error fetching all procedures:", error);
        } finally {
            setLoading(false);
        }
    }, [canViewAll, employeeId, selectedYear, selectedMonth, doctors]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);


    // Stable callbacks (must be defined before JSX, not inline)
    const handleItemClick = React.useCallback((id: string) => {
        setSelectedId(id);
        setConclusionOpen(false);
    }, []);
    const handleCloseDetails = React.useCallback(() => setSelectedId(null), []);
    const handleToggleConclusion = React.useCallback(() => setConclusionOpen(prev => !prev), []);
    const handleCloseConclusion = React.useCallback(() => setConclusionOpen(false), []);
    const handleOpenDrawer = React.useCallback(() => setDrawerOpen(true), []);
    const handleOpenFilters = React.useCallback(() => {}, []);

    // --- Derived State (Client-Side Grouping) ---

    // Defer heavy list computations so UI stays responsive during filter changes
    const deferredEmployeeFilter = React.useDeferredValue(selectedEmployeeFilter);
    const deferredServiceEmployee = React.useDeferredValue(selectedServiceEmployee);
    const deferredDate = React.useDeferredValue(selectedDate);

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
        const currentYear = dayjs().year();
        const startYear = 2023; // Assuming clinic data starts around 2023
        const years = [];
        for (let y = currentYear; y >= startYear; y--) {
            years.push(y.toString());
        }
        return years;
    }, []);

    // 3. Available Months (for selected Year)
    const availableMonths = React.useMemo(() => {
        if (!selectedYear) return [];
        const monthMap = new Map<string, number>();

        for (let i = 0; i < 12; i++) {
            const key = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
            // If activeMonthsSet is loaded, only include months that have data globally
            if (activeMonthsSet) {
                if (activeMonthsSet.has(key)) {
                    monthMap.set(key, i);
                }
            } else {
                // Return all months by default while loading to avoid shrinking dropdown and blocked UI
                // Or we can just fallback to showing all until loaded
                monthMap.set(key, i);
            }
        }

        return Array.from(monthMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0])) // Descending sorting (latest month first)
            .map(([value, monthIndex]) => ({ value, monthIndex }));
    }, [selectedYear, activeMonthsSet]);

    const isDoctorInvolved = React.useCallback((h: Appointment, doctorName: string) => {
        if (h.doctor_name === doctorName) return true;
        const services = h.parsed_services || [];
        if (services.length > 0) {
            return services.some((s: any) => s.performer_name === doctorName || s.doctor_name === doctorName);
        }
        return false;
    }, []);

    const getInvolvedDoctors = React.useCallback((h: Appointment) => {
        const docNames = new Set<string>();
        if (h.doctor_name) docNames.add(h.doctor_name);
        const services = h.parsed_services || [];
        services.forEach((s: any) => {
            if (s.performer_name) docNames.add(s.performer_name);
            else if (s.doctor_name) docNames.add(s.doctor_name);
        });

        if (doctors.length > 0) {
            const validNames = new Set(doctors.map(d => d.full_name));
            return Array.from(docNames).filter(n => validNames.has(n));
        }

        if (docNames.size === 0) docNames.add("Неизвестно");
        return Array.from(docNames);
    }, [doctors]);

    // 4. Group by Employee -> Day (for hierarchy in Left Panel)
    const groupedByEmployee = React.useMemo(() => {
        const empMap = new Map<string, { employeeName: string, total: number, days: Map<string, number> }>();

        filteredHistory.forEach(h => {
            if (!h.appointment_at) return;
            // Count only paid appointments
            if (h.status !== "Оплачено" && h.status !== "Со скидкой") return;

            const dayKey = h.appointment_day;
            if (!dayKey) return;

            const services = h.parsed_services || [];
            if (services.length > 0) {
                services.forEach((s: any) => {
                    const empName = s.performer_name || s.doctor_name;
                    if (!empName) return;
                    if (!empMap.has(empName)) {
                        empMap.set(empName, { employeeName: empName, total: 0, days: new Map() });
                    }
                    const empData = empMap.get(empName)!;
                    empData.total++;
                    empData.days.set(dayKey, (empData.days.get(dayKey) || 0) + 1);
                });
                return;
            }

            const docNames = getInvolvedDoctors(h);
            docNames.forEach(empName => {
                if (!empMap.has(empName)) {
                    empMap.set(empName, { employeeName: empName, total: 0, days: new Map() });
                }
                const empData = empMap.get(empName)!;
                empData.total++;
                empData.days.set(dayKey, (empData.days.get(dayKey) || 0) + 1);
            });
        });

        return Array.from(empMap.values()).map(emp => ({
            employeeName: emp.employeeName,
            total: emp.total,
            days: Array.from(emp.days.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([date, count]) => ({ date, count }))
        })).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    }, [filteredHistory, getInvolvedDoctors]);

    // 5. Group by Employee -> Service (for "services" filter mode)
    const groupedByService = React.useMemo(() => {
        // filteredHistory is already constrained to selectedYear/selectedMonth by server query
        const empMap = new Map<string, Map<string, number>>();

        filteredHistory.forEach(h => {
            // Count only paid appointments
            if (h.status !== "Оплачено" && h.status !== "Со скидкой") return;

            const services = h.parsed_services || [];
            if (services.length === 0) return;

            services.forEach(s => {
                const svcName = s.name || s.service_name || "Без названия";
                const empName = s.performer_name || s.doctor_name;
                if (!empName) return;
                if (!empMap.has(empName)) empMap.set(empName, new Map());
                empMap.get(empName)!.set(svcName, (empMap.get(empName)!.get(svcName) || 0) + 1);
            });
        });

        return Array.from(empMap.entries())
            .map(([empName, svcMap]) => ({
                empName,
                total: Array.from(svcMap.values()).reduce((a, b) => a + b, 0),
                services: Array.from(svcMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([svcName, count]) => ({ svcName, count })),
            }))
            .sort((a, b) => a.empName.localeCompare(b.empName, "ru"));
    }, [filteredHistory]);

    // 6. Final Display List (Middle Panel)
    const displayList = React.useMemo(() => {
        // filteredHistory is already constrained to selectedYear/selectedMonth by the server query.
        // We only need to additionally filter by selectedDate and employee.
        // Use deferred values so employee/date selection doesn't block the UI
        const empFilter = filterMode === "services" ? deferredServiceEmployee : deferredEmployeeFilter;

        let list: Appointment[];

        if (deferredDate) {
            list = filteredHistory.filter(h =>
                // Сравниваем по Bishkek дате, не по UTC
                h.appointment_day === deferredDate &&
                (!empFilter || (
                    filterMode === "services"
                        ? (h.parsed_services || []).some((s: any) => (s.performer_name || s.doctor_name) === empFilter)
                        : isDoctorInvolved(h, empFilter)
                ))
            );
        } else if (empFilter) {
            list = filteredHistory.filter(h =>
                filterMode === "services"
                    ? (h.parsed_services || []).some((s: any) => (s.performer_name || s.doctor_name) === empFilter)
                    : isDoctorInvolved(h, empFilter)
            );
        } else {
            list = filteredHistory;
        }

        // Дополнительно фильтруем по выбранной услуге
        if (filterMode === "services" && selectedServiceName) {
            list = list.filter(h => {
                const svcs = h.parsed_services || [];
                if (svcs.length === 0) return false;
                return svcs.some((s: any) => (s.name || s.service_name) === selectedServiceName);
            });
        }

        // Sort descending by ISO string (lexicographic = chronological for ISO dates)
        return [...list].sort((a, b) =>
            (b.appointment_at || "").localeCompare(a.appointment_at || "")
        );
    }, [filteredHistory, deferredDate, deferredEmployeeFilter, isDoctorInvolved, filterMode, deferredServiceEmployee, selectedServiceName]);




    return (
        <Box
            sx={{
                height: { xs: "calc(100vh - 56px)", md: "auto" },
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
                overflow: "hidden",
            }}
        >
            <PageHeader
                title="Все процедуры"
                showTitle={false}
                showSearch
                searchVal={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Поиск пациента, процедуры..."
            >
            </PageHeader>

            <Box
                sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflowY: "auto",
                    overflowX: "hidden",
                    pb: theme.appLayout.page.paddingY,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    '&::-webkit-scrollbar': { display: 'none' },
                }}
            >
                <Box
                    sx={(t) => ({
                        px: t.appLayout.page.paddingX,
                    })}
                >
                    <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

                        {/* LEFT COLUMN: PERIOD FILTER */}
                        <Grid2
                            size={{ xs: 12, md: 3 }}
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
                                {/* Header with title and reset */}
                                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Фильтр</Typography>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setSelectedYear(null);
                                            setSelectedMonth(null);
                                            setSelectedDate(null);
                                            setSelectedEmployeeFilter(null);
                                            setExpandedEmployee(null);
                                            setSelectedServiceEmployee(null); setSelectedServiceName(null);
                                        }}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        Сброс
                                    </Button>
                                </Box>

                                {/* Mode switcher */}
                                <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
                                    <ToggleButtonGroup
                                        value={filterMode}
                                        exclusive
                                        onChange={(_, v) => {
                                            if (v) {
                                                setFilterMode(v);
                                                setSelectedServiceEmployee(null); setSelectedServiceName(null);
                                                setSelectedEmployeeFilter(null);
                                                setSelectedDate(null);
                                                setExpandedEmployee(null);
                                            }
                                        }}
                                        size="small"
                                        fullWidth
                                    >
                                        <ToggleButton value="date" sx={{ textTransform: "none", gap: 0.5, fontSize: "0.75rem" }}>
                                            <CalendarMonthIcon fontSize="inherit" />
                                            По дате
                                        </ToggleButton>
                                        <ToggleButton value="services" sx={{ textTransform: "none", gap: 0.5, fontSize: "0.75rem" }}>
                                            <MedicalServicesIcon fontSize="inherit" />
                                            По услугам
                                        </ToggleButton>
                                    </ToggleButtonGroup>
                                </Box>

                                <Box sx={{ overflowY: "auto", flex: 1, p: 1.5, pt: 0.5 }}>
                                    {/* Period selectors (always visible) */}
                                    <Stack spacing={1.5} sx={{ mb: 1.5 }}>
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
                                                    setSelectedServiceEmployee(null); setSelectedServiceName(null);
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
                                                        setSelectedServiceEmployee(null); setSelectedServiceName(null);
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
                                    </Stack>

                                    {/* DATE MODE */}
                                    {filterMode === "date" && selectedMonth && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600}>Сотрудники</Typography>
                                            <List dense sx={{ py: 0 }}>
                                                {groupedByEmployee.map(emp => {
                                                    const isExpanded = expandedEmployee === emp.employeeName;
                                                    const isSelected = selectedEmployeeFilter === emp.employeeName;

                                                    return (
                                                        <React.Fragment key={emp.employeeName}>
                                                            <ListItemButton
                                                                selected={isSelected}
                                                                onClick={() => {
                                                                    if (isExpanded) {
                                                                        setExpandedEmployee(null);
                                                                        setSelectedEmployeeFilter(null);
                                                                        setSelectedDate(null);
                                                                    } else {
                                                                        setExpandedEmployee(emp.employeeName);
                                                                        setSelectedEmployeeFilter(emp.employeeName);
                                                                        setSelectedDate(null);
                                                                    }
                                                                }}
                                                                sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                                                            >
                                                                <ListItemText
                                                                    primary={emp.employeeName}
                                                                    primaryTypographyProps={{ variant: "body2", sx: { fontWeight: isSelected ? 600 : 400 } }}
                                                                />
                                                                <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 10, px: 0.8, py: 0.2, fontSize: '0.75rem', fontWeight: 600, mr: 1, minWidth: 20, textAlign: 'center' }}>
                                                                    {emp.total}
                                                                </Box>
                                                                {isExpanded ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                                                            </ListItemButton>
                                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                                <List dense disablePadding>
                                                                    {emp.days.map(day => (
                                                                        <ListItemButton
                                                                            key={day.date}
                                                                            selected={selectedDate === day.date}
                                                                            onClick={() => {
                                                                                if (selectedDate === day.date) {
                                                                                    setSelectedDate(null);
                                                                                } else {
                                                                                    setSelectedEmployeeFilter(emp.employeeName);
                                                                                    setSelectedDate(day.date);
                                                                                }
                                                                            }}
                                                                            sx={{ borderRadius: 1, mb: 0.5, pl: 3 }}
                                                                        >
                                                                            <Typography variant="body2" sx={{ flex: 1, color: "text.secondary" }}>{formatDateRu(day.date)}</Typography>
                                                                            <Typography variant="caption" color="text.secondary">{day.count}</Typography>
                                                                        </ListItemButton>
                                                                    ))}
                                                                </List>
                                                            </Collapse>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </List>
                                        </Stack>
                                    )}

                                    {/* SERVICES MODE */}
                                    {filterMode === "services" && (
                                        <Stack spacing={0.5}>
                                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                Сотрудники и услуги
                                            </Typography>
                                            {groupedByService.length === 0 && (
                                                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                                                    Нет данных за выбранный период
                                                </Typography>
                                            )}
                                            <List dense sx={{ py: 0 }}>
                                                {groupedByService.map(emp => {
                                                    const isSelected = selectedServiceEmployee === emp.empName;
                                                    return (
                                                        <React.Fragment key={emp.empName}>
                                                            <ListItemButton
                                                                selected={isSelected}
                                                                onClick={() => {
                                                                    setSelectedServiceEmployee(isSelected ? null : emp.empName);
                                                                    setSelectedServiceName(null);
                                                                }}
                                                                sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                                                            >
                                                                <ListItemText
                                                                    primary={emp.empName}
                                                                    primaryTypographyProps={{ variant: "body2", sx: { fontWeight: isSelected ? 600 : 400 } }}
                                                                />
                                                                <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 10, px: 0.8, py: 0.2, fontSize: '0.75rem', fontWeight: 600, mr: 1, minWidth: 20, textAlign: 'center' }}>
                                                                    {emp.total}
                                                                </Box>
                                                                {isSelected ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                                                            </ListItemButton>
                                                            <Collapse in={isSelected} timeout="auto" unmountOnExit>
                                                                <Box sx={{ pl: 2, pb: 1 }}>
                                                                    <Stack spacing={0.5}>
                                                                        {emp.services.map(svc => {
                                                                            const isSvcSelected = selectedServiceName === svc.svcName;
                                                                            return (
                                                                            <Box
                                                                                key={svc.svcName}
                                                                                onClick={() => setSelectedServiceName(isSvcSelected ? null : svc.svcName)}
                                                                                sx={{
                                                                                    display: "flex",
                                                                                    alignItems: "center",
                                                                                    justifyContent: "space-between",
                                                                                    px: 1, py: 0.4,
                                                                                    borderRadius: 1,
                                                                                    cursor: "pointer",
                                                                                    bgcolor: isSvcSelected ? "primary.main" : "action.hover",
                                                                                    "&:hover": { bgcolor: isSvcSelected ? "primary.dark" : "action.selected" },
                                                                                }}
                                                                            >
                                                                                <Typography variant="body2" sx={{ color: isSvcSelected ? "primary.contrastText" : "text.secondary", flex: 1, mr: 1, fontSize: "0.78rem", fontWeight: isSvcSelected ? 600 : 400 }}>
                                                                                    {svc.svcName}
                                                                                </Typography>
                                                                                <Chip
                                                                                    label={svc.count}
                                                                                    size="small"
                                                                                    sx={{ height: 20, fontSize: "0.72rem", fontWeight: 700, minWidth: 28 }}
                                                                                />
                                                                            </Box>
                                                                            );
                                                                        })}
                                                                    </Stack>
                                                                </Box>
                                                            </Collapse>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </List>
                                        </Stack>
                                    )}
                                </Box>
                            </Paper>
                        </Grid2>

                        {/* MIDDLE COLUMN: LIST */}
                        <Grid2
                            size={{ xs: 12, md: 4 }}
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
                                        {filterMode === "services" && selectedServiceEmployee
                                            ? `${selectedServiceEmployee} (${displayList.length})`
                                            : `Список процедур (${displayList.length})`
                                        }
                                    </Typography>
                                </Box>
                                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                                        <AppointmentsList
                                            titleDate={selectedDate ? formatDateRu(selectedDate) : "Выбранный период"}
                                            loading={loading}
                                            errorMsg={null}
                                            items={displayList}
                                            onOpenFilters={handleOpenFilters}
                                            onItemClick={handleItemClick}
                                            doctors={doctors}
                                            onAddSlot={undefined}
                                            shifts={[]}
                                            hideDoctorFilter={true}
                                            selectedDoctorName={filterMode === "services" ? null : selectedEmployeeFilter}
                                        />
                                    </Box>
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
                                        onClose={handleCloseConclusion}
                                        onSaveSuccess={fetchData}
                                        hideCloseButton={false}
                                        onEditClick={handleOpenDrawer}
                                        readOnly={true}
                                    />
                                ) : (
                                    <AppointmentDetailsCard
                                        appointmentId={selectedId}
                                        onClose={handleCloseDetails}
                                        onUpdate={fetchData}
                                        showPaymentAction={false}
                                        readOnly={true}
                                        isConclusionVisible={conclusionOpen}
                                        onToggleConclusion={handleToggleConclusion}
                                    />
                                )}
                            </Grid2>
                        )}
                    </Grid2>
                </Box>

                {/* Mobile Sheet */}
                {isMobile && (
                    <AppBottomSheet open={!!selectedId} onClose={handleCloseDetails}>
                        <Box sx={{ p: 0, height: '80vh' }}>
                            {conclusionOpen ? (
                                <DoctorConclusionPanel
                                    appointmentId={selectedId!}
                                    onClose={handleCloseConclusion}
                                    onSaveSuccess={fetchData}
                                    hideCloseButton={false}
                                    onEditClick={handleOpenDrawer}
                                    readOnly={true}
                                />
                            ) : (
                                <AppointmentDetailsCard
                                    appointmentId={selectedId}
                                    onClose={handleCloseDetails}
                                    onUpdate={fetchData}
                                    showPaymentAction={false}
                                    readOnly={true}
                                    isConclusionVisible={conclusionOpen}
                                    onToggleConclusion={handleToggleConclusion}
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
        </Box >
    );
};

export default AllProceduresList;
