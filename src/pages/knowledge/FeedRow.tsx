import React from "react";
import { Box, Card, CardActionArea, Chip, IconButton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import DriveFileMoveOutlined from "@mui/icons-material/DriveFileMoveOutlined";
import LayersOutlined from "@mui/icons-material/LayersOutlined";

import { formatDateRu } from "../../utility/format";
import {
  type KnowledgeArticleListItem,
  type KnowledgeSeriesGroup,
} from "../../api/knowledge";
import FeedCover from "./FeedCover";
import HighlightedText from "./HighlightedText";
import { partsLabel } from "./folders";
import { PartDots } from "./SeriesCard";
import { useArticleCover } from "./useArticleCover";

/**
 * Строка ленты для телефона. Карточка 16:9 во всю ширину экрана давала полторы
 * штуки на видимую область — список приходилось листать «на ощупь». Строка с
 * миниатюрой 4:3 показывает восемь-девять материалов сразу, и обложка при этом
 * остаётся: узнавать статью по картинке — половина навигации в базе знаний.
 *
 * Высота строки — 88px: миниатюра 96×72 плюс padding. Это вдвое больше
 * минимального тач-таргета, так что промахнуться пальцем по строке негде.
 */
const ROW_COVER_WIDTH = 96;

/** Заголовок — максимум две строки, дальше многоточие. */
const clamp2 = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  lineHeight: 1.3,
} as const;

const chipSx = {
  borderRadius: "6px",
  height: 18,
  "& .MuiChip-label": { px: 0.625, fontSize: "0.68rem" },
} as const;

interface RowShellProps {
  /** Семя цвета заглушки обложки — обычно название раздела. */
  coverSeed: string;
  coverTitle: string;
  coverUrl: string | null;
  coverIcon?: React.ReactNode;
  /** Плашка поверх миниатюры — галочка «прочитано» или счётчик частей. */
  coverOverlay?: React.ReactNode;
  title: React.ReactNode;
  /** Вторая строка — прогресс серии; у обычной статьи отсутствует. */
  middle?: React.ReactNode;
  meta: React.ReactNode;
  onOpen: () => void;
  /** Меню выбора папки. Перетаскивания на телефоне нет — только эта кнопка. */
  onMove?: (anchor: HTMLElement) => void;
}

/**
 * Общая раскладка строки: миниатюра слева, текст справа, кнопка «в папку» —
 * последней в потоке, а не поверх обложки (на миниатюре 96px она перекрыла бы
 * саму картинку).
 */
