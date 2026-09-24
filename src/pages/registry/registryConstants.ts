import type { DjangoPatient } from "../../api/patients";
import type { Program } from "../../api/programs";
import type { CancelReason, DocumentKind, Relation } from "../../api/registry";
import type { ExistingPerson } from "./intake/intakeState";

export const CANCEL_REASONS: CancelReason[] = ["moved", "refused", "aged_out", "transferred", "other"];
export const RELATIONS: Relation[] = ["mother", "father", "guardian", "grandmother", "grandfather", "other"];
export const DOCUMENT_KINDS: DocumentKind[] = [
  "contract",
  "consent_treatment",
  "consent_personal_data",
  "birth_certificate",
  "other",
];

export function toExistingPerson(patient: DjangoPatient): ExistingPerson {
  return {
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    birthDate: patient.birthDate,
    gender: patient.gender === "male" || patient.gender === "female" ? patient.gender : "unknown",
    cardNumber: patient.cardNumber ?? "",
  };
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === "number") : [];
}

export function programSpecializationIds(program: Program | undefined): number[] {
  return numberList(program?.settings?.responsibleSpecializationIds);
}

export function programTemplateIds(program: Program | undefined): number[] {
  return numberList(program?.settings?.documentTemplateIds);
}

export function programCardPrefix(program: Program | undefined): string {
  const prefix = program?.settings?.cardNumberPrefix;
  return typeof prefix === "string" ? prefix : "";
}
