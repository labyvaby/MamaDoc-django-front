import React from "react";
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Container,
    CircularProgress,
    LinearProgress,
    Stack,
    IconButton,
    TextField,
    MenuItem,
    Grid2
} from "@mui/material";
import { usePermissions } from "../../hooks/usePermissions";
import { useSkudActions, WorkShift } from "../../hooks/useSkudActions";
import { useEmployees } from "../../hooks/useEmployees";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import { Tooltip } from "@mui/material";
import { supabase } from "../../utility/supabaseClient";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { useNotification } from "@refinedev/core";
import { usePageTitle } from "../../hooks/usePageTitle";
import ShiftFormSidebar from "../../components/schedule/ShiftFormSidebar";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import DjangoUnderConstructionPage from "../../components/routing/DjangoUnderConstructionPage";

dayjs.extend(duration);


const WorkShiftsPage: React.FC = () => {
    usePageTitle("СКУД");
    if (IS_DJANGO_BACKEND) return <DjangoUnderConstructionPage title="СКУД в разработке" />;
    const { open: notify } = useNotification();
    const { isAdmin, isSuperAdmin } = usePermissions();
    const { employees } = useEmployees();

    // Default to current month
    const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string | null>(null);
    const [startDate, setStartDate] = React.useState<string>(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = React.useState<string>(dayjs().endOf('month').format('YYYY-MM-DD'));

    const {
        shifts,
        loading,
        isFetching,
        currentUserEmployeeId,
        actionLoading,
        effectiveAllowedIp,
        isIpCorrect,
        currentShift,
        fetchShifts,
        handleStartShift,
        handleEndShift,
        isNightShiftTime
    } = useSkudActions(true, selectedEmployeeId, startDate, endDate); // Enable history fetching with filters

    const { confirm, ConfirmDialog } = useConfirmDialog();

    // Memoize sorted employees to prevent mutation and re-sorting on every render
    const sortedEmployees = React.useMemo(() => {
        return [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name));
    }, [employees]);

    // Pre-calculate shift data to avoid expensive dayjs operations during render for both mobile and desktop
    const processedShifts = React.useMemo(() => {
        return shifts.map(shift => {
            const clockIn = dayjs(shift.clock_in);
            const clockOut = shift.clock_out ? dayjs(shift.clock_out) : null;

            const dayStr = clockIn.format("DD.MM.YYYY");
            const shortDayStr = clockIn.format("DD.MM");
            const timeStart = clockIn.format("HH:mm");
            const timeEnd = clockOut ? clockOut.format("HH:mm") : "—";

            const diffHours = clockOut ? clockOut.diff(clockIn, 'hour', true) : 0;
            const isAnomalous = diffHours > 36;

            const isNight = (shift.is_night_shift !== undefined && shift.is_night_shift !== null)
                ? shift.is_night_shift
                : isNightShiftTime(shift.clock_in);

            let durationStr = "Активна";
            if (clockOut) {
                const diffMs = clockOut.diff(clockIn);
                const dur = dayjs.duration(diffMs);
                const totalHours = Math.floor(dur.asHours());
                const minutes = dur.minutes().toString().padStart(2, '0');
                const seconds = dur.seconds().toString().padStart(2, '0');
                durationStr = `${totalHours}:${minutes}:${seconds}`;
            }

            return {
                ...shift,
                dayStr,
                shortDayStr,
                timeStart,
                timeEnd,
                diffHours,
                isAnomalous,
                isNight,
                durationStr
            };
        });
    }, [shifts, isNightShiftTime]);


    // Edit Modal State
    const [editSidebarOpen, setEditSidebarOpen] = React.useState(false);
    const [shiftToEdit, setShiftToEdit] = React.useState<any>(null); // Use existing type or relax it

    // Edit Handlers
    const handleEditClick = (shift: WorkShift) => {
        // Prepare shift for form: needs startDate, endDate, start_time, end_time split from ISO
        const start = dayjs(shift.clock_in);
        const end = shift.clock_out ? dayjs(shift.clock_out) : dayjs(shift.clock_in).add(9, 'hour'); // Default if active

        const prepared = {
            id: shift.id,
            employes_id: shift.employee_id,
            startDate: start.format('YYYY-MM-DD'),
            endDate: end.format('YYYY-MM-DD'),
            start_time: start.format('HH:mm'),
            end_time: shift.clock_out ? end.format('HH:mm') : null,
            is_night_shift: shift.is_night_shift
        };

        setShiftToEdit(prepared);
        setEditSidebarOpen(true);
    };

    const handleEditSuccess = async (data: any) => {
        // data comes from ShiftForm onSuccess
        // { employes_id, startDate, endDate, start_time, end_time, is_night_shift }
        try {
            const clockInISO = `${data.startDate}T${data.start_time}:00`;
            const clockOutISO = data.end_time ? `${data.endDate}T${data.end_time}:00` : null;

            const { error } = await supabase
                .from("WorkShifts")
                .update({
                    employee_id: data.employes_id,
                    clock_in: new Date(clockInISO).toISOString(),
                    clock_out: clockOutISO ? new Date(clockOutISO).toISOString() : null,
                    is_night_shift: data.is_night_shift,
                })
                .eq("id", shiftToEdit.id);

            if (error) throw error;

            notify?.({ type: "success", message: "Смена обновлена" });
            fetchShifts();
            setEditSidebarOpen(false); // Close sidebar after edit
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка обновления смены" });
        }
    };

    const handleAddClick = () => {
        setShiftToEdit(null);
        setEditSidebarOpen(true);
    };

    const handleCreateSuccess = async (data: any) => {
        try {
            const clockInISO = `${data.startDate}T${data.start_time}:00`;
            const clockOutISO = data.end_time ? `${data.endDate}T${data.end_time}:00` : null;

            const { error } = await supabase
                .from("WorkShifts")
                .insert({
                    employee_id: data.employes_id,
                    clock_in: new Date(clockInISO).toISOString(),
                    clock_out: clockOutISO ? new Date(clockOutISO).toISOString() : null,
                    is_night_shift: data.is_night_shift,
                });

            if (error) throw error;

            notify?.({ type: "success", message: "Смена добавлена" });
            fetchShifts();
            setEditSidebarOpen(false); // Close sidebar after create
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка добавления смены" });
        }
    };

    const handleDeleteShift = async (shift: WorkShift) => {
        const date = dayjs(shift.clock_in).format("DD.MM.YYYY HH:mm");
        const employee = shift.employee?.full_name ?? "";
        const confirmed = await confirm({
            title: "Удалить смену?",
            message: `Смена от ${date}${employee ? ` (${employee})` : ""} будет удалена без возможности восстановления.`,
            confirmText: "Удалить",
            cancelText: "Отмена",
            variant: "error",
        });
        if (!confirmed) return;

        try {
            const { error } = await supabase.from("WorkShifts").delete().eq("id", shift.id);
            if (error) throw error;
            notify?.({ type: "success", message: "Смена удалена" });
            fetchShifts();
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка удаления смены" });
        }
    };

    const formatDuration = (start: string, end?: string | null) => {
        if (!end) return "Активна";
        const diff = dayjs(end).diff(dayjs(start));
        const dur = dayjs.duration(diff);
        const totalHours = Math.floor(dur.asHours());
        const minutes = dur.minutes().toString().padStart(2, '0');
        const seconds = dur.seconds().toString().padStart(2, '0');

        return `${totalHours}:${minutes}:${seconds}`;
    };

    return (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* ═══ STICKY TOP ZONE ═══ */}
            <Box sx={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                bgcolor: "background.default",
                borderBottom: "1px solid",
                borderColor: "divider",
                flexShrink: 0,
            }}>
                <Container maxWidth="lg" sx={{ pt: 1, pb: 1 }}>
                    {/* Status bar — compact row on mobile */}
                    {currentUserEmployeeId ? (
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                            <Box sx={{ minWidth: 0 }}>
                                {/* IP warning */}
                                {!effectiveAllowedIp && (
                                    <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
                                        IP не настроен
                                    </Typography>
                                )}
                                {effectiveAllowedIp && !isIpCorrect && (
                                    <Typography variant="caption" sx={{ color: 'error.main', display: 'block' }}>
                                        Не в офисном Wi-Fi
                                    </Typography>
                                )}
                                {currentShift ? (
                                    <Chip
                                        icon={<AccessTimeIcon />}
                                        label={`Активна с ${dayjs(currentShift.clock_in).format('HH:mm')}`}
                                        color="success"
                                        size="small"
                                        variant="outlined"
                                    />
                                ) : (
                                    <Chip label="Смена не начата" size="small" color="default" variant="outlined" />
                                )}
                            </Box>
                            <Box sx={{ flexShrink: 0 }}>
                                {!currentShift ? (
                                    <Button
                                        variant="contained"
                                        color="success"
                                        size="small"
                                        startIcon={<PlayArrowIcon />}
                                        onClick={handleStartShift}
                                        disabled={actionLoading || !isIpCorrect}
                                    >
                                        Начать
                                    </Button>
                                ) : (
                                    <Button
                                        variant="contained"
                                        color="error"
                                        size="small"
                                        startIcon={<StopIcon />}
                                        onClick={handleEndShift}
                                        disabled={actionLoading}
                                    >
                                        Завершить
                                    </Button>
                                )}
                            </Box>
                        </Stack>
                    ) : (
                        !loading && (
                            <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mb: 1 }}>
                                Аккаунт не связан с карточкой сотрудника
                            </Typography>
                        )
                    )}

                    {/* Filters Row */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        {isAdmin() && (
                            <TextField
                                select
                                size="small"
                                label="Сотрудник"
                                value={selectedEmployeeId ?? ""}
                                onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
                                sx={{ flex: '1 1 160px', minWidth: 0 }}
                            >
                                <MenuItem value="">Все</MenuItem>
                                {sortedEmployees.map((emp) => (
                                    <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>
                                ))}
                            </TextField>
                        )}
                        <TextField
                            type="date"
                            size="small"
                            label="От"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{ flex: '1 1 130px', minWidth: 0 }}
                        />
                        <TextField
                            type="date"
                            size="small"
                            label="До"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{ flex: '1 1 130px', minWidth: 0 }}
                        />
                        {isAdmin() && (
                            <Button
                                variant="contained"
                                size="small"
                                onClick={handleAddClick}
                                sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                            >
                                + Добавить
                            </Button>
                        )}
                    </Stack>
                </Container>
                {isFetching && !loading && (
                    <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, transform: 'translateY(100%)' }}>
                        <LinearProgress sx={{ height: 2 }} />
                    </Box>
                )}
            </Box>

            {/* ═══ SCROLLABLE LIST ═══ */}
            <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0, position: 'relative' }}>
                <Container maxWidth="lg" sx={{ pt: 1.5, pb: { xs: 12, md: 4 } }}>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : shifts.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">История пуста</Typography>
                        </Paper>
                    ) : (
                        <>
                            {/* Desktop table (md+) */}
                            <TableContainer component={Paper} variant="outlined" elevation={0} sx={{ display: { xs: 'none', md: 'block' } }}>
                                <Table stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Дата</TableCell>
                                            <TableCell>Режим</TableCell>
                                            {isAdmin() && <TableCell>Сотрудник</TableCell>}
                                            <TableCell>Начало</TableCell>
                                            <TableCell>Конец</TableCell>
                                            <TableCell>Длительность</TableCell>
                                            <TableCell>Статус</TableCell>
                                            {isAdmin() && <TableCell align="right">Действия</TableCell>}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(() => {
                                            let currentDayStr = "";

                                            return processedShifts.map((shift) => {
                                                const isNewDay = shift.dayStr !== currentDayStr;
                                                if (isNewDay) currentDayStr = shift.dayStr;

                                                return (
                                                    <React.Fragment key={shift.id}>
                                                        {isNewDay && (
                                                            <TableRow
                                                                sx={{
                                                                    position: "sticky",
                                                                    top: 56,
                                                                    zIndex: 2,
                                                                    bgcolor: "background.default",
                                                                }}
                                                            >
                                                                <TableCell
                                                                    colSpan={isAdmin() ? 8 : 6}
                                                                    sx={{
                                                                        py: 1,
                                                                        fontWeight: 600,
                                                                        borderBottom: "1px solid",
                                                                        borderColor: "divider",
                                                                        color: "text.primary",
                                                                        bgcolor: "background.default",
                                                                    }}
                                                                >
                                                                    {shift.dayStr}
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                        <TableRow hover>
                                                            <TableCell>
                                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                                    <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.5, mr: 0.5 }}>
                                                                        {shift.shortDayStr}
                                                                    </Typography>
                                                                    {shift.isAnomalous && (
                                                                        <Tooltip title="Аномальная длительность (> 36ч)">
                                                                            <ReportProblemIcon sx={{ color: 'error.main', fontSize: '1rem' }} />
                                                                        </Tooltip>
                                                                    )}
                                                                </Box>
                                                            </TableCell>
                                                            <TableCell>
                                                                {shift.isNight ? (
                                                                    <NightlightOutlined
                                                                        sx={{ color: 'warning.main' }}
                                                                        titleAccess="Ночная смена"
                                                                    />
                                                                ) : (
                                                                    <WbSunnyOutlined
                                                                        sx={{ color: 'primary.main' }}
                                                                        titleAccess="Дневная смена"
                                                                    />
                                                                )}
                                                            </TableCell>
                                                            {isAdmin() && <TableCell>{shift.employee?.full_name || shift.employee_id}</TableCell>}
                                                            <TableCell>{shift.timeStart}</TableCell>
                                                            <TableCell>{shift.timeEnd}</TableCell>
                                                            <TableCell>{shift.durationStr}</TableCell>
                                                            <TableCell>
                                                                {(() => {
                                                                    if (!shift.clock_out) return <Chip label="Активна" color="success" size="small" />;
                                                                    if (shift.isAnomalous) return <Chip label="Аномально" color="error" size="small" />;
                                                                    return <Chip label="Завершено" color="info" size="small" />;
                                                                })()}
                                                            </TableCell>
                                                            {isAdmin() && (
                                                                <TableCell align="right">
                                                                    <IconButton size="small" onClick={() => handleEditClick(shift as WorkShift)} title="Редактировать">
                                                                        <EditOutlined fontSize="small" />
                                                                    </IconButton>
                                                                    {isSuperAdmin() && (
                                                                        <IconButton size="small" color="error" onClick={() => handleDeleteShift(shift as WorkShift)} title="Удалить">
                                                                            <DeleteOutline fontSize="small" />
                                                                        </IconButton>
                                                                    )}
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    </React.Fragment>
                                                );
                                            });
                                        })()}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {/* Mobile/tablet cards (xs, sm) */}
                            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                {(() => {
                                    let currentDayStr = "";
                                    return processedShifts.map((shift) => {
                                        const isNewDay = shift.dayStr !== currentDayStr;
                                        if (isNewDay) currentDayStr = shift.dayStr;

                                        const statusChip = !shift.clock_out
                                            ? <Chip label="Активна" color="success" size="small" />
                                            : shift.isAnomalous
                                                ? <Chip label="Аномально" color="error" size="small" />
                                                : <Chip label="Завершено" color="info" size="small" />;

                                        return (
                                            <React.Fragment key={shift.id}>
                                                {isNewDay && (
                                                    <Typography
                                                        variant="caption"
                                                        fontWeight={700}
                                                        color="text.secondary"
                                                        sx={{
                                                            display: 'block',
                                                            mt: 2,
                                                            mb: 0.5,
                                                            px: 0.5,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: 0.5,
                                                        }}
                                                    >
                                                        {shift.dayStr}
                                                    </Typography>
                                                )}
                                                <Card variant="outlined" sx={{ mb: 1 }}>
                                                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                                <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                                                                    {shift.isNight ? (
                                                                        <NightlightOutlined sx={{ color: 'warning.main', fontSize: '1rem' }} />
                                                                    ) : (
                                                                        <WbSunnyOutlined sx={{ color: 'primary.main', fontSize: '1rem' }} />
                                                                    )}
                                                                    <Typography variant="body2" fontWeight={600}>
                                                                        {shift.timeStart} — {shift.timeEnd === "—" ? "активна" : shift.timeEnd}
                                                                    </Typography>
                                                                    {shift.isAnomalous && (
                                                                        <Tooltip title="Аномальная длительность (> 36ч)">
                                                                            <ReportProblemIcon sx={{ color: 'error.main', fontSize: '1rem' }} />
                                                                        </Tooltip>
                                                                    )}
                                                                </Stack>

                                                                <Stack direction="row" spacing={2} flexWrap="wrap">
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        Длительность: <strong>{shift.durationStr}</strong>
                                                                    </Typography>
                                                                    {isAdmin() && shift.employee?.full_name && (
                                                                        <Typography variant="caption" color="text.secondary" noWrap>
                                                                            {shift.employee.full_name}
                                                                        </Typography>
                                                                    )}
                                                                </Stack>
                                                            </Box>

                                                            <Stack direction="row" alignItems="center" spacing={0.5} ml={1} sx={{ flexShrink: 0 }}>
                                                                {statusChip}
                                                                {isAdmin() && (
                                                                    <IconButton size="small" onClick={() => handleEditClick(shift as WorkShift)}>
                                                                        <EditOutlined fontSize="small" />
                                                                    </IconButton>
                                                                )}
                                                                {isSuperAdmin() && (
                                                                    <IconButton size="small" color="error" onClick={() => handleDeleteShift(shift as WorkShift)}>
                                                                        <DeleteOutline fontSize="small" />
                                                                    </IconButton>
                                                                )}
                                                            </Stack>
                                                        </Stack>
                                                    </CardContent>
                                                </Card>
                                            </React.Fragment>
                                        );
                                    });
                                })()}
                            </Box>
                        </>
                    )}
                </Container>
            </Box>
            {/* ══════════════════════ */}

            {/* Edit Drawer */}
            <ShiftFormSidebar
                isOpen={editSidebarOpen}
                onClose={() => setEditSidebarOpen(false)}
                onSuccess={shiftToEdit ? handleEditSuccess : handleCreateSuccess}
                shiftToEdit={shiftToEdit}
            />
            <ConfirmDialog />
        </Box>
    );
};

export default WorkShiftsPage;
