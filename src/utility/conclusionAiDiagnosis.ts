import { getDiagnoses, type CatalogDiagnosis } from "../api/medical";

/**
 * Диагноз ↔ AI-помощник.
 *
 * Поле диагноза в заключении — не текст, а чипы из каталога МКБ-10 (плюс
 * произвольные строки через freeSolo), а ручка `/medical/ai/assist/` работает
 * только с текстом. Поэтому в модель уходит текстовая проекция выбранного, а
 * её ответ раскладывается обратно: найденные коды МКБ подтягиваются из
 * каталога организации, остальное остаётся произвольной строкой. Врач в
 * любом случае видит результат чипами и правит их до сохранения.
 */

/** Выбранные диагнозы одной строкой — так же они печатаются в документе. */
export const diagnosesAsText = (items: CatalogDiagnosis[]): string =>
  items.map((d) => [d.code, d.title].filter(Boolean).join(" ")).join("; ");

/** Код МКБ-10: латинская буква, две цифры, необязательная подрубрика. */
const ICD_CODE_RE = /\b[A-Z]\d{2}(?:\.\d{1,2})?\b/g;

/** Подпись вроде «Диагноз:» в начале ответа модели — не диагноз. */
const LEADING_LABEL_RE = /^\s*(диагноз[а-яё]*|предварительн[а-яё]+\s+диагноз|dx)\s*[:—-]\s*/i;

const TRAILING_PUNCT_RE = /[\s.;,]+$/;

/** Произвольная строка диагноза — та же форма, что даёт freeSolo в дровере. */
export const freeTextDiagnosis = (title: string): CatalogDiagnosis => ({
  id: -1,
  code: "",
  title: title.trim(),
  displayName: "",
  isActive: true,
  sortOrder: 0,
});

export interface DiagnosisSegment {
  /** Код МКБ, если сегмент начинается с него. */
  code: string | null;
  /** Текст сегмента целиком (с кодом), без хвостовой пунктуации. */
  text: string;
}

/**
 * Режет ответ модели на диагнозы по кодам МКБ: каждый код открывает новый
 * сегмент до следующего кода. Текст до первого кода (после снятой подписи)
 * остаётся отдельным сегментом без кода.
 */
export function splitDiagnosisText(raw: string): DiagnosisSegment[] {
  const text = raw.replace(LEADING_LABEL_RE, "");
  const matches = [...text.matchAll(ICD_CODE_RE)];
  const cut = (s: string) => s.replace(TRAILING_PUNCT_RE, "").trim();
  const segments: DiagnosisSegment[] = [];
  const head = cut(matches.length ? text.slice(0, matches[0].index) : text);
  if (/[a-zа-яё]/i.test(head)) segments.push({ code: null, text: head });
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    segments.push({ code: m[0].toUpperCase(), text: cut(text.slice(start, end)) });
  });
  return segments;
}

/**
 * Собирает чипы диагнозов из ответа модели.
 *
 * Код, который уже выбран, берём как есть; остальные ищем в каталоге по коду
 * (поиск бэка — подстрока по коду или названию, поэтому сверяем код точно).
 * Не найденный в каталоге код остаётся произвольной строкой вместе со своим
 * текстом — врач увидит его чипом и решит сам. Ошибка каталога не роняет
 * применение: сегмент просто остаётся текстом.
 */
export async function resolveDiagnosesFromText(
  raw: string,
  current: CatalogDiagnosis[],
  lookup: (code: string) => Promise<CatalogDiagnosis[]> = (code) => getDiagnoses(code),
): Promise<CatalogDiagnosis[]> {
  const segments = splitDiagnosisText(raw);
  const resolved = await Promise.all(
    segments.map(async (segment) => {
      if (!segment.code) return freeTextDiagnosis(segment.text);
      const code = segment.code;
      const known = current.find((d) => d.code.toUpperCase() === code);
      if (known) return known;
      try {
        const found = await lookup(code);
        return found.find((d) => d.code.toUpperCase() === code) ?? freeTextDiagnosis(segment.text);
      } catch {
        return freeTextDiagnosis(segment.text);
      }
    }),
  );
  // Один и тот же код дважды — модель повторилась; чипы не дублируем.
  const seen = new Set<string>();
  return resolved.filter((d) => {
    const key = d.code ? d.code.toUpperCase() : `text:${d.title.toLowerCase()}`;
    if (!d.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
