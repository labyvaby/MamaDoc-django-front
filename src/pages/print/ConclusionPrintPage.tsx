import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Box, CircularProgress, Typography } from "@mui/material";
import dayjs from "dayjs";

import {
  generateConclusionPDF,
  pdfFileName,
  type ConclusionPDFData,
} from "../../utility/pdfGenerator";
import {
  buildConclusionPrintParts,
  formatDiagnoses,
  type ConclusionColumns,
} from "../../utility/conclusionPrintParts";
import { generateConclusionSheetPdf } from "../../components/conclusion-forms/printConclusionSheet";
import type { SheetContext } from "../../components/conclusion-forms/FormSheet";
import { getConclusionForms, type ConclusionFormTemplate } from "../../api/conclusionForms";
import { parseConclusionFormData } from "../../api/conclusionFormData";
import { usePermissions } from "../../hooks/usePermissions";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { PdfResultView } from "./PdfResultView";
import { ConclusionDocumentView } from "./DocumentViews";
import { formatQuantity } from "../../utility/format";
import { loadDjangoPrintData } from "./djangoPrintData";

/**
 * Печать заключения — единственное место, где документ собирается.
 *
 * Почему здесь, а не в дровере (перенесено 08.09.2026). Раньше документ с
 * бланком собирался прямо в форме заключения из её живого состояния, а
 * документ без бланка — здесь, из сохранённых данных. Одна кнопка вела в две
 * разные механики: печать могла уйти на бумагу с несохранёнными правками
 * (в карте одно, у пациента на руках другое), с прочерками вместо ФИО, если
 * фоновый запрос не успел, и без видимого сообщения об ошибке. Теперь любой
 * путь печати — и кнопка в заключении, и иконка в списке услуг приёма — ведёт
 * сюда, а сюда попадает только то, что действительно сохранено в карте.
 *
 * Бланк восстанавливается из снапшота внутри `formData`, то есть ровно таким,
 * каким врач его заполнил: администратор мог позже переставить поля или
 * переназначить привязку, и актуальный шаблон разложил бы значения не по тем
 * строкам (см. api/conclusionFormData.ts).
 */
export const ConclusionPrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { activeOrganization } = usePermissions();
  const orgId = useApiOrgId();
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState<ConclusionPDFData | null>(null);
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

        // Прочерк ставит документ, а не данные. Пустое привязанное поле на
        // листе бланка должно остаться линейкой под ручку, как и остальные
        // незаполненные строки протокола, — иначе врач получает лист, где в
        // одних пустых полях линейка, а в других «—» (найдено на живой печати
        // 08.09.2026). Штатный документ и экранный вид ставят свои прочерки
        // сами и пустую строку понимают.
        const quantity = (value: string | null | undefined) =>
          value == null || value === "" ? "" : formatQuantity(value);

        const columns: ConclusionColumns = {
          heightCm: quantity(c?.heightCm),
          weightKg: quantity(c?.weightKg),
          temperature: quantity(c?.temperature),
          complaints: c?.complaints ?? d.appt.doctorComplaints ?? "",
          diagnosis: formatDiagnoses(c?.diagnosisData ?? []),
          anamnesis: c?.anamnesis ?? "",
          objective: c?.objective ?? "",
          conclusion: c?.conclusion ?? "",
        };

        // Экранный (адаптивный) вид показывает все колонки как есть: на
        // телефоне важно прочитать содержимое, а не повторить фирменный лист.
        const screenData: ConclusionPDFData = {
          patientFio: d.patientFio,
          patientDob: d.patientDob,
          appointmentDate: d.appt.scheduledAt
            ? dayjs(d.appt.scheduledAt).format("DD.MM.YYYY HH:mm")
            : "—",
          height: columns.heightCm,
          weight: columns.weightKg,
          temperature: columns.temperature,
          complaints: d.appt.complaints ?? "—",
          doctorComplaints: columns.complaints || "—",
          diagnosis: columns.diagnosis || "—",
          anamnesis: columns.anamnesis,
          objective: columns.objective,
          conclusion: columns.conclusion || "—",
          doctorFio: d.doctorFio,
        };

        const template = await resolveTemplate(c?.formData, orgId);
        const blob = template
          ? await printWithSheet(template, d, columns, activeOrganization)
          : await generateConclusionPDF(screenData);

        if (!active) return;
        setDocData(screenData);
        setPdfUrl(URL.createObjectURL(blob));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Ошибка загрузки данных");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, orgId, activeOrganization]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column", gap: 2 }}>
        <CircularProgress />
        <Typography>Загрузка данных...</Typography>
      </Box>
    );
  if (error)
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error" variant="h6">Произошла ошибка</Typography>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  return (
    <Box sx={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>
      {pdfUrl ? (
        <PdfResultView
          url={pdfUrl}
          fileName={pdfFileName("conclusion", docData?.patientFio ?? "")}
          preview={docData ? <ConclusionDocumentView data={docData} /> : null}
          caption={docData?.patientFio}
        />
      ) : (
        <CircularProgress />
      )}
    </Box>
  );
};

