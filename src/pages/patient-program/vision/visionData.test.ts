import { describe, expect, it } from "vitest";

import type { ProgramModuleRecord } from "../../../api/programs";
import {
  buildDiagnosisData,
  buildExamData,
  chronicSuggestions,
  classifyVisionRecords,
  diagnosisTitle,
  emptyDiagnosisForm,
  emptyExamForm,
  examHasContent,
  examToForm,
  formatDiopter,
  hasFullExam,
  isVisionModule,
  parseNumber,
  readDiagnosis,
  readExam,
  refractionLine,
  toggleExclusive,
} from "./visionData";

let seq = 0;
function visionRecord(partial: Partial<ProgramModuleRecord> = {}): ProgramModuleRecord {
  seq += 1;
  return {
    id: seq,
    enrollmentId: 1,
    programModuleId: 5,
    moduleCode: "vision",
    branchId: 1,
    occurredAt: "2026-09-27T08:00:00Z",
    title: "Осмотр",
    status: "completed",
    notes: "",
    data: {},
    configurationVersion: 1,
    schemaSnapshot: {},
    createdById: null,
    createdByName: null,
    createdAt: "2026-09-27T08:00:00Z",
    updatedAt: "2026-09-27T08:00:00Z",
    ...partial,
  };
}

describe("vision data", () => {
  it("recognises the vision section", () => {
    expect(isVisionModule({ code: "vision", moduleType: "ophthalmology" })).toBe(true);
    expect(isVisionModule({ code: "custom-1", moduleType: "ophthalmology" })).toBe(true);
    expect(isVisionModule({ code: "growth", moduleType: "growth" })).toBe(false);
  });

  it("sorts exams, chronic diagnoses and planned checks", () => {
    const old = visionRecord({ occurredAt: "2025-09-27T08:00:00Z" });
    const fresh = visionRecord({ occurredAt: "2026-09-27T08:00:00Z" });
    const active = visionRecord({ data: { visionKind: "diagnosis", diagnosis: "myopia", state: "treatment" } });
    const resolved = visionRecord({
      occurredAt: "2026-10-01T08:00:00Z",
      data: { visionKind: "diagnosis", diagnosis: "ptosis", state: "resolved" },
    });
    const planned = visionRecord({ status: "planned", occurredAt: "2027-03-27T04:00:00Z" });
    const sorted = classifyVisionRecords([old, resolved, planned, fresh, active]);
    expect(sorted.exams.map((item) => item.record.id)).toEqual([fresh.id, old.id]);
    expect(sorted.diagnoses.map((item) => item.record.id)).toEqual([active.id, resolved.id]);
    expect(sorted.planned.map((item) => item.id)).toEqual([planned.id]);
  });

  it("reads an old record from the generic form", () => {
    const exam = readExam(
      visionRecord({ data: { visualAcuityRight: "123", visualAcuityLeft: "23", recommendation: "фывфы" } }),
    );
    expect(exam.acuityRight).toBe("123");
    const form = examToForm(exam);
    expect(form.recommendationNote).toBe("фывфы");
    expect(form.recommendationCodes).toEqual([]);
  });

  it("builds exam data without empty keys and reads it back", () => {
    expect(examHasContent(emptyExamForm())).toBe(false);
    const form = {
      ...emptyExamForm(),
      acuityRight: "0.8",
      acuityLeft: "0.6",
      refractionLeft: { sph: "−1,5", cyl: "-0,75", axis: "180" },
      conclusions: ["myopia"],
      recommendationCodes: ["exercises", "screens"],
      recommendationNote: "Контроль у окулиста",
    };
    const data = buildExamData(form);
    expect(data).toEqual({
      visionKind: "exam",
      examType: "preventive",
      visualAcuityRight: "0.8",
      visualAcuityLeft: "0.6",
      refraction: {
        cycloplegia: false,
        right: { sph: null, cyl: null, axis: null },
        left: { sph: -1.5, cyl: -0.75, axis: 180 },
      },
      conclusions: ["myopia"],
      recommendationCodes: ["exercises", "screens"],
      recommendationNote: "Контроль у окулиста",
      recommendation: "Гимнастика для глаз. Ограничить время у экранов. Контроль у окулиста",
    });
    expect(examHasContent(form)).toBe(true);
    expect(hasFullExam(form)).toBe(true);
    const back = examToForm(readExam(visionRecord({ data })));
    expect(back.refractionLeft).toEqual({ sph: "-1.5", cyl: "-0.75", axis: "180" });
    expect(back.recommendationNote).toBe("Контроль у окулиста");
  });

  it("keeps exclusive choices apart", () => {
    expect(toggleExclusive(["myopia"], "normal", "normal")).toEqual(["normal"]);
    expect(toggleExclusive(["normal"], "myopia", "normal")).toEqual(["myopia"]);
    expect(toggleExclusive(["myopia", "astigmatism"], "myopia", "normal")).toEqual(["astigmatism"]);
  });

  it("reads diopters and prints refraction", () => {
    expect(parseNumber("−1,25")).toBe(-1.25);
    expect(parseNumber("+0,5")).toBe(0.5);
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(formatDiopter(-1.25)).toBe("−1,25");
    expect(formatDiopter(0.5)).toBe("+0,50");
    expect(refractionLine({ sph: -1.5, cyl: -0.75, axis: 180 })).toBe("sph −1,50 · cyl −0,75 × 180°");
    expect(refractionLine({ sph: null, cyl: null, axis: null })).toBe("");
  });

  it("offers new conclusions as chronic diagnoses", () => {
    const active = [readDiagnosis(visionRecord({ data: { visionKind: "diagnosis", diagnosis: "myopia" } }))];
    const form = {
      ...emptyExamForm(),
      conclusions: ["myopia", "astigmatism"],
      refractionLeft: { sph: "-1.5", cyl: "-0.75", axis: "180" },
    };
    expect(chronicSuggestions(form, active)).toEqual([
      { diagnosis: "astigmatism", eye: "OS", cylinder: -0.75, axis: 180 },
    ]);
  });

  it("names and stores a chronic diagnosis", () => {
    const amblyopia = emptyDiagnosisForm({
      diagnosis: "amblyopia",
      subtype: "refractive",
      degree: "weak",
      eye: "OS",
      dispensary: true,
    });
    expect(diagnosisTitle(amblyopia)).toBe("Амблиопия рефракционная слабой степени");
    const data = buildDiagnosisData(amblyopia);
    expect(data).toEqual({
      visionKind: "diagnosis",
      diagnosis: "amblyopia",
      icd: "H53.0",
      state: "observation",
      dispensary: true,
      eye: "OS",
      degree: "weak",
      subtype: "refractive",
    });
    const read = readDiagnosis(visionRecord({ title: diagnosisTitle(amblyopia), data }));
    expect(read.eye).toBe("OS");
    expect(read.label).toBe("Амблиопия рефракционная слабой степени");

    const other = emptyDiagnosisForm({ diagnosis: "other", customLabel: "Халязион", icd: "H00.1" });
    expect(diagnosisTitle(other)).toBe("Халязион");
    expect(buildDiagnosisData(other).icd).toBe("H00.1");
    const gone = buildDiagnosisData(emptyDiagnosisForm({ diagnosis: "ptosis", state: "resolved", resolvedOn: "2026-10-01" }));
    expect(gone.resolvedOn).toBe("2026-10-01");
  });
});
