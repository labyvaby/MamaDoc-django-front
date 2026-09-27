/**
 * Чистая часть перетаскивания: по тому, над чем отпустили карточку, понять,
 * в какую колонку и на какой индекс она встала.
 *
 * Идентификаторы dnd-kit — строки: `card:<id>` у карточек, `col:<id>` у
 * колонок. Колонка как цель нужна для пустых колонок и для броска ниже
 * последней карточки.
 */

export const CARD_PREFIX = "card:";
export const COLUMN_PREFIX = "col:";

export const cardDndId = (id: string | number) => `${CARD_PREFIX}${id}`;
export const columnDndId = (id: string | number) => `${COLUMN_PREFIX}${id}`;

export interface DndColumn {
  /** `col:<id>` */
  key: string;
  /** `card:<id>` в порядке колонки. */
  ids: string[];
}

export interface DropTarget {
  columnKey: string;
  /**
   * 0-based место в целевой колонке **без учёта самой карточки**: то, что
   * уйдёт на бэк как `position`, и то, куда вставить в оптимистичном кэше.
   */
  index: number;
}

/**
 * Куда встанет `activeId`, если отпустить над `overId`.
 *
 * Над карточкой — на её место (карточка и всё ниже сдвигаются вниз; при
 * переносе внутри колонки индекс считается по списку без активной карточки,
 * как делает `arrayMove`). Над колонкой — в конец. `null` — бросили мимо.
 */
export function resolveDrop(
  activeId: string,
  overId: string | null,
  columns: readonly DndColumn[],
): DropTarget | null {
  if (overId == null) return null;
  if (overId.startsWith(COLUMN_PREFIX)) {
    const column = columns.find((c) => c.key === overId);
    if (!column) return null;
    return { columnKey: column.key, index: column.ids.filter((id) => id !== activeId).length };
  }
  const column = columns.find((c) => c.ids.includes(overId));
  if (!column) return null;
  const without = column.ids.filter((id) => id !== activeId);
  return { columnKey: column.key, index: Math.max(0, without.indexOf(overId)) };
}

/** Колонка, в которой лежит карточка (`null` — нет такой). */
export function columnOfCard(cardId: string, columns: readonly DndColumn[]): string | null {
  return columns.find((c) => c.ids.includes(cardId))?.key ?? null;
}

/**
 * Раскладка, в которой `cardId` переехала в колонку `columnKey` на место
 * `index` (0-based, без учёта самой карточки). Чистая: исходные массивы не
 * меняются. Нужна на время drag — чтобы целевая колонка «знала» о карточке
 * и её соседи раздвинулись.
 */
export function moveCard(
  columns: readonly DndColumn[],
  cardId: string,
  columnKey: string,
  index: number,
): DndColumn[] {
  return columns.map((column) => {
    const ids = column.ids.filter((id) => id !== cardId);
    if (column.key !== columnKey) return { key: column.key, ids };
    const at = Math.max(0, Math.min(index, ids.length));
    return { key: column.key, ids: [...ids.slice(0, at), cardId, ...ids.slice(at)] };
  });
}
