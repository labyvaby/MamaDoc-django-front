import React from "react";
import { Skeleton, Stack, Typography } from "@mui/material";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { AnimatePresence } from "framer-motion";
import InboxOutlined from "@mui/icons-material/InboxOutlined";

import { subtleBg } from "../../theme/uiHelpers";

/** Насколько заранее до низа списка просим следующую порцию. */
const SCROLL_LOAD_THRESHOLD_PX = 160;

export interface BoardColumnProps {
  title: string;
  dotColor?: string;
  count?: number;
  headerMeta?: React.ReactNode;
  loading?: boolean;
  /** В колонке нет карточек — рисуем зону вместо списка. */
  empty: boolean;
  emptyHint?: string;
  /** Подпись зоны, когда карточку можно сюда бросить. */
  dropHint?: string;
  /** Сюда можно бросить перетаскиваемую карточку. */
  droppable: boolean;
  /** Карточку держат над этой колонкой. */
  isHover: boolean;
  /** Перенос идёт, но в эту колонку нельзя — колонка гаснет. */
  dimmed: boolean;
  minWidth: number;
  footer?: React.ReactNode;
  onScrollEnd?: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  children: React.ReactNode;
}

/** Колонка доски: шапка со счётчиком, прокручиваемый список, зона переноса. */
const BoardColumn: React.FC<BoardColumnProps> = ({
  title,
  dotColor,
  count,
  headerMeta,
  loading,
  empty,
  emptyHint = "Пусто",
  dropHint = "Перенести сюда",
  droppable,
  isHover,
  dimmed,
  minWidth,
  footer,
  onScrollEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}) => (
  <Stack
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    sx={(t) => ({
      /* Колонки делят всю ширину поровну, но не уже minWidth: на широком
         экране доска не оставляет пустоту справа, на узком — включается
         горизонтальная прокрутка контейнера. */
      flex: `1 0 ${minWidth}px`,
      // Без сброса min-width колонка с длинными подписями выторговывает себе
      // лишние пиксели и ряд перестаёт быть ровным.
      minWidth: 0,
      minHeight: 0,
      borderRadius: "14px",
      border: 1,
      borderColor: isHover ? alpha(t.palette.primary.main, 0.5) : "divider",
      bgcolor: isHover ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.1 : 0.05) : subtleBg(t),
      transition: "border-color .15s ease, background-color .15s ease",
      // Колонка, куда перенос запрещён, гаснет — правило видно до drop.
      opacity: dimmed ? 0.5 : 1,
    })}
  >
    <Stack
      direction="row"
      alignItems="center"
      gap={0.75}
      sx={{ px: 1.5, py: 1.25, borderBottom: 1, borderColor: "divider" }}
    >
      {/* Тот же цвет, что у чипа статуса в таблице — доска и список
          говорят на одном языке. */}
      {dotColor && (
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: dotColor,
          }}
        />
      )}
      <Typography variant="subtitle2" fontWeight={600} noWrap>
        {title}
      </Typography>
      {count != null && (
        <Typography variant="caption" color="text.secondary">
          {count}
        </Typography>
      )}
      {headerMeta}
    </Stack>

    <Stack
      gap={1}
      onScroll={(e) => {
        if (!onScrollEnd) return;
        // Догружаем следующую порцию, не доходя до самого низа, — так
        // прокрутка не упирается в конец списка.
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_LOAD_THRESHOLD_PX) return;
        onScrollEnd();
      }}
      sx={{ p: 1, overflowY: "auto", flex: 1, minHeight: 0 }}
    >
      {loading ? (
        Array.from({ length: 3 }).map((_, k) => <Skeleton key={k} variant="rounded" height={92} />)
      ) : empty ? (
        /* Пустая колонка — норма, а не ошибка: вместо серого «Пусто» в
           каждой колонке рисуем спокойную зону, которая заодно показывает,
           куда можно бросить карточку. */
        <Stack
          alignItems="center"
          justifyContent="center"
          gap={0.75}
          sx={(t) => ({
            /* Высота карточки, а не всей колонки: зона читается как
               место под карточку, а не как пустое полотно. */
            minHeight: 96,
            borderRadius: "10px",
            border: "1px dashed",
            borderColor: droppable ? alpha(t.palette.primary.main, 0.45) : "divider",
            opacity: droppable ? 1 : 0.6,
            transition: "border-color .15s ease, opacity .15s ease",
          })}
        >
          <InboxOutlined sx={{ fontSize: 22, color: "text.disabled" }} />
          <Typography variant="caption" color="text.disabled">
            {droppable ? dropHint : emptyHint}
          </Typography>
        </Stack>
      ) : (
        <>
          <AnimatePresence>{children}</AnimatePresence>
          {footer}
        </>
      )}
    </Stack>
  </Stack>
);

export default BoardColumn;
