import React from "react";
import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import {
  getKnowledgeArticles,
  parseArticleSeries,
  type ArticleSeriesRef,
  type KnowledgeArticle,
  type KnowledgeSeriesPart,
} from "../../api/knowledge";

/** Сколько частей серии имеет смысл искать одним запросом. */
const SERIES_LOOKUP_PAGE_SIZE = 50;

export interface ArticleSeriesContext {
  /** null — статья не часть серии либо соседей не нашлось. */
  ref: ArticleSeriesRef | null;
  parts: KnowledgeSeriesPart[];
  /** Позиция текущей статьи в parts, -1 — не найдена. */
  index: number;
  prev: KnowledgeSeriesPart | null;
  next: KnowledgeSeriesPart | null;
  loading: boolean;
}

const EMPTY: ArticleSeriesContext = {
  ref: null,
  parts: [],
  index: -1,
  prev: null,
  next: null,
  loading: false,
};

/**
 * Соседние части серии для страницы статьи.
 *
 * Серия связана через название (полей серии у бэка нет — см. api/knowledge.ts),
 * поэтому соседей ищем серверным поиском по имени серии и оставляем те, чей
 * разобранный ключ совпал. Поиск идёт по title+content, так что в выдачу
 * попадают и посторонние статьи — фильтр по ключу их отсекает.
 *
 * Права соблюдаются сами собой: без knowledge.manage бэк отдаёт только
 * опубликованные части, и в навигации черновики не появятся.
 */
export function useArticleSeries(
  article: KnowledgeArticle | undefined,
  orgId: number | undefined,
): ArticleSeriesContext {
  const ref = React.useMemo(
    () => (article ? parseArticleSeries(article.title) : null),
    [article],
  );

  const query = useQuery({
    queryKey: djangoQueryKeys.knowledge.articles({
      seriesOf: ref?.key ?? "",
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getKnowledgeArticles(
        {
          search: ref?.name,
          page: 1,
          pageSize: SERIES_LOOKUP_PAGE_SIZE,
          organizationId: orgId,
        },
        signal,
      ),
    enabled: Boolean(ref),
    staleTime: 5 * 60 * 1000,
  });

  return React.useMemo(() => {
    if (!ref || !article) return EMPTY;

    const parts: KnowledgeSeriesPart[] = [];
    for (const item of query.data?.results ?? []) {
      const itemRef = parseArticleSeries(item.title);
      if (!itemRef || itemRef.key !== ref.key) continue;
      parts.push({
        article: item,
        partNumber: itemRef.partNumber,
        partTitle: itemRef.partTitle,
      });
    }
    // Текущая статья может не попасть в выдачу поиска (например, она черновик,
    // открытый по прямой ссылке) — добавляем её сами, иначе «часть 2 из 3»
    // посчиталась бы неверно.
    if (!parts.some((p) => p.article.id === article.id)) {
      parts.push({ article, partNumber: ref.partNumber, partTitle: ref.partTitle });
    }
    parts.sort((a, b) => a.partNumber - b.partNumber || a.article.id - b.article.id);

    // Одна часть — это ещё не серия (то же правило, что в ленте).
    if (parts.length < 2) return { ...EMPTY, ref, loading: query.isLoading };

    const index = parts.findIndex((p) => p.article.id === article.id);
    return {
      ref,
      parts,
      index,
      prev: index > 0 ? parts[index - 1] : null,
      next: index >= 0 && index < parts.length - 1 ? parts[index + 1] : null,
      loading: query.isLoading,
    };
  }, [ref, article, query.data, query.isLoading]);
}
