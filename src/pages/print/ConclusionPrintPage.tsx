import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Box, CircularProgress, Typography } from "@mui/material";
import dayjs from "dayjs";
import { generateConclusionPDF, pdfFileName } from "../../utility/pdfGenerator";
import { PdfResultView } from "./PdfResultView";
import { ConclusionDocumentView } from "./DocumentViews";
import { formatQuantity } from "../../utility/format";
import { loadDjangoPrintData } from "./djangoPrintData";

type PrintData = {
  patientFio: string; patientDob: string; appointmentDate: string; weight: string;
  height: string; temperature: string; complaints: string; doctorComplaints?: string;
  diagnosis: string; anamnesis: string; objective: string; recommendations: string; doctorFio: string;
};

export const ConclusionPrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const lineIdRaw = new URLSearchParams(window.location.search).get("lineId");
        const d = await loadDjangoPrintData(Number(id), lineIdRaw ? Number(lineIdRaw) : null);
        const c = d.conclusion;
        const diagnosis = (c?.diagnosisData ?? []).map((x) => x.displayName?.trim() || (x.diagnosisCode ? `${x.diagnosisCode} - ${x.title ?? ""}` : x.title ?? "")).filter(Boolean).join("; ") || "—";
        const next: PrintData = {
          patientFio: d.patientFio,
          patientDob: d.patientDob,
          appointmentDate: d.appt.scheduledAt ? dayjs(d.appt.scheduledAt).format("DD.MM.YYYY HH:mm") : "—",
          weight: formatQuantity(c?.weightKg), height: formatQuantity(c?.heightCm), temperature: formatQuantity(c?.temperature),
          complaints: d.appt.complaints ?? "—", doctorComplaints: c?.complaints ?? d.appt.doctorComplaints ?? "—",
          diagnosis, anamnesis: c?.anamnesis ?? "", objective: c?.objective ?? "", recommendations: c?.conclusion ?? "—", doctorFio: d.doctorFio,
        };
        if (active) setData(next);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Ошибка загрузки данных");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!data) return;
    generateConclusionPDF(data).then((blob) => setPdfUrl(URL.createObjectURL(blob))).catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка генерации PDF"));
  }, [data]);

  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column", gap: 2 }}><CircularProgress /><Typography>Загрузка данных...</Typography></Box>;
  if (error) return <Box sx={{ p: 4 }}><Typography color="error" variant="h6">Произошла ошибка</Typography><Typography color="error">{error}</Typography></Box>;
  return <Box sx={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>{pdfUrl ? <PdfResultView url={pdfUrl} fileName={pdfFileName("conclusion", data?.patientFio ?? "")} preview={data ? <ConclusionDocumentView data={data} /> : null} caption={data?.patientFio} /> : <CircularProgress />}</Box>;
};
