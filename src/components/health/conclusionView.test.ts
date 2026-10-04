import { describe, expect, it } from "vitest";

import type { IllnessVisit } from "../../api/health";
import type { MedicalConclusion } from "../../api/medical";
import { medicalConclusionToCard } from "./conclusionView";

const VISIT: IllnessVisit = {
  on: "2026-03-17",
  appointmentId: 9001,
  conclusionId: 812,
  legacyConclusionId: null,
  doctor: { id: 12, fullName: "Аббасова Айгерим" },
  doctorName: "",
  specialty: "Педиатр",
  serviceName: "Приём педиатра",
  branch: { id: 3, name: "Центр" },
  diagnoses: [],
};

describe("conclusionView", () => {
  it("shows a live conclusion as the patient card's conclusion history does", () => {
    const card = medicalConclusionToCard(
      {
        id: 812,
        serviceLineId: 55,
        appointmentId: 9001,
        complaints: "Бледность",
        anamnesis: null,
        objective: "",
        conclusion: "Назначено железо",
        diagnosisData: [{ diagnosisCode: "D50.9", title: "Железодефицитная анемия" }],
        photoUrls: [],
        weightKg: "10.40",
        heightCm: null,
        temperature: null,
        internalComment: null,
        status: "completed",
        formData: null,
        createdAt: "2026-03-17T10:20:00+06:00",
        updatedAt: "2026-03-17T10:40:00+06:00",
      } as MedicalConclusion,
      VISIT,
    );
    expect(card).toMatchObject({
      id: "live-812",
      appointment_id: "9001",
      service_line_id: 55,
      source: "current",
      diagnosis: "D50.9 Железодефицитная анемия",
      weight_kg: 10.4,
      objective: null,
      changed_by: "Аббасова Айгерим",
      branch_name: "Центр",
      conclusion: "Назначено железо",
    });
  });
});
