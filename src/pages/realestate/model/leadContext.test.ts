import { describe, expect, it } from "vitest";

import { leadIdFor } from "./leadContext";

const lead = { id: 7, client: "Нурия Абдрахманова", phone: "+996701440322" };

describe("leadIdFor", () => {
  it("без подбора заявки — null", () => {
    expect(leadIdFor(null, "Нурия Абдрахманова", "+996701440322")).toBeNull();
  });
  it("тот же телефон в любом формате — заявка", () => {
    expect(leadIdFor(lead, "Нурия А.", "0701 440 322")).toBe(7);
  });
  it("то же ФИО без учёта регистра и пробелов — заявка", () => {
    expect(leadIdFor(lead, "  нурия   абдрахманова ", "")).toBe(7);
  });
  it("другой покупатель (договор по чужой брони) — не привязываем", () => {
    expect(leadIdFor(lead, "Айгуль Кадырова", "+996509135757")).toBeNull();
  });
  it("у заявки нет телефона — пустой телефон в форме не совпадение", () => {
    expect(leadIdFor({ ...lead, phone: "" }, "Другой", "")).toBeNull();
  });
});
