import { describe, expect, it } from "vitest";

import { groupArticleFeed, partLabel, type KnowledgeArticleListItem } from "./knowledge";

/**
 * Серии статей — отдельная сущность бэка (seriesId/seriesName/partNumber на
 * статье, CRUD на /knowledge/series/ — см. api/knowledge.ts). groupArticleFeed
 * схлопывает части одной серии в один элемент ленты по этим полям.
 */

const article = (
  id: number,
  overrides: Partial<KnowledgeArticleListItem> = {},
): KnowledgeArticleListItem => ({
  id,
  title: `Статья ${id}`,
  categoryId: 1,
  categoryName: "Регистратура",
  authorName: "Автандил",
  isPublished: true,
  updatedAt: "2026-07-20T10:00:00Z",
  createdAt: "2026-07-01T10:00:00Z",
  seriesId: null,
  seriesName: null,
  partNumber: null,
  folderId: null,
  folderName: null,
  ...overrides,
});

describe("partLabel", () => {
  it("показывает заголовок статьи", () => {
    const part = { article: article(1), partNumber: 2, partTitle: "Приёмы" };
    expect(partLabel(part)).toBe("Приёмы");
  });

  it("подставляет номер части, если заголовок пуст", () => {
    const part = { article: article(1), partNumber: 3, partTitle: "" };
    expect(partLabel(part)).toBe("Часть 3");
  });
});

describe("groupArticleFeed", () => {
  it("схлопывает части одной серии в один элемент и сортирует их по номеру", () => {
    const feed = groupArticleFeed([
      article(3, { title: "Часть 3", seriesId: 1, seriesName: "Обзор CRM", partNumber: 3 }),
      article(1, { title: "Часть 1", seriesId: 1, seriesName: "Обзор CRM", partNumber: 1 }),
      article(9, { title: "Стерилизация" }),
      article(2, { title: "Часть 2", seriesId: 1, seriesName: "Обзор CRM", partNumber: 2 }),
    ]);

    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({ kind: "series" });
    expect(feed[1]).toMatchObject({ kind: "article" });
    const series = feed[0].kind === "series" ? feed[0].series : null;
    expect(series?.name).toBe("Обзор CRM");
    expect(series?.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  });

  it("разные серии не смешиваются, даже если имена совпадают", () => {
    const feed = groupArticleFeed([
      article(1, { seriesId: 1, seriesName: "Обзор CRM", partNumber: 1 }),
      article(2, { seriesId: 1, seriesName: "Обзор CRM", partNumber: 2 }),
      article(3, { seriesId: 2, seriesName: "Обзор CRM", partNumber: 1 }),
    ]);
    // Серия id=2 из единственной части — ещё не серия, остаётся статьёй.
    expect(feed.map((i) => i.kind)).toEqual(["series", "article"]);
  });

  it("серия встаёт на место своей первой части — порядок бэка сохраняется", () => {
    const feed = groupArticleFeed([
      article(9, { title: "Стерилизация" }),
      article(1, { seriesId: 1, seriesName: "Обзор CRM", partNumber: 1 }),
      article(2, { seriesId: 1, seriesName: "Обзор CRM", partNumber: 2 }),
    ]);
    expect(feed.map((i) => i.kind)).toEqual(["article", "series"]);
  });

  it("одинокая часть остаётся обычной статьёй", () => {
    const feed = groupArticleFeed([
      article(1, { seriesId: 1, seriesName: "Обзор CRM", partNumber: 1 }),
    ]);
    expect(feed).toEqual([expect.objectContaining({ kind: "article" })]);
  });

  it("берёт самую свежую правку среди частей", () => {
    const feed = groupArticleFeed([
      article(1, {
        seriesId: 1,
        seriesName: "Обзор CRM",
        partNumber: 1,
        updatedAt: "2026-07-01T10:00:00Z",
      }),
      article(2, {
        seriesId: 1,
        seriesName: "Обзор CRM",
        partNumber: 2,
        updatedAt: "2026-07-25T10:00:00Z",
      }),
    ]);
    const series = feed[0].kind === "series" ? feed[0].series : null;
    expect(series?.updatedAt).toBe("2026-07-25T10:00:00Z");
  });
});
