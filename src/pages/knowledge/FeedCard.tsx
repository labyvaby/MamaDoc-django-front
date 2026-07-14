import React from "react";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";

import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";

import type { SxProps, Theme } from "@mui/material/styles";

import { formatDateRu } from "../../utility/format";
import {
  parseYoutubeId,
  youtubeThumbnailUrl,
  type KnowledgeArticleListItem,
  type KnowledgeVideo,
} from "../../api/knowledge";

/** Элемент общей ленты: статья или видео, сортировка по дате создания. */
export type FeedItem =
  | { kind: "article"; createdAt: string; article: KnowledgeArticleListItem }
  | { kind: "video"; createdAt: string; video: KnowledgeVideo };

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
  item: FeedItem;
  canManage: boolean;
  onOpenArticle: (articleId: number) => void;
  onPlayVideo: (video: KnowledgeVideo) => void;
  onEditVideo: (video: KnowledgeVideo) => void;
  onDeleteVideo: (video: KnowledgeVideo) => void;
}

/** Карточка ленты базы знаний: статья (обложка-иконка) или видео (превью YouTube). */
const FeedCard: React.FC<FeedCardProps> = ({
  item,
  canManage,
  onOpenArticle,
  onPlayVideo,
  onEditVideo,
  onDeleteVideo,
}) => {
  const theme = useTheme();

  if (item.kind === "article") {
    const article = item.article;
    const cover = theme.palette[coverColorKey(article.categoryName ?? article.title)];
    return (
      <Card variant="outlined" sx={cardSx}>
        <CardActionArea onClick={() => onOpenArticle(article.id)}>
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
            <Stack direction="row" gap={0.75} sx={{ mb: 0.5 }} flexWrap="wrap">
              <Chip size="small" variant="outlined" icon={<ArticleOutlined />} label="Статья" sx={chipSx} />
              {article.categoryName && (
                <Chip size="small" variant="outlined" label={article.categoryName} sx={chipSx} />
              )}
              {!article.isPublished && (
                <Chip size="small" color="warning" variant="outlined" label="Черновик" sx={chipSx} />
              )}
            </Stack>
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
  }

  const video = item.video;
  const videoId = parseYoutubeId(video.youtubeUrl);
  return (
    <Card variant="outlined" sx={cardSx}>
      <CardActionArea onClick={() => onPlayVideo(video)}>
        {videoId && (
          <Box sx={{ position: "relative" }}>
            <CardMedia
              component="img"
              image={youtubeThumbnailUrl(videoId)}
              alt={video.title}
              sx={{ aspectRatio: "16/9", objectFit: "cover" }}
            />
            <PlayCircleOutlined
              sx={{
                position: "absolute",
                inset: 0,
                m: "auto",
                fontSize: 52,
                color: "#fff",
                filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.6))",
              }}
            />
          </Box>
        )}
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Stack direction="row" gap={0.75} sx={{ mb: 0.5 }} flexWrap="wrap">
            <Chip size="small" variant="outlined" icon={<PlayCircleOutlined />} label="Видео" sx={chipSx} />
            {video.categoryName && (
              <Chip size="small" variant="outlined" label={video.categoryName} sx={chipSx} />
            )}
            {!video.isPublished && (
              <Chip size="small" color="warning" variant="outlined" label="Черновик" sx={chipSx} />
            )}
          </Stack>
          <Typography variant="body2" fontWeight={600}>
            {video.title}
          </Typography>
          {video.description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {video.description}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
      {canManage && (
        <Stack
          direction="row"
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.background.paper, 0.85),
          }}
        >
          <Tooltip title="Изменить">
            <IconButton size="small" onClick={() => onEditVideo(video)}>
              <EditOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Удалить">
            <IconButton size="small" color="error" onClick={() => onDeleteVideo(video)}>
              <DeleteOutlineOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Card>
  );
};

export default FeedCard;
