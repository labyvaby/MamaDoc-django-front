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

import ArticleOutlined from "@mui/icons-material/ArticleOutlined";

import type { SxProps, Theme } from "@mui/material/styles";

import { formatDateRu } from "../../utility/format";
import type { KnowledgeArticleListItem } from "../../api/knowledge";

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

interface FeedCardProps {
  article: KnowledgeArticleListItem;
  onOpen: (articleId: number) => void;
}

/**
 * Карточка статьи в ленте базы знаний. Видео живут внутри статей
 * (YouTube-эмбед в контенте) — отдельного вида карточки для них нет
 * (UPD заказчика 15.07.2026).
 */
const FeedCard: React.FC<FeedCardProps> = ({ article, onOpen }) => {
  const theme = useTheme();
  const cover = theme.palette[coverColorKey(article.categoryName ?? article.title)];

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
            bgcolor: alpha(cover.main, theme.palette.mode === "dark" ? 0.16 : 0.09),
          }}
        >
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
