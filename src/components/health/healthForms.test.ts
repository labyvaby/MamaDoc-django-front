import { describe, expect, it } from "vitest";

import type { ConditionInput, HealthProfile } from "../../api/health";
import { buildConditionPayload, buildProfilePatch, parseNumberField, toProfileForm, toggleCondition, toggleReaction } from "./healthForms";

const CONDITION: ConditionInput = {
  kind: "chronic",
  title: " Железодефицитная анемия ",
  diagnosisId: 140,
  diagnosisCode: "d50.9 ",
  status: "active",
  diagnosedOn: "2026-03-17",
  datePrecision: "day",
  place: "",
  resolvedOn: null,
  isFirstDiagnosis: true,
  isDispensary: true,
  dispensarySince: "2026-03-17",
  dispensaryEndedOn: null,
  dispensaryEndReason: "",
  responsibleDoctorId: 12,
  controlIntervalMonths: 3,
  lastControlOn: null,
  nextControlOn: null,
  sourceConclusionId: 812,
  notes: "",
};

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

  it("keeps a chronic diagnosis with its observation and trims the text", () => {
    expect(buildConditionPayload(CONDITION)).toMatchObject({
      kind: "chronic",
      title: "Железодефицитная анемия",
      diagnosisCode: "D50.9",
      status: "active",
      isDispensary: true,
      controlIntervalMonths: 3,
      sourceConclusionId: 812,
    });
  });

  it("brings the date to the first day of the month or year", () => {
    expect(buildConditionPayload({ ...CONDITION, diagnosedOn: "2025-04-17", datePrecision: "month" }).diagnosedOn).toBe("2025-04-01");
    expect(buildConditionPayload({ ...CONDITION, diagnosedOn: "2025-04-17", datePrecision: "year" }).diagnosedOn).toBe("2025-01-01");
  });

  it("makes a past illness resolved and off the dispensary without today's recovery date", () => {
    const past = buildConditionPayload({ ...CONDITION, kind: "past", place: " Дома ", diagnosedOn: "2025-04-17", datePrecision: "month" });
    expect(past).toMatchObject({
      kind: "past",
      status: "resolved",
      resolvedOn: null,
      place: "Дома",
      diagnosedOn: "2025-04-01",
      isDispensary: false,
      dispensarySince: null,
      responsibleDoctorId: null,
      controlIntervalMonths: null,
    });
    expect(buildConditionPayload({ ...CONDITION, kind: "past", status: "refuted" }).status).toBe("refuted");
  });
});
