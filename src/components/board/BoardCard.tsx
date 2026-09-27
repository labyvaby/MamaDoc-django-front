import React from "react";
import { Box, IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { subtleBg } from "../../theme/uiHelpers";
import { cardSx } from "./cardStyles";
import type { BoardCardSpec } from "./types";

export interface BoardCardProps extends BoardCardSpec {
  /** Идентификатор для dnd-kit (`card:<id>`) — он же ключ React-списка. */
  dndId: string;
  /** Порядок в колонке — задаёт лесенку появления. */
  index: number;
  /** Эту карточку сейчас несут: на месте остаётся полупрозрачная тень. */
  dragging: boolean;
  /** Карточку нельзя взять (нет права переносить). */
  dragDisabled?: boolean;
}

/**
 * Оболочка карточки доски: перетаскивание (dnd-kit sortable), меню действий,
 * анимация появления и рамка. Содержимое (`content`) рисует модуль — ядро о
 * его полях не знает.
 */
const BoardCard: React.FC<BoardCardProps> = ({
  dndId,
  ariaLabel,
  accentColor,
  accentTooltip,
  alert,
  highlight,
  actions,
  actionsTooltip = "Действия",
  onOpen,
  content,
  index,
  dragging,
  dragDisabled,
}) => {
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  // Системная настройка «уменьшить движение» — тогда карточки просто появляются.
  const reduceMotion = useReducedMotion();
  const hasActions = actions != null && actions.length > 0;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: dndId,
      disabled: dragDisabled,
    });

  return (
    /* Внешний motion.div отвечает только за появление и исчезновение;
       перетаскивание и сдвиг соседей (transform от dnd-kit) — на внутреннем
       Box, чтобы две анимации не спорили за один transform. */
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
      transition={{
        duration: 0.18,
        ease: "easeOut",
        // Лесенка сверху вниз: колонка «собирается», а не мигает целиком.
        delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.15),
      }}
    >
      <Box
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        /* Карточка открывается и с клавиатуры: Enter — открыть, Space —
           взять и нести (KeyboardSensor настроен без Enter). */
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
          }
        }}
        onClick={onOpen}
        style={{
          transform: CSS.Translate.toString(transform),
          transition,
        }}
        sx={(t) => ({
          ...cardSx(t, alert, highlight),
          cursor: dragDisabled ? "pointer" : "grab",
          // Плейсхолдер: сама карточка уехала в DragOverlay, на месте — тень,
          // и соседи раздвигаются вокруг неё.
          opacity: dragging ? 0.35 : 1,
          touchAction: "manipulation",
          transitionProperty:
            "border-color, background-color, opacity, box-shadow, transform",
          transitionDuration: ".15s, .15s, .15s, .6s, .2s",
          "&:hover": {
            borderColor: alpha(t.palette.primary.main, 0.35),
            bgcolor: subtleBg(t, true),
          },
          "&:active": { cursor: dragDisabled ? "pointer" : "grabbing" },
        })}
      >
        {/* Акцент — полоской по левому краю вместо чипа: не занимает строку
            и не спорит с заголовком за внимание. */}
        {accentColor && (
          <Tooltip
            title={accentTooltip ?? ""}
            disableHoverListener={!accentTooltip}
          >
            <Box
              sx={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                bgcolor: accentColor,
              }}
            />
          </Tooltip>
        )}

        {/* Те же переходы, что и перетаскиванием: мышью одним кликом быстрее,
            а с клавиатуры и на тач-экране это запасной путь. */}
        {hasActions && (
          <>
            <Tooltip title={actionsTooltip}>
              <IconButton
                size="small"
                aria-label={actionsTooltip}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuAnchor(e.currentTarget);
                }}
                sx={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  color: "text.disabled",
                  opacity: menuAnchor ? 1 : 0.5,
                  transition: "opacity .15s ease, color .15s ease",
                  "&:hover": { opacity: 1, color: "text.primary" },
                }}
              >
                <MoreVertOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              onClick={(e) => e.stopPropagation()}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: { sx: { borderRadius: "12px", minWidth: 190 } },
              }}
            >
              {actions!.map((a) => (
                <MenuItem
                  key={a.key}
                  sx={{ fontSize: "0.875rem" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuAnchor(null);
                    a.onSelect();
                  }}
                >
                  {a.label}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

        {content}
      </Box>
    </motion.div>
  );
};

/** Копия карточки под курсором (DragOverlay): без меню и обработчиков. */
export const BoardCardGhost: React.FC<{
  spec: BoardCardSpec;
  width?: number;
}> = ({ spec, width }) => (
  <Box
    sx={(t) => ({
      ...cardSx(t, spec.alert, false),
      width,
      boxShadow: `0 12px 32px ${alpha(
        t.palette.common.black,
        t.palette.mode === "dark" ? 0.6 : 0.18
      )}`,
      transform: "rotate(2deg)",
      cursor: "grabbing",
      pointerEvents: "none",
    })}
  >
    {spec.accentColor && (
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: spec.accentColor,
        }}
      />
    )}
    {spec.content}
  </Box>
);

export default BoardCard;
