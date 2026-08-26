import { type KnowledgeArticleListItem } from "../../api/knowledge";

/**
 * Сортировка ленты — клиентская: серверного ordering у бэка не подтверждено.
 * Вынесена из KnowledgePage, потому что вариантами пользуется и мобильная
 * панель (лист «Сортировка»), а компонентный файл не должен экспортировать
 * ничего кроме React-компонента — иначе ломается hot reload.
 */
export type SortKey = "recent" | "oldest" | "title";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "title", label: "По алфавиту" },
];

export const sortArticles = (
  articles: KnowledgeArticleListItem[],
  sort: SortKey,
): KnowledgeArticleListItem[] => {
  const list = [...articles];
  if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const dir = sort === "oldest" ? 1 : -1;
  return list.sort((a, b) => dir * a.updatedAt.localeCompare(b.updatedAt));
};
