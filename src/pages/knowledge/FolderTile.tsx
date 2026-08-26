import React from "react";
import { Box, Card, CardActionArea, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";

import { subtleBg } from "../../theme";
import { ARTICLE_DND_TYPE, articlesLabel, readDraggedArticleIds } from "./folders";

interface FolderTileProps {
  name: string;
  /** Число статей в папке; 0 — «пусто». */
  count: number;
  onOpen: () => void;
  /**
   * Дроп статьи на папку. Приходит список id: у карточки серии частей несколько,
   * и переносить их надо вместе — иначе серия расползётся по папкам и в корне
   * схлопнется в неполную карточку.
   */
  onDropArticles?: (articleIds: number[]) => void;
  /** Переименование/удаление — только с knowledge.manage. */
  onEdit?: () => void;
  /**
   * Компактный вид для телефона: плитка живёт в прокручиваемой полке над
   * лентой, поэтому иконка и отступы мельче — иначе пять папок съедали треть
   * экрана до первой статьи.
   */
  compact?: boolean;
}

/**
 * Плитка папки в базе знаний. Папка — произвольная группировка статей
 * (см. раздел «Папки» в api/knowledge.ts): она не заменяет ни разделы-чипы, ни
 * серии-части, а лежит рядом с ними третьим измерением.
 *
 * Плитка одновременно — цель перетаскивания: статью кладут в папку, бросая на
 * неё карточку. Пока над плиткой висит карточка, грань подсвечивается акцентом,
 * иначе непонятно, куда именно упадёт статья.
 *
 * Ховер по гайду §5.2 — только подсветка грани, без подъёма и теней.
 */
const FolderTile: React.FC<FolderTileProps> = ({
  name,
  count,
  onOpen,
  onDropArticles,
  onEdit,
  compact = false,
}) => {
  const [dragOver, setDragOver] = React.useState(false);
  const canDrop = onDropArticles != null;

  return (
    <Card
      variant="outlined"
      onDragOver={
        canDrop
          ? (e) => {
              // Без preventDefault браузер не считает элемент зоной сброса.
              if (!e.dataTransfer.types.includes(ARTICLE_DND_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={canDrop ? () => setDragOver(false) : undefined}
      onDrop={
        canDrop
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const ids = readDraggedArticleIds(e.dataTransfer);
              if (ids.length > 0) onDropArticles?.(ids);
            }
          : undefined
      }
      sx={(t) => ({
        borderRadius: "14px",
        transition: "border-color .15s ease, background-color .15s ease",
        borderColor: dragOver ? alpha(t.palette.primary.main, 0.6) : undefined,
        bgcolor: dragOver ? alpha(t.palette.primary.main, 0.06) : undefined,
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.28) },
      })}
    >
      <CardActionArea onClick={onOpen} sx={{ p: compact ? 1.25 : 1.5, borderRadius: "14px" }}>
        <Stack direction="row" alignItems="center" gap={compact ? 1 : 1.25}>
          <Box
            sx={(t) => ({
              width: compact ? 32 : 40,
              height: compact ? 32 : 40,
              borderRadius: compact ? "8px" : "10px",
              bgcolor: dragOver ? alpha(t.palette.primary.main, 0.12) : subtleBg(t, true),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            })}
          >
            {dragOver ? (
              <FolderOpenOutlined sx={{ fontSize: compact ? 18 : 22, color: "primary.main" }} />
            ) : (
              <FolderOutlined sx={{ fontSize: compact ? 18 : 22, color: "primary.main" }} />
            )}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {dragOver ? "перенести сюда" : count === 0 ? "пусто" : articlesLabel(count)}
            </Typography>
          </Box>
          {onEdit && (
            <Tooltip title="Переименовать или удалить">
              {/* Кнопка внутри CardActionArea: гасим клик, иначе он откроет папку. */}
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onEdit();
                }}
                sx={{ flexShrink: 0 }}
              >
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </CardActionArea>
    </Card>
  );
};

export default FolderTile;
