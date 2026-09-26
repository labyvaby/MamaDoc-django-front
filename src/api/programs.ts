import { apiRequest } from "./client";
import type { CancelReason, EnrollmentTerm, PaymentState, ResidenceStatus } from "./registry";
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
  /** Учётная: медицинская, и у неё есть хотя бы один пакет (§4.7 ТЗ). */
  isRegistry: boolean;
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
  responsibleEmployee: { id: number; fullName: string } | null;
  onboardingCompletedAt: string | null;
  cancelReason: CancelReason | "";
  cancelComment: string;
  /** Титул ф. 112/у: проживание, откуда прибыл, адрес выбытия (при снятии «Выбыл»). */
  residenceStatus: ResidenceStatus | "";
  arrivedFrom: string;
  movedToAddress: string;
  terms: EnrollmentTerm[];
  currentTerm: EnrollmentTerm | null;
  paymentState: PaymentState;
  createdAt: string;
  updatedAt: string;
}

/** Учётная программа: медицинская и с пакетами — её видят мастер и реестр. */
export function isRegistryProgram(program: Pick<Program, "isRegistry">): boolean {
  return program.isRegistry;
}

export type ProgramUpdatePayload = Partial<
  Pick<
    Program,
    | "name"
    | "description"
    | "status"
    | "isEnabled"
    | "grantsVip"
    | "settings"
  >
>;

