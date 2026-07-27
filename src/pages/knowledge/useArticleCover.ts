import { useQuery } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import {
  coverFromHtml,
  getKnowledgeArticle,
  type KnowledgeArticleListItem,
} from "../../api/knowledge";

/**
 * Обложка карточки. Пока бэк не отдаёт coverUrl в списке (тикет
 * backend_ticket_knowledge_images.md, п. 4), догружаем detail статьи и берём
 * картинку из content (помеченную title="cover", иначе первую — см.
 * coverFromHtml). Ключ кэша общий со страницей статьи, так что открытие статьи
 * после ленты не делает повторный запрос. Когда поле появится в списке
 * (coverUrl !== undefined), догрузка отключится сама.
 */
export function useArticleCover(
  article: KnowledgeArticleListItem | undefined,
  orgId: number | undefined,
): string | null {
  const needDetail = Boolean(article) && article?.coverUrl === undefined;
  const detailQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.article(article?.id ?? 0),
    queryFn: ({ signal }) => getKnowledgeArticle(article!.id, orgId, signal),
    enabled: needDetail,
    // Обложка меняется редко — не рефетчим ленту из-за неё; инвалидация
    // после редактирования (knowledge.all) всё равно обновит.
    staleTime: 10 * 60 * 1000,
  });
  if (!article) return null;
  if (!needDetail) return article.coverUrl ?? null;
  const content = detailQuery.data?.content;
  return content ? coverFromHtml(content) : null;
}
