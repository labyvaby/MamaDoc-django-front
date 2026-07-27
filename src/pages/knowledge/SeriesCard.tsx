import React from "react";
import { Box, Card, CardActionArea, CardContent, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import LayersOutlined from "@mui/icons-material/LayersOutlined";

import type { SxProps, Theme } from "@mui/material/styles";

import { formatDateRu } from "../../utility/format";
import { type KnowledgeSeriesGroup } from "../../api/knowledge";
import FeedCover from "./FeedCover";
import HighlightedText from "./HighlightedText";
import { useArticleCover } from "./useArticleCover";

const cardSx: SxProps<Theme> = (t) => ({
  borderRadius: "14px",
  position: "relative",
  transition: "border-color .15s ease",
  "&:hover": { borderColor: alpha(t.palette.primary.main, 0.28) },
});

/** «3 части» — существительное склоняется по числу. */
const partsLabel = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} часть`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} части`;
  return `${n} частей`;
};

interface PartDotsProps {
  total: number;
  /** Индексы (0-based) прочитанных частей. */
  readFlags: boolean[];
}

/** Точки прогресса: закрашенная = прочитанная часть. */
const PartDots: React.FC<PartDotsProps> = ({ total, readFlags }) => (
  <Stack direction="row" gap={0.5} alignItems="center">
    {Array.from({ length: total }).map((_, i) => (
      <Box
        key={i}
        sx={(t) => ({
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: readFlags[i] ? "success.main" : alpha(t.palette.text.primary, 0.2),
        })}
      />
    ))}
  </Stack>
);

interface SeriesCardProps {
  series: KnowledgeSeriesGroup;
  orgId?: number;
  isRead: (articleId: number) => boolean;
  highlight?: string;
  onOpen: (articleId: number) => void;
}

/**
 * Карточка серии в ленте: части схлопнуты в один элемент, чтобы лента не
 * забивалась однотипными карточками «Часть 1 / 2 / 3». Клик открывает первую
 * непрочитанную часть — так «Продолжить» работает без отдельной кнопки, —
 * а если прочитано всё, возвращает к первой части.
 */
const SeriesCard: React.FC<SeriesCardProps> = ({ series, orgId, isRead, highlight, onOpen }) => {
  const { parts } = series;
  // Обложка серии — обложка её первой части.
  const coverUrl = useArticleCover(parts[0]?.article, orgId);

  const readFlags = parts.map((p) => isRead(p.article.id));
  const readCount = readFlags.filter(Boolean).length;
  const nextIndex = readFlags.findIndex((r) => !r);
  const target = parts[nextIndex === -1 ? 0 : nextIndex];
  const inProgress = readCount > 0 && readCount < parts.length;
  const finished = readCount === parts.length;

  const hasDraft = parts.some((p) => !p.article.isPublished);
  const categoryName = parts[0]?.article.categoryName ?? null;
  const updatedBy = parts[0]?.article.authorName ?? "—";

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardActionArea onClick={() => target && onOpen(target.article.id)}>
        <FeedCover
          seed={categoryName ?? series.name}
          title={series.name}
          coverUrl={coverUrl}
          icon={<LayersOutlined />}
          overlay={
            <Chip
              size="small"
              icon={<LayersOutlined />}
              label={partsLabel(parts.length)}
              sx={(t) => ({
                position: "absolute",
                top: 8,
                left: 8,
                borderRadius: "7px",
                height: 22,
                bgcolor: t.palette.background.paper,
                border: `1px solid ${t.palette.divider}`,
                "& .MuiChip-label": { px: 0.75, fontSize: "0.7rem" },
                "& .MuiChip-icon": { fontSize: 14, ml: 0.5, mr: -0.25 },
              })}
            />
          }
        />
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          {(categoryName || hasDraft) && (
            <Stack direction="row" gap={0.75} sx={{ mb: 0.5 }} flexWrap="wrap">
              {categoryName && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={categoryName}
                  sx={{ borderRadius: "7px" }}
                />
              )}
              {hasDraft && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label="Есть черновики"
                  sx={{ borderRadius: "7px" }}
                />
              )}
            </Stack>
          )}
          <Typography variant="body2" fontWeight={600}>
            <HighlightedText text={series.name} query={highlight} />
          </Typography>

          <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.5, mb: 0.25 }}>
            <Tooltip title={parts.map((p) => `Часть ${p.partNumber}`).join(" · ")}>
              <span>
                <PartDots total={parts.length} readFlags={readFlags} />
              </span>
            </Tooltip>
            <Typography
              variant="caption"
              color={finished ? "success.main" : "text.secondary"}
              noWrap
            >
              {finished
                ? "прочитано полностью"
                : inProgress
                ? `продолжить с части ${target?.partNumber ?? 1}`
                : partsLabel(parts.length)}
            </Typography>
          </Stack>

          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {updatedBy} · {formatDateRu(series.updatedAt)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default SeriesCard;
