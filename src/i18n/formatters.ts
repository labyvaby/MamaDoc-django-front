import type { Gender } from "./types";

/** «пациент» → «Пациент». Первая буква, остальное не трогаем. */
export const capitalize = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** «Пациент» → «пациент». Для середины предложения. */
export const lower = (value: string): string =>
  value ? value.charAt(0).toLowerCase() + value.slice(1) : value;

/**
 * Согласование по роду для случаев, где безличную формулировку не подобрать:
 *   agree(glossary.patient.gender, ["добавлен", "добавлена", "добавлено"])
 *
 * По возможности этого стоит избегать — предпочитайте формулировки, не
 * зависящие от рода термина («Запись создана» вместо «Пациент добавлен»).
 * См. docs/i18n-verticals.md, раздел «Род термина».
 */
export const agree = (gender: Gender, [m, f, n]: [string, string, string]): string => {
  if (gender === "f") return f;
  if (gender === "n") return n;
  return m;
};

/**
 * Форма слова по роду термина — для шаблонов:
 *   {{visit.gender, gender(m: создан; f: создана; n: создано)}}
 * Значение — род из глоссария ("m" | "f" | "n"), параметры — формы.
 * Неизвестный род или пропущенная форма — мужская форма (как было в шаблонах).
 */
export const genderForm = (value: unknown, forms: Record<string, unknown>): string => {
  const pick = (g: string): string => (typeof forms[g] === "string" ? (forms[g] as string) : "");
  const gender = value === "f" || value === "n" ? value : "m";
  return pick(gender) || pick("m");
};
