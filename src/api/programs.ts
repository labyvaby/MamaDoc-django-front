import { apiRequest } from "./client";
import { Scope, scopeParams } from "./scope";

export type ProgramState = "draft" | "active" | "archived";
export type EnrollmentState = "draft" | "active" | "paused" | "cancelled" | "expired";

export interface EffectiveProgramModule {
  id: number;
  code: string;
  name: string;
  moduleType: string;
  sortOrder: number;
  settings: Record<string, unknown>;
}

export interface Program {
  id: number;
  organizationId: number;
  code: string;
  name: string;
  description: string;
  businessDomain: string;
  status: ProgramState;
  isEnabled: boolean;
  grantsVip: boolean;
  settings: Record<string, unknown>;
  modules: Array<EffectiveProgramModule & { isEnabled: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramList {
  results: Program[];
  count: number;
}

export interface ProgramEnrollment {
  id: number;
  organizationId: number;
  patient: {
    id: number;
    fullName: string;
    phone: string;
  };
  program: {
    id: number;
    code: string;
    name: string;
    grantsVip: boolean;
  };
  branch: {
    id: number;
    name: string;
  };
  status: EnrollmentState;
  startsAt: string | null;
  expiresAt: string | null;
  externalId: string;
  source: string;
  settings: Record<string, unknown>;
  isEffectivelyActive: boolean;
  isVip: boolean;
  enabledModules: EffectiveProgramModule[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgramEnrollmentList {
  results: ProgramEnrollment[];
  count: number;
}

export function getProgramEnrollments(
  scope: Scope,
  params: {
    patientId?: number;
    status?: EnrollmentState;
    limit?: number;
    offset?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ProgramEnrollmentList> {
  const query = scopeParams(scope);
  if (params.patientId != null) query.set("patientId", String(params.patientId));
  if (params.status) query.set("status", params.status);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const suffix = query.toString();
  return apiRequest<ProgramEnrollmentList>(
    `/program-enrollments/${suffix ? `?${suffix}` : ""}`,
    { signal },
  );
}

export function getPrograms(scope: Scope, signal?: AbortSignal): Promise<ProgramList> {
  const query = scopeParams(scope);
  query.set("limit", "200");
  return apiRequest<ProgramList>(`/programs/?${query.toString()}`, { signal });
}

export interface CreateProgramEnrollmentPayload {
  patientId: number;
  programId: number;
  branchId: number;
  organizationId?: number;
  status: "active" | "draft";
  startsAt?: string | null;
  expiresAt?: string | null;
  source?: string;
}

export function createProgramEnrollment(
  scope: Scope,
  payload: CreateProgramEnrollmentPayload,
): Promise<ProgramEnrollment> {
  const query = scopeParams(scope);
  const suffix = query.toString();
  return apiRequest<ProgramEnrollment>(
    `/program-enrollments/${suffix ? `?${suffix}` : ""}`,
    { method: "POST", body: payload },
  );
}
