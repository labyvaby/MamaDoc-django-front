import html2pdf from "html2pdf.js";
import { tt } from "../i18n/t";
import { A4_WIDTH_MM, pdfFileName } from "./pdfLayout";

export { pdfFileName } from "./pdfLayout";

export type ConclusionPDFData = {
  patientFio: string;
  patientDob: string;
  appointmentDate: string;
  height: string;
  weight: string;
  temperature: string;
  complaints: string;
  doctorComplaints?: string;
  diagnosis: string;
  anamnesis: string;
  objective: string;
  recommendations: string;
  doctorFio: string;
};

export type CertificatePDFData = {
  patientFio: string;
  patientDob: string;
  conclusion: string;
  doctorFio: string;
  issueDate: string;
  organizationName?: string;
};

/**
 * Общие опции html2pdf.
 *
 * 🔴 НЕ добавлять сюда `windowWidth` / `scrollX` / `scrollY` и НЕ уносить
 * контейнер за пределы экрана (`position: fixed; left: -10000px`): html2canvas
 * снимает область по координатам элемента в документе, и для элемента вне
 * вьюпорта снимок получается ПУСТЫМ — PDF выходил из одной белой страницы
 * (проверено 10.08.2026, это была регрессия). Контейнер должен оставаться в
 * обычном потоке документа; фиксированная геометрия достигается размерами в
 * мм, которые от вьюпорта не зависят.
 */
const pdfOptions = (filename: string) => ({
  margin: [0, 0, 0, 0] as [number, number, number, number], // Отступы заданы padding-ом контейнера.
  filename,
  image: { type: "jpeg" as const, quality: 0.98 },
  html2canvas: { scale: 2 },
  jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
});

/**
 * Отрендерить готовый HTML документа в PDF-Blob.
 *
 * Контейнер живёт в обычном потоке  (см. предупреждение выше) и
 * удаляется в , даже если html2pdf упал.
 */
const renderPdf = async (html: string, filename: string): Promise<Blob> => {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    const blob = await html2pdf().set(pdfOptions(filename)).from(container).output("blob");
    return blob as Blob;
  } finally {
    document.body.removeChild(container);
  }
};

const toPrintableString = (value: unknown) => String(value ?? "");

const escapeHtml = (value: unknown) =>
  toPrintableString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizePrintableText = (value?: unknown) =>
  toPrintableString(value).replace(/\r\n/g, "\n");

const renderPrintableBlock = (value?: unknown, fallback = "—", extraStyles = "") => {
  const normalized = normalizePrintableText(value);
  const content = normalized.length > 0 ? normalized : fallback;
  const styleSuffix = extraStyles ? ` ${extraStyles}` : "";

  // overflow-wrap: длинные слова/номера (названия препаратов, ссылки) должны
  // переноситься, а не выпирать за правый край страницы.
  return (
    `<div style="white-space: pre-wrap; overflow-wrap: anywhere;${styleSuffix}">`
    + `${escapeHtml(content)}</div>`
  );
};

/**
 * HTML документа «Заключение».
 *
 * Один источник для PDF и для экранного предпросмотра: то, что видит врач на
 * экране, попадает в файл без расхождений.
 */
export const buildConclusionHtml = (data: ConclusionPDFData): string => {
  const {
    patientFio,
    patientDob,
    appointmentDate,
    height,
    weight,
    temperature,
    complaints,
    doctorComplaints,
    diagnosis,
    anamnesis,
    objective,
    recommendations,
    doctorFio,
  } = data;

  // Очищаем значения от прочерков для корректного отображения единиц измерения
  const heightDisplay = height && height !== "—" ? height : "";
  const weightDisplay = weight && weight !== "—" ? weight : "";
  const tempDisplay = temperature && temperature !== "—" ? temperature : "";

  return `
    <div
      style="
        box-sizing: border-box;
        width: ${A4_WIDTH_MM}mm;
        margin: 0 auto;
        font-family: Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.1;
        color: #000;
        padding: 50mm 15mm 20mm 10mm;
        overflow-wrap: anywhere;
      "
    >
      <div style="margin-bottom: 1.5mm;"><b>${escapeHtml(tt("print:patientFioLabel"))}</b> ${escapeHtml(patientFio)}</div>
      <div style="margin-bottom: 1.5mm;"><b>Дата рождения:</b> ${escapeHtml(patientDob)}</div>
      <div style="margin-bottom: 5mm;"><b>${escapeHtml(tt("print:visitDateTimeLabel"))}</b> ${escapeHtml(appointmentDate)}</div>

      <div style="margin-bottom: 5mm; display: flex; gap: 4mm;">
        <div style="flex: 0 0 45mm;"><b>Рост:</b> ${heightDisplay ? `${escapeHtml(heightDisplay)} см` : ""}</div>
        <div style="flex: 0 0 45mm;"><b>Вес:</b> ${weightDisplay ? `${escapeHtml(weightDisplay)} кг` : ""}</div>
        <div style="flex: 1; min-width: 0;"><b>Температура:</b> ${tempDisplay ? `${escapeHtml(tempDisplay)} C°` : ""}</div>
      </div>

      <div style="margin-bottom: 2mm;">
        <b>Жалобы:</b>
        ${renderPrintableBlock(doctorComplaints || complaints || "—")}
      </div>

      <div style="margin-top: 4mm; margin-bottom: 2mm;">
        <b>Диагноз:</b>
        ${renderPrintableBlock(diagnosis || "—")}
      </div>

      <div style="margin-top: 4mm; margin-bottom: 2mm;">
        <b>Анамнез:</b>
        ${renderPrintableBlock(anamnesis)}
      </div>

      <div style="margin-top: 4mm; margin-bottom: 2mm;">
        <b>Объективно:</b>
        ${renderPrintableBlock(objective)}
      </div>

      <div style="margin-top: 4mm; margin-bottom: 2mm;">
        <b>Рекомендации:</b>
        <div style="margin-top: 1.5mm;">${renderPrintableBlock(recommendations)}</div>
      </div>

      <div style="margin-top: 8mm; display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm;">
        <div style="flex: 1; min-width: 0;"><b>${escapeHtml(tt("print:specialistLabel"))}</b> ${escapeHtml(doctorFio)}</div>
        <div style="flex: 0 0 70mm;">
          <div style="display: flex; justify-content: space-between;">
            <b>Подпись:</b>
            <span></span>
          </div>
          <div style="text-align: right; margin-top: 5mm; font-size: 10pt;">место для печати</div>
        </div>
      </div>
    </div>
  `;
};

