import type { IllnessVisit } from "../../api/health";
import type { MedicalConclusion } from "../../api/medical";
import type { OldConclusion } from "../../pages/patients/useOldConclusions";

const num = (value: string | null | undefined): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const orNull = (value: string | null | undefined): string | null => (value ? value : null);

/**
 * Живое заключение (`GET /api/medical/conclusions/<id>/`) в виде карточки
 * истории заключений пациента — её показывает кнопка «Заключение» у приёма в
 * «Истории болезней» (только просмотр). Врач и филиал — из строки приёма.
 */
export function medicalConclusionToCard(conclusion: MedicalConclusion, visit: IllnessVisit): OldConclusion {
  const diagnosis = (conclusion.diagnosisData ?? [])
    .map((item) => {
      const raw = item as { diagnosisCode?: string; diagnosis_code?: string; title?: string; displayName?: string };
      return [raw.diagnosisCode ?? raw.diagnosis_code, raw.title ?? raw.displayName].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");
  return {
    // Префикс — как у живых записей в истории заключений: по нему карточка догружает бланк.
    id: `live-${conclusion.id}`,
    legacy_id: null,
    appointment_id: String(conclusion.appointmentId),
    patient_number: null,
    height_cm: num(conclusion.heightCm),
    weight_kg: num(conclusion.weightKg),
    temperature: num(conclusion.temperature),
    complaints: orNull(conclusion.complaints),
    diagnosis: diagnosis || null,
    diagnosis_catalog: null,
    anamnesis: orNull(conclusion.anamnesis),
    objective: orNull(conclusion.objective),
    recommendations: null,
    doctor_comment: null,
    document_path: null,
    patient_document_path: null,
    photo: conclusion.photoUrls?.length ? conclusion.photoUrls[0] : null,
    changed_at: conclusion.createdAt,
    changed_by: visit.doctor?.fullName || orNull(visit.doctorName),
    ask_for_feedback: false,
    source: "current",
    conclusion: orNull(conclusion.conclusion),
    branch_name: visit.branch?.name ?? null,
    service_line_id: conclusion.serviceLineId ?? null,
  };
}
