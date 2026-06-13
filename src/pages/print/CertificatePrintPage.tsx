import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "../../utility/supabaseClient";
import { Box, CircularProgress, Typography } from "@mui/material";
import dayjs from "dayjs";
import { generateCertificatePDF } from "../../utility/pdfGenerator";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { loadDjangoPrintData } from "./djangoPrintData";

export const CertificatePrintPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [dataLoading, setDataLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        fetchAndGenerate(id);
    }, [id]);

    const fetchAndGenerate = async (appointmentId: string) => {
        try {
            setDataLoading(true);
            setError(null);

            if (IS_DJANGO_BACKEND) {
                const lineIdRaw = new URLSearchParams(window.location.search).get("lineId");
                const d = await loadDjangoPrintData(
                    Number(appointmentId),
                    lineIdRaw ? Number(lineIdRaw) : null,
                );
                const blob = await generateCertificatePDF({
                    patientFio: d.patientFio,
                    patientDob: d.patientDob,
                    conclusion: d.conclusion?.conclusion ?? "",
                    doctorFio: d.doctorFio,
                    issueDate: dayjs().format("DD.MM.YYYY"),
                });
                setPdfUrl(URL.createObjectURL(blob));
                return;
            }

            // 1. Fetch Appointment & Patient Data
            const { data: aptData, error: aptError } = await supabase
                .from("Appointments")
                .select(`
                    id,
                    appointment_at,
                    patient_id
                `)
                .eq("id", appointmentId)
                .single();

            if (aptError) throw aptError;

            const urlParams = new URLSearchParams(window.location.search);
            const doctorId = urlParams.get("doctorId");

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
            let conclusionText = "";
            let mQuery = supabase
                .from("MedicalConclusions")
                .select("conclusion")
                .eq("appointment_id", appointmentId);

            if (doctorId) {
                mQuery = mQuery.eq("doctor_id", doctorId);
            }

            const { data: mData } = await mQuery.maybeSingle();

            if (mData) {
                conclusionText = mData.conclusion || "";
            }

            // Generate PDF
            const blob = await generateCertificatePDF({
                patientFio: patientName,
                patientDob: patientDob,
                conclusion: conclusionText,
                doctorFio: doctorName,
                issueDate: dayjs().format("DD.MM.YYYY"),
            });

            const url = URL.createObjectURL(blob);
            setPdfUrl(url);

        } catch (e: any) {
            console.error("Certificate Data Error:", e);
            setError(e.message || "Ошибка загрузки данных для справки");
        } finally {
            setDataLoading(false);
        }
    };

    if (dataLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: 2 }}>
                <CircularProgress />
                <Typography>Загрузка данных для справки...</Typography>
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
                    title="Certificate PDF Preview"
                />
            ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column', gap: 2 }}>
                    <CircularProgress />
                    <Typography>Подготовка справки...</Typography>
                </Box>
            )}
        </Box>
    );
};
