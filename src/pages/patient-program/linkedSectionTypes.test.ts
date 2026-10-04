import { describe, expect, it } from "vitest";

import { SYSTEM_SECTIONS, isLinkedModule, systemType } from "./linkedSectionTypes";

describe("linkedSectionTypes", () => {
  it("recognises system sections and the stand's first growth section", () => {
    expect(systemType({ code: "family", moduleType: "family" })).toBe("family");
    expect(systemType({ code: "growth", moduleType: "measurements" })).toBe("growth");
    expect(systemType({ code: "measurements", moduleType: "measurements" })).toBeNull();
    expect(systemType({ code: "vision", moduleType: "ophthalmology" })).toBeNull();
  });

  it("trusts the server kind and falls back to the type", () => {
    expect(isLinkedModule({ code: "x", moduleType: "custom", kind: "linked" })).toBe(true);
    expect(isLinkedModule({ code: "family", moduleType: "family", kind: "records" })).toBe(false);
    expect(isLinkedModule({ code: "visits", moduleType: "visits" })).toBe(true);
    expect(isLinkedModule({ code: "plan", moduleType: "checkup_plan" })).toBe(false);
    expect(SYSTEM_SECTIONS.every((section) => section.kind === "linked")).toBe(true);
  });
});
