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

const PEDIATRIC = /педиатр|pediatr/i;

/**
 * Кого можно закрепить врачом: всегда педиатра (решение клиники 2026-10-04).
 * Если педиатров в справочнике специальностей нет — любой врач.
 */
export function pediatricians<T extends { clinicalRole?: string | null; specializations: ReadonlyArray<{ name: string }> }>(
  employees: T[],
): T[] {
  const found = employees.filter((employee) => employee.specializations.some((item) => PEDIATRIC.test(item.name)));
  if (found.length) return found;
  const doctors = employees.filter((employee) => employee.clinicalRole === "doctor");
  return doctors.length ? doctors : employees;
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

/** С какого номера продолжать нумерацию карт (бумажные карты были до него). */
export function programCardStart(program: Program | undefined): number {
  const value = program?.settings?.cardNumberStart;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : 1;
}

/** Бланк договора: печатается на шаге «Оплата» до приёма денег. */
export function programContractTemplateId(program: Program | undefined): number | null {
  const value = program?.settings?.contractTemplateId;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function programCardPrefix(program: Program | undefined): string {
  const prefix = program?.settings?.cardNumberPrefix;
  return typeof prefix === "string" ? prefix : "";
}