export function updateProgram(scope: Scope, programId: number, payload: ProgramUpdatePayload): Promise<Program> {
  const query = scopeParams(scope).toString();
  return apiRequest<Program>(`/programs/${programId}/${query ? `?${query}` : ""}`, {
    method: "PATCH",
    body: payload,
  });
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

export function getProgramTemplates(
  scope: Scope,
  signal?: AbortSignal,
): Promise<{ results: ProgramTemplate[]; count: number }> {
  const query = scopeParams(scope);
  return apiRequest(`/programs/templates/?${query.toString()}`, { signal });
}

export function createProgramFromTemplate(
  scope: Scope,
  payload: { templateCode: string; code: string; name: string },
): Promise<Program> {
  const query = scopeParams(scope);
  return apiRequest(`/programs/from-template/?${query.toString()}`, {
    method: "POST",
    body: payload,
  });
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

export interface ProgramModuleRecord {
  id: number;
  enrollmentId: number;
  programModuleId: number;
  moduleCode: string;
  branchId: number;
  occurredAt: string;
  title: string;
  status: string;
  notes: string;
  data: Record<string, unknown>;
  configurationVersion: number;
  schemaSnapshot: Record<string, unknown>;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramModuleRecordList {
  results: ProgramModuleRecord[];
  count: number;
}

export interface CreateProgramModuleRecordPayload {
  programModuleId: number;
  occurredAt: string;
  title: string;
  status?: string;
  notes?: string;
  data?: Record<string, unknown>;
}

export type InteractionChannel = "call" | "sms" | "whatsapp" | "in_person" | "note";
export type InteractionOutcome = "answered" | "no_answer" | "callback" | "scheduled" | "informed";

export interface PatientInteraction {
  id: number;
  patientId: number;
  enrollmentId: number | null;
  branchId: number;
  occurredAt: string;
  channel: InteractionChannel;
  outcome: InteractionOutcome;
  subject: string;
  notes: string;
  followUpTaskId: number | null;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientInteractionList {
  results: PatientInteraction[];
  count: number;
}

export interface CreatePatientInteractionPayload {
  occurredAt: string;
  channel: InteractionChannel;
  outcome: InteractionOutcome;
  subject: string;
  notes?: string;
  followUpTaskId?: number | null;
}

export type ProgramNotificationChannel = "sms" | "whatsapp";
export type ProgramNotificationStatus =
  | "draft"
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

export interface ProgramNotification {
  id: number;
  enrollmentId: number;
  moduleRecordId: number | null;
  channel: ProgramNotificationChannel;
  recipient: string;
  body: string;
  scheduledFor: string;
  status: ProgramNotificationStatus;
  error: string;
  sentAt: string | null;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  attemptsCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  providerMessageId: string;
  failureCode: string;
  failureMessage: string;
  cancelledReason: string;
}

export interface ProgramFieldDefinition {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "date" | "datetime" | "boolean" | "select";
  required?: boolean;
  suffix?: string;
  options?: Array<string | number>;
}

export interface ProgramConfigurationSchema {
  program: {
    name?: string;
    description?: string;
    businessDomain?: string;
    grantsVip?: boolean;
    settings?: Record<string, unknown>;
  };
  modules: Array<{
    code: string;
    name: string;
    moduleType: string;
    isEnabled?: boolean;
    sortOrder?: number;
    settings: Record<string, unknown> & { fields?: ProgramFieldDefinition[] };
  }>;
}

export interface ProgramConfigurationVersion {
  id: number;
  programId: number;
  version: number;
  status: "draft" | "published" | "archived";
  isCurrent: boolean;
  schema: ProgramConfigurationSchema;
  createdById: number | null;
  createdByName: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramTemplate {
  code: string;
  name: string;
  description: string;
  businessDomain: string;
  grantsVip: boolean;
  schema: ProgramConfigurationSchema;
}

export interface ProgramNotificationList {
  results: ProgramNotification[];
  count: number;
}

export interface CreateProgramNotificationPayload {
  moduleRecordId?: number | null;
  channel: ProgramNotificationChannel;
  body: string;
  scheduledFor?: string | null;
}

export function getProgramConfigurationVersions(
  scope: Scope,
  programId: number,
  signal?: AbortSignal,
): Promise<{ results: ProgramConfigurationVersion[]; count: number }> {
  const query = scopeParams(scope);
  return apiRequest(`/programs/${programId}/versions/?${query.toString()}`, { signal });
}

export function createProgramConfigurationVersion(
  scope: Scope,
  programId: number,
  schema: ProgramConfigurationSchema,
): Promise<ProgramConfigurationVersion> {
  const query = scopeParams(scope);
  return apiRequest(`/programs/${programId}/versions/?${query.toString()}`, {
    method: "POST",
    body: { schema },
  });
}

export function updateProgramConfigurationVersion(
  scope: Scope,
  programId: number,
  versionId: number,
  schema: ProgramConfigurationSchema,
): Promise<ProgramConfigurationVersion> {
  const query = scopeParams(scope);
  return apiRequest(`/programs/${programId}/versions/${versionId}/?${query.toString()}`, {
    method: "PATCH",
    body: { schema },
  });
}

export function publishProgramConfigurationVersion(
  scope: Scope,
  programId: number,
  versionId: number,
): Promise<ProgramConfigurationVersion> {
  const query = scopeParams(scope);
  return apiRequest(
    `/programs/${programId}/versions/${versionId}/publish/?${query.toString()}`,
    { method: "POST" },
  );
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

export function getProgramModuleRecords(
  scope: Scope,
  enrollmentId: number,
  programModuleId: number,
  signal?: AbortSignal,
): Promise<ProgramModuleRecordList> {
  const query = scopeParams(scope);
  query.set("programModuleId", String(programModuleId));
  query.set("limit", "200");
  return apiRequest<ProgramModuleRecordList>(
    `/program-enrollments/${enrollmentId}/records/?${query.toString()}`,
    { signal },
  );
}

export function createProgramModuleRecord(
  scope: Scope,
  enrollmentId: number,
  payload: CreateProgramModuleRecordPayload,
): Promise<ProgramModuleRecord> {
  const query = scopeParams(scope);
  return apiRequest<ProgramModuleRecord>(
    `/program-enrollments/${enrollmentId}/records/?${query.toString()}`,
    { method: "POST", body: payload },
  );
}

export function updateProgramModuleRecord(
  scope: Scope,
  enrollmentId: number,
  recordId: number,
  payload: Partial<CreateProgramModuleRecordPayload>,
): Promise<ProgramModuleRecord> {
  const query = scopeParams(scope);
  return apiRequest<ProgramModuleRecord>(
    `/program-enrollments/${enrollmentId}/records/${recordId}/?${query.toString()}`,
    { method: "PATCH", body: payload },
  );
}

export function transitionProgramEnrollment(
  scope: Scope,
  enrollmentId: number,
  action: "activate" | "pause" | "resume" | "cancel",
): Promise<ProgramEnrollment> {
  const query = scopeParams(scope);
  return apiRequest<ProgramEnrollment>(
    `/program-enrollments/${enrollmentId}/${action}/?${query.toString()}`,
    { method: "POST" },
  );
}

export function getPatientInteractions(
  scope: Scope,
  enrollmentId: number,
  signal?: AbortSignal,
): Promise<PatientInteractionList> {
  const query = scopeParams(scope);
  query.set("limit", "200");
  return apiRequest<PatientInteractionList>(
    `/program-enrollments/${enrollmentId}/interactions/?${query.toString()}`,
    { signal },
  );
}

export function createPatientInteraction(
  scope: Scope,
  enrollmentId: number,
  payload: CreatePatientInteractionPayload,
): Promise<PatientInteraction> {
  const query = scopeParams(scope);
  return apiRequest<PatientInteraction>(
    `/program-enrollments/${enrollmentId}/interactions/?${query.toString()}`,
    { method: "POST", body: payload },
  );
}

export function updatePatientInteraction(
  scope: Scope,
  enrollmentId: number,
  interactionId: number,
  payload: Partial<CreatePatientInteractionPayload>,
): Promise<PatientInteraction> {
  const query = scopeParams(scope);
  return apiRequest<PatientInteraction>(
    `/program-enrollments/${enrollmentId}/interactions/${interactionId}/?${query.toString()}`,
    { method: "PATCH", body: payload },
  );
}

export function getUpcomingProgramRecords(
  scope: Scope,
  enrollmentId: number,
  signal?: AbortSignal,
): Promise<ProgramModuleRecordList> {
  const query = scopeParams(scope);
  query.set("limit", "200");
  return apiRequest<ProgramModuleRecordList>(
    `/program-enrollments/${enrollmentId}/upcoming/?${query.toString()}`,
    { signal },
  );
}

export function getProgramNotifications(
  scope: Scope,
  enrollmentId: number,
  signal?: AbortSignal,
  filters: {
    status?: ProgramNotificationStatus;
    channel?: ProgramNotificationChannel;
    moduleRecordId?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {},
): Promise<ProgramNotificationList> {
  const query = scopeParams(scope);
  query.set("limit", "200");
  if (filters.status) query.set("status", filters.status);
  if (filters.channel) query.set("channel", filters.channel);
  if (filters.moduleRecordId != null) query.set("moduleRecordId", String(filters.moduleRecordId));
  if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) query.set("dateTo", filters.dateTo);
  return apiRequest<ProgramNotificationList>(
    `/program-enrollments/${enrollmentId}/notifications/?${query.toString()}`,
    { signal },
  );
}

export function retryProgramNotification(
  scope: Scope,
  enrollmentId: number,
  notificationId: number,
): Promise<ProgramNotification> {
  const query = scopeParams(scope);
  return apiRequest<ProgramNotification>(
    `/program-enrollments/${enrollmentId}/notifications/${notificationId}/retry/?${query.toString()}`,
    { method: "POST" },
  );
}

export function createProgramNotification(
  scope: Scope,
  enrollmentId: number,
  payload: CreateProgramNotificationPayload,
): Promise<ProgramNotification> {
  const query = scopeParams(scope);
  return apiRequest<ProgramNotification>(
    `/program-enrollments/${enrollmentId}/notifications/?${query.toString()}`,
    { method: "POST", body: payload },
  );
}

export function cancelProgramNotification(
  scope: Scope,
  enrollmentId: number,
  notificationId: number,
): Promise<ProgramNotification> {
  const query = scopeParams(scope);
  return apiRequest<ProgramNotification>(
    `/program-enrollments/${enrollmentId}/notifications/${notificationId}/cancel/?${query.toString()}`,
    { method: "POST" },
  );
}

// ── Пакеты учёта ─────────────────────────────────────────────────────────────

/** Пакет учёта: что продаётся по учётной программе — цена, срок, условия. */
export interface ProgramPackage {
  id: number;
  programId: number;
  programName: string;
  name: string;
  priceAmount: string;
  /** «Официальная» цена — показывается зачёркнутой. */
  listPriceAmount: string | null;
  termMonths: number;
  /** Скидка второму и следующему ребёнку семьи. */
  familyDiscountPercent: number;
  /** Скидка на приёмы: пока подсказка кассе, применяется в этапе 1.3. */
  visitDiscountPercent: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ProgramPackagePayload {
  name: string;
  priceAmount: string;
  listPriceAmount: string | null;
  termMonths: number;
  familyDiscountPercent: number;
  visitDiscountPercent: number;
  description: string;
  isActive: boolean;
  sortOrder?: number;
}

function withScopeQuery(path: string, scope: Scope): string {
  const query = scopeParams(scope).toString();
  return query ? `${path}?${query}` : path;
}

export function getProgramPackages(
  scope: Scope,
  params: { programId?: number; active?: boolean } = {},
  signal?: AbortSignal,
): Promise<ProgramPackage[]> {
  const query = scopeParams(scope);
  if (params.programId != null) query.set("programId", String(params.programId));
  if (params.active) query.set("active", "1");
  return apiRequest<ProgramPackage[]>(`/programs/packages/?${query.toString()}`, { signal });
}

export function createProgramPackage(
  scope: Scope,
  payload: ProgramPackagePayload & { programId: number },
): Promise<ProgramPackage> {
  return apiRequest<ProgramPackage>(withScopeQuery("/programs/packages/", scope), { method: "POST", body: payload });
}

export function updateProgramPackage(
  scope: Scope,
  packageId: number,
  payload: Partial<ProgramPackagePayload>,
): Promise<ProgramPackage> {
  return apiRequest<ProgramPackage>(withScopeQuery(`/programs/packages/${packageId}/`, scope), {
    method: "PATCH",
    body: payload,
  });
}
