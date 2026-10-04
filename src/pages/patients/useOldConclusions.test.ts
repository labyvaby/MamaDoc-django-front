import { describe, expect, it } from "vitest";

import { livePrintPath, type OldConclusion } from "./useOldConclusions";

const base: OldConclusion = {
  id: "live-9500",
  legacy_id: null,
  appointment_id: "23021",
  patient_number: null,
  height_cm: null,
  weight_kg: null,
  temperature: null,
  complaints: null,
  diagnosis: null,
  diagnosis_catalog: null,
  anamnesis: null,
  objective: null,
  recommendations: null,
  doctor_comment: null,
  document_path: null,
  patient_document_path: null,
  photo: null,
  changed_at: null,
  changed_by: null,
  ask_for_feedback: false,
  source: "current",
  service_line_id: 25810,
};

/**
 * С 22.09.2026 у строки услуги бывает несколько документов. Печать из карточки
 * пациента должна открыть тот документ, что врач смотрит, а не первый в строке.
 */
describe("livePrintPath", () => {
  it("печатает именно открытый документ строки", () => {
    expect(livePrintPath(base)).toBe(
      "/print/conclusion/23021?lineId=25810&conclusionId=9500",
    );
  });

  it("у архивной записи своей страницы печати нет", () => {
    expect(livePrintPath({ ...base, id: "123", source: "supabase" })).toBeNull();
  });
});
