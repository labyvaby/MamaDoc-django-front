import { ApiError, apiRequest } from "./client";
import { Scope, scopeParams } from "./scope";
import { preparePhotoIfImage, withUploadErrors } from "./uploads";

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
/** Точность даты: при `month` день — 1-е число, при `year` — 1 января. */
export type DatePrecision = "day" | "month" | "year";
/** `chronic` — хроническое или под наблюдением; `past` — перенесённая болезнь, внесённая вручную. */
export type ConditionKind = "chronic" | "past";
export type AttachmentKind = "discharge" | "image" | "other";

/** Документ записи медкарты: ссылка только из загрузки для этой карточки (`health-files/`). */
export interface HealthAttachment {
  url: string;
  name: string;
  kind: AttachmentKind;
}

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
  kind: ConditionKind;
  diagnosisId: number | null;
  diagnosisCode: string;
  title: string;
  status: ConditionStatus;
  diagnosedOn: string | null;
  datePrecision: DatePrecision;
  /** Где лечили (у перенесённой): дома, другая клиника, стационар. */
  place: string;
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
  kind: ConditionKind;
  title: string;
  diagnosisId: number | null;
  diagnosisCode: string;
  status: ConditionStatus;
  diagnosedOn: string | null;
  datePrecision: DatePrecision;
  place: string;
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
  /** Заключение, из которого диагноз поднят кнопкой «Хроническое». */
  sourceConclusionId: number | null;
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
  attachments: HealthAttachment[];
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
  attachments: HealthAttachment[];
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
  params: { status?: ConditionStatus | "all"; dispensary?: boolean; kind?: ConditionKind } = {},
  signal?: AbortSignal,
): Promise<Condition[]> {
  const extra: Record<string, string> = {};
  if (params.status) extra.status = params.status;
  if (params.dispensary) extra.dispensary = "1";
  // Без вида сервер отдаёт хронические — как до появления перенесённых.
  if (params.kind) extra.kind = params.kind;
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

/** Журнал прикорма (ТЗ 2026-10-04-book-feeding §2.3): группа продукта. */
export type FoodGroup = "vegetables" | "cereals" | "meat" | "fruits" | "egg" | "dairy" | "fish" | "other";
export type FoodReaction = "none" | "rash" | "abdomen" | "stool" | "vomiting" | "other";
/** Тяжесть есть только при реакции; без реакции — пусто. */
export type FoodReactionSeverity = "mild" | "moderate" | "severe" | "";

/** Отметка «продукт дали в этот день»: первая — введение, следующие — повторы. */
export interface FoodIntroduction {
  id: number;
  /** Код каталога интерфейса; пусто — свой продукт. */
  productCode: string;
  productName: string;
  foodGroup: FoodGroup;
  givenOn: string;
  reaction: FoodReaction;
  reactionSeverity: FoodReactionSeverity;
  /** Аллергия, внесённая по этой отметке; null — не вносили. */
  allergy: { id: number; allergen: string; status: AllergyStatus } | null;
  notes: string;
  createdBy: EmployeeRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface FoodIntroductionInput {
  productCode: string;
  productName: string;
  foodGroup: FoodGroup;
  givenOn: string;
  reaction: FoodReaction;
  reactionSeverity: FoodReactionSeverity;
  notes: string;
  /** null снимает связь с аллергией. */
  allergyId: number | null;
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
  /** Журнал прикорма, от ранних отметок к поздним. */
  foods: FoodIntroduction[];
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

export function createFood(scope: Scope, patientId: number, payload: FoodIntroductionInput): Promise<FoodIntroduction> {
  return apiRequest<FoodIntroduction>(patientPath(scope, patientId, "foods/"), { method: "POST", body: payload });
}

export function updateFood(
  scope: Scope,
  patientId: number,
  foodId: number,
  payload: Partial<FoodIntroductionInput>,
): Promise<FoodIntroduction> {
  return apiRequest<FoodIntroduction>(patientPath(scope, patientId, `foods/${foodId}/`), { method: "PATCH", body: payload });
}

/** Удаляется только ошибочная отметка: без реакции и без аллергии (иначе 400). */
export function deleteFood(scope: Scope, patientId: number, foodId: number): Promise<void> {
  return apiRequest<void>(patientPath(scope, patientId, `foods/${foodId}/`), { method: "DELETE" });
}

// ── Курсы препаратов (этап 2в) ───────────────────────────────────────────────

export type MedicationKind = "antibiotic" | "vitamin_d" | "other";
export type MedicationPurpose = "prophylaxis" | "treatment" | "";

export interface MedicationCourse {
  id: number;
  kind: MedicationKind;
  purpose: MedicationPurpose;
  drug: string;
  dose: string;
  startedOn: string;
  endedOn: string | null;
  courseTotal: string;
  reaction: string;
  prescribedBy: EmployeeRef | null;
  sourceConclusionId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationInput {
  kind: MedicationKind;
  purpose: MedicationPurpose;
  drug: string;
  dose: string;
  startedOn: string;
  endedOn: string | null;
  courseTotal: string;
  reaction: string;
  prescribedById: number | null;
  notes: string;
}

export function getMedications(scope: Scope, patientId: number, signal?: AbortSignal): Promise<MedicationCourse[]> {
  return apiRequest<MedicationCourse[]>(patientPath(scope, patientId, "medications/"), { signal });
}

export function createMedication(scope: Scope, patientId: number, payload: MedicationInput): Promise<MedicationCourse> {
  return apiRequest<MedicationCourse>(patientPath(scope, patientId, "medications/"), { method: "POST", body: payload });
}

export function updateMedication(
  scope: Scope,
  patientId: number,
  courseId: number,
  payload: Partial<MedicationInput>,
): Promise<MedicationCourse> {
  return apiRequest<MedicationCourse>(patientPath(scope, patientId, `medications/${courseId}/`), {
    method: "PATCH",
    body: payload,
  });
}

// ── История болезней, детские инфекции, операции и травмы (пакет B) ─────────
// ТЗ docs/specs/2026-10-04-book-illness-surgery-design.md, §2.5.

export type IllnessCounter = "ari" | "otitis" | "intestinal";
/** `visit` — есть живое заключение, `archive` — только архив, `manual` — внесено вручную. */
export type EpisodeSource = "visit" | "archive" | "manual";
export type AgeBand = "0" | "1-3" | "4-5" | "6+";

export interface IllnessDiagnosis {
  code: string;
  title: string;
}

/** Приём (или архивное заключение) внутри случая болезни. */
export interface IllnessVisit {
  on: string;
  appointmentId: number | null;
  conclusionId: number | null;
  legacyConclusionId: number | null;
  doctor: EmployeeRef | null;
  /** Врач текстом — у архива, где сотрудника нет. */
  doctorName: string;
  /** Специализации врача через запятую. */
  specialty: string;
  serviceName: string;
  branch: { id: number; name: string } | null;
  /** Диагнозы этой группы на этом приёме. */
  diagnoses: IllnessDiagnosis[];
}

export interface EpisodeMedication {
  id: number;
  drug: string;
  startedOn: string;
  endedOn: string | null;
  /** Дней курса — при известной дате отмены. */
  days: number | null;
}

/** Случай болезни: приёмы одной группы диагнозов с промежутком не больше 21 дня. */
export interface IllnessEpisode {
  /** `v<заключение>-<группа>`, `a<архив>-<группа>`, `m<диагноз>`. */
  key: string;
  source: EpisodeSource;
  counter: IllnessCounter | null;
  startedOn: string;
  endedOn: string;
  datePrecision: DatePrecision;
  diagnoses: IllnessDiagnosis[];
  /** Номер в справочнике клиники — для кнопки «Хроническое». */
  diagnosisId: number | null;
  visitsCount: number;
  visits: IllnessVisit[];
  /** У `manual` — его строка диагноза; у остальных — хроническое той же рубрики. */
  conditionId: number | null;
  isChronic: boolean;
  place: string;
  notes: string;
  medications: EpisodeMedication[];
}

export interface ChronicStat {
  conditionId: number;
  visitsLast12Months: number;
  lastVisitOn: string | null;
}

export type ChildhoodInfectionCode =
  | "varicella"
  | "measles"
  | "rubella"
  | "mumps"
  | "pertussis"
  | "scarlet_fever"
  | "roseola"
  | "mononucleosis";
export type InfectionStatus = "had" | "not_had" | "unknown";
export type InfectionEvidence = "doctor" | "lab" | "parent";

export interface ChildhoodInfection {
  id: number;
  infection: ChildhoodInfectionCode;
  status: InfectionStatus;
  occurredOn: string | null;
  datePrecision: DatePrecision;
  evidence: InfectionEvidence | "";
  sourceConclusionId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EmployeeRef | null;
  updatedBy: EmployeeRef | null;
}

export interface ChildhoodInfectionInput {
  infection: ChildhoodInfectionCode;
  status: InfectionStatus;
  occurredOn: string | null;
  datePrecision: DatePrecision;
  evidence: InfectionEvidence | "";
  sourceConclusionId: number | null;
  notes: string;
}

export interface InfectionMention {
  on: string;
  code: string;
  title: string;
  conclusionId: number | null;
  legacyConclusionId: number | null;
}

/** Итог по одной детской инфекции (§3.7). */
export interface InfectionSummary {
  infection: ChildhoodInfectionCode;
  name: string;
  codes: string[];
  status: InfectionStatus;
  /** «Болела» выведено из приёмов, отметки нет. */
  derived: boolean;
  /** Отмечено «не болела», а диагноз в приёмах есть. */
  conflict: boolean;
  record: ChildhoodInfection | null;
  mentions: InfectionMention[];
}

export interface IllnessSummary {
  windowFrom: string;
  windowTo: string;
  ageYears: number | null;
  /** У взрослых и без даты рождения — null. */
  ageBand: AgeBand | null;
  counts: { ari: number; otitis: number; intestinal: number; episodes: number; hospitalizations: number };
  frequentIll: { threshold: number; isFrequent: boolean } | null;
  sources: { visits: number; archive: number; manual: number };
}

/** `GET illness-history/` — вся «История болезней» одним ответом. */
export interface IllnessHistory {
  patientId: number;
  birthDate: string | null;
  today: string;
  chronic: Condition[];
  chronicStats: ChronicStat[];
  /** Новые сверху. */
  episodes: IllnessEpisode[];
  hospitalizations: Hospitalization[];
  /** Все восемь инфекций в порядке каталога. */
  infections: InfectionSummary[];
  summary: IllnessSummary;
}

export function getIllnessHistory(scope: Scope, patientId: number, signal?: AbortSignal): Promise<IllnessHistory> {
  return apiRequest<IllnessHistory>(patientPath(scope, patientId, "illness-history/"), { signal });
}

/** Тело отметки: при создании обязательны `infection` и `status`; при правке `null` очищает поле. */
export type ChildhoodInfectionPayload = Partial<Record<keyof ChildhoodInfectionInput, unknown>>;

export function createChildhoodInfection(
  scope: Scope,
  patientId: number,
  payload: ChildhoodInfectionPayload,
): Promise<ChildhoodInfection> {
  return apiRequest<ChildhoodInfection>(patientPath(scope, patientId, "childhood-infections/"), {
    method: "POST",
    body: payload,
  });
}

export function updateChildhoodInfection(
  scope: Scope,
  patientId: number,
  recordId: number,
  payload: ChildhoodInfectionPayload,
): Promise<ChildhoodInfection> {
  return apiRequest<ChildhoodInfection>(patientPath(scope, patientId, `childhood-infections/${recordId}/`), {
    method: "PATCH",
    body: payload,
  });
}

export type SurgeryKind = "operation" | "injury" | "procedure" | "transfusion";
export type SurgeryStatus = "recorded" | "refuted";
export type InjuryType = "fracture" | "dislocation" | "bruise" | "sprain" | "burn" | "wound" | "concussion" | "other";
export type BodySide = "left" | "right" | "both";
export type InjuryTreatment = "cast" | "splint" | "sutures" | "surgery" | "bandage";
export type TransfusionProduct = "red_cells" | "plasma" | "platelets" | "exchange" | "immunoglobulin" | "other";
export type Anesthesia = "general" | "sedation" | "local" | "none";
export type AnesthesiaTolerance = "good" | "complications";
export type SurgeryOutcome = "recovered" | "consequences" | "ongoing";

/** Операция, травма, процедура или переливание крови (иммуноглобулина). */
export interface Surgery {
  id: number;
  kind: SurgeryKind;
  status: SurgeryStatus;
  performedOn: string;
  datePrecision: DatePrecision;
  title: string;
  injuryType: InjuryType | "";
  bodyPart: string;
  side: BodySide | "";
  treatments: InjuryTreatment[];
  transfusionProduct: TransfusionProduct | "";
  reason: string;
  facility: string;
  surgeon: string;
  anesthesia: Anesthesia | "";
  anesthesiaTolerance: AnesthesiaTolerance | "";
  anesthesiaNotes: string;
  complications: string;
  outcome: SurgeryOutcome | "";
  hospitalizationId: number | null;
  hospitalization: { id: number; facility: string; admittedOn: string; dischargedOn: string | null } | null;
  attachments: HealthAttachment[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: EmployeeRef | null;
  updatedBy: EmployeeRef | null;
}

/** Тело создания и правки; пустые поля собирает `buildSurgeryPayload` (§2.5: null очищает). */
export type SurgeryPayload = Partial<Record<keyof Omit<Surgery, "id" | "hospitalization" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">, unknown>>;

export function getSurgeries(
  scope: Scope,
  patientId: number,
  params: { kind?: SurgeryKind; status?: "all" } = {},
  signal?: AbortSignal,
): Promise<Surgery[]> {
  const extra: Record<string, string> = {};
  if (params.kind) extra.kind = params.kind;
  if (params.status) extra.status = params.status;
  return apiRequest<Surgery[]>(patientPath(scope, patientId, "surgeries/", extra), { signal });
}

export function createSurgery(scope: Scope, patientId: number, payload: SurgeryPayload): Promise<Surgery> {
  return apiRequest<Surgery>(patientPath(scope, patientId, "surgeries/"), { method: "POST", body: payload });
}

export function updateSurgery(scope: Scope, patientId: number, surgeryId: number, payload: SurgeryPayload): Promise<Surgery> {
  return apiRequest<Surgery>(patientPath(scope, patientId, `surgeries/${surgeryId}/`), { method: "PATCH", body: payload });
}

export interface HealthFileUpload {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/** Документы медкарты: фото и PDF до 10 МБ (§2.5). */
export const HEALTH_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const HEALTH_FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf";

/**
 * `POST health-files/` — загрузка документа карточки. Снимок ужимаем и
 * приводим к jpg (HEIC сервер не берёт), PDF уходит как есть.
 */
export async function uploadHealthFile(scope: Scope, patientId: number, file: File): Promise<HealthFileUpload> {
  const prepared = await preparePhotoIfImage(file);
  if (prepared.size > HEALTH_FILE_MAX_BYTES) {
    throw new ApiError("Файл больше 10 МБ — уменьшите снимок или PDF.", 400, null);
  }
  const form = new FormData();
  form.append("file", prepared);
  return withUploadErrors(() =>
    apiRequest<HealthFileUpload>(patientPath(scope, patientId, "health-files/"), { method: "POST", formData: form }),
  );
}
