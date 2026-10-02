import { apiRequest } from "./client";
import { Scope, scopeParams } from "./scope";

/**
 * Медпрофиль пациента (книжка ребёнка, этап 2): рождение, группы, аллергии,
 * диагнозы с Д-учётом, госпитализации, паспорт семьи, журнал, чек-лист
 * первичного осмотра. Контракт — `docs/medical-health-contract.md` бэкенда.
 * Пациент ищется в скоупе пациентов сотрудника, поэтому передаётся только
 * организация (`orgWide`), без филиала.
 */

export type AllergyState = "has" | "none" | "unknown";
export type AllergyCategory = "drug" | "food" | "environmental" | "insect" | "other";
export type AllergySeverity = "mild" | "moderate" | "severe" | "anaphylaxis" | "unknown";
export type AllergyStatus = "active" | "resolved" | "refuted";
export type ConditionStatus = "active" | "remission" | "resolved" | "refuted";
export type DispensaryEndReason = "recovered" | "moved" | "other" | "";
export type FamilyRelation = "mother" | "father" | "sibling" | "other";
export type DeliveryType = "natural" | "cesarean" | "other" | "";
export type HealthGroup = "1" | "2" | "3" | "4" | "5" | "";
export type PeGroup = "main" | "preparatory" | "special" | "exempt" | "";
export type BloodGroup = "0" | "A" | "B" | "AB" | "";
export type RhFactor = "positive" | "negative" | "";
export type RiskGroup = "cns" | "infection" | "trophic_endocrine" | "malformations" | "allergic" | "social";

export interface EmployeeRef {
  id: number;
  fullName: string;
}

export interface PatientRef {
  id: number;
  fullName: string;
  birthDate: string | null;
  phone: string;
}

export interface HealthProfile {
  /** false — профиль ещё не сохраняли, поля по умолчанию. */
  exists: boolean;
  gestationalAgeWeeks: number | null;
  gestationalAgeDays: number | null;
  birthWeightG: number | null;
  birthLengthCm: number | null;
  birthHeadCircumferenceCm: number | null;
  apgar1min: number | null;
  apgar5min: number | null;
  deliveryType: DeliveryType;
  maternityHospital: string;
  maternityDischargedOn: string | null;
  birthNoticeReceivedOn: string | null;
  complementaryFeedingOn: string | null;
  perinatalNotes: string;
  riskGroups: RiskGroup[];
  healthGroup: HealthGroup;
  healthGroupSetOn: string | null;
  peGroup: PeGroup;
  bloodGroup: BloodGroup;
  rhFactor: RhFactor;
  noKnownAllergies: boolean;
  allergiesReviewedAt: string | null;
  allergiesReviewedBy: EmployeeRef | null;
  updatedAt: string | null;
  updatedBy: EmployeeRef | null;
}

export type HealthProfileUpdate = Partial<
  Omit<HealthProfile, "exists" | "noKnownAllergies" | "allergiesReviewedAt" | "allergiesReviewedBy" | "updatedAt" | "updatedBy">
>;

export interface Allergy {
  id: number;
  category: AllergyCategory;
  allergen: string;
  reaction: string;
  severity: AllergySeverity;
  status: AllergyStatus;
  isConfirmed: boolean;
  notedOn: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EmployeeRef | null;
  updatedBy: EmployeeRef | null;
}

export interface AllergyInput {
  allergen: string;
  category: AllergyCategory;
  reaction: string;
  severity: AllergySeverity;
  status: AllergyStatus;
  isConfirmed: boolean;
  notedOn: string | null;
  notes: string;
}

export interface Condition {
  id: number;
  diagnosisId: number | null;
  diagnosisCode: string;
  title: string;
  status: ConditionStatus;
  diagnosedOn: string | null;
  resolvedOn: string | null;
  isFirstDiagnosis: boolean;
  isDispensary: boolean;
  dispensarySince: string | null;
  dispensaryEndedOn: string | null;
  dispensaryEndReason: DispensaryEndReason;
  responsibleDoctor: EmployeeRef | null;
  controlIntervalMonths: number | null;
  lastControlOn: string | null;
  nextControlOn: string | null;
  sourceConclusionId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EmployeeRef | null;
  updatedBy: EmployeeRef | null;
}

