import React from "react";
import { Box, IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";

import { subtleBg } from "../../theme/uiHelpers";
import type { BoardCardSpec } from "./types";

export interface BoardCardProps extends BoardCardSpec {
  /** Идентификатор элемента — полезная нагрузка перетаскивания. */
  id: string | number;
  /** Порядок в колонке — задаёт лесенку появления. */
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

/**
 * Оболочка карточки доски: перетаскивание, меню действий, анимация появления
 * и рамка. Содержимое (`content`) рисует модуль — ядро о его полях не знает.
 */
const BoardCard: React.FC<BoardCardProps> = ({
  id,
  ariaLabel,
  accentColor,
  accentTooltip,
  alert,
  actions,
  actionsTooltip = "Действия",
  onOpen,
  content,
  index,
  dragging,
  onDragStart,
  onDragEnd,
}) => {
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  // Системная настройка «уменьшить движение» — тогда карточки просто появляются.
  const reduceMotion = useReducedMotion();
  const hasActions = actions != null && actions.length > 0;

  return (
    /* Обёртка отвечает только за появление и исчезновение: у motion.div свои
       onDragStart/onDragEnd (pan-жесты), они конфликтуют с HTML5-перетаскиванием,
       поэтому drag остаётся на внутреннем Box. */
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
        draggable
        /* Карточка открывается и с клавиатуры: перетаскивание мышью — не
           единственный способ работать с доской (и на тач-экране его нет). */
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          // Safari не начинает перетаскивание без полезной нагрузки.
          e.dataTransfer.setData("text/plain", String(id));
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onClick={onOpen}
        sx={(t) => ({
          position: "relative",
          overflow: "hidden",
          p: 1.25,
          pl: 1.75,
          borderRadius: "12px",
          border: 1,
          borderColor: alert ? alpha(t.palette.error.main, 0.35) : "divider",
          bgcolor: "background.paper",
          cursor: "grab",
          opacity: dragging ? 0.45 : 1,
          transition: "border-color .15s ease, background-color .15s ease, opacity .15s ease",
          "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35), bgcolor: subtleBg(t, true) },
          "&:active": { cursor: "grabbing" },
        })}
      >
        {/* Акцент — полоской по левому краю вместо чипа: не занимает строку
            и не спорит с заголовком за внимание. */}
        {accentColor && (
          <Tooltip title={accentTooltip ?? ""} disableHoverListener={!accentTooltip}>
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

        {/* Те же переходы, что и перетаскиванием: на тач-экране HTML5-drag не
            работает вовсе, да и мышью действие быстрее одним кликом. */}
        {hasActions && (
          <>
            <Tooltip title={actionsTooltip}>
              <IconButton
                size="small"
                aria-label={actionsTooltip}
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
              slotProps={{ paper: { sx: { borderRadius: "12px", minWidth: 190 } } }}
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

export default BoardCard;
