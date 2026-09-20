import { describe, expect, it } from "vitest";

import { expensePhotoMark } from "./photoMark";

const general = { categoryKind: "general" as const, photoUrl: null, photosCount: 0 };

describe("expensePhotoMark", () => {
  it("обычный расход без фото — «нет фото»", () => {
    expect(expensePhotoMark(general)).toBe("missing");
  });

  it("накладные без старого чека — «есть фото» (прод: две накладные, photoUrl пуст)", () => {
    expect(expensePhotoMark({ ...general, photosCount: 2 })).toBe("has");
  });

  it("старый чек считается фото и без photosCount от бэка", () => {
    expect(expensePhotoMark({ ...general, photosCount: undefined, photoUrl: "/media/receipt.jpg" })).toBe(
      "has",
    );
  });

  it("категория без чека (инкассация) — метки нет", () => {
    expect(expensePhotoMark({ ...general, categoryPhotoRequired: false })).toBeNull();
    expect(expensePhotoMark({ ...general, categoryPhotoRequired: false, photosCount: 1 })).toBeNull();
  });

  it("аванс и ЗП — метки нет", () => {
    expect(expensePhotoMark({ ...general, categoryKind: "advance" })).toBeNull();
    expect(expensePhotoMark({ ...general, categoryKind: "salary" })).toBeNull();
  });

  it("бэк без флага (поле не пришло) — метка показывается как раньше", () => {
    expect(expensePhotoMark({ ...general, categoryPhotoRequired: undefined })).toBe("missing");
  });
});
