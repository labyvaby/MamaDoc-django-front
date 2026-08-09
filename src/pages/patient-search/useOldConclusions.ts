import React from "react";
import { IS_DJANGO_BACKEND } from "../../config/backend";
import { apiRequest, getErrorMessage, isAbortError } from "../../api/client";

/**
 * Архивное заключение из прошлых систем клиники.
 *
 * Форма полей — snake_case, как её отдавала старая Supabase-таблица
 * `old_conclusions`: панель и карточка деталей читают именно её, поэтому
 * django-ответ приводится к этому же виду (см. fromDjango ниже), а не наоборот.
 */
export type OldConclusion = {
  id: string;
  legacy_id: string | null;
  appointment_id: string | null;
  patient_number: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  temperature: number | null;
  complaints: string | null;
  diagnosis: string | null;
  diagnosis_catalog: string | null;
  anamnesis: string | null;
  objective: string | null;
  recommendations: string | null;
  doctor_comment: string | null;
  document_path: string | null;
  patient_document_path: string | null;
  photo: string | null;
  changed_at: string | null;
  changed_by: string | null;
  ask_for_feedback: boolean;
  /**
   * Откуда запись: до-Supabase база, старый MamaDoc или текущая система
   * (`current` — живое заключение, в том числе сделанное в другом филиале).
   */
  source?: "legacy_db" | "supabase" | "current";
  /** Текст заключения врача — у записей до-Supabase базы его нет. */
  conclusion?: string | null;
  /** Филиал, где сделана запись. Есть только у живых заключений. */
  branch_name?: string | null;
};

/** Ответ Django: GET /api/medical/legacy-conclusions/ (camelCase). */
type DjangoLegacyConclusion = {
  id: number;
  source: "legacy_db" | "supabase";
  patientId: number | null;
  patientPhone: string;
  doctorId: number | null;
  doctorName: string;
  occurredAt: string | null;
  complaints: string;
  anamnesis: string;
  objective: string;
  conclusion: string;
  recommendations: string;
  doctorComment: string;
  internalComment: string;
  diagnosisText: string;
  diagnosisCode: string;
  diagnosisCatalog: string;
  diagnosisData: Array<{ title?: string; diagnosis_code?: string }>;
  weightKg: string | null;
  heightCm: string | null;
  temperature: string | null;
  photoUrls: string[];
  documentPath: string;
  patientDocumentPath: string;
  legacyId: string;
  sourceAppointmentId: string;
  revisionsCount: number;
};

const num = (value: string | null): number | null => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const orNull = (value: string): string | null => (value ? value : null);

/**
 * Диагноз одной строкой. У записей старого MamaDoc он лежит структурно в
 * diagnosisData (список МКБ-10), у до-Supabase базы — свободным текстом.
 */
