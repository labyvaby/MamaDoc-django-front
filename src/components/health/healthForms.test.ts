import { describe, expect, it } from "vitest";

import type { HealthProfile } from "../../api/health";
import { buildProfilePatch, parseNumberField, toProfileForm, toggleCondition, toggleReaction } from "./healthForms";

const PROFILE: HealthProfile = {
  exists: true,
  gestationalAgeWeeks: 38,
  gestationalAgeDays: 3,
  birthWeightG: 3350,
  birthLengthCm: 51.5,
  birthHeadCircumferenceCm: null,
  apgar1min: 8,
  apgar5min: 9,
  deliveryType: "natural",
  maternityHospital: "Роддом №2",
  maternityDischargedOn: "2025-03-29",
  birthNoticeReceivedOn: null,
  complementaryFeedingOn: null,
  perinatalNotes: "",
  riskGroups: ["cns"],
  healthGroup: "2",
  healthGroupSetOn: "2025-04-01",
  peGroup: "",
  bloodGroup: "A",
  rhFactor: "positive",
  noKnownAllergies: false,
  allergiesReviewedAt: null,
  allergiesReviewedBy: null,
  updatedAt: null,
  updatedBy: null,
};

describe("healthForms", () => {
  it("toggles reactions and family conditions as list items", () => {
    expect(toggleReaction("", "Сыпь")).toBe("Сыпь");
    expect(toggleReaction("Сыпь", "Зуд")).toBe("Сыпь, зуд");
    expect(toggleReaction("Сыпь, зуд", "зуд")).toBe("Сыпь");
    expect(toggleCondition("Здоров(а)", "Аллергия")).toBe("Здоров(а); Аллергия");
    expect(toggleCondition("Здоров(а); Аллергия", "аллергия")).toBe("Здоров(а)");
  });

  it("parses numbers with commas and spaces", () => {
    expect(parseNumberField("3 350")).toBe(3350);
    expect(parseNumberField("51,5")).toBe(51.5);
    expect(parseNumberField("")).toBeNull();
    expect(parseNumberField("abc")).toBeNaN();
  });

  it("builds a profile patch only for the opened parts", () => {
    const form = { ...toProfileForm(PROFILE), birthLengthCm: "52,0" };
    expect(buildProfilePatch(form, ["blood"])).toEqual({ bloodGroup: "A", rhFactor: "positive" });
    const birth = buildProfilePatch(form, ["birth"]);
    expect(birth).toMatchObject({ gestationalAgeWeeks: 38, birthWeightG: 3350, birthLengthCm: 52, birthHeadCircumferenceCm: null });
    expect(buildProfilePatch({ ...form, birthWeightG: "три кило" }, ["birth"])).toBeNull();
  });
});
