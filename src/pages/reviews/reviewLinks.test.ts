import { describe, expect, it } from "vitest";
import type { BranchMaps } from "../../api/reviews";
import { branchLink, changedLinks, linkKey, linksDraft } from "./reviewLinks";

const branch: BranchMaps = {
  branchId: 7,
  branchName: "Центр",
  maps: [],
  reviewLinks: [{ platform: "google", url: "https://g.page/r/abc/review" }],
  branchLinks: [{ platform: "2gis", url: "https://2gis.kg/bishkek/firm/1" }],
};

describe("reviewLinks", () => {
  it("черновик заполняется сохранёнными ссылками на отзыв", () => {
    const draft = linksDraft([branch]);
    expect(draft[linkKey(7, "google")]).toBe("https://g.page/r/abc/review");
    expect(draft[linkKey(7, "2gis")]).toBe("");
  });

  it("в PATCH уходят только изменения, очистка — пустой строкой", () => {
    const draft = {
      ...linksDraft([branch]),
      [linkKey(7, "google")]: "  ",
      [linkKey(7, "yandex")]: " https://yandex.ru/maps/org/1/reviews/ ",
    };
    expect(changedLinks([branch], draft)).toEqual([
      {
        branchId: 7,
        platform: "yandex",
        url: "https://yandex.ru/maps/org/1/reviews/",
      },
      { branchId: 7, platform: "google", url: "" },
    ]);
    expect(changedLinks([branch], linksDraft([branch]))).toEqual([]);
  });

  it("ссылка филиала — запасной вариант", () => {
    expect(branchLink(branch, "2gis")).toBe("https://2gis.kg/bishkek/firm/1");
    expect(branchLink(branch, "google")).toBe("");
  });
});
