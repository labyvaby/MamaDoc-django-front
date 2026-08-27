/**
 * Общие мелочи модуля: тип полезной нагрузки перетаскивания и склонения
 * счётчиков. Лежат отдельно от компонентов, чтобы файлы плитки и обёртки
 * экспортировали только React-компоненты (иначе ломается hot reload).
 */

/** MIME-тип D&D: в нём едет JSON-массив id статей. */
export const ARTICLE_DND_TYPE = "application/x-mamadoc-articles";

/** «12 статей» — существительное склоняется по числу (как partsLabel в SeriesCard). */
export const articlesLabel = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} статья`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} статьи`;
  return `${n} статей`;
};

/** «3 части» — существительное склоняется по числу (как articlesLabel). */
export const partsLabel = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} часть`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} части`;
  return `${n} частей`;
};

/** Достаёт id статей из события перетаскивания (пустой массив — чужой дроп). */
export const readDraggedArticleIds = (dataTransfer: DataTransfer): number[] => {
  const raw = dataTransfer.getData(ARTICLE_DND_TYPE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === "number") : [];
  } catch {
    return [];
  }
};
