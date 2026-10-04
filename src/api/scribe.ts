import { apiRequest } from "./client";

/**
 * ИИ-запись приёма (модуль `scribe`): звук из браузера → расшифровка →
 * раскладка по полям заключения. Контракт — `/api/scribe/...` бэка CRM,
 * ключи в camelCase.
 */

export type ScribeMode = "visit" | "dictation";
export type ScribeConsent = "yes" | "no" | "unknown";
export type ScribeStatus =
  | "recording"
  | "queued"
  | "transcribing"
  | "structuring"
  | "ready"
  | "failed"
  | "cancelled";
export type ScribeSection = "complaints" | "anamnesis" | "objective" | "conclusion";

export interface ScribeDiagnosis {
  id: number;
  code: string;
  title: string;
  displayName: string;
}

export interface ScribeVitals {
  weightKg: number | null;
  heightCm: number | null;
  temperature: number | null;
}

export interface ScribeResult {
  sections: Partial<Record<ScribeSection, string>>;
  diagnoses: ScribeDiagnosis[];
  vitals: ScribeVitals;
}

export interface ScribeRecording {
  id: number;
  serviceLineId: number;
  mode: ScribeMode;
  status: ScribeStatus;
  abandoned: boolean;
  durationMs: number;
  chunkCount: number;
  startedAt: string;
  stoppedAt: string | null;
  errorCode: string;
  audioAvailable: boolean;
  transcript: string;
  result: ScribeResult | null;
  appliedAt: string | null;
}

export interface ScribeLineContext {
  serviceLineId: number;
  patientId: number | null;
  consent: ScribeConsent;
  /** Последние записи строки, новые первыми; без текста и результата. */
  recordings: ScribeRecording[];
}

export interface ScribeChunkReceipt {
  seq: number;
  chunkCount: number;
  bytesTotal: number;
}

export interface PatientRecordingConsent {
  patientId: number;
  status: ScribeConsent;
  setAt: string | null;
  setByName: string | null;
}

/** Статусы, в которых запись ещё «едет» к результату. */
export const SCRIBE_IN_PROGRESS: readonly ScribeStatus[] = ["queued", "transcribing", "structuring"];

export function getScribeLine(lineId: number, signal?: AbortSignal): Promise<ScribeLineContext> {
  return apiRequest<ScribeLineContext>(`/scribe/lines/${lineId}/`, { signal });
}

export function getScribeRecording(id: number, signal?: AbortSignal): Promise<ScribeRecording> {
  return apiRequest<ScribeRecording>(`/scribe/recordings/${id}/`, { signal });
}

export function startScribeRecording(input: {
  serviceLineId: number;
  mode: ScribeMode;
  mimeType: string;
  consent?: "yes" | "no";
}): Promise<ScribeRecording> {
  return apiRequest<ScribeRecording>("/scribe/recordings/", { method: "POST", body: input });
}

/** Кусок звука — multipart-поле `chunk`; повтор того же `seq` бэк принимает безвредно. */
export function uploadScribeChunk(id: number, seq: number, blob: Blob): Promise<ScribeChunkReceipt> {
  const form = new FormData();
  form.append("chunk", blob, `part-${seq}`);
  return apiRequest<ScribeChunkReceipt>(`/scribe/recordings/${id}/chunks/${seq}/`, {
    method: "POST",
    formData: form,
  });
}

export function stopScribeRecording(id: number, durationMs: number): Promise<ScribeRecording> {
  return apiRequest<ScribeRecording>(`/scribe/recordings/${id}/stop/`, {
    method: "POST",
    body: { durationMs: Math.round(durationMs) },
  });
}

export function cancelScribeRecording(id: number): Promise<ScribeRecording> {
  return apiRequest<ScribeRecording>(`/scribe/recordings/${id}/cancel/`, { method: "POST" });
}

export function retryScribeRecording(id: number): Promise<ScribeRecording> {
  return apiRequest<ScribeRecording>(`/scribe/recordings/${id}/retry/`, { method: "POST" });
}

export function markScribeApplied(id: number): Promise<ScribeRecording> {
  return apiRequest<ScribeRecording>(`/scribe/recordings/${id}/applied/`, { method: "POST" });
}

export function getPatientRecordingConsent(patientId: number, signal?: AbortSignal): Promise<PatientRecordingConsent> {
  return apiRequest<PatientRecordingConsent>(`/scribe/patients/${patientId}/consent/`, { signal });
}

export function setPatientRecordingConsent(patientId: number, status: "yes" | "no"): Promise<PatientRecordingConsent> {
  return apiRequest<PatientRecordingConsent>(`/scribe/patients/${patientId}/consent/`, {
    method: "PUT",
    body: { status },
  });
}