function diagnosisLine(row: DjangoLegacyConclusion): string | null {
  if (row.diagnosisText) return row.diagnosisText;
  if (Array.isArray(row.diagnosisData) && row.diagnosisData.length) {
    const parts = row.diagnosisData
      .map((d) => [d.diagnosis_code, d.title].filter(Boolean).join(" "))
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  return orNull(row.diagnosisCatalog);
}

function fromDjango(row: DjangoLegacyConclusion): OldConclusion {
  return {
    id: String(row.id),
    legacy_id: orNull(row.legacyId),
    appointment_id: orNull(row.sourceAppointmentId),
    patient_number: orNull(row.patientPhone),
    height_cm: num(row.heightCm),
    weight_kg: num(row.weightKg),
    temperature: num(row.temperature),
    complaints: orNull(row.complaints),
    diagnosis: diagnosisLine(row),
    diagnosis_catalog: orNull(row.diagnosisCatalog),
    anamnesis: orNull(row.anamnesis),
    objective: orNull(row.objective),
    recommendations: orNull(row.recommendations),
    doctor_comment: orNull(row.doctorComment),
    document_path: orNull(row.documentPath),
    patient_document_path: orNull(row.patientDocumentPath),
    photo: row.photoUrls?.length ? row.photoUrls[0] : null,
    changed_at: row.occurredAt,
    // Врач известен только у записей старого MamaDoc: в до-Supabase таблице
    // на месте автора лежал числовой счётчик, а не человек.
    changed_by: orNull(row.doctorName),
    ask_for_feedback: false,
    source: row.source,
    conclusion: orNull(row.conclusion),
  };
}

/** Живое заключение: GET /api/medical/patient-conclusions/ (без финансов). */
type DjangoPatientConclusion = {
  id: number;
  appointmentId: number;
  serviceLineId: number;
  occurredAt: string;
  branch: { id: number; name: string };
  doctor: { id: number; fullName: string } | null;
  serviceName: string;
  complaints: string;
  anamnesis: string;
  objective: string;
  conclusion: string;
  diagnosisData: Array<{ title?: string; diagnosis_code?: string }>;
  photoUrls: string[];
  weightKg: string | null;
  heightCm: string | null;
  temperature: string | null;
  status: "draft" | "completed";
  canEdit: boolean;
};

function diagnosisFromData(
  items: Array<{ title?: string; diagnosis_code?: string }> | undefined,
): string | null {
  if (!Array.isArray(items) || !items.length) return null;
  const parts = items
    .map((d) => [d.diagnosis_code, d.title].filter(Boolean).join(" "))
    .filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

function fromLiveConclusion(row: DjangoPatientConclusion): OldConclusion {
  return {
    // Префикс, чтобы id живого заключения не столкнулся с id архивной записи.
    id: `live-${row.id}`,
    legacy_id: null,
    appointment_id: String(row.appointmentId),
    patient_number: null,
    height_cm: num(row.heightCm),
    weight_kg: num(row.weightKg),
    temperature: num(row.temperature),
    complaints: orNull(row.complaints),
    diagnosis: diagnosisFromData(row.diagnosisData),
    diagnosis_catalog: null,
    anamnesis: orNull(row.anamnesis),
    objective: orNull(row.objective),
    recommendations: null,
    doctor_comment: null,
    document_path: null,
    patient_document_path: null,
    photo: row.photoUrls?.length ? row.photoUrls[0] : null,
    changed_at: row.occurredAt,
    changed_by: row.doctor?.fullName ?? null,
    ask_for_feedback: false,
    source: "current",
    conclusion: orNull(row.conclusion),
    branch_name: row.branch?.name ?? null,
  };
}

/**
 * Вся история заключений пациента: архив прошлых систем плюс живые записи
 * текущей системы.
 *
 * Архив ищем и по телефону, и по id карточки: телефон — его основной ключ (в
 * старых системах связь с пациентом была только по номеру, и семейный номер
 * покрывает несколько детей), а patientId добирает записи, у которых номер
 * успели изменить уже после переноса.
 *
 * Живые заключения берутся отдельным запросом, потому что список приёмов
 * ограничен филиалами пользователя (он же питает кассу и отчёты), а
 * медицинская история при общем реестре пациентов не должна разрезаться по
 * филиалам — иначе врач видит заключения 2023 года и не видит осмотр коллеги
 * из соседнего филиала. Этот эндпоинт не отдаёт ни одного финансового поля.
 */
export function useOldConclusions(patientPhone?: string, patientId?: number | string) {
  const [data, setData] = React.useState<OldConclusion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!patientPhone && !patientId) {
      setData([]);
      setErrorMsg(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const rows = IS_DJANGO_BACKEND
          ? await fetchFromDjango(patientPhone, patientId, ctrl.signal)
          : await fetchFromSupabase(patientPhone, ctrl.signal);
        setData(rows);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        setErrorMsg(getErrorMessage(err, "Не удалось загрузить старые заключения"));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [patientPhone, patientId]);

  return { data, loading, errorMsg };
}

async function fetchFromDjango(
  patientPhone: string | undefined,
  patientId: number | string | undefined,
  signal: AbortSignal,
): Promise<OldConclusion[]> {
  const params = new URLSearchParams();
  if (patientPhone) params.set("phone", patientPhone);
  if (patientId) params.set("patientId", String(patientId));
  // Один номер может нести длинную историю (в архиве есть карточки с сотнями
  // записей), поэтому берём верхнюю границу эндпоинта, а не страницу по 100.
  params.set("limit", "500");

  // Живые заключения — только когда известна карточка. Один упавший запрос не
  // должен обнулить весь список: архив полезен и без свежих записей, и наоборот.
  const [archive, live] = await Promise.all([
    apiRequest<DjangoLegacyConclusion[]>(
      `/medical/legacy-conclusions/?${params.toString()}`,
      { signal },
    ).catch((err) => {
      if (isAbortError(err)) throw err;
      return [] as DjangoLegacyConclusion[];
    }),
    patientId
      ? apiRequest<DjangoPatientConclusion[]>(
          `/medical/patient-conclusions/?patientId=${encodeURIComponent(String(patientId))}&limit=500`,
          { signal },
        ).catch((err) => {
          if (isAbortError(err)) throw err;
          return [] as DjangoPatientConclusion[];
        })
      : Promise.resolve([] as DjangoPatientConclusion[]),
  ]);

  const merged = [
    ...(live ?? []).map(fromLiveConclusion),
    ...(archive ?? []).map(fromDjango),
  ];
  // Новее — выше; записи без даты (в архиве такие есть) уходят в конец.
  return merged.sort((a, b) => {
    if (!a.changed_at) return 1;
    if (!b.changed_at) return -1;
    return b.changed_at.localeCompare(a.changed_at);
  });
}

/** Прежний путь — прямой запрос в Supabase. Остаётся для supabase-режима. */
async function fetchFromSupabase(
  patientPhone: string | undefined,
  signal: AbortSignal,
): Promise<OldConclusion[]> {
  if (!patientPhone) return [];
  const { supabase } = await import("../../utility/supabaseClient");

  // Точные совпадения вместо ILIKE: номер в старой базе записан в разных
  // форматах, а ILIKE по 27 000 строк уходил в таймаут.
  const cleanNumber = patientPhone.replace(/\D/g, "");
  const forms: string[] = [cleanNumber, `+${cleanNumber}`];
  if (cleanNumber.startsWith("996") && cleanNumber.length === 12) {
    const core = cleanNumber.slice(3);
    forms.push(core, `0${core}`);
    forms.push(`+996 ${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`);
    forms.push(`996 ${core.slice(0, 3)} ${core.slice(3, 6)} ${core.slice(6)}`);
  }

  const { data, error } = await supabase
    .from("old_conclusions")
    .select("*")
    .in("patient_number", forms)
    .order("changed_at", { ascending: false })
    .abortSignal(signal);

  if (error) throw error;
  return (data ?? []) as OldConclusion[];
}
