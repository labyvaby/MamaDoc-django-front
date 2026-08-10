import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Box, CircularProgress, Typography } from "@mui/material";
import dayjs from "dayjs";
import { generateCertificatePDF, pdfFileName } from "../../utility/pdfGenerator";
import type { CertificatePDFData } from "../../utility/pdfGenerator";
import { PdfResultView } from "./PdfResultView";
import { CertificateDocumentView } from "./DocumentViews";
import { loadDjangoPrintData } from "./djangoPrintData";
import { usePermissions } from "../../hooks/usePermissions";

export const CertificatePrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { activeOrganization } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // Данные справки нужны экранному (адаптивному) виду документа.
  const [docData, setDocData] = useState<CertificatePDFData | null>(null);
  const [patientFio, setPatientFio] = useState("");

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const lineIdRaw = new URLSearchParams(window.location.search).get("lineId");
        const data = await loadDjangoPrintData(Number(id), lineIdRaw ? Number(lineIdRaw) : null);
        const pdfData: CertificatePDFData = {
          patientFio: data.patientFio,
          patientDob: data.patientDob,
          conclusion: data.conclusion?.conclusion ?? "",
          doctorFio: data.doctorFio,
          issueDate: dayjs().format("DD.MM.YYYY"),
          organizationName: activeOrganization?.name,
        };
        const blob = await generateCertificatePDF(pdfData);
        if (!active) return;
        setPatientFio(data.patientFio);
        setPdfUrl(URL.createObjectURL(blob));
        setDocData(pdfData);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Ошибка загрузки данных для справки");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, activeOrganization?.name]);

  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column", gap: 2 }}><CircularProgress /><Typography>Загрузка данных для справки...</Typography></Box>;
  if (error) return <Box sx={{ p: 4 }}><Typography color="error" variant="h6">Произошла ошибка</Typography><Typography color="error">{error}</Typography></Box>;
  return <Box sx={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>{pdfUrl ? <PdfResultView url={pdfUrl} fileName={pdfFileName("certificate", patientFio)} preview={docData ? <CertificateDocumentView data={docData} /> : null} caption={patientFio || undefined} /> : <CircularProgress />}</Box>;
};
