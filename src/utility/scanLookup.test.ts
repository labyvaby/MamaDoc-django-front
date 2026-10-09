import { describe, expect, it } from "vitest";

import { findProductByScanCode, productScanCodes } from "./scanLookup";

const items = [
  { id: 1, barcode: "4600000000011", barcodes: [], sku: "MONO-42" },
  { id: 2, barcode: "", barcodes: ["4600000000028", "2000000000015"], sku: null },
  { id: 3, barcode: "4600000000011999", sku: "4600000000028" },
];

describe("findProductByScanCode", () => {
  it("находит по основному штрихкоду точно, а не подстрокой", () => {
    expect(findProductByScanCode(items, "4600000000011")?.id).toBe(1);
  });

  it("находит по дополнительному штрихкоду раньше, чем по артикулу", () => {
    expect(findProductByScanCode(items, "4600000000028")?.id).toBe(2);
  });

  it("находит по артикулу без учёта регистра и пробелов", () => {
    expect(findProductByScanCode(items, "  mono-42 ")?.id).toBe(1);
  });

  it("не находит неизвестный и пустой код", () => {
    expect(findProductByScanCode(items, "999")).toBeUndefined();
    expect(findProductByScanCode(items, "  ")).toBeUndefined();
  });
});

describe("productScanCodes", () => {
  it("собирает коды без пустых и повторов", () => {
    expect(productScanCodes({ barcode: "A1", barcodes: ["a1", "B2"], sku: "" })).toEqual(["a1", "b2"]);
  });
});
