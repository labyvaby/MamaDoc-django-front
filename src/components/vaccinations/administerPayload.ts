import type { AdministerRecordPayload, VaccinationRecord } from "../../api/vaccinations";
import { ApiError } from "../../api/client";
import { changedPatientFields, type PatientDraft } from "./patientGaps";

export interface AdministerForm {
  isExternal: boolean;
  batchId: number | "";
  batchNumberManual: string;
  doseNumber: string;
  injectionSite: string;
  administeredById: number | "";
  /** ISO. */
  administeredAt: string;
  notes: string;
}

/** Тело POST administer/: заполненные поля записи + изменённые поля пациента. */
export function buildAdministerPayload(
  form: AdministerForm,
  patient: PatientDraft,
  originalPatient: PatientDraft,
): AdministerRecordPayload {
  const body: AdministerRecordPayload = {};
  const dose = Number(form.doseNumber);
  if (Number.isInteger(dose) && dose > 0) body.doseNumber = dose;
  if (form.isExternal) {
    if (form.batchNumberManual.trim()) body.batchNumberManual = form.batchNumberManual.trim();
  } else if (form.batchId !== "") {
    body.batchId = form.batchId;
  }
  if (form.injectionSite) body.injectionSite = form.injectionSite;
  if (form.administeredById !== "") body.administeredById = form.administeredById;
  if (form.administeredAt) body.administeredAt = form.administeredAt;
  if (form.notes.trim()) body.notes = form.notes.trim();
  const changed = changedPatientFields(originalPatient, patient);
  if (Object.keys(changed).length > 0) body.patient = changed;
  return body;
}

/** Поля пациента из записи — начальное значение блока «пол / дата / ИНН». */
export function patientDraftFromRecord(record: VaccinationRecord | null | undefined): PatientDraft {
  const p = record?.patient;
  return {
    gender: p?.gender ?? "unknown",
    birthDate: p?.birthDate ?? null,
    inn: p?.inn ?? "",
    innAbsentReason: p?.innAbsentReason ?? "",
  };
}

/** Ключи незаполненных полей из 400 бэка (`error.details.fields`). */
export function missingFromError(err: unknown): string[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const fields = (err.details as { fields?: Record<string, unknown> } | null)?.fields;
  return fields ? Object.keys(fields) : [];
}

/** Следующий номер дозы этой вакцины по истории пациента (без отменённых). */
export function nextDoseNumber(
  history: VaccinationRecord[],
  vaccineId: number,
  excludeRecordId?: number,
): number {
  const doses = history
    .filter(
      (r) =>
        r.vaccineId === vaccineId &&
        r.id !== excludeRecordId &&
        r.status !== "canceled" &&
        r.doseNumber != null,
    )
    .map((r) => r.doseNumber);
  return doses.length ? Math.max(...doses) + 1 : 1;
}
