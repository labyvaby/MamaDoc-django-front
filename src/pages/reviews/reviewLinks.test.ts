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
    expect(draft[linkKey(7, "google")].url).toBe(
      "https://g.page/r/abc/review"
    );
    expect(draft[linkKey(7, "2gis")].url).toBe("");
  });

  it("в PATCH уходят только изменения, очистка — пустой строкой", () => {
    const draft = {
      ...linksDraft([branch]),
      [linkKey(7, "google")]: {
        url: "  ",
        externalId: "",
        apiKey: "",
      },
      [linkKey(7, "yandex")]: {
        url: " https://yandex.ru/maps/org/1/reviews/ ",
        externalId: "",
        apiKey: "",
      },
    };
    expect(changedLinks([branch], draft)).toEqual([
      {
        branchId: 7,
        platform: "yandex",
        url: "https://yandex.ru/maps/org/1/reviews/",
        externalId: "",
        apiKey: "",
      },
      { branchId: 7, platform: "google", url: "", externalId: "", apiKey: "" },
    ]);
    expect(changedLinks([branch], linksDraft([branch]))).toEqual([]);
  });

  it("в PATCH уходят параметры синхронизации 2GIS", () => {
    const draft = {
      ...linksDraft([branch]),
      [linkKey(7, "2gis")]: {
        url: "",
        externalId: "70000001051350763",
        apiKey: "reviews-public-key",
      },
    };
    expect(changedLinks([branch], draft)).toEqual([
      {
        branchId: 7,
        platform: "2gis",
        url: "",
        externalId: "70000001051350763",
        apiKey: "reviews-public-key",
      },
    ]);
  });

  it("ссылка филиала — запасной вариант", () => {
    expect(branchLink(branch, "2gis")).toBe("https://2gis.kg/bishkek/firm/1");
    expect(branchLink(branch, "google")).toBe("");
  });
});
