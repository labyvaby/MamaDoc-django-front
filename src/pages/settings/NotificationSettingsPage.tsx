import React, { useEffect, useState } from "react";
import {
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    TextField,
    Typography,
    Alert,
    Snackbar,
    CircularProgress,
    FormControlLabel,
    Switch,
    Stack,
    Divider,
    IconButton,
    Tooltip,
    InputAdornment,
    Tabs,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Pagination,
    Chip
} from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import HelpOutline from "@mui/icons-material/HelpOutline";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { supabase } from "../../utility/supabaseClient";
import { usePermissions } from "../../hooks/usePermissions";
import { Navigate } from "react-router";
import { formatDateRu } from "../../utility/format";
import dayjs from "dayjs";

export const NotificationSettingsPage: React.FC = () => {
    const { isSuperAdmin, loading: authLoading } = usePermissions();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [activeTab, setActiveTab] = useState(0);

    const [settings, setSettings] = useState({
        notification_enabled: "false",
        notification_created_interval: "10",
        notification_reminder_interval: "120",
        notification_created_10m_template: "",
        notification_reminder_2h_template: "",
        notification_appointment_change_template: "",
        notification_appointment_cancel_template: ""
    });

    useEffect(() => {
        if (isSuperAdmin()) {
            fetchSettings();
        }
    }, [isSuperAdmin]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("app_settings")
                .select("key, value")
                .in("key", [
                    "notification_enabled",
                    "notification_created_interval",
                    "notification_reminder_interval",
                    "notification_created_10m_template",
                    "notification_reminder_2h_template",
                    "notification_appointment_change_template",
                    "notification_appointment_cancel_template"
                ]);

            if (error) {
                console.error("Error fetching settings:", error);
            }

            if (data) {
                const newSettings = { ...settings };
                data.forEach(item => {
                    if (item.key in newSettings) {
                        (newSettings as any)[item.key] = item.value || "";
                    }
                });
                setSettings(newSettings);
            }
        } catch (err) {
            console.error("Unexpected error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const upsertData = Object.entries(settings).map(([key, value]) => ({
                key,
                value: String(value),
                description: key === 'notification_enabled' ? 'Глобальный переключатель SMS-уведомлений' :
                    key === 'notification_created_interval' ? 'Интервал после создания (мин)' :
                        key === 'notification_reminder_interval' ? 'Интервал перед приемом (мин)' :
                            key === 'notification_created_10m_template' ? 'Шаблон уведомления после создания' :
                            key === 'notification_reminder_2h_template' ? 'Шаблон напоминания перед приёмом' :
                            key === 'notification_appointment_change_template' ? 'Шаблон уведомления об изменении приёма' :
                                'Шаблон уведомления об отмене приёма'
            }));

            const { error } = await supabase
                .from("app_settings")
                .upsert(upsertData);

            if (error) throw error;

            setMessage({ type: "success", text: "Настройки уведомлений успешно сохранены" });
        } catch (err) {
            console.error("Error saving settings:", err);
            setMessage({ type: "error", text: "Ошибка при сохранении настроек" });
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    if (!isSuperAdmin()) {
        return <Navigate to="/access-denied" replace />;
    }

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: "auto", height: "100%", display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h4" gutterBottom fontWeight={700}>
                    Уведомления
                </Typography>
                <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab icon={<SettingsOutlined fontSize="small" />} iconPosition="start" label="Настройки" />
                    <Tab icon={<HistoryOutlined fontSize="small" />} iconPosition="start" label="История отправок" />
                </Tabs>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', pb: 5 }}>
                {activeTab === 0 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardHeader
                                title="Глобальные настройки"
                                subheader="Общее управление системой уведомлений"
                            />
                            <Divider />
                            <CardContent>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={settings.notification_enabled === "true"}
                                            onChange={(e) => setSettings(prev => ({ ...prev, notification_enabled: e.target.checked ? "true" : "false" }))}
                                            color="primary"
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography variant="body1" fontWeight={600}>
                                                SMS-уведомления включены
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Если выключено, SMS не будут отправляться никому
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader
                                title="Тайминги и шаблоны"
                                subheader="Настройте время отправки и текст SMS"
                                action={
                                    <Tooltip title="Доступные переменные: {{patient_name}}, {{appointment_date}}, {{doctor_name}}">
                                        <IconButton size="small">
                                            <HelpOutline />
                                        </IconButton>
                                    </Tooltip>
                                }
                            />
                            <Divider />
                            <CardContent>
                                <Stack spacing={4}>
                                    <Box>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
                                                1. Подтверждение записи
                                            </Typography>
                                            <TextField
                                                size="small"
                                                label="Отправить через"
                                                value={settings.notification_created_interval}
                                                onChange={(e) => setSettings(prev => ({ ...prev, notification_created_interval: e.target.value.replace(/\D/g, '') }))}
                                                sx={{ width: { xs: '100%', sm: 160 } }}
                                                InputProps={{
                                                    endAdornment: <InputAdornment position="end">мин.</InputAdornment>,
                                                    startAdornment: (
                                                        <InputAdornment position="start">
                                                            <TimerOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
                                                        </InputAdornment>
                                                    )
                                                }}
                                            />
                                        </Stack>
                                        <TextField
                                            fullWidth
                                            multiline
                                            rows={3}
                                            placeholder="Текст уведомления..."
                                            value={settings.notification_created_10m_template}
                                            onChange={(e) => setSettings(prev => ({ ...prev, notification_created_10m_template: e.target.value }))}
                                            helperText="Отправляется спустя указанное время после записи пациента"
                                        />
                                    </Box>

                                    <Divider />

                                    <Box>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
                                                2. Напоминание о приеме
                                            </Typography>
                                            <TextField
                                                size="small"
                                                label="Отправить за"
                                                value={settings.notification_reminder_interval}
                                                onChange={(e) => setSettings(prev => ({ ...prev, notification_reminder_interval: e.target.value.replace(/\D/g, '') }))}
                                                sx={{ width: { xs: '100%', sm: 160 } }}
                                                InputProps={{
                                                    endAdornment: <InputAdornment position="end">мин.</InputAdornment>,
                                                    startAdornment: (
                                                        <InputAdornment position="start">
                                                            <TimerOutlined fontSize="small" sx={{ color: 'text.secondary' }} />
                                                        </InputAdornment>
                                                    )
                                                }}
                                            />
                                        </Stack>
                                        <TextField
                                            fullWidth
                                            multiline
                                            rows={3}
                                            placeholder="Текст напоминания..."
                                            value={settings.notification_reminder_2h_template}
                                            onChange={(e) => setSettings(prev => ({ ...prev, notification_reminder_2h_template: e.target.value }))}
                                            helperText="Отправляется за указанное количество минут до начала приема (120 мин = 2 часа)"
                                        />
                                    </Box>

                                    <Divider />

                                    <Box>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
                                                3. Изменение приёма
                                            </Typography>
                                            <Tooltip title="Задержка берётся из пункта 1 (Подтверждение записи)">
                                                <Chip
                                                    size="small"
                                                    icon={<TimerOutlined fontSize="small" />}
                                                    label={`Через ${settings.notification_created_interval} мин.`}
                                                    variant="outlined"
                                                    sx={{ alignSelf: 'center' }}
                                                />
                                            </Tooltip>
                                        </Stack>
                                        <TextField
                                            fullWidth
                                            multiline
                                            rows={3}
                                            placeholder="Текст уведомления об изменении..."
                                            value={settings.notification_appointment_change_template}
                                            onChange={(e) => setSettings(prev => ({ ...prev, notification_appointment_change_template: e.target.value }))}
                                            helperText="Отправляется если время приёма было изменено. Переменные: {{patient_name}}, {{doctor_name}}, {{appointment_date}}"
                                        />
                                    </Box>

                                    <Divider />

                                    <Box>
                                        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                            4. Отмена приёма
                                        </Typography>
                                        <TextField
                                            fullWidth
                                            multiline
                                            rows={3}
                                            placeholder="Текст уведомления об отмене..."
                                            value={settings.notification_appointment_cancel_template}
                                            onChange={(e) => setSettings(prev => ({ ...prev, notification_appointment_cancel_template: e.target.value }))}
                                            helperText="Отправляется при отмене приёма. Переменные: {{patient_name}}, {{doctor_name}}, {{appointment_date}}"
                                        />
                                    </Box>
                                </Stack>
                            </CardContent>
                        </Card>

                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                size="large"
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveOutlined />}
                                onClick={handleSave}
                                disabled={loading || saving}
                            >
                                {saving ? "Сохранение..." : "Сохранить изменения"}
                            </Button>
                        </Box>
                    </Stack>
                )}

                {activeTab === 1 && <NotificationHistoryView />}
            </Box>

            <Snackbar
                open={!!message}
                autoHideDuration={6000}
                onClose={() => setMessage(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert
                    onClose={() => setMessage(null)}
                    severity={message?.type || "info"}
                    sx={{ width: "100%" }}
                >
                    {message?.text}
                </Alert>
            </Snackbar>
        </Box>
    );
};

