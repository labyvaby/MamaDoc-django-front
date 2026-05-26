import React, { useState, useEffect, useCallback, useRef } from "react";
import { alpha } from "@mui/material/styles";
import {
    Box,
    Paper,
    Card,
    Typography,
    Stack,
    Button,
    IconButton,
    CircularProgress,
    Dialog,
    DialogContent,
    Divider,
    Chip,
    Grid,
    Tooltip,
    useTheme,
    useMediaQuery
} from "@mui/material";
import {
    getClinicDiagnoses
} from "../../../services/diagnoses";
import { useNotification } from "@refinedev/core";
import { usePermissions } from "../../../hooks/usePermissions";
import { supabase } from "../../../utility/supabaseClient";
import { DB_TABLES } from "../../../utility/constants";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import StarOutlined from "@mui/icons-material/StarOutlined";


type DoctorConclusionPanelProps = {
    appointmentId: string | null;
    onClose: () => void;
    onSaveSuccess?: () => void;
    hideCloseButton?: boolean; // Hide close button in header (for desktop workspace)
    hideEditButton?: boolean; // Hide edit button (for doctor workspace conclusion panel)
    onEditClick?: () => void; // Callback to open edit drawer instead of inline editing
    selectedDoctorId?: string | null; // Specifically selected doctor for view
    readOnly?: boolean; // If true, hide edit actions
};

// Элемент диагноза в массиве diagnosis_data медицинского заключения
type ConclusionDiagnosisItem = {
    id: string;
    diagnosis_code: string;
    title: string;
};


// Строка из MedicalConclusions, используемая в этом компоненте
type MedicalConclusionRow = {
    conclusion: string | null;
    anamnesis: string | null;
    objective: string | null;
    internal_comment: string | null;
    diagnosis_data: ConclusionDiagnosisItem[] | null;
    photo_urls: string[] | null;
    weight_kg: number | null;
    height_cm: number | null;
    temperature: number | null;
};

// В памяти кэш для заключений, чтобы не дергать базу при каждом переключении
const CONCLUSION_CACHE = new Map<string, {
    data: {
        vitals: { weight: string; height: string; temperature: string };
        doctorComplaints: string;
        conclusion: string;
        anamnesis: string;
        objective: string;
        internalComment: string;
        photoUrls: string[];
        selectedDiagnoses: ConclusionDiagnosisItem[];
        availableDoctors: { id: string, full_name: string, hasConclusion?: boolean }[];
    };
    timestamp: number;
}>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

