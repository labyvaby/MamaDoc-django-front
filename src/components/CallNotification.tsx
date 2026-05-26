import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../utility/supabaseClient';
import { usePermissions } from '../hooks/usePermissions';
import {
    Paper,
    Typography,
    Box,
    IconButton,
    Button,
    Slide,
    useTheme,
    alpha,
    Avatar,
    Chip,
    Skeleton,
    Divider,
} from '@mui/material';
import {
    PhoneInTalk as PhoneInTalkIcon,
    History as HistoryIcon,
    ChevronRight as ChevronRightIcon,
    Close as CloseIcon,
    PersonAdd as PersonAddIcon,
    EventAvailable as EventAvailableIcon,
    CalendarMonth as CalendarMonthIcon,
    MedicalServices as MedicalServicesIcon,
    Phone as PhoneIcon,
    AccessTime as AccessTimeIcon,
} from '@mui/icons-material';
import { HistoryRow } from '../types/models';
import Dayjs from 'dayjs';
import { IS_DJANGO_BACKEND } from '../config/backend';

interface IncomingCall {
    id: string;
    phone: string;
    patient_id?: string;
    is_known: boolean;
    caller_name?: string;
    created_at: string;
}

const CallNotificationItem: React.FC<{
    call: IncomingCall;
    onClose: (id: string) => void;
}> = ({ call: initialCall, onClose }) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [call, setCall] = useState<IncomingCall>(initialCall);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Fetch patient info and history when a call with patient_id is received
    useEffect(() => {
        if (call.patient_id) {
            const pId = call.patient_id;

            // Fetch Caller Name if missing
            if (call.is_known && !call.caller_name) {
                supabase
                    .from('Patients')
                    .select('*')
                    .eq('id', pId)
                    .maybeSingle()
                    .then(({ data, error }) => {
                        if (error) console.error("CallNotification: Error fetching patient:", error);
                        if (data) {
                            const name = data.full_name || data['full_name'] || data['Full Name'] || data['ФИО'] || data['Пациент ФИО'] || data.fio || (data as any).full_name;
                            if (name) {
                                setCall(prev => ({ ...prev, caller_name: name }));
                            }
                        }
                    });
            }

            // Fetch Last 3 Appointments
            setLoadingHistory(true);
            supabase
                .from('AppointmentsAggregated')
                .select('*')
                .eq('patient_id', pId)
                .order('appointment_at', { ascending: false })
                .limit(3)
                .then(({ data, error }) => {
                    setLoadingHistory(false);
                    if (error) {
                        console.error("CallNotification: Error fetching history:", error);
                        return;
                    }
                    if (data) {
                        const hist: HistoryRow[] = (data as any[]).map(r => ({
                            ...r,
                            ID: String(r.id || r.ID || r["Прием ID"] || ""),
                            "Дата и время": String(r.formatted_date || r.appointment_at || ""),
                            "Доктор ФИО": r.doctor_name || r["Доктор ФИО"] || r["Доктор"] || "",
                            Услуга: r.service_names || r["Услуга"] || "",
                            Статус: r.status || r["Статус"] || ""
                        }));
                        setHistory(hist);
                    }
                });
        }
    }, [call.patient_id, call.is_known]);

    const handleCreateAppointment = () => {
        if (call.patient_id) {
            navigate(`/home?create_appointment=true&patient_id=${call.patient_id}`);
        }
    };

    const handleCreatePatient = () => {
        navigate(`/patient-search?create_patient=true&phone=${call.phone}`);
    };

    // Known patient = green, Unknown = blue (was orange)
    const isKnown = call.is_known;
    const accentColor = isKnown ? theme.palette.success.main : theme.palette.info.main;
    const accentLight = isKnown ? alpha(theme.palette.success.main, 0.08) : alpha(theme.palette.info.main, 0.08);
    const accentBg = isKnown ? alpha(theme.palette.success.main, 0.12) : alpha(theme.palette.info.main, 0.12);

    // Get initials from caller name
    const getInitials = (name?: string) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0][0]?.toUpperCase() || '?';
    };

    // Format phone nicely
    const formatPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 12) {
            return `+${cleaned.slice(0, 3)} (${cleaned.slice(3, 6)}) ${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
        }
        return phone;
    };

    return (
        <Paper
            elevation={12}
            sx={{
                mb: 2,
                overflow: 'hidden',
                borderRadius: 4,
                border: `1.5px solid ${alpha(accentColor, 0.3)}`,
                backdropFilter: 'blur(20px)',
                background: alpha(theme.palette.background.paper, 0.97),
                width: '100%',
                flexShrink: 0
            }}
        >
            {/* Animated top accent bar */}
            <Box
                sx={{
                    height: 3,
                    background: `linear-gradient(90deg, ${accentColor}, ${alpha(accentColor, 0.4)}, ${accentColor})`,
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s ease-in-out infinite',
                }}
            />

            {/* Header */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                pt: 1.5,
                pb: 1,
            }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <Box
                        sx={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            bgcolor: accentBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <PhoneInTalkIcon sx={{ fontSize: 16, color: accentColor, animation: 'pulse 1.5s infinite' }} />
                    </Box>
                    <Typography variant="caption" sx={{ color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.7rem' }}>
                        {isKnown ? "Входящий звонок" : "Новый номер"}
                    </Typography>
                </Box>
                <IconButton
                    size="small"
                    onClick={() => onClose(call.id)}
                    sx={{
                        width: 28,
                        height: 28,
                        bgcolor: alpha(theme.palette.text.primary, 0.05),
                        '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) },
                    }}
                >
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            {/* Main content */}
            <Box sx={{ px: 2, pb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar
                    sx={{
                        width: 52,
                        height: 52,
                        bgcolor: accentBg,
                        color: accentColor,
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        border: `2px solid ${alpha(accentColor, 0.3)}`,
                    }}
                >
                    {isKnown ? getInitials(call.caller_name) : <PersonAddIcon sx={{ fontSize: 24 }} />}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {isKnown ? (
                        <>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, color: theme.palette.text.primary }}>
                                {call.caller_name || <Skeleton width={160} />}
                            </Typography>
                            <Box display="flex" alignItems="center" gap={0.5} mt={0.25}>
                                <PhoneIcon sx={{ fontSize: 13, color: theme.palette.text.disabled }} />
                                <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 500, fontSize: '0.85rem' }}>
                                    {formatPhone(call.phone)}
                                </Typography>
                            </Box>
                        </>
                    ) : (
                        <>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, color: theme.palette.text.primary, fontSize: '1.15rem' }}>
                                {formatPhone(call.phone)}
                            </Typography>
                            <Chip
                                label="Пациент не найден"
                                size="small"
                                sx={{
                                    mt: 0.5,
                                    height: 22,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    bgcolor: alpha(theme.palette.info.main, 0.1),
                                    color: theme.palette.info.main,
                                    border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
                                }}
                            />
                        </>
                    )}
                </Box>
            </Box>

            {/* History Section for known patients */}
            {isKnown && (
                <>
                    <Divider />
                    <Box sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                        <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <HistoryIcon sx={{ fontSize: 15, color: theme.palette.text.disabled }} />
                            <Typography variant="caption" sx={{ fontWeight: 700, color: theme.palette.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>
                                Последние визиты
                            </Typography>
                        </Box>

                        <Box sx={{ px: 1.5, pb: 1 }}>
                            {loadingHistory ? (
                                <Box sx={{ px: 0.5, py: 0.5 }}>
                                    {[1, 2].map(i => (
                                        <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 0.5, borderRadius: 2 }} />
                                    ))}
                                </Box>
                            ) : history.length > 0 ? (
                                history.map((h, index) => (
                                    <Box
                                        key={h.ID}
                                        onClick={() => {
                                            navigate(`/home?appointment_id=${h.ID}`);
                                        }}
                                        sx={{
                                            px: 1.5,
                                            py: 1,
                                            mb: index === history.length - 1 ? 0 : 0.5,
                                            borderRadius: 2,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1.5,
                                            transition: 'all 0.15s ease',
                                            '&:hover': {
                                                bgcolor: alpha(accentColor, 0.06),
                                                transform: 'translateX(2px)',
                                            }
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 2,
                                                bgcolor: accentLight,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <CalendarMonthIcon sx={{ fontSize: 16, color: accentColor }} />
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Box display="flex" alignItems="center" gap={0.5}>
                                                <AccessTimeIcon sx={{ fontSize: 12, color: theme.palette.text.disabled }} />
                                                <Typography variant="caption" sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: '0.75rem' }}>
                                                    {Dayjs(h["Дата и время"]).format('DD.MM.YYYY HH:mm')}
                                                </Typography>
                                            </Box>
                                            <Typography variant="caption" noWrap display="block" sx={{ color: theme.palette.text.secondary, fontSize: '0.68rem', mt: 0.15 }}>
                                                {h["Доктор ФИО"]} {h.Услуга ? `• ${h.Услуга}` : ''}
                                            </Typography>
                                        </Box>
                                        <ChevronRightIcon sx={{ fontSize: 16, color: theme.palette.text.disabled, flexShrink: 0 }} />
                                    </Box>
                                ))
                            ) : (
                                <Box sx={{ px: 0.5, py: 1, textAlign: 'center' }}>
                                    <Typography variant="caption" sx={{ color: theme.palette.text.disabled, fontStyle: 'italic' }}>
                                        Нет истории визитов
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Box>
                </>
            )}

            {/* Actions */}
            <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.background.default, 0.3) }}>
                {isKnown ? (
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleCreateAppointment}
                        disableElevation
                        startIcon={<EventAvailableIcon />}
                        sx={{
                            bgcolor: accentColor,
                            color: '#fff',
                            borderRadius: 2.5,
                            textTransform: 'none',
                            fontWeight: 600,
                            py: 1,
                            fontSize: '0.9rem',
                            '&:hover': {
                                bgcolor: theme.palette.success.dark,
                            },
                        }}
                    >
                        Записать на прием
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleCreatePatient}
                        disableElevation
                        startIcon={<PersonAddIcon />}
                        sx={{
                            bgcolor: theme.palette.info.main,
                            color: '#fff',
                            borderRadius: 2.5,
                            textTransform: 'none',
                            fontWeight: 600,
                            py: 1,
                            fontSize: '0.9rem',
                            '&:hover': {
                                bgcolor: theme.palette.info.dark,
                            },
                        }}
                    >
                        Создать пациента
                    </Button>
                )}
            </Box>

            <style>
                {`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.15); }
                    100% { opacity: 1; transform: scale(1); }
                }
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                `}
            </style>
        </Paper>
    );
};

export const CallNotification: React.FC = () => {
    const { isRegistrator } = usePermissions();
    const [calls, setCalls] = useState<IncomingCall[]>([]);

    // Persistence: Load on mount
    useEffect(() => {
        const saved = localStorage.getItem('active_call_notifications_list');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setCalls(parsed);
                }
            } catch (e) {
                console.error("Error parsing saved call notifications:", e);
            }
        }
    }, []);

    // Persistence: Save when calls change
    useEffect(() => {
        if (calls.length > 0) {
            localStorage.setItem('active_call_notifications_list', JSON.stringify(calls));
        } else {
            localStorage.removeItem('active_call_notifications_list');
        }
    }, [calls]);

    useEffect(() => {
        if (IS_DJANGO_BACKEND) return;

        const channel = supabase.channel('incoming_calls_sub')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'incoming_calls' },
                (payload) => {
                    if (!isRegistrator()) return;
                    console.log('Incoming call received:', payload.new);
                    setCalls(prev => [...prev, payload.new as IncomingCall]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isRegistrator]);

    if (IS_DJANGO_BACKEND) return null;

    const handleClose = (id: string) => {
        setCalls(prev => prev.filter(c => c.id !== id));
    };

    if (calls.length === 0) return null;

    return (
        <Box
            sx={{
                position: 'fixed',
                top: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                width: '92%',
                maxWidth: 420,
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'none' // Allow interaction with page through empty space
            }}
        >
            {calls.map((call) => (
                <Box key={call.id} sx={{ pointerEvents: 'auto' }}>
                    <Slide direction="down" in={true} mountOnEnter unmountOnExit>
                        <Box>
                            <CallNotificationItem
                                call={call}
                                onClose={handleClose}
                            />
                        </Box>
                    </Slide>
                </Box>
            ))}
        </Box>
    );
};
