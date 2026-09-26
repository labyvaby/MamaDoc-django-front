import { apiRequest } from "./client";
import type { EnrollmentState, ProgramEnrollment } from "./programs";
import { type Scope, scopeParams } from "./scope";

/**
 * Учёт детей, этап 1: реестр, постановка на учёт, периоды и оплата,
 * представители, документы и печать. Контракт —
 * docs/registry-intake-contract.md в репозитории бэкенда.
 *
 * Деньги приходят строками с двумя знаками («5000.00»), как в «Доходах».
 */

export type RegistryTab = "active" | "onboarding" | "unpaid" | "expiring" | "inactive" | "cancelled";
export type TermPaymentState = "unpaid" | "partial" | "paid";
/** Состояние оплаты подключения: `none` — периодов ещё нет. */
export type PaymentState = TermPaymentState | "none";
export type CancelReason = "moved" | "refused" | "aged_out" | "transferred" | "not_visiting" | "other";
/** Проживание по титулу ф. 112/у: постоянно, временно, приезжий. */
export type ResidenceStatus = "permanent" | "temporary" | "visitor";
export type Relation = "mother" | "father" | "guardian" | "grandmother" | "grandfather" | "other";
export type DocumentKind =
  | "contract"
  | "consent_treatment"
  | "consent_personal_data"
  | "birth_certificate"
  | "exchange_card"
  | "other";
export type ChildGender = "male" | "female" | "unknown";

export const LEGAL_RELATIONS: Relation[] = ["mother", "father", "guardian"];

function withScope(path: string, scope: Scope): string {
  const query = scopeParams(scope).toString();
  return query ? `${path}?${query}` : path;
}

// ── Периоды и оплата ─────────────────────────────────────────────────────────

export interface EnrollmentTerm {
  id: number;
  startsOn: string;
  endsOn: string;
  priceAmount: string;
  paidAmount: string;
  paymentState: TermPaymentState;
  createdAt: string;
}

