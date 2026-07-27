import React from "react";
import { Card, CardActionArea, CardContent, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";

import type { SxProps, Theme } from "@mui/material/styles";

import { formatDateRu } from "../../utility/format";
import { type KnowledgeArticleListItem } from "../../api/knowledge";
import FeedCover from "./FeedCover";
import HighlightedText from "./HighlightedText";
import { useArticleCover } from "./useArticleCover";

/** Ховер по гайду §5.2: только подсветка грани акцентом, без подъёма и теней. */
const cardSx: SxProps<Theme> = (t) => ({
  borderRadius: "14px",
  position: "relative",
  transition: "border-color .15s ease",
  "&:hover": { borderColor: alpha(t.palette.primary.main, 0.28) },
});

const chipSx = { borderRadius: "7px" } as const;

interface FeedCardProps {
  article: KnowledgeArticleListItem;
  /** organizationId для догрузки detail (нужен суперпользователю/мультиорг). */
  orgId?: number;
  /** Прочитана ли статья (локальная отметка — см. useReadArticles). */
  read?: boolean;
  /** Подсветить совпадения поискового запроса в заголовке. */
  highlight?: string;
  onOpen: (articleId: number) => void;
}

/**
 * Карточка статьи в ленте базы знаний. Видео живут внутри статей
 * (YouTube-эмбед в контенте) — отдельного вида карточки для них нет
 * (UPD заказчика 15.07.2026). Части серии схлопываются в SeriesCard.
 */
const FeedCard: React.FC<FeedCardProps> = ({ article, orgId, read, highlight, onOpen }) => {
  const coverUrl = useArticleCover(article, orgId);

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardActionArea onClick={() => onOpen(article.id)}>
        <FeedCover
          seed={article.categoryName ?? article.title}
          title={article.title}
          coverUrl={coverUrl}
          overlay={
            read ? (
              <Tooltip title="Вы это читали">
                <CheckCircleOutlined
                  sx={(t) => ({
                    position: "absolute",
                    top: 8,
                    right: 8,
                    fontSize: 20,
                    color: "success.main",
                    // Кружок под иконкой — иначе она теряется на пёстрой обложке.
                    bgcolor: t.palette.background.paper,
                    borderRadius: "50%",
                  })}
                />
              </Tooltip>
            ) : undefined
          }
        />
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          {(article.categoryName || !article.isPublished) && (
            <Stack direction="row" gap={0.75} sx={{ mb: 0.5 }} flexWrap="wrap">
              {article.categoryName && (
                <Chip size="small" variant="outlined" label={article.categoryName} sx={chipSx} />
              )}
              {!article.isPublished && (
                <Chip size="small" color="warning" variant="outlined" label="Черновик" sx={chipSx} />
              )}
            </Stack>
          )}
          <Typography variant="body2" fontWeight={600}>
            <HighlightedText text={article.title} query={highlight} />
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {article.authorName ?? "—"} · {formatDateRu(article.updatedAt)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default FeedCard;
