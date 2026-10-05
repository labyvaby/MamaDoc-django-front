import { describe, expect, it } from "vitest";

import ruSettings from "../../locales/ru/settings.json";
import { PNL_LINE_OPTIONS } from "./pnlLines";

describe("PNL_LINE_OPTIONS", () => {
  it("все статьи бэкенда в порядке формы", () => {
    expect(PNL_LINE_OPTIONS.map((o) => o.value)).toEqual([
      "cost", "other_operating", "selling", "admin", "interest", "other_non_operating", "income_tax", "excluded",
    ]);
  });

  it("у каждой статьи есть подпись в ru/settings.json", () => {
    const labels = ruSettings.expenseCategories.pnlLine.options as Record<string, string>;
    for (const option of PNL_LINE_OPTIONS) expect(labels[option.value]).toBeTruthy();
  });
});