export const generateConclusionPDF = async (data: ConclusionPDFData): Promise<Blob> =>
  renderPdf(buildConclusionHtml(data), pdfFileName("conclusion", data.patientFio));

/** HTML документа «Медицинская справка» (см. buildConclusionHtml). */
export const buildCertificateHtml = (data: CertificatePDFData): string => {
  const {
    patientFio,
    patientDob,
    conclusion,
    doctorFio,
    issueDate,
    organizationName,
  } = data;
  const certificateOrganization = escapeHtml(organizationName || "Aximo CRM");

  return `
    <div
      style="
        box-sizing: border-box;
        width: ${A4_WIDTH_MM}mm;
        margin: 0 auto;
        font-family: Arial, sans-serif;
        font-size: 14pt;
        line-height: 1.5;
        color: #000;
        padding: 40mm 15mm 20mm 15mm;
        position: relative;
        overflow: hidden;
        overflow-wrap: anywhere;
      "
    >
      <!-- Watermark -->
      <div 
        style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 120pt;
          font-weight: bold;
          color: rgba(0, 0, 0, 0.05);
          white-space: nowrap;
          z-index: -1;
          pointer-events: none;
        "
      >
        СПРАВКА
      </div>

      <div style="text-align: center; margin-bottom: 2mm;">
        <h1 style="margin: 0; font-size: 24pt; font-weight: bold; text-transform: uppercase;">Медицинская справка</h1>
        <p style="margin: 0; font-size: 12pt;">(врачебное профессионально-консультативное заключение)</p>
      </div>

      <div style="margin-top: 15mm; margin-bottom: 8mm;">
        <div style="margin-bottom: 3mm;">
          Ф.И.О. <span style="display: inline-block; border-bottom: 1px solid #000; min-width: 100mm; max-width: 100%;">${escapeHtml(patientFio)}</span>
        </div>
        <div>
          Дата рождения: <span style="display: inline-block; border-bottom: 1px solid #000; min-width: 50mm; max-width: 100%;">${escapeHtml(patientDob)}</span>
        </div>
      </div>

      <div style="margin-bottom: 10mm; font-size: 13pt;">
        В том, что ребенок был на амбулаторном лечении<br/>
        в ${certificateOrganization}
      </div>

      <div style="margin-bottom: 5mm;">
        <b>Заключение:</b>
      </div>
      
      <div style="min-height: 20mm; line-height: 1.8; margin-bottom: 5mm;">
        ${renderPrintableBlock(conclusion, "", "border-bottom: 1px solid #000; min-height: 8mm;")}
      </div>

      <div style="margin-top: 10mm; display: flex; flex-direction: column; gap: 2mm;">
        <div><b>Дата выдачи:</b> ${escapeHtml(issueDate)}</div>
        <div><b>${escapeHtml(tt("print:specialistLabel"))}</b> ${escapeHtml(doctorFio)}</div>
      </div>

      <div style="margin-top: 15mm; display: flex; justify-content: flex-end; align-items: flex-start;">
        <div style="flex: 0 0 50mm; text-align: center;">
          <div style="border-bottom: 1px solid #000; height: 10mm;"></div>
          <div style="font-size: 9pt; color: #666; margin-top: 1mm;">(подпись)</div>
        </div>
      </div>
    </div>
  `;
};

export const generateCertificatePDF = async (data: CertificatePDFData): Promise<Blob> =>
  renderPdf(buildCertificateHtml(data), pdfFileName("certificate", data.patientFio));
