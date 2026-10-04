import { describe, expect, it } from "vitest";

import { SYSTEM_SECTIONS, isLinkedModule, systemType } from "./linkedSectionTypes";

describe("linkedSectionTypes", () => {
  it("recognises system sections and the stand's first growth section", () => {
    expect(systemType({ code: "family", moduleType: "family" })).toBe("family");
    expect(systemType({ code: "life_anamnesis", moduleType: "life_anamnesis" })).toBe("life_anamnesis");
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
    expect(isLinkedModule({ code: "life_anamnesis", moduleType: "life_anamnesis" })).toBe(true);
  });

  it("knows «Операции и травмы» and the new name of «conditions»", () => {
    expect(systemType({ code: "surgeries", moduleType: "surgeries" })).toBe("surgeries");
    expect(isLinkedModule({ code: "surgeries", moduleType: "surgeries" })).toBe(true);
    const surgeries = SYSTEM_SECTIONS.find((section) => section.type === "surgeries");
    expect(surgeries).toMatchObject({ name: "Операции и травмы", kind: "linked" });
    expect(SYSTEM_SECTIONS.find((section) => section.type === "conditions")?.name).toBe("История болезней");
    // В конструкторе — в расширениях после «Аллергий».
    const types = SYSTEM_SECTIONS.map((section) => section.type);
    expect(types.indexOf("surgeries")).toBe(types.indexOf("allergies") + 1);
  });
});
