import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import Board from "./Board";

type Item = { id: number; column: "a" | "b"; title: string };

const items: Item[] = [
  { id: 1, column: "a", title: "Первая" },
  { id: 2, column: "a", title: "Вторая" },
  { id: 3, column: "b", title: "Третья" },
];

/**
 * Дымовой рендер без DOM: ядро с dnd-kit собирается и выводит колонки и
 * карточки. Само перетаскивание в SSR не проверить — на это есть
 * `dnd.test.ts` для чистой части и ручная проверка на стенде.
 */
describe("Board", () => {
  it("рендерит колонки и карточки внутри DndContext", () => {
    const html = renderToString(
      <Board<Item, "a" | "b">
        columns={[
          { id: "a", title: "Колонка A", count: 2 },
          { id: "b", title: "Колонка B", count: 1 },
        ]}
        itemsOf={(c) => items.filter((i) => i.column === c)}
        getItemId={(i) => i.id}
        columnOf={(i) => i.column}
        canDrop={() => true}
        onDrop={() => undefined}
        card={(i) => ({ ariaLabel: i.title, onOpen: () => undefined, content: <span>{i.title}</span> })}
      />,
    );
    expect(html).toContain("Колонка A");
    expect(html).toContain("Третья");
    // Карточки — sortable-элементы dnd-kit (role/aria от useSortable).
    expect(html).toContain('aria-roledescription="sortable"');
  });

  it("пустая доска показывает переданный экран", () => {
    const html = renderToString(
      <Board<Item, "a">
        columns={[{ id: "a", title: "A" }]}
        itemsOf={() => []}
        getItemId={(i) => i.id}
        columnOf={(i) => i.column as "a"}
        canDrop={() => true}
        onDrop={() => undefined}
        card={(i) => ({ ariaLabel: i.title, onOpen: () => undefined, content: null })}
        isEmpty
        emptyState={<div>Ничего нет</div>}
      />,
    );
    expect(html).toContain("Ничего нет");
  });
});