const NotificationHistoryView: React.FC = () => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const pageSize = 50;

    useEffect(() => {
        fetchHistory();
    }, [page]);

    const fetchHistory = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const { data: notifData, error: notifError, count } = await supabase
                .from("appointment_notifications")
                .select("*", { count: 'exact' })
                .order("sent_at", { ascending: false })
                .range((page - 1) * pageSize, page * pageSize - 1);

            if (notifError) {
                setFetchError(notifError.message);
                throw notifError;
            }

            let enrichedData: any[] = [];

            if (notifData && notifData.length > 0) {
                // Fetch Appointments
                const aptIds = [...new Set(notifData.map(n => n.appointment_id).filter(Boolean))];
                let aptsMap: Record<string, any> = {};

                if (aptIds.length > 0) {
                    const { data: aptsData } = await supabase
                        .from("Appointments")
                        .select("id, appointment_at, patient_id")
                        .in("id", aptIds);

                    if (aptsData) {
                        aptsMap = aptsData.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {});
                    }
                }

                // Fetch Patients
                const patientIds = [...new Set(Object.values(aptsMap).map((a: any) => a.patient_id).filter(Boolean))];
                let patientsMap: Record<string, any> = {};

                if (patientIds.length > 0) {
                    const { data: patientsData } = await supabase
                        .from("Patients")
                        .select("id, full_name, phone")
                        .in("id", patientIds);

                    if (patientsData) {
                        patientsMap = patientsData.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {});
                    }
                }

                // Merge data to match the UI's expected structure
                enrichedData = notifData.map(n => {
                    const apt = aptsMap[n.appointment_id];
                    let patient = null;
                    if (apt && apt.patient_id) {
                        patient = patientsMap[apt.patient_id];
                    }
                    return {
                        ...n,
                        Appointments: apt ? {
                            appointment_at: apt.appointment_at,
                            Patients: patient ? {
                                full_name: patient.full_name,
                                phone: patient.phone
                            } : null
                        } : null
                    };
                });
            }

            setHistory(enrichedData);
            setTotalCount(count || 0);
        } catch (err: any) {
            console.error("Error fetching notification history:", err);
            if (!fetchError && err.message) {
                setFetchError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    if (loading && page === 1) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    return (
        <Stack spacing={2}>
            {fetchError && (
                <Alert severity="error">
                    Ошибка при загрузке истории: {fetchError}
                </Alert>
            )}
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Дата отправки</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Пациент</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Тип</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Прием (Дата)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {history.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 10 }}>
                                    <Box sx={{ color: 'text.secondary', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                        <InfoOutlined />
                                        <Typography>История уведомлений пуста</Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ) : (
                            history.map((item) => (
                                <TableRow key={item.id} hover>
                                    <TableCell>
                                        {item.sent_at ? dayjs(item.sent_at).format('DD.MM.YYYY HH:mm') : '-'}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            {item.Appointments?.Patients?.full_name || 'Неизвестно'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {item.Appointments?.Patients?.phone || '-'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={
                                                item.notification_type === 'created_10m' ? 'Подтверждение' :
                                                item.notification_type === 'reminder_2h' ? 'Напоминание' :
                                                item.notification_type === 'appointment_change' ? 'Изменение приёма' :
                                                item.notification_type === 'appointment_cancel' ? 'Отмена приёма' :
                                                item.notification_type
                                            }
                                            size="small"
                                            color={
                                                item.notification_type === 'created_10m' ? 'primary' :
                                                item.notification_type === 'reminder_2h' ? 'secondary' :
                                                item.notification_type === 'appointment_cancel' ? 'error' :
                                                'warning'
                                            }
                                            variant="outlined"
                                            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {item.Appointments?.appointment_at ? dayjs(item.Appointments.appointment_at).format('DD.MM.YYYY HH:mm') : '-'}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {totalCount > pageSize && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <Pagination
                        count={Math.ceil(totalCount / pageSize)}
                        page={page}
                        onChange={(_, v) => setPage(v)}
                        color="primary"
                    />
                </Box>
            )}
        </Stack>
    );
};
