import React from "react";
import { Box, Button, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import LayersOutlined from "@mui/icons-material/LayersOutlined";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";

import { partLabel, type KnowledgeSeriesPart } from "../../api/knowledge";

interface SeriesHeaderProps {
  name: string;
  parts: KnowledgeSeriesPart[];
  /** Индекс текущей части в parts. */
  index: number;
  isRead: (articleId: number) => boolean;
  onOpen: (articleId: number) => void;
}

/**
 * Плашка серии над статьёй: где мы находимся и переход к любой части.
 * Шаги кликабельны — это и есть оглавление серии, отдельного списка не нужно.
 */
export const SeriesHeader: React.FC<SeriesHeaderProps> = ({
  name,
  parts,
  index,
  isRead,
  onOpen,
}) => (
  <Paper variant="outlined" sx={{ borderRadius: "14px", p: 1.5, mb: 1.5 }}>
    <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
      <LayersOutlined fontSize="small" sx={{ color: "text.secondary" }} />
      <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
        {name}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: "auto" }}>
        часть {index + 1} из {parts.length}
      </Typography>
    </Stack>

    <Stack direction="row" gap={0.75} flexWrap="wrap">
      {parts.map((part, i) => {
        const current = i === index;
        const read = isRead(part.article.id);
        return (
          <Tooltip key={part.article.id} title={partLabel(part)}>
            <Box
              component="button"
              type="button"
              onClick={() => !current && onOpen(part.article.id)}
              sx={(t) => ({
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.5,
                maxWidth: 220,
                border: `1px solid ${current ? t.palette.primary.main : t.palette.divider}`,
                borderRadius: "7px",
                bgcolor: current ? alpha(t.palette.primary.main, 0.08) : "transparent",
                color: current ? "primary.main" : "text.secondary",
                cursor: current ? "default" : "pointer",
                font: "inherit",
                fontSize: "0.8rem",
                transition: "border-color .15s ease, color .15s ease",
                "&:hover": current
                  ? undefined
                  : { color: "text.primary", borderColor: alpha(t.palette.primary.main, 0.4) },
              })}
            >
              {read && !current ? (
                <CheckOutlined sx={{ fontSize: 14, color: "success.main" }} />
              ) : (
                <Box
                  component="span"
                  sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                >
                  {part.partNumber}
                </Box>
              )}
              <Box
                component="span"
                sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {partLabel(part)}
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Stack>
  </Paper>
);

interface SeriesFooterNavProps {
  prev: KnowledgeSeriesPart | null;
  next: KnowledgeSeriesPart | null;
  onOpen: (articleId: number) => void;
}

/** Переход к соседней части внизу статьи — «дочитал и пошёл дальше». */
export const SeriesFooterNav: React.FC<SeriesFooterNavProps> = ({ prev, next, onOpen }) => (
  <Stack
    direction={{ xs: "column", sm: "row" }}
    gap={1}
    sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}
  >
    {prev && (
      <Button
        variant="outlined"
        startIcon={<ArrowBackOutlined />}
        onClick={() => onOpen(prev.article.id)}
        sx={{ justifyContent: "flex-start", maxWidth: { sm: "48%" } }}
      >
        <Box sx={{ minWidth: 0, textAlign: "left" }}>
          <Typography variant="caption" color="text.secondary" component="div">
            Часть {prev.partNumber}
          </Typography>
          <Typography variant="body2" noWrap>
            {partLabel(prev)}
          </Typography>
        </Box>
      </Button>
    )}
    {next && (
      <Button
        variant="contained"
        endIcon={<ArrowForwardOutlined />}
        onClick={() => onOpen(next.article.id)}
        sx={{ justifyContent: "flex-end", ml: { sm: "auto" }, maxWidth: { sm: "48%" } }}
      >
        <Box sx={{ minWidth: 0, textAlign: "right" }}>
          <Typography variant="caption" sx={{ opacity: 0.8 }} component="div">
            Часть {next.partNumber}
          </Typography>
          <Typography variant="body2" noWrap>
            {partLabel(next)}
          </Typography>
        </Box>
      </Button>
    )}
  </Stack>
);