/**
 * Бланк заключения: строки берём из снапшота, фирменную бумагу — актуальную.
 *
 * Снапшот задаёт поля и их привязки: администратор мог позже переставить
 * строки или переназначить `slot`, и актуальный шаблон разложил бы сохранённые
 * значения не по тем строкам (см. api/conclusionFormData.ts). Поэтому `fields`
 * всегда из снимка.
 *
 * ⚠ А вот подложка — исключение, и намеренное. Это фирменная бумага клиники, а
 * не часть медицинской записи: печатают на том бланке, который у клиники сейчас.
 * Пока подложка тоже бралась из снимка, добавленная позже картинка не появлялась
 * ни в одном уже сохранённом заключении, и владелец видел ровно то, что описал
 * 08.09.2026: «добавил картинку, а её не видно при печати». Ждать от врача
 * открепления и повторного прикрепления бланка ради этого нельзя.
 *
 * Снапшота может не быть у заключений, сохранённых до появления `formData`, и у
 * тех, где он не влез в лимит бэка (`fitConclusionFormData`) — тогда печатаем по
 * актуальному шаблону целиком. Не нашли ничего — штатный документ, без бланка.
 */
async function resolveTemplate(
  formData: unknown,
  orgId: number | null | undefined,
): Promise<ConclusionFormTemplate | null> {
  const parsed = parseConclusionFormData(formData);
  if (!parsed) return null;
  const current = await fetchCurrentForm(parsed.formId, orgId);
  if (!parsed.snapshot) return current;
  // Шаблон удалили — печатаем снимок как есть, с его бумагой и отступами.
  if (!current) return parsed.snapshot;
  // Отступы — та же бумага, что и подложка: их подгоняют под напечатанную
  // шапку бланка, и старые заключения должны печататься по текущей настройке.
  return { ...parsed.snapshot, background: current.background, margins: current.margins };
}

async function fetchCurrentForm(
  formId: number,
  orgId: number | null | undefined,
): Promise<ConclusionFormTemplate | null> {
  try {
    const forms = await getConclusionForms(orgId, undefined, { includeInactive: true });
    return forms.find((form) => form.id === formId) ?? null;
  } catch {
    // Справочник недоступен — документ всё равно должен напечататься.
    return null;
  }
}

async function printWithSheet(
  template: ConclusionFormTemplate,
  d: Awaited<ReturnType<typeof loadDjangoPrintData>>,
  columns: ConclusionColumns,
  organization: { name?: string; logoUrl?: string | null } | null | undefined,
): Promise<Blob> {
  const parsed = parseConclusionFormData(d.conclusion?.formData);
  const { sheetValues, trailer } = buildConclusionPrintParts({
    template,
    formValues: parsed?.values ?? {},
    manual: parsed?.manual ?? "",
    columns,
  });
  const context: SheetContext = {
    patientFio: d.patientFio,
    patientDob: d.patientDob,
    appointmentDateTime: d.appt.scheduledAt
      ? dayjs(d.appt.scheduledAt).format("DD.MM.YYYY HH:mm")
      : "—",
    doctorFio: d.doctorFio,
    clinicName: organization?.name ?? "",
    clinicLogoUrl: organization?.logoUrl,
  };
  return generateConclusionSheetPdf(template, context, sheetValues, trailer);
}
