import React from "react";
import { Box } from "@mui/material";

import BoardCard from "./BoardCard";
import BoardColumn from "./BoardColumn";
import type { BoardCardSpec, BoardColumnDef, BoardColumnId } from "./types";

/** Минимальная ширина колонки: уже неё карточка перестаёт читаться. */
const DEFAULT_MIN_COLUMN_WIDTH = 268;

export interface BoardProps<T, C extends BoardColumnId> {
  columns: BoardColumnDef<C>[];
  /** Карточки колонки — модуль держит их у себя (кэш запроса, агрегат доски). */
  itemsOf: (columnId: C) => T[];
  getItemId: (item: T) => string | number;
  /** В какой колонке элемент лежит сейчас: её не гасим при перетаскивании. */
  columnOf: (item: T) => C;
  /** Разрешён ли перенос: колонки, куда нельзя, гаснут ещё до drop. */
  canDrop: (item: T, columnId: C) => boolean;
  /** Карточку бросили в колонку (в свою же колонку ядро не зовёт). */
  onDrop: (item: T, columnId: C) => void;
  /** Оформление и содержимое карточки. */
  card: (item: T) => BoardCardSpec;
  /** Что показать, когда доска пуста целиком (общий экран с пустым списком). */
  emptyState?: React.ReactNode;
  isEmpty?: boolean;
  dropHint?: string;
  minColumnWidth?: number;
}

/**
 * Канбан-доска: ряд колонок с перетаскиванием карточек.
 *
 * Ядро знает про раскладку, drag-and-drop и вид; правила переходов, тексты и
 * загрузка данных остаются в модуле. Используется доской задач (`/tasks`) и
 * воронкой продаж (`/deals`) — см. `MamaDoc/TZ_sales_funnel_module.md` §7.1.
 */
function Board<T, C extends BoardColumnId>({
  columns,
  itemsOf,
  getItemId,
  columnOf,
  canDrop,
  onDrop,
  card,
  emptyState,
  isEmpty,
  dropHint,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
}: BoardProps<T, C>) {
  const [dragged, setDragged] = React.useState<T | null>(null);
  const [hoverColumn, setHoverColumn] = React.useState<C | null>(null);
  const draggedId = dragged != null ? getItemId(dragged) : null;

  const endDrag = () => {
    setDragged(null);
    setHoverColumn(null);
  };

  /* Доска целиком пуста: несколько одинаковых пунктирных зон подряд выглядят
     как поломка, поэтому показываем один экран — тот же, что и у списка. */
  if (isEmpty && emptyState != null) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {emptyState}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        gap: 1.25,
        overflowX: "auto",
        pb: 1,
      }}
    >
      {columns.map((column) => {
        const items = itemsOf(column.id);
        const droppable = dragged != null && canDrop(dragged, column.id);

        return (
          <BoardColumn
            key={column.id}
            title={column.title}
            dotColor={column.dotColor}
            count={column.count}
            headerMeta={column.headerMeta}
            loading={column.loading}
            empty={items.length === 0}
            emptyHint={column.emptyHint}
            dropHint={dropHint}
            droppable={droppable}
            isHover={hoverColumn === column.id && droppable}
            dimmed={dragged != null && !droppable && columnOf(dragged) !== column.id}
            minWidth={minColumnWidth}
            footer={column.footer}
            onScrollEnd={column.onScrollEnd}
            onDragOver={(e) => {
              if (!droppable) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (hoverColumn !== column.id) setHoverColumn(column.id);
            }}
            onDragLeave={() => setHoverColumn((c) => (c === column.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              const item = dragged;
              endDrag();
              if (!item || columnOf(item) === column.id) return;
              onDrop(item, column.id);
            }}
          >
            {items.map((item, index) => {
              const id = getItemId(item);
              return (
                <BoardCard
                  key={id}
                  {...card(item)}
                  id={id}
                  index={index}
                  dragging={draggedId === id}
                  onDragStart={() => setDragged(item)}
                  onDragEnd={endDrag}
                />
              );
            })}
          </BoardColumn>
        );
      })}
    </Box>
  );
}

export default Board;
