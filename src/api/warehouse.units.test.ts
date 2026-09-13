import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import {
  createUnitOfMeasure,
  generateProductMatrix,
  getUnitsOfMeasure,
} from "./warehouse";

describe("organization units API", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue([]));

  it("loads the unit directory in the active organization scope", async () => {
    await getUnitsOfMeasure(undefined, 8);

    expect(apiRequest).toHaveBeenCalledWith(
      "/v2/warehouse/units/?organizationId=8",
      { signal: undefined },
    );
  });

  it("can include an inactive current unit while editing a legacy product", async () => {
    await getUnitsOfMeasure(undefined, 8, true);

    expect(apiRequest).toHaveBeenCalledWith(
      "/v2/warehouse/units/?organizationId=8&includeInactive=true",
      { signal: undefined },
    );
  });

  it("creates a unit in the requested organization without leaking the query into the body", async () => {
    await createUnitOfMeasure({
      name: "Килограмм",
      shortName: "кг",
      decimalPlaces: 3,
      organizationId: 8,
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/v2/warehouse/units/?organizationId=8",
      {
        method: "POST",
        body: { name: "Килограмм", shortName: "кг", decimalPlaces: 3 },
      },
    );
  });

  it("sends unitId when generating an apparel matrix", async () => {
    await generateProductMatrix({
      modelId: 42,
      rowValueIds: [1],
      columnValueIds: [2],
      price: 1000,
      unitId: 9,
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/v2/warehouse/product-models/42/matrix/",
      {
        method: "POST",
        body: { rowValueIds: [1], columnValueIds: [2], price: 1000, unitId: 9 },
      },
    );
  });
});
