import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "../../utility/supabaseClient";
import { Box, CircularProgress, Typography } from "@mui/material";
import dayjs from "dayjs";
import { generateConclusionPDF } from "../../utility/pdfGenerator";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { loadDjangoPrintData } from "./djangoPrintData";

type PrintData = {
    patientFio: string;
    patientDob: string;
    appointmentDate: string;
    weight: string;
    height: string;
    temperature: string;
    complaints: string;
    doctorComplaints?: string;
    diagnosis: string;
    anamnesis: string;
    objective: string;
    recommendations: string;
    doctorFio: string;
};

export const ConclusionPrintPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [dataLoading, setDataLoading] = useState(true);
    const [data, setData] = useState<PrintData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        fetchData(id);
    }, [id]);

    useEffect(() => {
        if (data && !pdfUrl) {
            generatePdf(data);
        }
    }, [data, pdfUrl]);

    const fetchData = async (appointmentId: string) => {
        try {
            setDataLoading(true);
            setError(null);

            if (IS_DJANGO_BACKEND) {
                const lineIdRaw = new URLSearchParams(window.location.search).get("lineId");
                const d = await loadDjangoPrintData(
                    Number(appointmentId),
                    lineIdRaw ? Number(lineIdRaw) : null,
                );
                const c = d.conclusion;
                const diag = c?.diagnosisData ?? [];
                const diagnosisStr = diag.length > 0
                    ? diag
                        .map((x) => (x.diagnosisCode ? `${x.diagnosisCode} - ${x.title ?? ""}` : x.title ?? ""))
                        .join("; ")
                    : "—";
                setData({
                    patientFio: d.patientFio,
                    patientDob: d.patientDob,
                    appointmentDate: d.appt.scheduledAt
                        ? dayjs(d.appt.scheduledAt).format("DD.MM.YYYY HH:mm")
                        : "—",
                    weight: c?.weightKg ?? "—",
                    height: c?.heightCm ?? "—",
                    temperature: c?.temperature ?? "—",
                    complaints: d.appt.complaints ?? "—",
                    doctorComplaints: c?.complaints ?? d.appt.doctorComplaints ?? "—",
                    diagnosis: diagnosisStr,
                    anamnesis: c?.anamnesis ?? "",
                    objective: c?.objective ?? "",
                    recommendations: c?.conclusion ?? "—",
                    doctorFio: d.doctorFio,
                });
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            const doctorId = urlParams.get("doctorId");

            // Fetch Appointment Data
            const { data: aptData, error: aptError } = await supabase
                .from("Appointments")
                .select(`
                    id,
                    appointment_at,
                    weight,
                    height,
                    temperature,
                    complaints,
                    doctor_complaints,
                    conclusion,
                    patient_id
                `)
                .eq("id", appointmentId)
                .single();

            if (aptError) throw aptError;

            // Fetch Patient
            let patientName = "Неизвестно";
            let patientDob = "—";

            if (aptData.patient_id) {
                const { data: pData, error: pError } = await supabase
                    .from("Patients")
                    .select("full_name, birth_date")
                    .eq("id", aptData.patient_id)
                    .single();

                if (!pError && pData) {
                    patientName = pData.full_name;
                    patientDob = pData.birth_date ? dayjs(pData.birth_date).format("DD.MM.YYYY") : "—";
                }
            }

            // Fetch Doctor
            let doctorName = "Не указан";
            if (doctorId) {
                const { data: dData } = await supabase
                    .from("Employees")
                    .select("full_name")
                    .eq("id", doctorId)
                    .single();
                if (dData) {
                    doctorName = dData.full_name;
                }
            } else {
                const { data: sData } = await supabase
                    .from("AppointmentServices")
                    .select("performer_id")
                    .eq("appointment_id", appointmentId);

                if (sData && sData.length > 0) {
                    const ids = [...new Set(sData.map((s: any) => s.performer_id).filter(Boolean))];
                    if (ids.length > 0) {
                        const { data: dData } = await supabase
                            .from("Employees")
                            .select("full_name")
                            .in("id", ids);
                        if (dData && dData.length > 0) {
                            doctorName = dData.map((d: any) => d.full_name).join(", ");
                        }
                    }
                }
            }

            // Fetch Medical Conclusion
            let medData: any = {};
            let mQuery = supabase
                .from("MedicalConclusions")
                .select("*")
                .eq("appointment_id", appointmentId);

            if (doctorId) {
                mQuery = mQuery.eq("doctor_id", doctorId);
            }

            const { data: mData, error: mError } = await mQuery.maybeSingle();

            if (!mError && mData) {
                medData = mData;
            }

            const diagnosisList = medData?.diagnosis_data || [];
            const diagnosisStr = diagnosisList.length > 0
                ? diagnosisList.map((d: any) => d.diagnosis_code ? `${d.diagnosis_code} - ${d.title}` : d.title).join("; ")
                : "—";

            setData({
                patientFio: patientName,
                patientDob: patientDob,
                appointmentDate: dayjs(aptData.appointment_at).format("DD.MM.YYYY HH:mm"),
                weight: medData?.weight || aptData.weight || "—",
                height: medData?.height || aptData.height || "—",
                temperature: medData?.temperature || aptData.temperature || "—",
                complaints: aptData.complaints || "—",
                doctorComplaints: aptData.doctor_complaints || "—",
                diagnosis: diagnosisStr,
                anamnesis: medData?.anamnesis || "",
                objective: medData?.objective || "",
                recommendations: medData?.conclusion || aptData.conclusion || "—",
                doctorFio: doctorName,
            });

        } catch (e: any) {
            console.error("Fetch Error:", e);
            setError(e.message || "Ошибка загрузки данных");
        } finally {
            setDataLoading(false);
        }
    };

    const generatePdf = (printData: PrintData) => {
        generateConclusionPDF(printData)
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                setPdfUrl(url);
            })
            .catch((e: any) => {
                console.error("PDF Gen Error:", e);
                setError(`Ошибка генерации PDF: ${e.message}`);
            });
    };

    if (dataLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: 2 }}>
                <CircularProgress />
                <Typography>Загрузка данных...</Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 4 }}>
                <Typography color="error" variant="h6">Произошла ошибка</Typography>
                <Typography color="error">{error}</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {pdfUrl ? (
                <iframe
                    src={pdfUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="PDF Preview"
                />
            ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: 2 }}>
                    <CircularProgress />
                    <Typography>Подготовка документа...</Typography>
                </Box>
            )}
        </Box>
    );
};
