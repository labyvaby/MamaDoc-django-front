import { describe, it, expect } from "vitest";

import { catalogActions } from "./moduleCatalogActions";

const on = { isEnabled: true };
const off = { isEnabled: false };

describe("catalogActions", () => {
  it("lets the platform admin disable a connected module and still configure it", () => {
    expect(catalogActions(on, { isPlatformAdmin: true, hasSettingsRoute: true })).toEqual([
      "configure",
      "disable",
    ]);
  });

  it("lets the platform admin really connect a module", () => {
    expect(catalogActions(off, { isPlatformAdmin: true, hasSettingsRoute: false })).toEqual(["enable"]);
  });

  it("gives a clinic only the settings of what it has", () => {
    expect(catalogActions(on, { isPlatformAdmin: false, hasSettingsRoute: true })).toEqual(["configure"]);
    expect(catalogActions(on, { isPlatformAdmin: false, hasSettingsRoute: false })).toEqual([]);
  });

  it("gives a clinic the request stub for everything else", () => {
    expect(catalogActions(off, { isPlatformAdmin: false, hasSettingsRoute: true })).toEqual(["request"]);
  });
});
