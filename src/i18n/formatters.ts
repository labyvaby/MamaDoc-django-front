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
