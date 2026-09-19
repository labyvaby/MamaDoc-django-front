import React from "react";
import { Box } from "@mui/material";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import BoardCard, { BoardCardGhost } from "./BoardCard";
import BoardColumn from "./BoardColumn";
import {
  cardDndId,
  columnDndId,
  columnOfCard,
  resolveDrop,
  type DndColumn,
} from "./dnd";
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
  /**
   * Разрешён ли перенос: колонки, куда нельзя, гаснут ещё до drop. Для своей
   * колонки — можно ли переставлять карточки внутри неё (у сделок — да, у
   * задач порядка нет).
   */
  canDrop: (item: T, columnId: C) => boolean;
  /**
   * Карточку бросили: колонка и 0-based место в ней (без учёта самой
   * карточки). В свою колонку на то же место ядро не зовёт.
   */
  onDrop: (item: T, columnId: C, index: number) => void;
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
 * воронкой продаж (`/deals`).
 *
 * Перетаскивание — `@dnd-kit`: сортировка внутри колонки, раздвигающиеся
 * соседи вместо «пунктирной зоны», копия карточки под курсором
 * (`DragOverlay`), автопрокрутка у краёв, тач (удержание 200 мс) и
 * клавиатура (Space — взять, стрелки — нести, Space — отпустить, Esc —
 * отмена). Меню «Перенести в…» на карточке остаётся запасным путём.
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
  const [ghostWidth, setGhostWidth] = React.useState<number | undefined>(
    undefined
  );

  const sensors = useSensors(
    // Клик без движения остаётся кликом (открыть карточку): drag стартует
    // после 6px пути.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // На тач-экране короткое касание — прокрутка колонки, удержание — drag.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    // Enter открывает карточку, поэтому взять/отпустить — только Space.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );

  /* Снимок раскладки для чистых функций: dnd-kit говорит только «над чем»,
     а колонку и индекс мы считаем сами. */
  const dndColumns: DndColumn[] = columns.map((column) => ({
    key: columnDndId(column.id),
    ids: itemsOf(column.id).map((item) => cardDndId(getItemId(item))),
  }));
  const columnByKey = new Map<string, BoardColumnDef<C>>(
    columns.map((column) => [columnDndId(column.id), column])
  );
  const itemByDndId = new Map<string, T>();
  for (const column of columns) {
    for (const item of itemsOf(column.id))
      itemByDndId.set(cardDndId(getItemId(item)), item);
  }

  const endDrag = () => {
    setDragged(null);
    setHoverColumn(null);
  };

  const onDragStart = (event: DragStartEvent) => {
    const item = itemByDndId.get(String(event.active.id)) ?? null;
    setDragged(item);
    const width = event.active.rect.current.initial?.width;
    setGhostWidth(width && width > 0 ? width : undefined);
  };

  const onDragOver = (event: DragOverEvent) => {
    if (!dragged) return;
    const target = resolveDrop(
      String(event.active.id),
      event.over ? String(event.over.id) : null,
      dndColumns
    );
    setHoverColumn(
      target ? columnByKey.get(target.columnKey)?.id ?? null : null
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    const item = dragged;
    const activeId = String(event.active.id);
    const target = resolveDrop(
      activeId,
      event.over ? String(event.over.id) : null,
      dndColumns
    );
    endDrag();
    if (!item || !target) return;
    const column = columnByKey.get(target.columnKey);
    if (!column || !canDrop(item, column.id)) return;
    const sourceKey = columnOfCard(activeId, dndColumns);
    if (sourceKey === target.columnKey) {
      // Внутри колонки: сравниваем с текущим местом без самой карточки.
      const ids = dndColumns.find((c) => c.key === sourceKey)?.ids ?? [];
      const currentIndex = ids.indexOf(activeId);
      if (currentIndex === target.index) return;
    }
    onDrop(item, column.id, target.index);
  };

  /* Доска целиком пуста: несколько одинаковых пунктирных зон подряд выглядят
     как поломка, поэтому показываем один экран — тот же, что и у списка. */
  if (isEmpty && emptyState != null) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {emptyState}
      </Box>
    );
  }

  const draggedSpec = dragged ? card(dragged) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
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
          const key = columnDndId(column.id);
          const ownColumn = dragged != null && columnOf(dragged) === column.id;
          const droppable = dragged != null && canDrop(dragged, column.id);

          return (
            <BoardColumn
              key={key}
              dndId={key}
              title={column.title}
              dotColor={column.dotColor}
              count={column.count}
              headerMeta={column.headerMeta}
              loading={column.loading}
              empty={items.length === 0}
              emptyHint={column.emptyHint}
              dropHint={dropHint}
              droppable={droppable}
              isHover={hoverColumn === column.id && droppable && !ownColumn}
              dimmed={dragged != null && !droppable && !ownColumn}
              minWidth={minColumnWidth}
              footer={column.footer}
              onScrollEnd={column.onScrollEnd}
            >
              <SortableContext
                items={items.map((item) => cardDndId(getItemId(item)))}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item, index) => {
                  const id = cardDndId(getItemId(item));
                  const spec = card(item);
                  return (
                    <BoardCard
                      key={id}
                      {...spec}
                      dndId={id}
                      index={index}
                      dragging={
                        dragged != null && cardDndId(getItemId(dragged)) === id
                      }
                      dragDisabled={!canDropAnywhere(item, columns, canDrop)}
                    />
                  );
                })}
              </SortableContext>
            </BoardColumn>
          );
        })}
      </Box>
      <DragOverlay dropAnimation={null}>
        {draggedSpec ? (
          <BoardCardGhost spec={draggedSpec} width={ghostWidth} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Карточку, которую некуда нести, не даём и взять. */
function canDropAnywhere<T, C extends BoardColumnId>(
  item: T,
  columns: BoardColumnDef<C>[],
  canDrop: (item: T, columnId: C) => boolean
): boolean {
  return columns.some((column) => canDrop(item, column.id));
}

export default Board;
