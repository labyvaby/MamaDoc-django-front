import React, { useEffect, useState } from "react";
import { useUpdate, useList } from "@refinedev/core";
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Stack,
    Button,
    TextField,
    Autocomplete,
    CircularProgress,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";

import { useTheme } from "@mui/material/styles";

// Интерфейсы (можно вынести в types.ts)
interface ClinicDiagnosis {
    id: string;
    title: string | null;
    diagnosis_code: string | null;
    sort_order: number;
}

interface AppointmentConclusionDrawerProps {
    open: boolean;
    onClose: () => void;
    appointmentId: string | null;
    initialDiagnosisCode?: string | null;
    initialConclusion?: string | null;
    initialDoctorComplaints?: string | null;
    onSuccess?: () => void;
}

export const AppointmentConclusionDrawer: React.FC<AppointmentConclusionDrawerProps> = ({
    open,
    onClose,
    appointmentId,
    initialDiagnosisCode,
    initialConclusion,
    initialDoctorComplaints,
    onSuccess,
}) => {
    const theme = useTheme();

    const draftKey = appointmentId ? `conclusion_draft_${appointmentId}` : null;

    const readDraft = () => {
        if (!draftKey) return null;
        try { return JSON.parse(sessionStorage.getItem(draftKey) || "null"); } catch { return null; }
    };

    const saveDraft = React.useCallback((c: string, dc: string, diagCode: string | null) => {
        if (!draftKey) return;
        sessionStorage.setItem(draftKey, JSON.stringify({ conclusion: c, doctorComplaints: dc, diagnosisCode: diagCode }));
    }, [draftKey]);

    const [conclusion, setConclusion] = useState(() => readDraft()?.conclusion ?? "");
    const [doctorComplaints, setDoctorComplaints] = useState(() => readDraft()?.doctorComplaints ?? "");
    const [selectedDiagnosis, setSelectedDiagnosis] = useState<ClinicDiagnosis | null>(null);
    const initializedForAppointment = React.useRef<string | null>(null);

    // Обновление данных через Refine
    const { mutateAsync: updateAppointment } = useUpdate();
    const [isUpdating, setIsUpdating] = useState(false);

    // Загрузка справочника ClinicDiagnoses
    const { query } = useList<ClinicDiagnosis>({
        resource: "ClinicDiagnoses",
        sorters: [
            {
                field: "sort_order",
                order: "asc",
            },
        ],
        pagination: {
            mode: "off"
        }
    });

    const diagnosesList = React.useMemo(() => query.data?.data || [], [query.data?.data]);
    const isLoadingDiagnoses = query.isLoading;

    // Инициализация при открытии нового приёма
    useEffect(() => {
        if (!open || !appointmentId) return;
        if (initializedForAppointment.current === appointmentId) return;
        initializedForAppointment.current = appointmentId;

        const draft = readDraft();
        const c = draft?.conclusion ?? initialConclusion ?? "";
        const dc = draft?.doctorComplaints ?? initialDoctorComplaints ?? "";
        setConclusion(c);
        setDoctorComplaints(dc);
        setSelectedDiagnosis(null);
        // Сохраняем начальные значения как черновик
        saveDraft(c, dc, draft?.diagnosisCode ?? initialDiagnosisCode ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, appointmentId]);

    // Восстановление диагноза когда загрузился список
    useEffect(() => {
        if (!open || !appointmentId || diagnosesList.length === 0 || selectedDiagnosis) return;
        const draft = readDraft();
        const code = draft?.diagnosisCode ?? initialDiagnosisCode ?? null;
        if (code) {
            const found = diagnosesList.find((d: ClinicDiagnosis) => d.diagnosis_code === code);
            if (found) setSelectedDiagnosis(found);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, appointmentId, diagnosesList, selectedDiagnosis]);

    const handleSave = async () => {
        if (!appointmentId) return;

        try {
            setIsUpdating(true);
            await updateAppointment({
                resource: "Appointments",
                id: appointmentId,
                values: {
                    conclusion: conclusion,
                    doctor_complaints: doctorComplaints,
                    diagnosis_code: selectedDiagnosis?.diagnosis_code || null,
                },
            });
            if (draftKey) sessionStorage.removeItem(draftKey);
            onSuccess?.();
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: { xs: "100%", md: 500 },
                    p: 0,
                },
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 3,
                    py: 2,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                }}
            >
                <Typography variant="h6">Заключение врача</Typography>
                <IconButton onClick={onClose}>
                    <CloseOutlined />
                </IconButton>
            </Box>

            {/* Content */}
            <Box sx={{ p: 3, flex: 1, overflowY: "auto" }}>
                <Stack spacing={3}>
                    {/* Выбор диагноза */}
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Диагноз (Избранное клиники)
                        </Typography>
                        {isLoadingDiagnoses ? (
                            <CircularProgress size={20} />
                        ) : (
                            <Autocomplete
                                options={diagnosesList}
                                getOptionLabel={(option) => option.title || option.diagnosis_code || ""}
                                value={selectedDiagnosis}
                                onChange={(_, newValue) => {
                                    setSelectedDiagnosis(newValue);
                                    saveDraft(conclusion, doctorComplaints, newValue?.diagnosis_code ?? null);
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder="Выберите диагноз (например, ОРВИ)"
                                        variant="outlined"
                                        helperText={
                                            selectedDiagnosis?.diagnosis_code
                                                ? `Код МКБ-10: ${selectedDiagnosis.diagnosis_code}`
                                                : "Выберите диагноз из списка"
                                        }
                                    />
                                )}
                                renderOption={(props, option) => {
                                    const { key, ...optionProps } = props;
                                    return (
                                        <li key={key} {...optionProps}>
                                            <Stack>
                                                <Typography variant="body1">{option.title}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Код: {option.diagnosis_code}
                                                </Typography>
                                            </Stack>
                                        </li>
                                    )
                                }}
                            />
                        )}
                    </Box>

                    {/* Жалобы (врач) */}
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Жалобы (врач)
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            minRows={3}
                            placeholder="Запишите жалобы пациента..."
                            value={doctorComplaints}
                            onChange={(e) => { setDoctorComplaints(e.target.value); saveDraft(conclusion, e.target.value, selectedDiagnosis?.diagnosis_code ?? null); }}
                        />
                    </Box>

                    {/* Поле заключения */}
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Медицинское заключение
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            minRows={6}
                            placeholder="Опишите жалобы, анамнез, объективные данные и рекомендации..."
                            value={conclusion}
                            onChange={(e) => { setConclusion(e.target.value); saveDraft(e.target.value, doctorComplaints, selectedDiagnosis?.diagnosis_code ?? null); }}
                        />
                    </Box>
                </Stack>
            </Box>

            {/* Footer */}
            <Box
                sx={{
                    p: 2,
                    borderTop: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 2,
                }}
            >
                <Button variant="outlined" onClick={onClose} color="inherit">
                    Отмена
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    startIcon={<SaveOutlined />}
                    disabled={isUpdating}
                >
                    {isUpdating ? "Сохранение..." : "Завершить прием"}
                </Button>
            </Box>
        </Drawer>
    );
};