export interface TermPayment {
  id: number;
  termId: number;
  cashAmount: string;
  cardAmount: string;
  amount: string;
  cashlessMethodId: number | null;
  cashlessMethodName: string | null;
  paidOn: string;
  incomeId: number | null;
  isVoided: boolean;
  voidReason: string;
  voidedAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateTermPayload {
  months: number;
  startsOn?: string | null;
  priceAmount?: string | null;
}

export interface TermPaymentPayload {
  cashAmount?: string;
  cardAmount?: string;
  cashlessMethodId?: number | null;
  paidOn?: string | null;
}

export function getTerms(scope: Scope, enrollmentId: number, signal?: AbortSignal): Promise<EnrollmentTerm[]> {
  return apiRequest<EnrollmentTerm[]>(withScope(`/program-enrollments/${enrollmentId}/terms/`, scope), { signal });
}

export function createTerm(scope: Scope, enrollmentId: number, payload: CreateTermPayload): Promise<EnrollmentTerm> {
  return apiRequest<EnrollmentTerm>(withScope(`/program-enrollments/${enrollmentId}/terms/`, scope), {
    method: "POST",
    body: payload,
  });
}

export function deleteTerm(scope: Scope, enrollmentId: number, termId: number): Promise<void> {
  return apiRequest<void>(withScope(`/program-enrollments/${enrollmentId}/terms/${termId}/`, scope), {
    method: "DELETE",
  });
}

export function getTermPayments(
  scope: Scope,
  enrollmentId: number,
  termId: number,
  signal?: AbortSignal,
): Promise<TermPayment[]> {
  return apiRequest<TermPayment[]>(
    withScope(`/program-enrollments/${enrollmentId}/terms/${termId}/payments/`, scope),
    { signal },
  );
}

export function recordTermPayment(
  scope: Scope,
  enrollmentId: number,
  termId: number,
  payload: TermPaymentPayload,
): Promise<TermPayment> {
  return apiRequest<TermPayment>(
    withScope(`/program-enrollments/${enrollmentId}/terms/${termId}/payments/`, scope),
    { method: "POST", body: payload },
  );
}

export function voidTermPayment(
  scope: Scope,
  enrollmentId: number,
  termId: number,
  paymentId: number,
  reason: string,
): Promise<TermPayment> {
  return apiRequest<TermPayment>(
    withScope(`/program-enrollments/${enrollmentId}/terms/${termId}/payments/${paymentId}/void/`, scope),
    { method: "POST", body: { reason } },
  );
}

/** Остаток к оплате по периоду: цена минус оплачено, не меньше нуля. */
export function termDue(term: Pick<EnrollmentTerm, "priceAmount" | "paidAmount">): number {
  const due = Number(term.priceAmount) - Number(term.paidAmount);
  return due > 0 ? Math.round(due * 100) / 100 : 0;
}

// ── Подключение: врач, осмотр, снятие ────────────────────────────────────────

export function cancelEnrollment(
  scope: Scope,
  enrollmentId: number,
  payload: { reason: CancelReason; comment: string; movedToAddress?: string },
): Promise<ProgramEnrollment> {
  return apiRequest<ProgramEnrollment>(withScope(`/program-enrollments/${enrollmentId}/cancel/`, scope), {
    method: "POST",
    body: payload,
  });
}

export function changeResponsibleEmployee(
  scope: Scope,
  enrollmentId: number,
  employeeId: number | null,
): Promise<ProgramEnrollment> {
  return apiRequest<ProgramEnrollment>(withScope(`/program-enrollments/${enrollmentId}/`, scope), {
    method: "PATCH",
    body: { responsibleEmployeeId: employeeId },
  });
}

export function setOnboardingCompleted(
  scope: Scope,
  enrollmentId: number,
  completed: boolean,
): Promise<ProgramEnrollment> {
  return apiRequest<ProgramEnrollment>(withScope(`/program-enrollments/${enrollmentId}/`, scope), {
    method: "PATCH",
    body: { onboardingCompleted: completed },
  });
}

// ── Реестр ───────────────────────────────────────────────────────────────────

export interface RegistryRow {
  enrollmentId: number;
  patient: { id: number; fullName: string; birthDate: string | null; cardNumber: string; phone: string };
  primaryContact: { id: number; fullName: string; phone: string; relation: Relation } | null;
  program: { id: number; code: string; name: string; grantsVip: boolean };
  branch: { id: number; name: string };
  responsibleEmployee: { id: number; fullName: string } | null;
  status: EnrollmentState;
  startsAt: string | null;
  expiresAt: string | null;
  onboardingCompletedAt: string | null;
  cancelReason: CancelReason | "";
  currentTerm: EnrollmentTerm | null;
  paymentState: PaymentState;
  lastInteraction: { occurredAt: string; channel: string; outcome: string } | null;
  /** Последний приём, где ребёнок был (пришёл / на приёме / завершён); `null` — визитов нет. */
  lastVisitAt: string | null;
}

export type RegistryCounts = Record<RegistryTab, number>;

export interface RegistryList {
  results: RegistryRow[];
  count: number;
  counts: RegistryCounts;
}

export interface RegistryParams {
  tab: RegistryTab;
  branchId?: number;
  employeeId?: number;
  programId?: number;
  ageFromMonths?: number;
  ageToMonths?: number;
  q?: string;
  mine?: boolean;
  limit?: number;
  offset?: number;
}

export function getRegistry(scope: Scope, params: RegistryParams, signal?: AbortSignal): Promise<RegistryList> {
  const query = scopeParams(scope);
  query.set("tab", params.tab);
  // Фильтр филиала перекрывает филиал скоупа: пользователь без выбранного
  // филиала сужает реестр сам.
  if (params.branchId != null) query.set("branchId", String(params.branchId));
  if (params.employeeId != null) query.set("employeeId", String(params.employeeId));
  if (params.programId != null) query.set("programId", String(params.programId));
  if (params.ageFromMonths != null) query.set("ageFromMonths", String(params.ageFromMonths));
  if (params.ageToMonths != null) query.set("ageToMonths", String(params.ageToMonths));
  if (params.q) query.set("q", params.q);
  if (params.mine) query.set("mine", "1");
  query.set("limit", String(params.limit ?? 50));
  if (params.offset) query.set("offset", String(params.offset));
  return apiRequest<RegistryList>(`/program-enrollments/registry/?${query.toString()}`, { signal });
}

// ── Постановка на учёт ───────────────────────────────────────────────────────

export interface IntakeNewPerson {
  fullName: string;
  phone?: string;
  birthDate?: string | null;
  gender?: ChildGender;
  cardNumber?: string;
  address?: string;
  birthCertificateNumber?: string;
  birthCertificateIssuedOn?: string | null;
}

export interface IntakeRepresentative {
  relation: Relation;
  patientId?: number;
  new?: IntakeNewPerson;
  isLegalRepresentative?: boolean | null;
  isPrimaryContact?: boolean;
  receivesNotifications?: boolean;
  joinFamily?: boolean;
}

export interface IntakePayload {
  patient: {
    id?: number;
    new?: IntakeNewPerson;
    birthDate?: string | null;
    gender?: ChildGender | null;
    cardNumber?: string | null;
    birthCertificateNumber?: string | null;
    birthCertificateIssuedOn?: string | null;
  };
  representatives: IntakeRepresentative[];
  programId: number;
  branchId: number;
  responsibleEmployeeId?: number | null;
  termMonths?: number | null;
  termStartsOn?: string | null;
  priceAmount?: string | null;
  payment?: TermPaymentPayload | null;
  notes?: string;
  residenceStatus?: ResidenceStatus | "";
  arrivedFrom?: string;
}

export interface IntakeResult {
  enrollment: ProgramEnrollment;
  patientId: number;
  term: EnrollmentTerm;
  paymentId: number | null;
}

export function intakeEnrollment(scope: Scope, payload: IntakePayload): Promise<IntakeResult> {
  return apiRequest<IntakeResult>("/program-enrollments/intake/", {
    method: "POST",
    body: { ...payload, organizationId: scope.organizationId },
  });
}

// ── Представители и номер карты ──────────────────────────────────────────────

export interface RepresentativePerson {
  id: number;
  fullName: string;
  phone: string;
  birthDate: string | null;
}

export interface Representative {
  id: number;
  patient: RepresentativePerson;
  representative: RepresentativePerson;
  relation: Relation;
  isLegalRepresentative: boolean;
  isPrimaryContact: boolean;
  receivesNotifications: boolean;
  notes: string;
  createdAt: string;
}

export interface RepresentativeList {
  results: Representative[];
  count: number;
}

export interface AddRepresentativePayload {
  relation: Relation;
  representativeId?: number;
  newRepresentative?: { fullName: string; phone: string };
  isLegalRepresentative?: boolean | null;
  isPrimaryContact?: boolean;
  receivesNotifications?: boolean;
  notes?: string;
  joinFamily?: boolean;
}

export type UpdateRepresentativePayload = Partial<
  Pick<Representative, "relation" | "isLegalRepresentative" | "isPrimaryContact" | "receivesNotifications" | "notes">
>;

export function getRepresentatives(patientId: number, signal?: AbortSignal): Promise<RepresentativeList> {
  return apiRequest<RepresentativeList>(`/patients/${patientId}/representatives/`, { signal });
}

export function getRepresented(patientId: number, signal?: AbortSignal): Promise<RepresentativeList> {
  return apiRequest<RepresentativeList>(`/patients/${patientId}/represented/`, { signal });
}

export function addRepresentative(patientId: number, payload: AddRepresentativePayload): Promise<Representative> {
  return apiRequest<Representative>(`/patients/${patientId}/representatives/`, { method: "POST", body: payload });
}

export function updateRepresentative(
  patientId: number,
  linkId: number,
  payload: UpdateRepresentativePayload,
): Promise<Representative> {
  return apiRequest<Representative>(`/patients/${patientId}/representatives/${linkId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export function removeRepresentative(patientId: number, linkId: number): Promise<void> {
  return apiRequest<void>(`/patients/${patientId}/representatives/${linkId}/`, { method: "DELETE" });
}

export function getNextCardNumber(scope: Scope, prefix: string, signal?: AbortSignal): Promise<{ cardNumber: string }> {
  const query = scopeParams(scope);
  query.set("prefix", prefix);
  return apiRequest<{ cardNumber: string }>(`/patients/next-card-number/?${query.toString()}`, { signal });
}

// ── Документы и печать ───────────────────────────────────────────────────────

export interface EnrollmentDocument {
  id: number;
  enrollmentId: number;
  kind: DocumentKind;
  title: string;
  fileUrl: string;
  signedOn: string | null;
  signedBy: { id: number; fullName: string; phone: string } | null;
  printJobId: number | null;
  uploadedById: number | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface UploadDocumentPayload {
  kind: DocumentKind;
  title: string;
  file: File;
  signedOn?: string | null;
  signedById?: number | null;
  printJobId?: number | null;
}

export function getEnrollmentDocuments(
  scope: Scope,
  enrollmentId: number,
  signal?: AbortSignal,
): Promise<{ results: EnrollmentDocument[]; count: number }> {
  return apiRequest(withScope(`/program-enrollments/${enrollmentId}/documents/`, scope), { signal });
}

export function uploadEnrollmentDocument(
  scope: Scope,
  enrollmentId: number,
  payload: UploadDocumentPayload,
): Promise<EnrollmentDocument> {
  const form = new FormData();
  form.append("kind", payload.kind);
  form.append("title", payload.title);
  form.append("file", payload.file);
  if (payload.signedOn) form.append("signedOn", payload.signedOn);
  if (payload.signedById != null) form.append("signedById", String(payload.signedById));
  if (payload.printJobId != null) form.append("printJobId", String(payload.printJobId));
  return apiRequest<EnrollmentDocument>(withScope(`/program-enrollments/${enrollmentId}/documents/`, scope), {
    method: "POST",
    formData: form,
  });
}

export function deleteEnrollmentDocument(scope: Scope, enrollmentId: number, documentId: number): Promise<void> {
  return apiRequest<void>(withScope(`/program-enrollments/${enrollmentId}/documents/${documentId}/`, scope), {
    method: "DELETE",
  });
}

export interface PrintField {
  id?: string;
  label?: string;
  slot?: string;
  key?: string;
}

export interface PrintRender {
  templateId: number;
  kind: string;
  pageSize: string;
  orientation: string;
  fields: PrintField[];
  background: Record<string, unknown>;
  /** Текст бланка с подстановками; пусто — печать таблицей полей. */
  body?: string;
  data: Record<string, unknown>;
}

export function printEnrollmentDocument(
  scope: Scope,
  enrollmentId: number,
  templateId: number,
): Promise<{ jobId: number; render: PrintRender }> {
  return apiRequest(withScope(`/program-enrollments/${enrollmentId}/print/`, scope), {
    method: "POST",
    body: { templateId },
  });
}

export interface PrintTemplateShort {
  id: number;
  name: string;
  kind: string;
  isActive: boolean;
}

/** Бланки организации (право printforms.view); без права — пустой список. */
export function getBlankTemplates(scope: Scope, signal?: AbortSignal): Promise<PrintTemplateShort[]> {
  const query = scopeParams(scope);
  query.set("kind", "blank");
  return apiRequest<PrintTemplateShort[]>(`/v2/printforms/templates/?${query.toString()}`, { signal });
}
