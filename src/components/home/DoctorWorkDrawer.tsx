import React, { useState, useEffect, useRef } from "react";
import {
    Box,
    Button,
    Stack,
    TextField,
    Typography,
    Drawer,
    IconButton,
    Divider,
    Autocomplete,
    Paper,
    CircularProgress,
    Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import StarBorderOutlined from "@mui/icons-material/StarBorderOutlined";
import { useNotification } from "@refinedev/core";
import { supabase } from "../../utility/supabaseClient";
import { getClinicDiagnoses, type ClinicDiagnosis } from "../../services/diagnoses";
import type { Appointment } from "../../pages/home/types";
import { usePermissions } from "../../hooks/usePermissions";
import { ConclusionTemplatesDrawer } from "../../pages/doctor/components/ConclusionTemplatesDrawer";
import { ProfigramInviteDialog } from "../profigram/ProfigramInviteDialog";

interface DoctorWorkDrawerProps {
    open: boolean;
    onClose: () => void;
    appointment: Appointment | null;
    onSuccess?: () => void;
}

// Элемент диагноза, сохраняемый в MedicalConclusions.diagnosis_data
interface ConclusionDiagnosisItem {
    id: string;
    diagnosis_code: string;
    title: string;
}

// В памяти кэш для заключений в Drawer, чтобы не дергать базу при каждом открытии
// Ключ теперь: appointmentId-doctorId
const DRAWER_CONCLUSION_CACHE = new Map<string, {
    data: {
        conclusion: string;
        anamnesis: string;
        objective: string;
        internal_comment: string;
        photo_urls: string[];
    };
    timestamp: number;
}>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

const hasMeaningfulText = (value: string) => value.trim().length > 0;

const preserveFormattedText = (value: string) => {
    const normalized = value.replace(/\r\n/g, "\n");
    return hasMeaningfulText(normalized) ? normalized : "";
};

const DoctorWorkDrawer: React.FC<DoctorWorkDrawerProps> = ({
    open,
    onClose,
    appointment,
    onSuccess,
}) => {
    const { open: notify } = useNotification();
    const { isDoctor: isDoctorFunc, employeeId, employee } = usePermissions();
    const isDoctor = isDoctorFunc();

    // State
    const [conclusion, setConclusion] = useState("");
    const [doctorComplaints, setDoctorComplaints] = useState("");
    const [anamnesis, setAnamnesis] = useState("");
    const [objective, setObjective] = useState("");

    // Vitals
    const [weight, setWeight] = useState<string>("");
    const [height, setHeight] = useState<string>("");
    const [temperature, setTemperature] = useState<string>("");

    // Diagnosis
    const [selectedDiagnoses, setSelectedDiagnoses] = useState<ClinicDiagnosis[]>([]);
    const [diagnoses, setDiagnoses] = useState<ClinicDiagnosis[]>([]);

    const [loading, setLoading] = useState(false);
    const [loadingDiagnoses, setLoadingDiagnoses] = useState(false);

    // New Fields
    const [photoUrls, setPhotoUrls] = useState<string[]>([]);
    const [internalComment, setInternalComment] = useState("");
    const [uploading, setUploading] = useState(false);
    const [loadingImages, setLoadingImages] = useState<Set<number>>(new Set());

    // Templates / Revisions
    const [templatesOpen, setTemplatesOpen] = useState(false);

    // Profigram Integration State
    const [profigramOpen, setProfigramOpen] = useState(false);
    const [patientPhoneStr, setPatientPhoneStr] = useState("");
    const [saveSuccessCallback, setSaveSuccessCallback] = useState<(() => void) | null>(null);

    // CSS for standardized quantity inputs
    const noSpinnersSx = {
        '& input[type=number]': {
            MozAppearance: 'textfield'
        },
        '& input[type=number]::-webkit-outer-spin-button': {
            WebkitAppearance: 'none',
            margin: 0
        },
        '& input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0
        }
    };

    const lastAppointmentId = useRef<string | null>(null);
    const draftReadyToSave = useRef(false); // true только после загрузки данных

    const getDraftKey = (apptId?: string) =>
        apptId && employeeId ? `conclusion_draft_${apptId}_${employeeId}` : null;

    const saveDraft = (fields: {
        conclusion?: string; anamnesis?: string; objective?: string;
        internalComment?: string; doctorComplaints?: string;
        weight?: string; height?: string; temperature?: string;
        photoUrls?: string[]; selectedDiagnoses?: ClinicDiagnosis[];
    }) => {
        const key = getDraftKey(appointment?.id);
        if (!key) return;
        try {
            const existing = JSON.parse(localStorage.getItem(key) || "{}");
            localStorage.setItem(key, JSON.stringify({ ...existing, ...fields }));
        } catch {}
    };

    const clearDraft = (apptId?: string) => {
        const key = getDraftKey(apptId);
        if (key) localStorage.removeItem(key);
    };

    const resetForm = () => {
        setConclusion("");
        setAnamnesis("");
        setObjective("");
        setWeight("");
        setHeight("");
        setTemperature("");
        setSelectedDiagnoses([]);
        setPhotoUrls([]);
        setInternalComment("");
        setLoadingImages(new Set());
        setProfigramOpen(false);
        setSaveSuccessCallback(null);
    };

    const loadMedicalConclusion = async (force = false) => {
        if (!appointment) return;

        const targetDoctorId = employeeId;
        if (!targetDoctorId) return;

        const cacheKey = `${appointment.id}-${targetDoctorId}`;

        // Check cache
        if (!force && DRAWER_CONCLUSION_CACHE.has(cacheKey)) {
            const entry = DRAWER_CONCLUSION_CACHE.get(cacheKey)!;
            if (Date.now() - entry.timestamp < CACHE_TTL) {
                const d = entry.data;
                setConclusion(d.conclusion);
                setAnamnesis(d.anamnesis);
                setObjective(d.objective);
                setInternalComment(d.internal_comment);
                setPhotoUrls(d.photo_urls);
                setLoadingImages(new Set());
                // Сохраняем в localStorage если ещё нет
                const localKey = `conclusion_draft_${appointment.id}_${targetDoctorId}`;
                if (!localStorage.getItem(localKey)) {
                    try {
                        localStorage.setItem(localKey, JSON.stringify({
                            conclusion: d.conclusion, anamnesis: d.anamnesis,
                            objective: d.objective, internalComment: d.internal_comment,
                            photoUrls: d.photo_urls,
                        }));
                    } catch {}
                }
                return;
            }
        }

        try {
            // Загружаем всё из MedicalConclusions этого врача + Appointments для витальных (fallback)
            const [{ data, error }, { data: apptFresh }] = await Promise.all([
                supabase.from("MedicalConclusions").select("*").eq("appointment_id", appointment.id).eq("doctor_id", targetDoctorId).maybeSingle(),
                supabase.from("Appointments").select("weight, height, temperature, doctor_complaints").eq("id", appointment.id).maybeSingle(),
            ]);

            if (error) throw error;

            let vConc = "";
            let vAnam = "";
            let vObj = "";
            let vIntComm = "";
            let vPhotos: string[] = [];

            if (data) {
                vConc = data.conclusion || "";
                vAnam = data.anamnesis || "";
                vObj = data.objective || "";
                vIntComm = data.internal_comment || "";
                vPhotos = data.photo_urls || [];
                setDoctorComplaints(data.complaints || apptFresh?.doctor_complaints || "");
                // Витальные: если у врача есть своя запись — берём оттуда, иначе из Appointments
                setWeight(data.weight_kg ? String(data.weight_kg) : (apptFresh?.weight ? String(apptFresh.weight) : ""));
                setHeight(data.height_cm ? String(data.height_cm) : (apptFresh?.height ? String(apptFresh.height) : ""));
                setTemperature(data.temperature ? String(data.temperature) : (apptFresh?.temperature ? String(apptFresh.temperature) : ""));
            } else {
                // Нет записи MedicalConclusions — берём из Appointments
                vConc = appointment.conclusion || "";
                vAnam = appointment.anamnesis || "";
                vObj = appointment.objective || "";
                setDoctorComplaints(apptFresh?.doctor_complaints || appointment.doctor_complaints || "");
                setWeight(apptFresh?.weight ? String(apptFresh.weight) : (appointment.weight ? String(appointment.weight) : ""));
                setHeight(apptFresh?.height ? String(apptFresh.height) : (appointment.height ? String(appointment.height) : ""));
                setTemperature(apptFresh?.temperature ? String(apptFresh.temperature) : (appointment.temperature ? String(appointment.temperature) : ""));
            }

            setConclusion(vConc);
            setAnamnesis(vAnam);
            setObjective(vObj);
            setInternalComment(vIntComm);
            setPhotoUrls(vPhotos);
            setLoadingImages(new Set());

            // Сохраняем в localStorage если черновика ещё нет
            const localKey = `conclusion_draft_${appointment.id}_${targetDoctorId}`;
            if (!localStorage.getItem(localKey)) {
                try {
                    localStorage.setItem(localKey, JSON.stringify({
                        conclusion: vConc, anamnesis: vAnam, objective: vObj,
                        internalComment: vIntComm, photoUrls: vPhotos,
                    }));
                } catch {}
            }

            // Save to cache
            DRAWER_CONCLUSION_CACHE.set(cacheKey, {
                data: {
                    conclusion: vConc,
                    anamnesis: vAnam,
                    objective: vObj,
                    internal_comment: vIntComm,
                    photo_urls: vPhotos
                },
                timestamp: Date.now()
            });

        } catch (e) {
            console.error("Error loading conclusion:", e);
        }
    };

    const loadDiagnoses = async () => {
        if (!appointment) return;
        try {
            setLoadingDiagnoses(true);
            const data = await getClinicDiagnoses();
            setDiagnoses(data);

            // Используем employeeId из usePermissions — он уже правильно резолвится через employee_auth_links
            const { data: conclusionData } = await supabase
                .from("MedicalConclusions")
                .select("diagnosis_data")
                .eq("appointment_id", appointment.id)
                .eq("doctor_id", employeeId)
                .maybeSingle();

            let sourceData: ConclusionDiagnosisItem[] | null | undefined = conclusionData?.diagnosis_data as
                | ConclusionDiagnosisItem[]
                | null
                | undefined;

            if (!sourceData && Array.isArray(appointment.diagnosis_data)) {
                sourceData = appointment.diagnosis_data as ConclusionDiagnosisItem[]; // fallback
            }

            const preselected: ClinicDiagnosis[] = [];

            if (Array.isArray(sourceData)) {
                sourceData.forEach((d) => {
                    // Try match by ID first (preferred for exact match when codes are same)
                    let found = data.find((c) => c.id === d.id);
                    if (!found && d.diagnosis_code) {
                        // Fallback to code match for legacy data
                        found = data.find((c) => c.diagnosis_code === d.diagnosis_code);
                    }
                    if (found) preselected.push(found);
                });
            }
            else if (appointment.diagnosis_code) { // Legacy fallback
                const found = data.find(d => d.diagnosis_code === appointment.diagnosis_code);
                if (found) preselected.push(found);
            }

            // Ensure unique items in the selection array (by reference/id)
            const unique = Array.from(new Set(preselected.map(d => d.id)))
                .map(id => preselected.find(d => d.id === id)!);

            // Проверяем черновик — если там есть диагнозы, восстанавливаем их
            const draftKey = appointment?.id && employeeId ? `conclusion_draft_${appointment.id}_${employeeId}` : null;
            const draft = draftKey ? (() => { try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { return null; } })() : null;
            if (draft?.selectedDiagnoses?.length) {
                const restored = draft.selectedDiagnoses
                    .map((d: ConclusionDiagnosisItem) => data.find(c => c.id === d.id))
                    .filter(Boolean) as ClinicDiagnosis[];
                setSelectedDiagnoses(restored.length ? restored : unique);
            } else {
                setSelectedDiagnoses(unique);
            }
        } catch (error) {
            console.error("Error loading diagnoses:", error);
            notify?.({ type: "error", message: "Ошибка загрузки диагнозов" });
        } finally {
            setLoadingDiagnoses(false);
        }
    };

    // Ключ для отслеживания — комбинация приёма + врача
    const lastLoadedKey = useRef<string | null>(null);

    useEffect(() => {
        if (!open || !employeeId || !appointment?.id) return;

        const loadKey = `${appointment.id}_${employeeId}`;
        if (loadKey === lastLoadedKey.current) return; // уже загружено для этой пары
        lastLoadedKey.current = loadKey;
        lastAppointmentId.current = appointment.id;
        draftReadyToSave.current = false;

        const draftKey = getDraftKey(appointment.id);
        const rawDraft = draftKey ? localStorage.getItem(draftKey) : null;
        const draft = rawDraft ? (() => { try { return JSON.parse(rawDraft); } catch { return null; } })() : null;

        if (draft) {
            // Текстовые поля заключения — из черновика (врач мог редактировать)
            if (draft.conclusion !== undefined) setConclusion(draft.conclusion);
            if (draft.anamnesis !== undefined) setAnamnesis(draft.anamnesis);
            if (draft.objective !== undefined) setObjective(draft.objective);
            if (draft.internalComment !== undefined) setInternalComment(draft.internalComment);
            if (draft.photoUrls !== undefined) setPhotoUrls(draft.photoUrls);
            // Загружаем complaints из MedicalConclusions и витальные из Appointments
            Promise.all([
                supabase.from("MedicalConclusions").select("complaints").eq("appointment_id", appointment.id).eq("doctor_id", employeeId).maybeSingle(),
                supabase.from("Appointments").select("weight,height,temperature").eq("id", appointment.id).maybeSingle(),
            ]).then(([{ data: mc }, { data: appt }]) => {
                setDoctorComplaints(mc?.complaints || appointment.doctor_complaints || "");
                if (appt) {
                    setWeight(appt.weight ? String(appt.weight) : "");
                    setHeight(appt.height ? String(appt.height) : "");
                    setTemperature(appt.temperature ? String(appt.temperature) : "");
                }
                draftReadyToSave.current = true; // только после загрузки всех данных
            });
        } else {
            setConclusion(""); setAnamnesis(""); setObjective("");
            setInternalComment(""); setPhotoUrls([]); setSelectedDiagnoses([]);
            setWeight(appointment.weight ? String(appointment.weight) : "");
            setHeight(appointment.height ? String(appointment.height) : "");
            setTemperature(appointment.temperature ? String(appointment.temperature) : "");
            loadMedicalConclusion().then(() => { draftReadyToSave.current = true; });
        }
        loadDiagnoses();
    }, [open, appointment?.id, employeeId]);

    // Автосохранение черновика при изменении любого поля (только после загрузки)
    useEffect(() => {
        if (!open || !appointment?.id || !employeeId || !draftReadyToSave.current) return;
        // doctorComplaints и витальные не сохраняем в черновик — они берутся из appointment (актуальные из БД)
        saveDraft({ conclusion, anamnesis, objective, internalComment, photoUrls, selectedDiagnoses });
    }, [conclusion, anamnesis, objective, internalComment, doctorComplaints, weight, height, temperature, photoUrls, selectedDiagnoses]);

    // REALTIME: Subscribe to conclusion changes while drawer is open
    useEffect(() => {
        if (!open || !appointment) return;

        const sub = supabase
            .channel(`conc-drawer-${appointment.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "MedicalConclusions",
                    filter: `appointment_id=eq.${appointment.id}`,
                },
                (payload: any) => {
                    console.log("Realtime: Conclusion changed for drawer", payload);
                    const newPayload = (payload.new || payload.old) as any;

                    if (newPayload?.doctor_id) {
                        DRAWER_CONCLUSION_CACHE.delete(`${appointment.id}-${newPayload.doctor_id}`);

                        // ОБНОВЛЯЕМ ТОЛЬКО ЕСЛИ ИЗМЕНЕНИЯ КАСАЮТСЯ ТЕКУЩЕГО ВРАЧА
                        if (newPayload.doctor_id === employeeId) {
                            if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE' || payload.eventType === 'UPDATE') {
                                loadMedicalConclusion(true);
                                loadDiagnoses();
                            }
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(sub);
        };
    }, [open, appointment]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;

        const filesCount = event.target.files.length;
        const startIndex = photoUrls.length;

        const placeholders = new Array(filesCount).fill('');
        setPhotoUrls(prev => [...prev, ...placeholders]);

        setLoadingImages(prev => {
            const updated = new Set(prev);
            for (let i = 0; i < filesCount; i++) {
                updated.add(startIndex + i);
            }
            return updated;
        });

        setUploading(true);

        try {
            const urls: string[] = [];
            const apptId = appointment?.id;

            for (let i = 0; i < event.target.files.length; i++) {
                const file = event.target.files[i];
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `${apptId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('conclusion_photos')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage
                    .from('conclusion_photos')
                    .getPublicUrl(filePath);

                if (data) urls.push(data.publicUrl);
            }

            setPhotoUrls(prev => {
                const updated = [...prev];
                urls.forEach((url, i) => {
                    updated[startIndex + i] = url;
                });
                return updated;
            });
        } catch (error) {
            console.error('Error uploading:', error);
            notify?.({ type: "error", message: "Ошибка загрузки фото" });
            setPhotoUrls(prev => prev.slice(0, startIndex));
        } finally {
            setLoadingImages(prev => {
                const updated = new Set(prev);
                for (let i = 0; i < filesCount; i++) {
                    updated.delete(startIndex + i);
                }
                return updated;
            });
            setUploading(false);
        }
    };

    const handleApplyTemplate = (rev: { conclusion: string | null; anamnesis: string | null; objective: string | null }) => {
        if (rev.conclusion) setConclusion(rev.conclusion);
        if (rev.anamnesis) setAnamnesis(rev.anamnesis);
        if (rev.objective) setObjective(rev.objective);
        setTemplatesOpen(false);
        notify?.({ type: "success", message: "Шаблон применен" });
    };

    const handleSaveTemplate = async () => {
        if (!appointment) return;

        if (!hasMeaningfulText(conclusion)) {
            notify?.({ type: "error", message: "Заполните заключение для шаблона" });
            return;
        }

        try {
            setLoading(true);
            if (!employeeId) {
                notify?.({ type: "error", message: "Сотрудник не найден" });
                return;
            }

            const conclusionText = preserveFormattedText(conclusion);
            const anamnesisText = preserveFormattedText(anamnesis);
            const objectiveText = preserveFormattedText(objective);
            const internalCommentText = preserveFormattedText(internalComment);

            const conclusionData = {
                appointment_id: appointment.id,
                doctor_id: employeeId,
                conclusion: conclusionText,
                anamnesis: anamnesisText,
                objective: objectiveText,
                internal_comment: internalCommentText,
                diagnosis_data: selectedDiagnoses.map(d => ({
                    id: d.id,
                    diagnosis_code: d.diagnosis_code,
                    title: d.title
                })),
                photo_urls: photoUrls,
                updated_at: new Date().toISOString()
            };

            const { data: savedConclusion, error: conclusionError } = await supabase
                .from("MedicalConclusions")
                .upsert(conclusionData, { onConflict: "appointment_id,doctor_id" })
                .select()
                .single();

            if (conclusionError) throw conclusionError;

            const revisionData = {
                medical_conclusion_id: savedConclusion.id,
                changed_by: employeeId,
                change_reason: "Manual Template Save",
                conclusion: conclusionText,
                anamnesis: anamnesisText,
                objective: objectiveText,
                diagnosis_data: conclusionData.diagnosis_data,
                photo_urls: photoUrls,
                internal_comment: internalCommentText,
                is_template: true
            };

            const { error: revisionError } = await supabase
                .from("MedicalConclusionRevisions")
                .insert(revisionData);

            if (revisionError) throw revisionError;

            notify?.({ type: "success", message: "Шаблон успешно сохранен" });
        } catch (error: any) {
            console.error("Error saving template:", error);

            let errorText = error?.message || 'Неизвестная ошибка';
            if (errorText.includes('violates row-level security policy')) {
                errorText = 'Нет прав доступа для сохранения (ограничение безопасности)';
            } else if (errorText.includes('duplicate key value')) {
                errorText = 'Шаблон уже существует';
            }

            notify?.({ type: "error", message: `Ошибка сохранения шаблона: ${errorText}` });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!appointment) return;

        if (!hasMeaningfulText(conclusion)) {
            notify?.({ type: "error", message: "Заполните заключение" });
            return;
        }
        if (weight) {
            const w = parseFloat(weight);
            if (isNaN(w) || w <= 0 || w > 999) {
                notify?.({ type: "error", message: "Вес должен быть от 1 до 999 кг (например: 57 или 57.30)" });
                return;
            }
        }
        if (height) {
            const h = parseFloat(height);
            if (isNaN(h) || h <= 0 || h > 999) {
                notify?.({ type: "error", message: "Рост должен быть от 1 до 999 см (например: 165)" });
                return;
            }
        }
        if (temperature) {
            const t = parseFloat(temperature);
            if (t < 34 || t > 42) {
                notify?.({ type: "error", message: "Температура должна быть в диапазоне 34 - 42" });
                return;
            }
        }

        try {
            setLoading(true);

            if (!employeeId) {
                notify?.({ type: "error", message: "Сотрудник не найден" });
                return;
            }

            const conclusionText = preserveFormattedText(conclusion);
            const anamnesisText = preserveFormattedText(anamnesis);
            const objectiveText = preserveFormattedText(objective);
            const internalCommentText = preserveFormattedText(internalComment);
            const doctorComplaintsText = preserveFormattedText(doctorComplaints);

            const conclusionData = {
                appointment_id: appointment.id,
                doctor_id: employeeId,
                conclusion: conclusionText,
                anamnesis: anamnesisText,
                objective: objectiveText,
                internal_comment: internalCommentText,
                diagnosis_data: selectedDiagnoses.map(d => ({
                    id: d.id,
                    diagnosis_code: d.diagnosis_code,
                    title: d.title
                })),
                photo_urls: photoUrls,
                updated_at: new Date().toISOString()
            };

            // complaints и витальные сохраняем в MedicalConclusions
            (conclusionData as any).complaints = doctorComplaintsText || null;
            (conclusionData as any).weight_kg = weight ? parseFloat(weight) : null;
            (conclusionData as any).height_cm = height ? parseFloat(height) : null;
            (conclusionData as any).temperature = temperature ? parseFloat(temperature) : null;


            console.log(`[DoctorWorkDrawer] Saving conclusion for appointment ${appointment.id}, doctor ${employeeId}`);

            const { data: savedConclusion, error: conclusionError } = await supabase
                .from("MedicalConclusions")
                .upsert(conclusionData, { onConflict: "appointment_id,doctor_id" })
                .select()
                .single();

            if (conclusionError) {
                console.error("[DoctorWorkDrawer] Conclusion upsert error:", conclusionError);
                throw conclusionError;
            }

            console.log("[DoctorWorkDrawer] Conclusion saved successfully:", savedConclusion.id);

            const revisionData = {
                medical_conclusion_id: savedConclusion.id,
                conclusion: conclusionText,
                anamnesis: anamnesisText,
                objective: objectiveText,
                internal_comment: internalCommentText,
                diagnosis_data: conclusionData.diagnosis_data,
                photo_urls: photoUrls,
                changed_by: employeeId,
            };

            const { error: revisionError } = await supabase
                .from("MedicalConclusionRevisions")
                .insert(revisionData);

            if (revisionError) throw revisionError;

            // Mark services associated with this doctor as "Выполнено"
            const { error: serviceError } = await supabase
                .from("AppointmentServices")
                .update({ status: "Выполнено" })
                .eq("appointment_id", appointment.id)
                .eq("performer_id", employeeId);

            if (serviceError) throw serviceError;

            // Global Appointments.status will be updated by DB trigger
            // but we still update vitals and complaints
            const updateData: {
                weight: number | null;
                height: number | null;
                temperature: number | null;
                doctor_complaints: string | null;
            } = {
                weight: weight ? parseFloat(weight) : null,
                height: height ? parseFloat(height) : null,
                temperature: temperature ? parseFloat(temperature) : null,
                doctor_complaints: doctorComplaintsText || null,
            };

            const { error } = await supabase
                .from("Appointments")
                .update(updateData)
                .eq("id", appointment.id);

            if (error) throw error;

            notify?.({ type: "success", message: "Данные сохранены" });

            DRAWER_CONCLUSION_CACHE.delete(`${appointment.id}-${employeeId}`);
            clearDraft(appointment.id);
            draftReadyToSave.current = false;

            // Open Profigram invite after successful save, only if it's a doctor
            if (isDoctor && employee?.phone) {
                try {
                    // Fetch patient's phone since Appointment view doesn't have it
                    let pPhone = "";
                    if (appointment.patient_id) {
                        const { data: pData } = await supabase
                            .from("Patients")
                            .select("phone")
                            .eq("id", appointment.patient_id)
                            .maybeSingle();
                        if (pData?.phone) {
                            pPhone = String(pData.phone);
                        }
                    }
                    setPatientPhoneStr(pPhone);
                } catch (e) {
                    console.error("Error fetching patient phone:", e);
                    setPatientPhoneStr("");
                }

                setProfigramOpen(true);
            } else {
                onSuccess?.();
                onClose();
            }
        } catch (error: any) {
            console.error("Error saving:", error);

            let errorText = error?.message || 'Неизвестная ошибка';
            if (errorText.includes('violates row-level security policy')) {
                errorText = 'Нет прав доступа для сохранения (ограничение безопасности)';
            } else if (errorText.includes('duplicate key value')) {
                errorText = 'Запись уже существует';
            }

            notify?.({ type: "error", message: `Ошибка сохранения: ${errorText}` });
        } finally {
            setLoading(false);
        }
    };

    const handleProfigramClose = () => {
        setProfigramOpen(false);
        onSuccess?.();
        onClose();
    };

    const renderQuantityInput = (
        label: string,
        value: string,
        setValue: (v: string) => void,
        suffix: string,
        step: number = 1,
        min: number = 0,
        max?: number
    ) => (
        <Stack spacing={0.5} sx={{ minWidth: 100, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">
                {label}, {suffix}
            </Typography>
            <Box
                sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 40,
                }}
            >
                <Button
                    size="small"
                    onClick={() => {
                        const cur = value === "" ? (min !== undefined ? min : 0) : (parseFloat(value) || 0);
                        const next = Math.max(min, cur - step);
                        setValue(step < 1 ? next.toFixed(1) : String(next));
                    }}
                    sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                >
                    −
                </Button>
                <TextField
                    size="small"
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => {
                        const val = parseFloat(value);
                        if (!isNaN(val)) {
                            if (min !== undefined && val < min) setValue(String(min));
                            else if (max !== undefined && val > max) setValue(String(max));
                        }
                    }}
                    placeholder="0"
                    inputProps={{
                        style: { textAlign: 'center', padding: '8px 4px' },
                        min: min,
                        step: step,
                        max: max
                    }}
                    sx={{
                        flex: 1,
                        ...noSpinnersSx,
                        '& .MuiOutlinedInput-root': { '& fieldset': { border: 'none' } }
                    }}
                />
                <Button
                    size="small"
                    onClick={() => {
                        const cur = value === "" ? (min !== undefined ? min : 0) : (parseFloat(value) || 0);
                        const next = cur + step;
                        if (max !== undefined && next > max) return;
                        setValue(step < 1 ? next.toFixed(1) : String(next));
                    }}
                    sx={{ minWidth: 32, px: 0.5, minHeight: 34 }}
                >
                    +
                </Button>
            </Box>
        </Stack>
    );

    if (!appointment) return null;

    return (
        <>
            <Drawer
                anchor="right"
                open={open}
                onClose={loading ? undefined : onClose}
                PaperProps={{
                    sx: {
                        width: { xs: "100%", sm: 600, md: 700 },
                        maxWidth: "100vw",
                        overscrollBehavior: "contain",
                    },
                }}
            >
                <ProfigramInviteDialog
                    open={profigramOpen}
                    onClose={handleProfigramClose}
                    patientName={appointment.patient_name || ""}
                    patientPhone={patientPhoneStr || ""}
                    doctorPhone={employee?.phone || ""}
                    doctorId={employeeId || ""}
                />

                <ConclusionTemplatesDrawer
                    open={templatesOpen}
                    onClose={() => setTemplatesOpen(false)}
                    onApplyTemplate={handleApplyTemplate}
                />

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
                    <Typography variant="h6">
                        {appointment.formatted_date} - {appointment.patient_name}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Tooltip title="Сохранить как шаблон">
                            <IconButton
                                onClick={handleSaveTemplate}
                                disabled={loading}
                                color="primary"
                            >
                                <StarBorderOutlined />
                            </IconButton>
                        </Tooltip>
                        <Button
                            size="small"
                            startIcon={<ContentCopyOutlined />}
                            onClick={() => setTemplatesOpen(true)}
                            variant="outlined"
                        >
                            Шаблоны
                        </Button>
                        <IconButton onClick={loading ? undefined : onClose} disabled={loading}>
                            <CloseOutlined />
                        </IconButton>
                    </Stack>
                </Box>
                <Divider />

                <Stack
                    spacing={3}
                    sx={{
                        p: 3,
                        flex: 1,
                        overflowY: "auto",
                    }}
                >
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" spacing={2}>
                            {renderQuantityInput("Рост", height, setHeight, "см", 1, 0, 999)}
                            {renderQuantityInput("Вес", weight, setWeight, "кг", 1, 0, 999)}
                            {renderQuantityInput("Температура", temperature, setTemperature, "°C", 0.1, 34, 42)}
                        </Stack>
                    </Paper>
                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Жалобы пациента
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                            <Typography variant="body1">
                                {appointment.complaints || "Нет жалоб"}
                            </Typography>
                        </Paper>
                    </Stack>

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Жалобы (врач)
                        </Typography>
                        <TextField
                            value={doctorComplaints}
                            onChange={(e) => setDoctorComplaints(e.target.value)}
                            multiline
                            minRows={2}
                            placeholder="Запишите жалобы с точки зрения врача..."
                            fullWidth
                        />
                    </Stack>

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Каталог диагнозов
                        </Typography>
                        <Autocomplete
                            multiple
                            value={selectedDiagnoses}
                            onChange={(_, newValue) => setSelectedDiagnoses(newValue)}
                            options={diagnoses}
                            getOptionLabel={(option) => `${option.diagnosis_code} - ${option.title}`}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            loading={loadingDiagnoses}
                            filterSelectedOptions
                            renderOption={(props, option) => {
                                const { key, ...otherProps } = props;
                                return (
                                    <li key={key} {...otherProps}>
                                        {option.diagnosis_code} - {option.title}
                                    </li>
                                );
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    placeholder="Выберите диагнозы..."
                                    error={false}
                                    helperText=""
                                />
                            )}
                        />
                    </Stack>

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Диагноз
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1.5, minHeight: 56, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body1">
                                {selectedDiagnoses.length > 0
                                    ? selectedDiagnoses.map(d => `${d.title}`).join('. ')
                                    : "Выберите 1 или несколько из каталога диагнозов"}
                            </Typography>
                        </Paper>
                    </Stack>

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Анамнез
                        </Typography>
                        <TextField
                            value={anamnesis}
                            onChange={(e) => setAnamnesis(e.target.value)}
                            multiline
                            minRows={3}
                            placeholder="История заболевания..."
                            fullWidth
                        />
                    </Stack>

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Объективно
                        </Typography>
                        <TextField
                            value={objective}
                            onChange={(e) => setObjective(e.target.value)}
                            multiline
                            minRows={4}
                            placeholder="Объективные данные..."
                            fullWidth
                        />
                    </Stack>

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Заключение <Box component="span" sx={{ color: "error.main" }}>*</Box>
                        </Typography>
                        <TextField
                            value={conclusion}
                            onChange={(e) => setConclusion(e.target.value)}
                            multiline
                            minRows={4}
                            fullWidth
                            required
                            placeholder="Рекомендации и назначения..."
                            error={!hasMeaningfulText(conclusion)}
                            helperText={!hasMeaningfulText(conclusion) ? "Обязательное поле" : ""}
                        />
                    </Stack>

                    {isDoctor && (
                        <Stack spacing={0.5}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                Комментарий (виден только врачу)
                            </Typography>
                            <TextField
                                value={internalComment}
                                onChange={(e) => setInternalComment(e.target.value)}
                                multiline
                                minRows={2}
                                fullWidth
                                placeholder="Личные заметки..."
                                sx={{ bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.08 : 0.12) }}
                            />
                        </Stack>
                    )}

                    <Stack spacing={0.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            Фотографии
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {photoUrls.map((url, idx) => (
                                <Box
                                    key={idx}
                                    sx={{
                                        position: 'relative',
                                        width: 60,
                                        height: 60,
                                        borderRadius: 1,
                                        overflow: 'hidden',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: loadingImages.has(idx) ? 'action.hover' : 'transparent'
                                    }}
                                >
                                    {loadingImages.has(idx) ? (
                                        <Box
                                            sx={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <CircularProgress size={24} />
                                        </Box>
                                    ) : (
                                        <img
                                            src={url}
                                            alt="Conclusion"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    )}
                                </Box>
                            ))}
                            <Button
                                variant="outlined"
                                component="label"
                                disabled={uploading}
                                sx={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: 1,
                                    minWidth: 0,
                                    p: 0,
                                    borderStyle: 'dashed'
                                }}
                            >
                                {uploading ? <CircularProgress size={20} /> : <AddPhotoAlternateOutlined fontSize="small" />}
                                <input
                                    type="file"
                                    hidden
                                    multiple
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                />
                            </Button>
                        </Box>
                    </Stack>

                </Stack>

                <Box sx={{
                    pt: 2,
                    pb: 4,
                    px: 2,
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <Button
                        variant="contained"
                        size="large"
                        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SaveOutlined />}
                        onClick={handleSave}
                        disabled={loading || !hasMeaningfulText(conclusion)}
                        sx={{
                            minWidth: 240,
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '1rem',
                            py: 1.5,
                        }}
                    >
                        {loading ? "Сохранение..." : "Сохранить заключение"}
                    </Button>
                </Box>
            </Drawer>

            <ProfigramInviteDialog
                open={profigramOpen}
                onClose={handleProfigramClose}
                patientName={appointment?.patient_name || ""}
                patientPhone={patientPhoneStr}
                doctorPhone={employee?.phone || ""}
                doctorId={employeeId || ""}
            />
        </>
    );
}
export { DoctorWorkDrawer };
export default DoctorWorkDrawer;
