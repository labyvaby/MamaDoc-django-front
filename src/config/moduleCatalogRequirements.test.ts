import { describe, it, expect } from "vitest";

import { missingRequirements } from "./moduleCatalogRequirements";
import type { CatalogModule } from "../api/tenancy";

function mod(code: string, requires: string[] = [], isEnabled = false): CatalogModule {
  return {
    code,
    name: code.toUpperCase(),
    description: "",
    category: "c",
    tier: "shared",
    isEnabled,
    requires,
  };
}

describe("missingRequirements", () => {
  it("lists what is not connected through the chain, requirements first", () => {
    const warehouse = mod("warehouse");
    const pos = mod("pos", ["warehouse"]);
    const clients = mod("clients", [], true);
    const loyalty = mod("loyalty", ["pos", "clients"]);

    const missing = missingRequirements(loyalty, [warehouse, pos, clients, loyalty]);

    expect(missing).toEqual([
      { code: "warehouse", name: "WAREHOUSE" },
      { code: "pos", name: "POS" },
    ]);
  });

  it("returns nothing when every requirement is connected", () => {
    const warehouse = mod("warehouse", [], true);
    const pos = mod("pos", ["warehouse"]);
    expect(missingRequirements(pos, [warehouse, pos])).toEqual([]);
  });

  it("does not walk through a connected requirement", () => {
    // Касса подключена, хотя без Склада (старое нарушение): для Лояльности
    // не хватает только Клиентов, чужие пробелы не показываем.
    const warehouse = mod("warehouse");
    const pos = mod("pos", ["warehouse"], true);
    const clients = mod("clients");
    const loyalty = mod("loyalty", ["pos", "clients"]);

    expect(missingRequirements(loyalty, [warehouse, pos, clients, loyalty])).toEqual([
      { code: "clients", name: "CLIENTS" },
    ]);
  });

  it("names a requirement missing from the catalog by its code", () => {
    const orphan = mod("orphan", ["ghost"]);
    expect(missingRequirements(orphan, [orphan])).toEqual([{ code: "ghost", name: "ghost" }]);
  });

  it("tolerates a module without requires from an older backend", () => {
    const legacy = { ...mod("legacy"), requires: undefined } as unknown as CatalogModule;
    expect(missingRequirements(legacy, [legacy])).toEqual([]);
  });
});
