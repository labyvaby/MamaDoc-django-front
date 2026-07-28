import React from "react";
import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import {
  getKnowledgeArticles,
  type KnowledgeArticle,
  type KnowledgeSeriesPart,
} from "../../api/knowledge";

/**
 * Сколько статей организации просмотреть в поисках соседей серии.
 *
 * ⚠ Если в организации статей больше — часть, оказавшаяся за пределами этой
 * страницы, не попадёт в навигацию (то же ограничение, что у groupArticleFeed
 * в ленте: группируем среди подгруженного, не по всей организации).
 */
const SERIES_LOOKUP_PAGE_SIZE = 200;

export interface ArticleSeriesContext {
  /** null — статья не часть серии либо соседей не нашлось. */
  ref: { id: number; name: string } | null;
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
 * Ни `seriesId`, ни `seriesName` список статей не фильтруют и не ищутся —
 * проверено на живом API 28.07.2026: `seriesId` как query-параметр бэк молча
 * игнорирует, а серверный поиск (`search`) индексирует только title+content,
 * куда `seriesName` не входит (это отдельное поле статьи, а не часть текста).
 * Поэтому соседей ищем среди широкой выборки статей организации и сверяем
 * `seriesId` на клиенте — тот же приём, что и в groupArticleFeed для ленты.
 *
 * Права соблюдаются сами собой: без knowledge.manage бэк отдаёт только
 * опубликованные части, и в навигации черновики не появятся.
 */
export function useArticleSeries(
  article: KnowledgeArticle | undefined,
  orgId: number | undefined,
): ArticleSeriesContext {
  const ref = React.useMemo(
    () =>
      article?.seriesId != null && article.seriesName != null
        ? { id: article.seriesId, name: article.seriesName }
        : null,
    [article],
  );

  const query = useQuery({
    queryKey: djangoQueryKeys.knowledge.articles({
      seriesOf: ref?.id ?? "",
      orgId: orgId ?? null,
    }),
    queryFn: ({ signal }) =>
      getKnowledgeArticles(
        { page: 1, pageSize: SERIES_LOOKUP_PAGE_SIZE, organizationId: orgId },
        signal,
      ),
    enabled: Boolean(ref),
    staleTime: 5 * 60 * 1000,
  });

  return React.useMemo(() => {
    if (!ref || !article) return EMPTY;

    const parts: KnowledgeSeriesPart[] = [];
    for (const item of query.data?.results ?? []) {
      if (item.seriesId !== ref.id || item.partNumber == null) continue;
      parts.push({ article: item, partNumber: item.partNumber, partTitle: item.title });
    }
    // Текущая статья может не попасть в выдачу поиска (например, она черновик,
    // открытый по прямой ссылке) — добавляем её сами, иначе «часть 2 из 3»
    // посчиталась бы неверно.
    if (!parts.some((p) => p.article.id === article.id) && article.partNumber != null) {
      parts.push({ article, partNumber: article.partNumber, partTitle: article.title });
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
