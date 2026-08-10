import React from "react";
import { Box, Divider, Stack, Typography } from "@mui/material";

import { tt } from "../../i18n/t";
import type { CertificatePDFData, ConclusionPDFData } from "../../utility/pdfGenerator";

/**
 * Экранный вид документов — АДАПТИВНЫЙ, в отличие от PDF-шаблона.
 *
 * Почему отдельная разметка, а не масштабированный лист A4: уменьшенный до
 * ширины телефона лист даёт нечитаемо мелкий текст. Здесь то же содержимое
 * верстается под экран — блоки идут колонкой, текст переносится, кегль
 * нормальный. Бумажную геометрию (A4, поля под печать) держит `pdfGenerator`,
 * и трогать его для экрана не нужно: у листа и у экрана разные задачи.
 */

/** Лист документа: белый фон и чёрный текст независимо от темы приложения. */
const Sheet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      bgcolor: "#fff",
      color: "#000",
      borderRadius: 1,
      boxShadow: 2,
      px: { xs: 2, sm: 3 },
      py: { xs: 2.5, sm: 3 },
      mx: "auto",
      maxWidth: 760,
      fontSize: { xs: "0.95rem", sm: "1rem" },
      lineHeight: 1.5,
      // Длинные названия препаратов и ссылки переносятся, а не рвут вёрстку.
      overflowWrap: "anywhere",
    }}
  >
    {children}
  </Box>
);

/** Строка «подпись: значение» — на узких экранах значение уходит под подпись. */
const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 0.75 }}>
    <Typography component="span" sx={{ fontWeight: 700, color: "inherit" }}>
      {label}
    </Typography>
    <Typography component="span" sx={{ color: "inherit", minWidth: 0 }}>
      {value || "—"}
    </Typography>
  </Box>
);

/** Многострочный раздел: заголовок сверху, текст с сохранением переносов. */
const Section: React.FC<{ title: string; text?: string }> = ({ title, text }) => (
  <Box sx={{ mt: 2 }}>
    <Typography sx={{ fontWeight: 700, color: "inherit", mb: 0.5 }}>{title}</Typography>
    <Typography sx={{ color: "inherit", whiteSpace: "pre-wrap" }}>
      {text?.trim() ? text : "—"}
    </Typography>
  </Box>
);

export const ConclusionDocumentView: React.FC<{ data: ConclusionPDFData }> = ({ data }) => {
  const measurements = [
    { label: "Рост:", value: data.height && data.height !== "—" ? `${data.height} см` : "" },
    { label: "Вес:", value: data.weight && data.weight !== "—" ? `${data.weight} кг` : "" },
    {
      label: "Температура:",
      value: data.temperature && data.temperature !== "—" ? `${data.temperature} C°` : "",
    },
  ];

  return (
    <Sheet>
      <Field label={tt("print:patientFioLabel")} value={data.patientFio} />
      <Field label="Дата рождения:" value={data.patientDob} />
      <Field label={tt("print:visitDateTimeLabel")} value={data.appointmentDate} />

      <Divider sx={{ my: 1.5, borderColor: "rgba(0,0,0,.12)" }} />

      {/* Показатели: в ряд, когда влезают, и колонкой на узком экране. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
          gap: { xs: 0, sm: 1.5 },
        }}
      >
        {measurements.map((m) => (
          <Field key={m.label} label={m.label} value={m.value} />
        ))}
      </Box>

      <Section title="Жалобы:" text={data.doctorComplaints || data.complaints} />
      <Section title="Диагноз:" text={data.diagnosis} />
      <Section title="Анамнез:" text={data.anamnesis} />
      <Section title="Объективно:" text={data.objective} />
      <Section title="Рекомендации:" text={data.recommendations} />

      <Divider sx={{ my: 2, borderColor: "rgba(0,0,0,.12)" }} />

      <Stack spacing={0.75}>
        <Field label={tt("print:specialistLabel")} value={data.doctorFio} />
        <Field label="Подпись:" value="" />
      </Stack>
    </Sheet>
  );
};

export const CertificateDocumentView: React.FC<{ data: CertificatePDFData }> = ({ data }) => (
  <Sheet>
    <Box sx={{ textAlign: "center", mb: 2 }}>
      <Typography
        sx={{
          fontWeight: 700,
          color: "inherit",
          textTransform: "uppercase",
          fontSize: { xs: "1.15rem", sm: "1.4rem" },
        }}
      >
        Медицинская справка
      </Typography>
      <Typography sx={{ color: "inherit", fontSize: "0.85rem" }}>
        (врачебное профессионально-консультативное заключение)
      </Typography>
    </Box>

    <Field label="Ф.И.О." value={data.patientFio} />
    <Field label="Дата рождения:" value={data.patientDob} />

    <Typography sx={{ color: "inherit", mt: 2 }}>
      В том, что ребенок был на амбулаторном лечении в{" "}
      {data.organizationName || "Aximo CRM"}
    </Typography>

    <Section title="Заключение:" text={data.conclusion} />

    <Divider sx={{ my: 2, borderColor: "rgba(0,0,0,.12)" }} />

    <Stack spacing={0.75}>
      <Field label="Дата выдачи:" value={data.issueDate} />
      <Field label={tt("print:specialistLabel")} value={data.doctorFio} />
      <Field label="Подпись:" value="" />
    </Stack>
  </Sheet>
);