const RowShell: React.FC<RowShellProps> = ({
  coverSeed,
  coverTitle,
  coverUrl,
  coverIcon,
  coverOverlay,
  title,
  middle,
  meta,
  onOpen,
  onMove,
}) => (
  <Card
    variant="outlined"
    sx={(t) => ({
      borderRadius: "14px",
      display: "flex",
      alignItems: "stretch",
      transition: "border-color .15s ease",
      "&:active": { borderColor: alpha(t.palette.primary.main, 0.45) },
    })}
  >
    <CardActionArea
      onClick={onOpen}
      sx={{
        p: 1,
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        flex: 1,
        minWidth: 0,
        borderRadius: "14px",
      }}
    >
      <Box
        sx={{
          width: ROW_COVER_WIDTH,
          flexShrink: 0,
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <FeedCover
          compact
          seed={coverSeed}
          title={coverTitle}
          coverUrl={coverUrl}
          icon={coverIcon}
          overlay={coverOverlay}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} sx={clamp2}>
          {title}
        </Typography>
        {middle}
        <Typography
          variant="caption"
          color="text.secondary"
          component="div"
          noWrap
          sx={{ mt: 0.25 }}
        >
          {meta}
        </Typography>
      </Box>
    </CardActionArea>
    {onMove && (
      <IconButton
        size="small"
        aria-label="Переместить в папку"
        onClick={(e) => {
          e.stopPropagation();
          onMove(e.currentTarget);
        }}
        sx={{ alignSelf: "center", mr: 0.5, flexShrink: 0 }}
      >
        <DriveFileMoveOutlined fontSize="small" />
      </IconButton>
    )}
  </Card>
);

/** Галочка «прочитано» в углу миниатюры. */
const readMark = (
  <CheckCircleOutlined
    sx={(t) => ({
      position: "absolute",
      top: 4,
      right: 4,
      fontSize: 16,
      color: "success.main",
      // Кружок под иконкой — иначе она теряется на пёстрой обложке.
      bgcolor: t.palette.background.paper,
      borderRadius: "50%",
    })}
  />
);

interface ArticleRowProps {
  article: KnowledgeArticleListItem;
  /** organizationId для догрузки detail (нужен суперпользователю/мультиорг). */
  orgId?: number;
  read?: boolean;
  highlight?: string;
  onOpen: (articleId: number) => void;
  onMove?: (anchor: HTMLElement) => void;
}

/** Статья строкой: раздел и дата уходят в одну подпись, автор — в карточку. */
export const ArticleRow: React.FC<ArticleRowProps> = ({
  article,
  orgId,
  read,
  highlight,
  onOpen,
  onMove,
}) => {
  const coverUrl = useArticleCover(article, orgId);

  return (
    <RowShell
      coverSeed={article.categoryName ?? article.title}
      coverTitle={article.title}
      coverUrl={coverUrl}
      coverOverlay={read ? readMark : undefined}
      title={<HighlightedText text={article.title} query={highlight} />}
      meta={
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
          {!article.isPublished && (
            <Chip size="small" color="warning" variant="outlined" label="Черновик" sx={chipSx} />
          )}
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {article.categoryName ? `${article.categoryName} · ` : ""}
            {formatDateRu(article.updatedAt)}
          </Box>
        </Stack>
      }
      onOpen={() => onOpen(article.id)}
      onMove={onMove}
    />
  );
};

interface SeriesRowProps {
  series: KnowledgeSeriesGroup;
  orgId?: number;
  isRead: (articleId: number) => boolean;
  highlight?: string;
  onOpen: (articleId: number) => void;
  onMove?: (anchor: HTMLElement) => void;
}

/**
 * Серия строкой. Как и на карточке, тап открывает первую непрочитанную часть —
 * «продолжить» без отдельной кнопки.
 */
export const SeriesRow: React.FC<SeriesRowProps> = ({
  series,
  orgId,
  isRead,
  highlight,
  onOpen,
  onMove,
}) => {
  const { parts } = series;
  const coverUrl = useArticleCover(parts[0]?.article, orgId);

  const readFlags = parts.map((p) => isRead(p.article.id));
  const readCount = readFlags.filter(Boolean).length;
  const nextIndex = readFlags.findIndex((r) => !r);
  const target = parts[nextIndex === -1 ? 0 : nextIndex];
  const inProgress = readCount > 0 && readCount < parts.length;
  const finished = readCount === parts.length;

  const categoryName = parts[0]?.article.categoryName ?? null;
  const hasDraft = parts.some((p) => !p.article.isPublished);

  return (
    <RowShell
      coverSeed={categoryName ?? series.name}
      coverTitle={series.name}
      coverUrl={coverUrl}
      coverIcon={<LayersOutlined />}
      coverOverlay={
        <Chip
          size="small"
          label={parts.length}
          icon={<LayersOutlined />}
          sx={(t) => ({
            position: "absolute",
            top: 4,
            left: 4,
            borderRadius: "6px",
            height: 18,
            bgcolor: t.palette.background.paper,
            border: `1px solid ${t.palette.divider}`,
            "& .MuiChip-label": { px: 0.5, fontSize: "0.68rem" },
            "& .MuiChip-icon": { fontSize: 12, ml: 0.375, mr: -0.25 },
          })}
        />
      }
      title={<HighlightedText text={series.name} query={highlight} />}
      middle={
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.375 }}>
          <PartDots total={parts.length} readFlags={readFlags} />
          <Typography
            variant="caption"
            color={finished ? "success.main" : "text.secondary"}
            noWrap
          >
            {finished
              ? "прочитано"
              : inProgress
              ? `с части ${target?.partNumber ?? 1}`
              : partsLabel(parts.length)}
          </Typography>
        </Stack>
      }
      meta={
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
          {hasDraft && (
            <Chip size="small" color="warning" variant="outlined" label="Черновики" sx={chipSx} />
          )}
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {categoryName ? `${categoryName} · ` : ""}
            {formatDateRu(series.updatedAt)}
          </Box>
        </Stack>
      }
      onOpen={() => target && onOpen(target.article.id)}
      onMove={onMove}
    />
  );
};