export interface ConditionInput {
  title: string;
  diagnosisId: number | null;
  diagnosisCode: string;
  status: ConditionStatus;
  diagnosedOn: string | null;
  resolvedOn: string | null;
  isFirstDiagnosis: boolean;
  isDispensary: boolean;
  dispensarySince: string | null;
  dispensaryEndedOn: string | null;
  dispensaryEndReason: DispensaryEndReason;
  responsibleDoctorId: number | null;
  controlIntervalMonths: number | null;
  lastControlOn: string | null;
  nextControlOn: string | null;
  notes: string;
}

export interface Hospitalization {
  id: number;
  facility: string;
  admittedOn: string;
  dischargedOn: string | null;
  conditionId: number | null;
  conditionTitle: string | null;
  diagnosisTitle: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalizationInput {
  facility: string;
  admittedOn: string;
  dischargedOn: string | null;
  conditionId: number | null;
  diagnosisTitle: string;
  notes: string;
}

export interface FamilyMember {
  id: number;
  relation: FamilyRelation;
  relative: PatientRef | null;
  fullName: string;
  birthDate: string | null;
  conditions: string;
  therapistExamOn: string | null;
  gynecologistExamOn: string | null;
  fluorographyOn: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMemberInput {
  relation: FamilyRelation;
  relativeId: number | null;
  fullName: string;
  birthDate: string | null;
  conditions: string;
  therapistExamOn: string | null;
  gynecologistExamOn: string | null;
  fluorographyOn: string | null;
  notes: string;
}

export interface FamilySuggestion {
  relation: FamilyRelation;
  relative: PatientRef;
}

export interface HealthAlert {
  allergyStatus: AllergyState;
  allergies: Array<{ allergen: string; severity: AllergySeverity }>;
  dispensaryCount: number;
  healthGroup: HealthGroup;
}

export interface PatientHealth {
  profile: HealthProfile;
  allergies: Allergy[];
  conditions: Condition[];
  alert: HealthAlert;
}

export interface HealthChange {
  id: number;
  model: string;
  objectId: number | null;
  action: "create" | "update" | "status" | "delete";
  changes: Record<string, [unknown, unknown]>;
  actor: EmployeeRef | null;
  createdAt: string;
}

export interface HealthChangeList {
  results: HealthChange[];
  count: number;
}

export type OnboardingItem = "birth" | "allergies" | "healthGroup" | "conditions" | "measurements";

export interface Onboarding {
  enrollmentId: number;
  patientId: number;
  checklist: Record<OnboardingItem, boolean>;
  missing: OnboardingItem[];
  completedAt: string | null;
  completedBy: EmployeeRef | null;
}

function path(scope: Scope, suffix: string, extra?: Record<string, string>): string {
  const query = scopeParams(scope);
  for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
  const text = query.toString();
  return `/medical/${suffix}${text ? `?${text}` : ""}`;
}

const patientPath = (scope: Scope, patientId: number, rest: string, extra?: Record<string, string>) =>
  path(scope, `patients/${patientId}/${rest}`, extra);

export function getPatientHealth(scope: Scope, patientId: number, signal?: AbortSignal): Promise<PatientHealth> {
  return apiRequest<PatientHealth>(patientPath(scope, patientId, "health/"), { signal });
}

export function updateHealthProfile(scope: Scope, patientId: number, payload: HealthProfileUpdate): Promise<PatientHealth> {
  return apiRequest<PatientHealth>(patientPath(scope, patientId, "health/"), { method: "PATCH", body: payload });
}

export function confirmNoAllergies(scope: Scope, patientId: number): Promise<PatientHealth> {
  return apiRequest<PatientHealth>(patientPath(scope, patientId, "health/confirm-no-allergies/"), { method: "POST" });
}

export function getHealthAlert(scope: Scope, patientId: number, signal?: AbortSignal): Promise<HealthAlert> {
  return apiRequest<HealthAlert>(patientPath(scope, patientId, "health/alert/"), { signal });
}

export function getHealthChanges(
  scope: Scope,
  patientId: number,
  params: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<HealthChangeList> {
  const extra: Record<string, string> = {};
  if (params.limit != null) extra.limit = String(params.limit);
  if (params.offset != null) extra.offset = String(params.offset);
  return apiRequest<HealthChangeList>(patientPath(scope, patientId, "health/changes/", extra), { signal });
}

export function getAllergies(
  scope: Scope,
  patientId: number,
  status: "active" | "all" = "active",
  signal?: AbortSignal,
): Promise<Allergy[]> {
  return apiRequest<Allergy[]>(patientPath(scope, patientId, "allergies/", { status }), { signal });
}

export function createAllergy(scope: Scope, patientId: number, payload: AllergyInput): Promise<Allergy> {
  return apiRequest<Allergy>(patientPath(scope, patientId, "allergies/"), { method: "POST", body: payload });
}

export function updateAllergy(
  scope: Scope,
  patientId: number,
  allergyId: number,
  payload: Partial<AllergyInput>,
): Promise<Allergy> {
  return apiRequest<Allergy>(patientPath(scope, patientId, `allergies/${allergyId}/`), { method: "PATCH", body: payload });
}

export function getConditions(
  scope: Scope,
  patientId: number,
  params: { status?: ConditionStatus | "all"; dispensary?: boolean } = {},
  signal?: AbortSignal,
): Promise<Condition[]> {
  const extra: Record<string, string> = {};
  if (params.status) extra.status = params.status;
  if (params.dispensary) extra.dispensary = "1";
  return apiRequest<Condition[]>(patientPath(scope, patientId, "conditions/", extra), { signal });
}

export function createCondition(scope: Scope, patientId: number, payload: ConditionInput): Promise<Condition> {
  return apiRequest<Condition>(patientPath(scope, patientId, "conditions/"), { method: "POST", body: payload });
}

export function updateCondition(
  scope: Scope,
  patientId: number,
  conditionId: number,
  payload: Partial<ConditionInput>,
): Promise<Condition> {
  return apiRequest<Condition>(patientPath(scope, patientId, `conditions/${conditionId}/`), {
    method: "PATCH",
    body: payload,
  });
}

export function getHospitalizations(scope: Scope, patientId: number, signal?: AbortSignal): Promise<Hospitalization[]> {
  return apiRequest<Hospitalization[]>(patientPath(scope, patientId, "hospitalizations/"), { signal });
}

export function createHospitalization(
  scope: Scope,
  patientId: number,
  payload: HospitalizationInput,
): Promise<Hospitalization> {
  return apiRequest<Hospitalization>(patientPath(scope, patientId, "hospitalizations/"), {
    method: "POST",
    body: payload,
  });
}

export function updateHospitalization(
  scope: Scope,
  patientId: number,
  hospitalizationId: number,
  payload: Partial<HospitalizationInput>,
): Promise<Hospitalization> {
  return apiRequest<Hospitalization>(patientPath(scope, patientId, `hospitalizations/${hospitalizationId}/`), {
    method: "PATCH",
    body: payload,
  });
}

export function getFamily(scope: Scope, patientId: number, signal?: AbortSignal): Promise<FamilyMember[]> {
  return apiRequest<FamilyMember[]>(patientPath(scope, patientId, "family/"), { signal });
}

export function getFamilySuggestions(scope: Scope, patientId: number, signal?: AbortSignal): Promise<FamilySuggestion[]> {
  return apiRequest<FamilySuggestion[]>(patientPath(scope, patientId, "family/suggestions/"), { signal });
}

export function createFamilyMember(scope: Scope, patientId: number, payload: FamilyMemberInput): Promise<FamilyMember> {
  return apiRequest<FamilyMember>(patientPath(scope, patientId, "family/"), { method: "POST", body: payload });
}

export function updateFamilyMember(
  scope: Scope,
  patientId: number,
  memberId: number,
  payload: Partial<FamilyMemberInput>,
): Promise<FamilyMember> {
  return apiRequest<FamilyMember>(patientPath(scope, patientId, `family/${memberId}/`), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteFamilyMember(scope: Scope, patientId: number, memberId: number): Promise<void> {
  return apiRequest<void>(patientPath(scope, patientId, `family/${memberId}/`), { method: "DELETE" });
}

export function getOnboarding(scope: Scope, enrollmentId: number, signal?: AbortSignal): Promise<Onboarding> {
  return apiRequest<Onboarding>(path(scope, `enrollments/${enrollmentId}/onboarding/`), { signal });
}

export function completeOnboarding(scope: Scope, enrollmentId: number): Promise<Onboarding> {
  return apiRequest<Onboarding>(path(scope, `enrollments/${enrollmentId}/complete-onboarding/`), { method: "POST" });
}

// ── Рост и вскармливание (этап 2б) ───────────────────────────────────────────

export type MeasurementPosition = "recumbent" | "standing" | "";
export type MeasurementSource = "manual" | "conclusion" | "import";
export type FeedingType = "breast" | "mixed" | "formula" | "general";
export type FeedingSwitchReason =
  | "mother_illness"
  | "mother_absent"
  | "hypogalactia"
  | "no_lactation"
  | "mother_work"
  | "mother_wish"
  | "child_condition"
  | "other"
  | "";

export interface GrowthMeasurement {
  id: number;
  measuredOn: string;
  weightKg: number | null;
  lengthHeightCm: number | null;
  position: MeasurementPosition;
  headCircumferenceCm: number | null;
  chestCircumferenceCm: number | null;
  /** manual правится здесь; conclusion — в заключении приёма; import — архив. */
  source: MeasurementSource;
  conclusionId: number | null;
  appointmentId: number | null;
  notes: string;
  createdBy: EmployeeRef | null;
  createdAt: string;
}

export interface MeasurementInput {
  measuredOn: string;
  weightKg: number | null;
  lengthHeightCm: number | null;
  position: MeasurementPosition;
  headCircumferenceCm: number | null;
  chestCircumferenceCm: number | null;
  notes: string;
}

export interface FeedingPeriod {
  id: number;
  feedingType: FeedingType;
  startedOn: string;
  switchReason: FeedingSwitchReason;
  notes: string;
  createdBy: EmployeeRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedingInput {
  feedingType: FeedingType;
  startedOn: string;
  switchReason: FeedingSwitchReason;
  notes: string;
}

export interface GrowthData {
  sex: string;
  birthDate: string | null;
  gestationalAgeWeeks: number | null;
  gestationalAgeDays: number | null;
  birth: { weightKg: number | null; lengthCm: number | null; headCircumferenceCm: number | null } | null;
  complementaryFeedingOn: string | null;
  measurements: GrowthMeasurement[];
  feeding: FeedingPeriod[];
}

export function getGrowth(scope: Scope, patientId: number, signal?: AbortSignal): Promise<GrowthData> {
  return apiRequest<GrowthData>(patientPath(scope, patientId, "growth/"), { signal });
}

export function createMeasurement(scope: Scope, patientId: number, payload: MeasurementInput): Promise<GrowthMeasurement> {
  return apiRequest<GrowthMeasurement>(patientPath(scope, patientId, "growth/measurements/"), {
    method: "POST",
    body: payload,
  });
}

export function updateMeasurement(
  scope: Scope,
  patientId: number,
  measurementId: number,
  payload: Partial<MeasurementInput>,
): Promise<GrowthMeasurement> {
  return apiRequest<GrowthMeasurement>(patientPath(scope, patientId, `growth/measurements/${measurementId}/`), {
    method: "PATCH",
    body: payload,
  });
}

export function deleteMeasurement(scope: Scope, patientId: number, measurementId: number): Promise<void> {
  return apiRequest<void>(patientPath(scope, patientId, `growth/measurements/${measurementId}/`), { method: "DELETE" });
}

export function createFeedingPeriod(scope: Scope, patientId: number, payload: FeedingInput): Promise<FeedingPeriod> {
  return apiRequest<FeedingPeriod>(patientPath(scope, patientId, "feeding/"), { method: "POST", body: payload });
}

export function updateFeedingPeriod(
  scope: Scope,
  patientId: number,
  periodId: number,
  payload: Partial<FeedingInput>,
): Promise<FeedingPeriod> {
  return apiRequest<FeedingPeriod>(patientPath(scope, patientId, `feeding/${periodId}/`), { method: "PATCH", body: payload });
}

export function deleteFeedingPeriod(scope: Scope, patientId: number, periodId: number): Promise<void> {
  return apiRequest<void>(patientPath(scope, patientId, `feeding/${periodId}/`), { method: "DELETE" });
}
