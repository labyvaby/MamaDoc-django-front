import type { DjangoPatient } from "../../api/patients";
import type { Program } from "../../api/programs";
import type { CancelReason, DocumentKind, Relation, ResidenceStatus } from "../../api/registry";
import type { ExistingPerson } from "./intake/intakeState";

export const CANCEL_REASONS: CancelReason[] = ["moved", "refused", "aged_out", "transferred", "not_visiting", "other"];
export const RESIDENCE_STATUSES: ResidenceStatus[] = ["permanent", "temporary", "visitor"];
export const RELATIONS: Relation[] = ["mother", "father", "guardian", "grandmother", "grandfather", "other"];
export const DOCUMENT_KINDS: DocumentKind[] = [
  "contract",
  "consent_treatment",
  "consent_personal_data",
  "birth_certificate",
  "exchange_card",
  "other",
];
/** Порог вкладки «Не приходили», если в программе он не задан (как на бэкенде). */
export const DEFAULT_INACTIVITY_MONTHS = 6;

export function toExistingPerson(patient: DjangoPatient): ExistingPerson {
  return {
    id: patient.id,
    fullName: patient.fullName,
    phone: patient.phone,
    birthDate: patient.birthDate,
    gender: patient.gender === "male" || patient.gender === "female" ? patient.gender : "unknown",
    cardNumber: patient.cardNumber ?? "",
    birthCertificateNumber: patient.birthCertificateNumber ?? "",
    birthCertificateIssuedOn: patient.birthCertificateIssuedOn ?? null,
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

export function programInactivityMonths(program: Program | undefined): number {
  const value = program?.settings?.inactivityMonths;
  return typeof value === "number" && Number.isInteger(value) ? value : DEFAULT_INACTIVITY_MONTHS;
}

export function programCardPrefix(program: Program | undefined): string {
  const prefix = program?.settings?.cardNumberPrefix;
  return typeof prefix === "string" ? prefix : "";
}
