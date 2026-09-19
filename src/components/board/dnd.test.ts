import { describe, expect, it } from "vitest";

import { cardDndId, columnDndId, columnOfCard, resolveDrop } from "./dnd";

const columns = [
  { key: columnDndId("new"), ids: [cardDndId(1), cardDndId(2), cardDndId(3)] },
  { key: columnDndId("done"), ids: [cardDndId(9)] },
  { key: columnDndId("empty"), ids: [] },
];

describe("resolveDrop", () => {
  it("над карточкой другой колонки — на её место", () => {
    expect(resolveDrop(cardDndId(1), cardDndId(9), columns)).toEqual({
      columnKey: columnDndId("done"),
      index: 0,
    });
  });

  it("над пустой колонкой — индекс 0", () => {
    expect(resolveDrop(cardDndId(1), columnDndId("empty"), columns)).toEqual({
      columnKey: columnDndId("empty"),
      index: 0,
    });
  });

  it("над колонкой с карточками — в конец", () => {
    expect(resolveDrop(cardDndId(1), columnDndId("done"), columns)).toEqual({
      columnKey: columnDndId("done"),
      index: 1,
    });
  });

  it("внутри колонки вниз: индекс по списку без самой карточки", () => {
    // 1 → на место 3: список без «1» = [2, 3], «3» стоит на индексе 1.
    expect(resolveDrop(cardDndId(1), cardDndId(3), columns)).toEqual({
      columnKey: columnDndId("new"),
      index: 1,
    });
  });

  it("внутри колонки вверх", () => {
    expect(resolveDrop(cardDndId(3), cardDndId(1), columns)).toEqual({
      columnKey: columnDndId("new"),
      index: 0,
    });
  });

  it("над своей колонкой (ниже списка) — в конец без дубля", () => {
    expect(resolveDrop(cardDndId(1), columnDndId("new"), columns)).toEqual({
      columnKey: columnDndId("new"),
      index: 2,
    });
  });

  it("мимо — null", () => {
    expect(resolveDrop(cardDndId(1), null, columns)).toBeNull();
    expect(resolveDrop(cardDndId(1), cardDndId(777), columns)).toBeNull();
  });
});

describe("columnOfCard", () => {
  it("находит колонку карточки", () => {
    expect(columnOfCard(cardDndId(9), columns)).toBe(columnDndId("done"));
    expect(columnOfCard(cardDndId(42), columns)).toBeNull();
  });
});
