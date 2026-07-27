import { describe, expect, it } from "vitest";

import {
  buildArticleTitle,
  groupArticleFeed,
  parseArticleSeries,
  type KnowledgeArticleListItem,
} from "./knowledge";

/**
 * Серии статей связаны через название (у бэка полей серии нет — см.
 * api/knowledge.ts). Пока это так, разбор названия — контракт: сломается он
 * молча, серия просто рассыплется на отдельные карточки.
 */

const article = (
  id: number,
  title: string,
  updatedAt = "2026-07-20T10:00:00Z",
): KnowledgeArticleListItem => ({
  id,
  title,
  categoryId: 1,
  categoryName: "Регистратура",
  authorName: "Автандил",
  isPublished: true,
  updatedAt,
  createdAt: "2026-07-01T10:00:00Z",
});

describe("parseArticleSeries", () => {
  it("разбирает основную форму названия", () => {
    expect(parseArticleSeries("Обзор CRM. Часть 2")).toEqual({
      key: "обзор crm",
      name: "Обзор CRM",
      partNumber: 2,
      partTitle: null,
    });
  });

  it.each([
    ["Обзор CRM. Часть 2 — Приёмы", "Обзор CRM", 2, "Приёмы"],
    ["Обзор CRM. Часть 2. Приёмы", "Обзор CRM", 2, "Приёмы"],
    ["Обзор CRM (часть 2)", "Обзор CRM", 2, null],
    ["Обзор CRM — часть 10", "Обзор CRM", 10, null],
    ["Инструкция, часть 3: Касса", "Инструкция", 3, "Касса"],
    ["ЧАСТЬ тела. ЧАСТЬ 1", "ЧАСТЬ тела", 1, null],
  ])("понимает написание «%s»", (title, name, partNumber, partTitle) => {
    expect(parseArticleSeries(title)).toMatchObject({ name, partNumber, partTitle });
  });

  it.each([
    "Часть тела",
    "Часть 2",
    "Стерилизация инструментов",
    "Регламент кассы: часть первая",
  ])("не считает серией «%s»", (title) => {
    expect(parseArticleSeries(title)).toBeNull();
  });

  it("даёт одинаковый ключ при разном регистре, «ё» и хвостовой пунктуации", () => {
    const a = parseArticleSeries("Приём пациёнта. Часть 1");
    const b = parseArticleSeries("приём пациента — часть 2");
    expect(a?.key).toBe(b?.key);
  });
});

describe("buildArticleTitle", () => {
  it("собирает название, которое разбирается обратно в те же поля", () => {
    const title = buildArticleTitle("Приёмы", { name: "Обзор CRM", partNumber: 2 });
    expect(title).toBe("Обзор CRM. Часть 2 — Приёмы");
    expect(parseArticleSeries(title)).toMatchObject({
      name: "Обзор CRM",
      partNumber: 2,
      partTitle: "Приёмы",
    });
  });

  it("работает без подзаголовка части", () => {
    const title = buildArticleTitle("", { name: "Обзор CRM", partNumber: 3 });
    expect(title).toBe("Обзор CRM. Часть 3");
    expect(parseArticleSeries(title)).toMatchObject({ partNumber: 3, partTitle: null });
  });

  it("без серии отдаёт обычный заголовок", () => {
    expect(buildArticleTitle("  Стерилизация  ", null)).toBe("Стерилизация");
  });
});

describe("groupArticleFeed", () => {
  it("схлопывает части одной серии в один элемент и сортирует их по номеру", () => {
    const feed = groupArticleFeed([
      article(3, "Обзор CRM. Часть 3"),
      article(1, "Обзор CRM. Часть 1"),
      article(9, "Стерилизация"),
      article(2, "Обзор CRM. Часть 2"),
    ]);

    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({ kind: "series" });
    expect(feed[1]).toMatchObject({ kind: "article" });
    const series = feed[0].kind === "series" ? feed[0].series : null;
    expect(series?.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  });

  it("серия встаёт на место своей первой части — порядок бэка сохраняется", () => {
    const feed = groupArticleFeed([
      article(9, "Стерилизация"),
      article(1, "Обзор CRM. Часть 1"),
      article(2, "Обзор CRM. Часть 2"),
    ]);
    expect(feed.map((i) => i.kind)).toEqual(["article", "series"]);
  });

  it("одинокая часть остаётся обычной статьёй", () => {
    const feed = groupArticleFeed([article(1, "Обзор CRM. Часть 1")]);
    expect(feed).toEqual([
      expect.objectContaining({ kind: "article" }),
    ]);
  });

  it("берёт самую свежую правку среди частей", () => {
    const feed = groupArticleFeed([
      article(1, "Обзор CRM. Часть 1", "2026-07-01T10:00:00Z"),
      article(2, "Обзор CRM. Часть 2", "2026-07-25T10:00:00Z"),
    ]);
    const series = feed[0].kind === "series" ? feed[0].series : null;
    expect(series?.updatedAt).toBe("2026-07-25T10:00:00Z");
  });
});
