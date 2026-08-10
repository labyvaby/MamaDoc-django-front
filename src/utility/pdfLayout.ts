/**
 * Чистые константы геометрии и хелперы для печатных документов.
 *
 * Вынесено из `pdfGenerator.ts` намеренно: тот модуль импортирует html2pdf.js,
 * который падает вне браузера (`self is not defined`), поэтому покрыть его
 * тестами нельзя. Здесь только арифметика и строки — тестируется в node.
 */

/**
 * 🔴 Документ ОБЯЗАН быть ровно 210mm ВМЕСТЕ с отступами. Раньше контейнер
 * задавался как `width: 190mm` + `padding: … 15mm … 10mm` при дефолтном
 * `box-sizing: content-box`, то есть реально занимал 215mm (справка — 220mm):
 * правый край текста уезжал за границу страницы и обрезался. Отсюда
 * `box-sizing: border-box` в шаблонах и ширина = A4_WIDTH_MM.
 */
export const A4_WIDTH_MM = 210;


const toPrintableString = (value: unknown) => String(value ?? "");

/**
 * Имя файла PDF: без пробелов, всегда с расширением.
 *
 * Расширение критично для мобильных: имя берётся браузером из `<a download>`,
 * и без `.pdf` Android получает файл вида `6583c625-1baf-…` без типа и не
 * знает, чем его открыть.
 */
export const pdfFileName = (prefix: string, patientFio: string) => {
  const slug = toPrintableString(patientFio).trim().replace(/\s+/g, "_");
  return `${prefix}_${slug || "document"}.pdf`;
};
