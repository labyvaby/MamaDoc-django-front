import { describe, expect, it } from "vitest";

import { currencyLabel } from "./currencyLabel";

describe("currencyLabel", () => {
  it("сом для KGS и пустой валюты, иначе код валюты", () => {
    expect(currencyLabel("KGS")).toBe("сом");
    expect(currencyLabel("kgs")).toBe("сом");
    expect(currencyLabel("")).toBe("сом");
    expect(currencyLabel(undefined)).toBe("сом");
    expect(currencyLabel("USD")).toBe("USD");
    expect(currencyLabel(" eur ")).toBe("EUR");
  });
});
