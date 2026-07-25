import React from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";

import ArticleOutlined from "@mui/icons-material/ArticleOutlined";

import type { SxProps, Theme } from "@mui/material/styles";

import { formatDateRu } from "../../utility/format";
import { djangoQueryKeys } from "../../api/queryKeys";
import {
  coverFromHtml,
  getKnowledgeArticle,
  type KnowledgeArticleListItem,
} from "../../api/knowledge";

/** Ховер по гайду §5.2: только подсветка грани акцентом, без подъёма и теней. */
const cardSx: SxProps<Theme> = (t) => ({
  borderRadius: "14px",
  position: "relative",
  transition: "border-color .15s ease",
  "&:hover": { borderColor: alpha(t.palette.primary.main, 0.28) },
});

const chipSx = { borderRadius: "7px" } as const;

/** Палитра обложек статей — только семантические цвета темы (без хардкода). */
const COVER_COLOR_KEYS = ["primary", "success", "info", "warning", "secondary"] as const;

/** Детерминированный цвет по разделу: у статей одного раздела — одна обложка. */
const coverColorKey = (seed: string): (typeof COVER_COLOR_KEYS)[number] => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COVER_COLOR_KEYS[Math.abs(h) % COVER_COLOR_KEYS.length];
};

/**
 * Обложка карточки. Пока бэк не отдаёт coverUrl в списке (тикет
 * backend_ticket_knowledge_images.md, п. 4), догружаем detail статьи и берём
 * картинку из content (помеченную title="cover", иначе первую — см.
 * coverFromHtml). Ключ кэша общий со страницей статьи, так что открытие статьи
 * после ленты не делает повторный запрос. Когда поле появится в списке
 * (coverUrl !== undefined), догрузка отключится сама.
 */
function useArticleCover(
  article: KnowledgeArticleListItem,
  orgId: number | undefined,
): string | null {
  const needDetail = article.coverUrl === undefined;
  const detailQuery = useQuery({
    queryKey: djangoQueryKeys.knowledge.article(article.id),
    queryFn: ({ signal }) => getKnowledgeArticle(article.id, orgId, signal),
    enabled: needDetail,
    // Обложка меняется редко — не рефетчим ленту из-за неё; инвалидация
    // после редактирования (knowledge.all) всё равно обновит.
    staleTime: 10 * 60 * 1000,
  });
  if (!needDetail) return article.coverUrl ?? null;
  const content = detailQuery.data?.content;
  return content ? coverFromHtml(content) : null;
}

interface FeedCardProps {
  article: KnowledgeArticleListItem;
  /** organizationId для догрузки detail (нужен суперпользователю/мультиорг). */
  orgId?: number;
  onOpen: (articleId: number) => void;
}

/**
 * Карточка статьи в ленте базы знаний. Видео живут внутри статей
 * (YouTube-эмбед в контенте) — отдельного вида карточки для них нет
 * (UPD заказчика 15.07.2026).
 */
const FeedCard: React.FC<FeedCardProps> = ({ article, orgId, onOpen }) => {
  const theme = useTheme();
  const cover = theme.palette[coverColorKey(article.categoryName ?? article.title)];

  const coverUrl = useArticleCover(article, orgId);
  // Битая ссылка на обложку — откатываемся на «обложку из буквы».
  const [coverError, setCoverError] = React.useState(false);
  const showImage = Boolean(coverUrl) && !coverError;

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardActionArea onClick={() => onOpen(article.id)}>
        <Box
          sx={{
            aspectRatio: "16/9",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            bgcolor: alpha(cover.main, theme.palette.mode === "dark" ? 0.16 : 0.09),
          }}
        >
          {showImage ? (
            <Box
              component="img"
              src={coverUrl ?? undefined}
              alt=""
              loading="lazy"
              onError={() => setCoverError(true)}
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <>
              {/* Крупная первая буква заголовка — «обложка» без картинок и градиентов. */}
              <Typography
                component="span"
                sx={{
                  fontSize: "3rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: -1,
                  color: alpha(cover.main, theme.palette.mode === "dark" ? 0.9 : 0.75),
                  userSelect: "none",
                }}
              >
                {(article.title.trim()[0] ?? "•").toUpperCase()}
              </Typography>
              <ArticleOutlined
                sx={{
                  position: "absolute",
                  right: 10,
                  bottom: 8,
                  fontSize: 18,
                  color: alpha(cover.main, 0.55),
                }}
              />
            </>
          )}
        </Box>
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
            {article.title}
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
