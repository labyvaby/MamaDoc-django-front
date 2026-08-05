import React from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import DriveFileMoveOutlined from "@mui/icons-material/DriveFileMoveOutlined";

import { ARTICLE_DND_TYPE } from "./folders";

interface ArticleDraggableProps {
  /**
   * Что переносим. У карточки серии частей несколько — они переносятся вместе,
   * иначе серия расползётся по папкам и в корне схлопнется в неполную карточку.
   */
  articleIds: number[];
  /** Перекладывать статьи может только knowledge.manage. */
  enabled: boolean;
  /**
   * Открыть меню выбора папки. Нужно там, где D&D физически недоступен —
   * на телефоне и планшете нативного HTML5-перетаскивания нет, и без этой
   * кнопки папки на мобильном были бы только для чтения.
   */
  onMoveClick?: (anchor: HTMLElement) => void;
  children: React.ReactNode;
}

/**
 * Обёртка карточки ленты: делает её источником перетаскивания в папку и
 * добавляет кнопку «переместить» для тач-устройств. Вынесена отдельно, чтобы
 * FeedCard и SeriesCard остались как есть — им не нужно ничего знать о папках.
 */
const ArticleDraggable: React.FC<ArticleDraggableProps> = ({
  articleIds,
  enabled,
  onMoveClick,
  children,
}) => {
  const [dragging, setDragging] = React.useState(false);

  return (
    <Box
      draggable={enabled}
      onDragStart={
        enabled
          ? (e) => {
              e.dataTransfer.setData(ARTICLE_DND_TYPE, JSON.stringify(articleIds));
              e.dataTransfer.effectAllowed = "move";
              setDragging(true);
            }
          : undefined
      }
      onDragEnd={enabled ? () => setDragging(false) : undefined}
      sx={{
        position: "relative",
        cursor: enabled ? "grab" : undefined,
        // Пока карточку тащат, она гаснет — видно, что «поднята», а не осталась.
        opacity: dragging ? 0.5 : 1,
        transition: "opacity .15s ease",
        "&:active": { cursor: enabled ? "grabbing" : undefined },
      }}
    >
      {children}
      {enabled && onMoveClick && (
        <Tooltip title="Переместить в папку">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onMoveClick(e.currentTarget);
            }}
            sx={(t) => ({
              position: "absolute",
              top: 6,
              left: 6,
              // Подложка: иконка иначе теряется на пёстрой обложке.
              bgcolor: t.palette.background.paper,
              border: `1px solid ${t.palette.divider}`,
              "&:hover": { bgcolor: t.palette.background.paper },
            })}
          >
            <DriveFileMoveOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default ArticleDraggable;
