/**
 * Подписи полей заключения на бумаге — один источник на все документы.
 *
 * Заключение показывают четыре разных места: штатный печатный лист
 * (`utility/pdfGenerator`), хвост за листом бланка (`ConclusionTrailer`),
 * адаптивный экранный вид (`pages/print/DocumentViews`) и история правок
 * (`utility/conclusionRevisions`). Пока подписи лежали в каждом по отдельности,
 * одно и то же поле успело разъехаться: колонка `conclusion` печаталась как
 * «Рекомендации» в штатном документе и как «Заключение» в хвосте (08.09.2026).
 *
 * Отдельный модуль, а не константа рядом с рендером PDF: `pdfGenerator`
 * подтягивает html2pdf, которому нужен браузер, и любой тест, взявший отсюда
 * одну строку, падал бы на `self is not defined`.
 *
 * Обычный объект, а не геттер: это надписи на печатном документе, они не
 * терминологичны и не зависят от вертикали бизнеса (тот же довод, что у
 * `REQUIRED_BLOCK_LABELS` в api/conclusionForms.ts).
 */
export const CONCLUSION_FIELD_LABELS = {
  heightCm: "Рост",
  weightKg: "Вес",
  temperature: "Температура",
  complaints: "Жалобы",
  diagnosis: "Диагноз",
  anamnesis: "Анамнез",
  objective: "Объективно",
  conclusion: "Заключение",
} as const;

/** Единицы измерения показателей — печатаются следом за значением. */
export const CONCLUSION_FIELD_UNITS = {
  heightCm: "см",
  weightKg: "кг",
  temperature: "C°",
} as const;