export const DoctorConclusionPanel: React.FC<DoctorConclusionPanelProps> = ({
    appointmentId,
    onClose,
    hideCloseButton = false,
    hideEditButton = false,
    onEditClick,
    selectedDoctorId: propSelectedDoctorId,
    readOnly = false
}) => {
    const { open: notify } = useNotification();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const { isDoctor, isAdmin, employeeId } = usePermissions();
    const lastAppointmentId = useRef<string | null>(null);

    const [loading, setLoading] = useState(false);

    // Multiple doctors support
    const [availableDoctors, setAvailableDoctors] = useState<{ id: string, full_name: string, hasConclusion?: boolean }[]>([]);
    const [currentDoctorId, setCurrentDoctorId] = useState<string | null>(propSelectedDoctorId || null);

    // Form State (View only)
    const [conclusion, setConclusion] = useState("");
    const [doctorComplaints, setDoctorComplaints] = useState("");
    const [anamnesis, setAnamnesis] = useState("");
    const [objective, setObjective] = useState("");
    const [internalComment, setInternalComment] = useState("");

    // Vitals
    const [weight, setWeight] = useState("");
    const [height, setHeight] = useState("");
    const [temperature, setTemperature] = useState("");

    // Diagnoses
    const [selectedDiagnoses, setSelectedDiagnoses] = useState<ConclusionDiagnosisItem[]>([]);

    // Photos
    const [photoUrls, setPhotoUrls] = useState<string[]>([]);
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
    const [loadingImages, setLoadingImages] = useState<Set<number>>(new Set());


    const loadData = useCallback(async (forceRefetch = false) => {
        if (!appointmentId) return;

        // Determine which doctor we are looking at
        let targetDoctorId = currentDoctorId || propSelectedDoctorId;

        if (targetDoctorId) {
            const cacheKey = `${appointmentId}-${targetDoctorId}`;
            // Check cache
            if (!forceRefetch && CONCLUSION_CACHE.has(cacheKey)) {
                const entry = CONCLUSION_CACHE.get(cacheKey)!;
                if (Date.now() - entry.timestamp < CACHE_TTL) {
                    const { vitals, ...rest } = entry.data;
                    setWeight(vitals.weight || "");
                    setHeight(vitals.height || "");
                    setTemperature(vitals.temperature || "");
                    setDoctorComplaints(rest.doctorComplaints || "");
                    setConclusion(rest.conclusion || "");
                    setAnamnesis(rest.anamnesis || "");
                    setObjective(rest.objective || "");
                    setInternalComment(rest.internalComment || "");
                    setPhotoUrls(rest.photoUrls || []);
                    setSelectedDiagnoses(rest.selectedDiagnoses || []);
                    setAvailableDoctors(rest.availableDoctors || []);
                    setLoading(false);
                    return;
                }
            }
        }

        try {
            setLoading(true);
            console.log(`[ConclusionPanel] Loading data for appointment ${appointmentId}, targetDoctor: ${targetDoctorId}`);

            // 1. Load available doctors for this appointment
            const { data: sData, error: sError } = await supabase
                .from(DB_TABLES.APPOINTMENT_SERVICES)
                .select("performer_id")
                .eq("appointment_id", appointmentId);

            if (sError) console.error("Error loading performers:", sError);

            // Get unique performer IDs
            const performerIds = [...new Set((sData || []).map(s => s.performer_id).filter(id => !!id))];

            // Load employee details for these performers — only doctors (not nurses)
            const { data: performersData } = performerIds.length > 0
                ? await supabase
                    .from(DB_TABLES.EMPLOYEES)
                    .select("id, full_name, role:role_id(name)")
                    .in("id", performerIds)
                : { data: [] };

            // Filter out nurses — only doctors/admins shown as specialists in conclusion
            const performers = (performersData || []).filter((p: any) => {
                const roleName = p.role?.name?.toLowerCase();
                return roleName === 'doctor' || roleName === 'admin' || roleName === 'superadmin';
            });

            // 1.1 Load who already has conclusions
            const { data: concs, error: cError } = await supabase
                .from(DB_TABLES.MEDICAL_CONCLUSIONS)
                .select("doctor_id, doctor:Employees!doctor_id(id, full_name)")
                .eq("appointment_id", appointmentId);

            if (cError) console.error("Error loading conclusions:", cError);

            const concludedBy = new Map(concs?.map((c: any) => [c.doctor_id, c.doctor]) || []);

            // Merge lists: performers + anyone else who has a conclusion
            const doctorMap = new Map<string, { id: string, full_name: string, hasConclusion: boolean }>();

            performers.forEach(p => {
                doctorMap.set(p.id, { ...p, hasConclusion: concludedBy.has(p.id) });
            });

            concludedBy.forEach((doc, id) => {
                if (doc && !doctorMap.has(id)) {
                    doctorMap.set(id, { ...doc, hasConclusion: true });
                }
            });

            const allDoctors = Array.from(doctorMap.values());
            setAvailableDoctors(allDoctors);

            if (!targetDoctorId && allDoctors.length > 0) {
                // Try to pick current user first if they have a conclusion
                const me = allDoctors.find(d => d.id === employeeId);
                if (me && me.hasConclusion) {
                    targetDoctorId = me.id;
                } else {
                    // Pick first who has a conclusion, fallback to current user, then first doctor
                    const hasConc = allDoctors.find(d => d.hasConclusion);
                    targetDoctorId = hasConc ? hasConc.id : (me ? me.id : allDoctors[0].id);
                    console.log(`[ConclusionPanel] Auto-picked targetDoctor: ${targetDoctorId} (hasConc: ${!!hasConc})`);
                }
                if (targetDoctorId) {
                    setCurrentDoctorId(targetDoctorId);
                }
            }

            // 2. Load Appointment Data (Vitals & Complaints & Fallback Conclusion)
            const { data: aptData, error: aptError } = await supabase
                .from(DB_TABLES.APPOINTMENTS)
                .select("weight, height, temperature, doctor_complaints, conclusion, diagnosis_code, anamnesis, objective")
                .eq("id", appointmentId)
                .single();

            if (aptError) throw aptError;

            // 3. Load Medical Conclusion for specific doctor
            let query = supabase
                .from(DB_TABLES.MEDICAL_CONCLUSIONS)
                .select("*")
                .eq("appointment_id", appointmentId);

            if (targetDoctorId) {
                query = query.eq("doctor_id", targetDoctorId);
            }

            const { data: concData, error: concError } = await query.maybeSingle<MedicalConclusionRow>();

            console.log(`[ConclusionPanel] MedicalConclusion fetch: ${concData ? 'Found' : 'Not Found'}`);

            if (concError) throw concError;

            // Initialize local variables for cache sync
            const vComplaints = aptData?.doctor_complaints || "";

            let vConc = "";
            let vAnam = "";
            let vObj = "";
            let vIntComm = "";
            let vPhotos: string[] = [];
            let vDiag: ConclusionDiagnosisItem[] = [];
            // Vitals: prefer MedicalConclusions (weight_kg/height_cm/temperature), fallback to Appointments
            let vWeight = aptData?.weight ? String(aptData.weight) : "";
            let vHeight = aptData?.height ? String(aptData.height) : "";
            let vTemp = aptData?.temperature ? String(aptData.temperature) : "";

            setDoctorComplaints(vComplaints);

            if (concData) {
                vConc = concData.conclusion || "";
                vAnam = concData.anamnesis || "";
                vObj = concData.objective || "";
                vIntComm = concData.internal_comment || "";
                vPhotos = concData.photo_urls || [];
                // Override vitals from MedicalConclusions if present
                if (concData.weight_kg) vWeight = String(concData.weight_kg);
                if (concData.height_cm) vHeight = String(concData.height_cm);
                if (concData.temperature) vTemp = String(concData.temperature);

                // Handle legacy diagnosis data
                const sourceData = concData.diagnosis_data || [];
                const clinicDiagnoses = await getClinicDiagnoses(true);

                vDiag = sourceData.map(d => {
                    if (d.id) return d;
                    const found = clinicDiagnoses.find(cd => cd.diagnosis_code === d.diagnosis_code);
                    return found ? { id: found.id, diagnosis_code: found.diagnosis_code, title: found.title } : d;
                });
            } else {
                // Fallback to Appointment table data (migration/legacy support)
                vConc = aptData.conclusion || "";
                vAnam = aptData.anamnesis || "";
                vObj = aptData.objective || "";
                console.log(`[ConclusionPanel] Falling back to Appointments table data (legacy field present: ${!!vConc})`);

                if (aptData.diagnosis_code) {
                    vDiag = [{
                        id: "",
                        diagnosis_code: aptData.diagnosis_code,
                        title: ""
                    }];
                }
                vIntComm = "";
                vPhotos = [];
            }

            setWeight(vWeight);
            setHeight(vHeight);
            setTemperature(vTemp);
            setConclusion(vConc);
            setAnamnesis(vAnam);
            setObjective(vObj);
            setInternalComment(vIntComm);
            setPhotoUrls(vPhotos);
            setLoadingImages(new Set());
            setSelectedDiagnoses(vDiag);

            // Update Cache
            if (targetDoctorId) {
                const cacheKey = `${appointmentId}-${targetDoctorId}`;
                CONCLUSION_CACHE.set(cacheKey, {
                    data: {
                        vitals: { weight: vWeight, height: vHeight, temperature: vTemp },
                        doctorComplaints: vComplaints,
                        conclusion: vConc,
                        anamnesis: vAnam,
                        objective: vObj,
                        internalComment: vIntComm,
                        photoUrls: vPhotos,
                        selectedDiagnoses: vDiag,
                        availableDoctors: allDoctors
                    },
                    timestamp: Date.now()
                });
            }
        } catch (e: unknown) {
            console.error(e);
            const description =
                e && typeof e === "object" && "message" in e
                    ? String((e as { message?: unknown }).message)
                    : undefined;
            notify?.({
                message: "Ошибка загрузки данных",
                ...(description ? { description } : {}),
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }, [appointmentId, currentDoctorId, employeeId, notify, propSelectedDoctorId]);

    useEffect(() => {
        if (appointmentId) {
            // If prop changed, update current
            // 1. Check if we actually switched the appointment or just re-opened same one
            if (appointmentId !== lastAppointmentId.current) {
                // Check if we have valid cache for this doctor before clearing EVERYTHING
                const cacheKey = `${appointmentId}-${currentDoctorId}`;
                const cachedEntry = CONCLUSION_CACHE.get(cacheKey);
                const isCacheValid = cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL);

                if (!isCacheValid) {
                    // Only clear if no valid cache to prevent flickering
                    setConclusion("");
                    setAnamnesis("");
                    setObjective("");
                    setInternalComment("");
                    setWeight("");
                    setHeight("");
                    setTemperature("");
                    setDoctorComplaints("");
                    setSelectedDiagnoses([]);
                    setPhotoUrls([]);
                    setAvailableDoctors([]);
                    setLoading(true);
                }
                lastAppointmentId.current = appointmentId;
            }

            loadData(false); // Try to load from cache first
        } else {
            // ... reset state ...
            setConclusion("");
            setAnamnesis("");
            setObjective("");
            setInternalComment("");
            setWeight("");
            setHeight("");
            setTemperature("");
            setDoctorComplaints("");
            setSelectedDiagnoses([]);
            setPhotoUrls([]);
            setLoading(false);
            setCurrentDoctorId(null);
            setAvailableDoctors([]);
            lastAppointmentId.current = null;
        }
    }, [appointmentId, propSelectedDoctorId, currentDoctorId, loadData]);

    // REALTIME: Subscribe to conclusion changes
    useEffect(() => {
        if (!appointmentId) return;

        const sub = supabase
            .channel(`conc-panel-${appointmentId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: DB_TABLES.MEDICAL_CONCLUSIONS,
                    filter: `appointment_id=eq.${appointmentId}`,
                },
                (payload: any) => {
                    console.log("Realtime: Conclusion changed for panel", payload);
                    // Clear cache for this appointment when external change happens
                    if (payload.new && payload.new.doctor_id) {
                        CONCLUSION_CACHE.delete(`${appointmentId}-${payload.new.doctor_id}`);
                    }

                    // Only auto-load if change is for the current doctor we are viewing
                    if (payload.new?.doctor_id === currentDoctorId || (!payload.new && payload.old?.doctor_id === currentDoctorId)) {
                        loadData(true); // Force refetch from server
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(sub);
        };
    }, [appointmentId, currentDoctorId, loadData]);

    if (!appointmentId) {
        return (
            <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
                Выберите прием для заполнения заключения
            </Box>
        );
    }

    const currentDoctorName = availableDoctors.find(d => d.id === currentDoctorId)?.full_name || "Врач";

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            <Card
                variant={isMobile ? "elevation" : "outlined"}
                elevation={0}
                sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    bgcolor: "background.paper",
                    overflow: "hidden",
                    maxWidth: "100%",
                    boxSizing: 'border-box',
                    m: 0,
                    p: 0
                }}
            >
                <Box sx={{
                    p: 2,
                    px: 3, // Fixed 24px
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    flexWrap: 'wrap',
                    gap: 1,
                    boxSizing: 'border-box'
                }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
                        <Typography variant="h6" noWrap>Заключение</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" color="text.secondary" noWrap>Специалисты:</Typography>
                            {availableDoctors.map((doc) => (
                                <Chip
                                    key={doc.id}
                                    label={doc.full_name}
                                    onClick={() => setCurrentDoctorId(doc.id)}
                                    color={currentDoctorId === doc.id ? "primary" : "default"}
                                    variant={currentDoctorId === doc.id ? "filled" : "outlined"}
                                    size="small"
                                    icon={doc.hasConclusion ? <StarOutlined sx={{ fontSize: '14px !important' }} /> : undefined}
                                    sx={{
                                        fontWeight: doc.hasConclusion ? 'bold' : 'normal',
                                        borderColor: doc.hasConclusion ? 'primary.light' : 'divider'
                                    }}
                                />
                            ))}
                        </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                        {/* Button: Edit - Visible for author doctor or admin */}
                        {((isDoctor() && currentDoctorId === employeeId) || isAdmin()) && !readOnly && !hideEditButton && (
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<EditOutlined />}
                                onClick={() => {
                                    if (onEditClick) {
                                        onEditClick();
                                    }
                                }}
                            >
                                Изменить заключение
                            </Button>
                        )}
                        {/* Tooltip: Why disabled - for other doctors */}
                        {isDoctor() && currentDoctorId !== employeeId && !isAdmin() && !hideEditButton && (
                            <Tooltip title="Вы можете редактировать только свое собственное заключение">
                                <span>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        disabled
                                        startIcon={<EditOutlined />}
                                    >
                                        Изменить
                                    </Button>
                                </span>
                            </Tooltip>
                        )}
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<PrintOutlined />}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(`/print/conclusion/${appointmentId}?doctorId=${currentDoctorId}`, '_blank');
                            }}
                        >
                            Печать
                        </Button>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<DescriptionOutlined />}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(`/print/certificate/${appointmentId}?doctorId=${currentDoctorId}`, '_blank');
                            }}
                        >
                            Справка
                        </Button>
                        {!hideCloseButton && (
                            <IconButton onClick={onClose} size="small">
                                <CloseOutlined />
                            </IconButton>
                        )}
                    </Stack>
                </Box>
                <Box sx={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    p: 2,
                    px: 3, // Fixed 24px
                    boxSizing: 'border-box'
                }}>
                    <Stack spacing={3}>
                        {/* Vitals */}
                        <Paper
                            variant={isMobile ? "elevation" : "outlined"}
                            elevation={0}
                            sx={{
                                p: 2,
                                bgcolor: 'action.hover',
                                boxSizing: 'border-box'
                            }}
                        >
                            <Stack direction="row" spacing={3} justifyContent="space-around">
                                <Box textAlign="center">
                                    <Typography variant="caption" color="text.secondary">Вес</Typography>
                                    <Typography variant="h6">{weight ? `${weight} кг` : "—"}</Typography>
                                </Box>
                                <Divider orientation="vertical" flexItem />
                                <Box textAlign="center">
                                    <Typography variant="caption" color="text.secondary">Рост</Typography>
                                    <Typography variant="h6">{height ? `${height} см` : "—"}</Typography>
                                </Box>
                                <Divider orientation="vertical" flexItem />
                                <Box textAlign="center">
                                    <Typography variant="caption" color="text.secondary">Температура</Typography>
                                    <Typography variant="h6" color={parseFloat(temperature) > 37 ? 'error.main' : 'text.primary'}>
                                        {temperature ? `${temperature} °C` : "—"}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>

                        {/* Text Sections */}
                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Диагноз (МКБ-10)</Typography>
                            {selectedDiagnoses.length > 0 ? (
                                <Box display="flex" gap={1} flexWrap="wrap">
                                    {selectedDiagnoses.map((d, i) => (
                                        <Chip key={i} label={d.diagnosis_code ? `${d.diagnosis_code} - ${d.title}` : d.title} size="small" />
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.disabled">Не указан</Typography>
                            )}
                        </Box>

                        <Divider />

                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Анамнез</Typography>
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{anamnesis || "—"}</Typography>
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Объективно</Typography>
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{objective || "—"}</Typography>
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Заключение</Typography>
                            <Typography
                                variant="body1"
                                sx={{
                                    whiteSpace: 'pre-wrap',
                                    fontWeight: 500,
                                    color: conclusion ? 'text.primary' : 'text.disabled',
                                    fontStyle: conclusion ? 'normal' : 'italic'
                                }}
                            >
                                {conclusion || `Врач ${currentDoctorName} еще не оставил заключение`}
                            </Typography>
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Жалобы (врач)</Typography>
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{doctorComplaints || "—"}</Typography>
                        </Box>

                        {isDoctor() && internalComment && (
                            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? alpha(theme.palette.warning.main, 0.15) : '#fff9c4' }}>
                                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>Внутренний комментарий</Typography>
                                <Typography variant="body2">{internalComment}</Typography>
                            </Paper>
                        )}

                        {/* Photos */}
                        {photoUrls.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Фотографии исследования</Typography>
                                <Grid container spacing={1}>
                                    {photoUrls.map((url, index) => (
                                        <Grid item xs={6} sm={4} key={index}>
                                            <Box
                                                sx={{
                                                    width: '100%',
                                                    paddingTop: '100%',
                                                    position: 'relative',
                                                    borderRadius: 1,
                                                    overflow: 'hidden',
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    cursor: loadingImages.has(index) ? 'default' : 'pointer',
                                                    bgcolor: loadingImages.has(index) ? 'action.hover' : 'transparent',
                                                    '&:hover': !loadingImages.has(index) ? {
                                                        opacity: 0.9,
                                                        transform: 'scale(1.02)',
                                                        transition: 'all 0.2s',
                                                        boxShadow: 2
                                                    } : {}
                                                }}
                                                onClick={() => !loadingImages.has(index) && setSelectedPhotoIndex(index)}
                                            >
                                                {loadingImages.has(index) ? (
                                                    <Box
                                                        sx={{
                                                            position: 'absolute',
                                                            top: '50%',
                                                            left: '50%',
                                                            transform: 'translate(-50%, -50%)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            gap: 1
                                                        }}
                                                    >
                                                        <CircularProgress size={40} />
                                                        <Typography variant="caption" color="text.secondary">Загрузка...</Typography>
                                                    </Box>
                                                ) : (
                                                    <img
                                                        src={url}
                                                        alt={`Фото ${index + 1}`}
                                                        style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover'
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Box>
                        )}

                    </Stack>
                </Box>
            </Card>

            {/* Photo Viewer Dialog */}
            <Dialog
                open={selectedPhotoIndex !== null}
                onClose={() => setSelectedPhotoIndex(null)}
                maxWidth={false}
                PaperProps={{
                    sx: {
                        bgcolor: 'rgba(0, 0, 0, 0.95)',
                        boxShadow: 'none',
                        m: 2,
                        maxHeight: 'calc(100vh - 32px)',
                        maxWidth: 'calc(100vw - 32px)',
                    }
                }}
            >
                <DialogContent
                    sx={{
                        p: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        minHeight: '60vh'
                    }}
                >
                    <IconButton
                        onClick={() => setSelectedPhotoIndex(null)}
                        sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            color: 'white',
                            bgcolor: 'rgba(0, 0, 0, 0.5)',
                            '&:hover': {
                                bgcolor: 'rgba(0, 0, 0, 0.7)',
                            },
                            zIndex: 1
                        }}
                    >
                        <CloseOutlined />
                    </IconButton>
                    {selectedPhotoIndex !== null && (
                        <img
                            src={photoUrls[selectedPhotoIndex]}
                            alt={`Фото ${selectedPhotoIndex + 1}`}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '85vh',
                                objectFit: 'contain',
                                borderRadius: 4
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};
