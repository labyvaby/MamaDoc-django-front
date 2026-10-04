import { getErrorFields, getErrorMessage } from "../../api/client";
import type { ConditionInput, HealthProfile, HealthProfileUpdate, RiskGroup } from "../../api/health";
import { normalizePrecisionDate } from "./illnessData";

/** Текст ошибки сохранения: сообщения полей без служебных ключей. */
const FIELD_LABELS: Record<string, string> = {
  measuredOn: "Дата замера",
  weightKg: "Вес",
  lengthHeightCm: "Рост",
  headCircumferenceCm: "Окружность головы",
  chestCircumferenceCm: "Окружность груди",
  complementaryFeedingOn: "Первый прикорм",
  startedOn: "Начало",
  endedOn: "Окончание",
  birthWeightG: "Вес при рождении",
  birthLengthCm: "Рост при рождении",
  birthHeadCm: "Голова при рождении",
  gestationalAgeWeeks: "Срок гестации, нед.",
  gestationalAgeDays: "Срок гестации, дн.",
  allergen: "Аллерген",
  drug: "Препарат",
};

export function healthErrorText(error: unknown): string {
  const fields = getErrorFields(error);
  if (!fields) return getErrorMessage(error);
  return Object.entries(fields)
    .map(([key, message]) => (FIELD_LABELS[key] ? `${FIELD_LABELS[key]}: ${String(message)}` : String(message)))
    .join(" ");
}

/** Реакции списком: кнопка добавляет или убирает слово из строки «Сыпь, зуд». */
export function toggleReaction(text: string, reaction: string): string {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const index = parts.findIndex((part) => part.toLowerCase() === reaction.toLowerCase());
  if (index >= 0) parts.splice(index, 1);
  else parts.push(parts.length ? reaction.toLowerCase() : reaction);
  return parts.join(", ");
}

/** Заболевание в паспорте семьи кнопкой: добавить в конец строки или убрать. */
export function toggleCondition(text: string, item: string): string {
  const lines = text
    .split(/[;\n]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const index = lines.findIndex((line) => line.toLowerCase() === item.toLowerCase());
  if (index >= 0) lines.splice(index, 1);
  else lines.push(item);
  return lines.join("; ");
}

/** «3 350» → 3350; пусто — null; мусор — NaN (кнопка сохранения выключится). */
export function parseNumberField(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}

export type ProfilePart = "birth" | "maternity" | "groups" | "blood";

/** Форма профиля: числа строками, пустая строка — «не указано». */
export interface ProfileForm {
  gestationalAgeWeeks: string;
  gestationalAgeDays: string;
  birthWeightG: string;
  birthLengthCm: string;
  birthHeadCircumferenceCm: string;
  apgar1min: string;
  apgar5min: string;
  deliveryType: HealthProfile["deliveryType"];
  maternityHospital: string;
  maternityDischargedOn: string | null;
  birthNoticeReceivedOn: string | null;
  complementaryFeedingOn: string | null;
  perinatalNotes: string;
  riskGroups: RiskGroup[];
  healthGroup: HealthProfile["healthGroup"];
  healthGroupSetOn: string | null;
  peGroup: HealthProfile["peGroup"];
  bloodGroup: HealthProfile["bloodGroup"];
  rhFactor: HealthProfile["rhFactor"];
}

const text = (value: number | null) => (value == null ? "" : String(value).replace(".", ","));

export function toProfileForm(profile: HealthProfile): ProfileForm {
  return {
    gestationalAgeWeeks: text(profile.gestationalAgeWeeks),
    gestationalAgeDays: text(profile.gestationalAgeDays),
    birthWeightG: text(profile.birthWeightG),
    birthLengthCm: text(profile.birthLengthCm),
    birthHeadCircumferenceCm: text(profile.birthHeadCircumferenceCm),
    apgar1min: text(profile.apgar1min),
    apgar5min: text(profile.apgar5min),
    deliveryType: profile.deliveryType,
    maternityHospital: profile.maternityHospital,
    maternityDischargedOn: profile.maternityDischargedOn,
    birthNoticeReceivedOn: profile.birthNoticeReceivedOn,
    complementaryFeedingOn: profile.complementaryFeedingOn,
    perinatalNotes: profile.perinatalNotes,
    riskGroups: profile.riskGroups,
    healthGroup: profile.healthGroup,
    healthGroupSetOn: profile.healthGroupSetOn,
    peGroup: profile.peGroup,
    bloodGroup: profile.bloodGroup,
    rhFactor: profile.rhFactor,
  };
}

const PART_FIELDS: Record<ProfilePart, ReadonlyArray<keyof ProfileForm>> = {
  birth: [
    "gestationalAgeWeeks",
    "gestationalAgeDays",
    "birthWeightG",
    "birthLengthCm",
    "birthHeadCircumferenceCm",
    "apgar1min",
    "apgar5min",
    "deliveryType",
    "perinatalNotes",
  ],
  maternity: ["maternityHospital", "maternityDischargedOn", "birthNoticeReceivedOn", "complementaryFeedingOn"],
  groups: ["healthGroup", "healthGroupSetOn", "peGroup", "riskGroups"],
  blood: ["bloodGroup", "rhFactor"],
};

const NUMERIC: ReadonlyArray<keyof ProfileForm> = [
  "gestationalAgeWeeks",
  "gestationalAgeDays",
  "birthWeightG",
  "birthLengthCm",
  "birthHeadCircumferenceCm",
  "apgar1min",
  "apgar5min",
];

/**
 * Тело диагноза с видом и точностью даты (ТЗ 2026-10-04 §2.2): дата
 * приводится к 1-му числу или 1 января. Перенесённая — без Д-учёта и
 * «выздоровела» (кроме ошибочно внесённой); её «выздоровление» сегодняшним
 * числом не подставляется — ОРВИ 2024 года не «выздоравливает» сегодня.
 */
export function buildConditionPayload(form: ConditionInput): ConditionInput {
  const payload: ConditionInput = {
    ...form,
    title: form.title.trim(),
    diagnosisCode: form.diagnosisCode.trim().toUpperCase(),
    place: form.place.trim(),
    notes: form.notes.trim(),
    diagnosedOn: normalizePrecisionDate(form.diagnosedOn, form.datePrecision),
  };
  if (payload.kind === "past") {
    return {
      ...payload,
      status: payload.status === "refuted" ? "refuted" : "resolved",
      isDispensary: false,
      dispensarySince: null,
      dispensaryEndedOn: null,
      dispensaryEndReason: "",
      responsibleDoctorId: null,
      controlIntervalMonths: null,
      lastControlOn: null,
      nextControlOn: null,
    };
  }
  return payload;
}

/** Тело PATCH: только поля открытых частей; числа — числами; ошибка ввода — null. */
export function buildProfilePatch(form: ProfileForm, parts: ReadonlyArray<ProfilePart>): HealthProfileUpdate | null {
  const payload: Record<string, unknown> = {};
  for (const part of parts) {
    for (const key of PART_FIELDS[part]) {
      const value = form[key];
      if (NUMERIC.includes(key)) {
        const parsed = parseNumberField(value as string);
        if (parsed != null && Number.isNaN(parsed)) return null;
        payload[key] = parsed;
      } else {
        payload[key] = typeof value === "string" ? value.trim() : value;
      }
    }
  }
  return payload as HealthProfileUpdate;
}
