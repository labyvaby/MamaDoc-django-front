import type { ScribeMode } from "../api/scribe";

/**
 * Чистая машина состояний записи приёма: фазы, время без пауз и очередь
 * кусков на досылку. Без браузерных API — тестируется в node.
 */

export type RecorderPhase = "idle" | "starting" | "recording" | "paused" | "stopping" | "error";

export interface RecorderState {
  phase: RecorderPhase;
  recordingId: number | null;
  lineId: number | null;
  mode: ScribeMode | null;
  startedAt: number | null;
  pausedAt: number | null;
  pausedTotalMs: number;
  /** Сколько кусков отдал MediaRecorder (номер следующего = chunks). */
  chunks: number;
  /** Длительность каждого куска в мс — для «сохранено на сервере». */
  sliceMs: number[];
  /** Номера отправленных кусков. */
  uploaded: number[];
  durationMs: number;
  error: string | null;
  /** Последняя завершённая запись — чтобы окно знало, чего ждать. */
  lastRecordingId: number | null;
}

export type RecorderAction =
  | { type: "start" }
  | { type: "started"; recordingId: number; lineId: number; mode: ScribeMode; now: number }
  | { type: "chunk"; sliceMs: number }
  | { type: "uploaded"; seq: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "stop"; now: number }
  | { type: "stopped" }
  | { type: "failed"; error: string }
  | { type: "reset" };

export const INITIAL_RECORDER: RecorderState = {
  phase: "idle",
  recordingId: null,
  lineId: null,
  mode: null,
  startedAt: null,
  pausedAt: null,
  pausedTotalMs: 0,
  chunks: 0,
  sliceMs: [],
  uploaded: [],
  durationMs: 0,
  error: null,
  lastRecordingId: null,
};

/**
 * Запись «занята»: стартует, пишется, на паузе или досылается. В это время
 * нельзя менять организацию/филиал и выходить без досылки — хвост и «Стоп»
 * ушли бы уже в другом контексте.
 */
export function isScribeBusy(phase: RecorderPhase | null | undefined): boolean {
  return phase === "starting" || phase === "recording" || phase === "paused" || phase === "stopping";
}

export function elapsedMs(state: RecorderState, now: number): number {
  if (state.startedAt == null) return 0;
  const end = state.pausedAt ?? now;
  return Math.max(0, end - state.startedAt - state.pausedTotalMs);
}

/** Номер первого неотправленного куска или null. */
export function nextUpload(state: RecorderState): number | null {
  for (let seq = 0; seq < state.chunks; seq += 1) {
    if (!state.uploaded.includes(seq)) return seq;
  }
  return null;
}

/** Сколько миллисекунд звука уже лежит на сервере подряд с начала. */
export function savedMs(state: RecorderState): number {
  let total = 0;
  for (let seq = 0; seq < state.chunks; seq += 1) {
    if (!state.uploaded.includes(seq)) break;
    total += state.sliceMs[seq] ?? 0;
  }
  return total;
}

export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case "start":
      return { ...INITIAL_RECORDER, phase: "starting", lastRecordingId: state.lastRecordingId };
    case "started":
      return {
        ...state,
        phase: "recording",
        recordingId: action.recordingId,
        lineId: action.lineId,
        mode: action.mode,
        startedAt: action.now,
      };
    case "chunk":
      return { ...state, chunks: state.chunks + 1, sliceMs: [...state.sliceMs, action.sliceMs] };
    case "uploaded":
      return state.uploaded.includes(action.seq)
        ? state
        : { ...state, uploaded: [...state.uploaded, action.seq] };
    case "pause":
      return state.phase === "recording" ? { ...state, phase: "paused", pausedAt: action.now } : state;
    case "resume":
      return state.phase === "paused" && state.pausedAt != null
        ? {
            ...state,
            phase: "recording",
            pausedTotalMs: state.pausedTotalMs + (action.now - state.pausedAt),
            pausedAt: null,
          }
        : state;
    case "stop":
      return { ...state, phase: "stopping", durationMs: elapsedMs(state, action.now) };
    case "stopped":
      return { ...INITIAL_RECORDER, lastRecordingId: state.recordingId };
    case "failed":
      return { ...state, phase: "error", error: action.error };
    case "reset":
      return INITIAL_RECORDER;
    default:
      return state;
  }
}
