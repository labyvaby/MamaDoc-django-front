import type { ProgramEnrollment } from "../../api/programs";
import type { EnrollmentTerm, RegistryRow } from "../../api/registry";

/**
 * То, что нужно диалогам учёта (оплата, продление, снятие, врач, касание),
 * независимо от того, открыли их из реестра или из книжки пациента.
 */
export interface EnrollmentTarget {
  enrollmentId: number;
  patientId: number;
  patientName: string;
  programName: string;
  branchId: number;
  responsibleEmployeeId: number | null;
  onboardingCompletedAt: string | null;
  currentTerm: EnrollmentTerm | null;
}

export function targetFromRow(row: RegistryRow): EnrollmentTarget {
  return {
    enrollmentId: row.enrollmentId,
    patientId: row.patient.id,
    patientName: row.patient.fullName,
    programName: row.program.name,
    branchId: row.branch.id,
    responsibleEmployeeId: row.responsibleEmployee?.id ?? null,
    onboardingCompletedAt: row.onboardingCompletedAt,
    currentTerm: row.currentTerm,
  };
}

export function targetFromEnrollment(enrollment: ProgramEnrollment): EnrollmentTarget {
  return {
    enrollmentId: enrollment.id,
    patientId: enrollment.patient.id,
    patientName: enrollment.patient.fullName,
    programName: enrollment.program.name,
    branchId: enrollment.branch.id,
    responsibleEmployeeId: enrollment.responsibleEmployee?.id ?? null,
    onboardingCompletedAt: enrollment.onboardingCompletedAt ?? null,
    currentTerm: enrollment.currentTerm ?? null,
  };
}
