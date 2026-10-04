import React from "react";
import { useNotification } from "@refinedev/core";
import { useQueryClient } from "@tanstack/react-query";

import { ApiError, getErrorCode, getErrorMessage } from "../api/client";
import {
  cancelScribeRecording,
  startScribeRecording,
  stopScribeRecording,
  uploadScribeChunk,
  type ScribeMode,
  type ScribeRecording,
} from "../api/scribe";
import { useCan } from "../hooks/useCan";
import { useChangesSocket, type ChangeMessage } from "../hooks/useChangesSocket";
import { usePermissions } from "../hooks/usePermissions";
import { useT } from "../i18n/VerticalProvider";
import { micErrorCode, openMicrophone, pickMimeType, watchLevel, type MicErrorCode } from "./microphone";
import {
  INITIAL_RECORDER,
  elapsedMs,
  nextUpload,
  recorderReducer,
  savedMs,
  type RecorderAction,
  type RecorderState,
} from "./recorderMachine";

const SLICE_MS = 15_000;
const LIMIT_MS = 60 * 60_000;
const WARN_MS = 55 * 60_000;
const RETRY_MAX_MS = 30_000;
const MIC_ERRORS: readonly string[] = ["mic_denied", "mic_missing", "mic_insecure", "unsupported"];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Отказ сервера, который повтором не лечится: запись уже остановлена или
 * отменена в другом месте, нет доступа, кусок не принят. Сеть, 5xx, 401
 * (войдут заново — досылка продолжится) и 429 — повторяем.
 */
function isPermanentError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
}

export interface StartOptions {
  lineId: number;
  mode: ScribeMode;
  consent?: "yes" | "no";
}

/** Состояние записи и команды. Меняется только на переходах и кусках. */
export interface ScribeRecorderApi {
  state: RecorderState;
  /** Сколько звука уже лежит на сервере подряд с начала, мс. */
  saved: number;
  pendingUploads: boolean;
  start: (options: StartOptions) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  cancel: () => Promise<void>;
}

/**
 * Таймер и громкость — отдельным контекстом: они меняются несколько раз в
 * секунду, и окно заключения (большое дерево) не должно перерисовываться
 * вместе с ними — их читают только полоса записи и точка в шапке.
 */
export interface ScribeClock {
  level: number;
  elapsed: number;
}

const ScribeRecorderContext = React.createContext<ScribeRecorderApi | null>(null);
const ScribeClockContext = React.createContext<ScribeClock>({ level: 0, elapsed: 0 });

export const scribeQueryKey = (lineId: number) => ["scribe", "line", lineId] as const;

/**
 * Запись приёма живёт над маршрутами: окно заключения можно закрыть и уйти
 * на другую страницу — звук пишется и досылается кусками по 15 с.
 */
export const ScribeRecorderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = React.useReducer(recorderReducer, INITIAL_RECORDER);
  const [level, setLevel] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  // Синхронная копия состояния для асинхронной досылки: каждое действие
  // проходит через send() — и в ref, и в React, тем же чистым редьюсером.
  const stateRef = React.useRef<RecorderState>(INITIAL_RECORDER);
  const blobs = React.useRef(new Map<number, Blob>());
  const recorder = React.useRef<MediaRecorder | null>(null);
  const stopLevel = React.useRef<(() => void) | null>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const uploading = React.useRef(false);
  /** Сервер отказался принимать куски — досылку и «Стоп» больше не пытаемся. */
  const rejected = React.useRef(false);
  const lastSliceAt = React.useRef(0);
  const warned = React.useRef(false);
  /** Записи, начатые в этой вкладке: только о них тост «готово». */
  const mine = React.useRef(new Set<number>());
  const { open: notify } = useNotification();
  const { t } = useT("scribe");
  // Тикер не должен переподписываться на каждый рендер (громкость — 7 раз
  // в секунду): уведомления и тексты берём из ref.
  const notifyRef = React.useRef(notify);
  notifyRef.current = notify;
  const tRef = React.useRef(t);
  tRef.current = t;
  const queryClient = useQueryClient();
  const { activeBranch } = usePermissions();
  const canRecord = useCan("scribe.record");

  const send = React.useCallback((action: RecorderAction) => {
    stateRef.current = recorderReducer(stateRef.current, action);
    dispatch(action);
  }, []);

  const refreshLine = React.useCallback(
    (lineId: number | null) => {
      if (lineId != null) void queryClient.invalidateQueries({ queryKey: scribeQueryKey(lineId) });
    },
    [queryClient],
  );

  const releaseMic = React.useCallback(() => {
    stopLevel.current?.();
    stopLevel.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    setLevel(0);
  }, []);

  /** Погасить MediaRecorder без досылки и «Стоп» (отмена, отказ сервера). */
  const dropRecorder = React.useCallback(() => {
    const rec = recorder.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
    }
    releaseMic();
    blobs.current.clear();
  }, [releaseMic]);

  const rejectRecording = React.useCallback(() => {
    if (rejected.current) return;
    rejected.current = true;
    const current = stateRef.current;
    dropRecorder();
    send({ type: "failed", error: "upload_rejected" });
    refreshLine(current.lineId);
    notifyRef.current?.({ type: "error", message: tRef.current("errors.upload_rejected") });
  }, [dropRecorder, refreshLine, send]);

  // Досылка: один кусок за раз, по порядку; сбой сети — повтор того же
  // номера с растущей паузой, пока не уйдёт.
  const pump = React.useCallback(async () => {
    if (uploading.current) return;
    uploading.current = true;
    let delay = 1000;
    let restart = false;
    try {
      for (;;) {
        const current = stateRef.current;
        const seq = nextUpload(current);
        if (seq == null || current.recordingId == null || rejected.current) break;
        const blob = blobs.current.get(seq);
        if (!blob) break;
        try {
          await uploadScribeChunk(current.recordingId, seq, blob);
          // Пока кусок летел, запись отменили и начали новую — её очередь
          // разберёт следующий проход.
          if (stateRef.current.recordingId !== current.recordingId) {
            restart = true;
            break;
          }
          blobs.current.delete(seq);
          send({ type: "uploaded", seq });
          delay = 1000;
        } catch (err) {
          if (isPermanentError(err)) {
            rejectRecording();
            break;
          }
          await sleep(delay);
          delay = Math.min(delay * 2, RETRY_MAX_MS);
        }
      }
    } finally {
      uploading.current = false;
    }
    if (restart) void pump();
  }, [rejectRecording, send]);

  // После «Стоп»: дослать всё, затем остановить запись на сервере.
  const finish = React.useCallback(async () => {
    while (!rejected.current && nextUpload(stateRef.current) != null) {
      await pump();
      if (!rejected.current && nextUpload(stateRef.current) != null) await sleep(1000);
    }
    if (rejected.current) return;
    const current = stateRef.current;
    if (current.recordingId != null) {
      let delay = 1000;
      for (;;) {
        try {
          await stopScribeRecording(current.recordingId, current.durationMs);
          break;
        } catch (err) {
          // Уже остановлена или доступа нет — сервер сам покажет её
          // брошенной («Отправить / Удалить»), висеть в «досылаем» незачем.
          if (isPermanentError(err)) break;
          await sleep(delay);
          delay = Math.min(delay * 2, RETRY_MAX_MS);
        }
      }
      refreshLine(current.lineId);
    }
    send({ type: "stopped" });
  }, [pump, refreshLine, send]);

  const start = React.useCallback(
    async ({ lineId, mode, consent }: StartOptions) => {
      const phase = stateRef.current.phase;
      if (phase !== "idle" && phase !== "error") return;
      send({ type: "start" });
      const fail = (code: string, message?: string) => {
        send({ type: "failed", error: code });
        const text =
          message ?? tRef.current(MIC_ERRORS.includes(code) ? `errors.${code}` : "errors.start_failed");
        notifyRef.current?.({ type: "error", message: text });
      };
      const preferred = pickMimeType();
      if (preferred == null) return fail("unsupported");
      let media: MediaStream;
      try {
        media = await openMicrophone();
      } catch (err) {
        return fail((err as { scribeCode?: MicErrorCode }).scribeCode ?? micErrorCode(err));
      }
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(
          media,
          preferred ? { mimeType: preferred, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 },
        );
      } catch {
        media.getTracks().forEach((track) => track.stop());
        return fail("unsupported");
      }
      let recording: ScribeRecording;
      try {
        recording = await startScribeRecording({
          serviceLineId: lineId,
          mode,
          mimeType: rec.mimeType || preferred || "audio/webm",
          ...(consent ? { consent } : {}),
        });
      } catch (err) {
        media.getTracks().forEach((track) => track.stop());
        return fail(getErrorCode(err) ?? "start_failed", getErrorMessage(err, tRef.current("errors.start_failed")));
      }
      stream.current = media;
      recorder.current = rec;
      rejected.current = false;
      warned.current = false;
      blobs.current.clear();
      mine.current.add(recording.id);
      rec.ondataavailable = (event) => {
        if (recorder.current !== rec || !event.data || event.data.size === 0) return;
        const seq = stateRef.current.chunks;
        const at = Date.now();
        blobs.current.set(seq, event.data);
        send({ type: "chunk", sliceMs: at - lastSliceAt.current });
        lastSliceAt.current = at;
        void pump();
      };
      // Последний кусок приходит перед onstop — после него можно досылать и
      // закрывать запись на сервере.
      rec.onstop = () => {
        releaseMic();
        void finish();
      };
      stopLevel.current = watchLevel(media, setLevel);
      lastSliceAt.current = Date.now();
      rec.start(SLICE_MS);
      send({ type: "started", recordingId: recording.id, lineId, mode, now: Date.now() });
      refreshLine(lineId);
    },
    [finish, pump, refreshLine, releaseMic, send],
  );

  const stop = React.useCallback(() => {
    const phase = stateRef.current.phase;
    if (phase !== "recording" && phase !== "paused") return;
    send({ type: "stop", now: Date.now() });
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      releaseMic();
      void finish();
    }
  }, [finish, releaseMic, send]);

  const pause = React.useCallback(() => {
    if (stateRef.current.phase !== "recording") return;
    if (recorder.current?.state === "recording") recorder.current.pause();
    send({ type: "pause", now: Date.now() });
  }, [send]);

  const resume = React.useCallback(() => {
    if (stateRef.current.phase !== "paused") return;
    if (recorder.current?.state === "paused") recorder.current.resume();
    send({ type: "resume", now: Date.now() });
  }, [send]);

  const cancel = React.useCallback(async () => {
    const current = stateRef.current;
    dropRecorder();
    // Сначала сброс: полоса записи исчезает сразу, а не после ответа сервера.
    send({ type: "reset" });
    if (current.recordingId != null) {
      mine.current.delete(current.recordingId);
      await cancelScribeRecording(current.recordingId).catch(() => undefined);
    }
    refreshLine(current.lineId);
  }, [dropRecorder, refreshLine, send]);

  // Тикер времени и лимит 60 минут.
  React.useEffect(() => {
    if (state.phase !== "recording" && state.phase !== "paused") return undefined;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      const spent = elapsedMs(stateRef.current, at);
      if (spent >= WARN_MS && !warned.current) {
        warned.current = true;
        notifyRef.current?.({ type: "progress", message: tRef.current("toast.limitSoon") });
      }
      if (spent >= LIMIT_MS) {
        notifyRef.current?.({ type: "error", message: tRef.current("toast.limitReached") });
        stop();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [state.phase, stop]);

  // Не дать закрыть вкладку, пока идёт запись или не дослано.
  const busy = state.phase === "recording" || state.phase === "paused" || state.phase === "stopping";
  React.useEffect(() => {
    if (!busy) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  // Смена организации/филиала — остановить и дослать, не терять звук.
  React.useEffect(() => {
    const handler = () => stop();
    window.addEventListener("mamadoc:django-context-switched", handler);
    return () => window.removeEventListener("mamadoc:django-context-switched", handler);
  }, [stop]);

  // Провайдер живёт всё время работы приложения; на всякий случай отпускаем
  // микрофон, если его всё же размонтируют.
  React.useEffect(() => () => releaseMic(), [releaseMic]);

  // Готово — тост, даже если окно заключения закрыто. Сокет — только у тех,
  // кому запись доступна: остальным лишнее соединение ни к чему.
  useChangesSocket({
    branchId: activeBranch?.id,
    enabled: canRecord,
    onMessage: (msg: ChangeMessage) => {
      if (msg.entity !== "scribe_recording" || msg.objectId == null) return;
      const lineId = Number(msg.meta?.serviceLineId);
      if (Number.isFinite(lineId)) refreshLine(lineId);
      if (msg.meta?.status === "ready" && mine.current.has(msg.objectId)) {
        mine.current.delete(msg.objectId);
        notifyRef.current?.({ type: "success", message: tRef.current("toast.ready") });
      }
    },
  });

  const value = React.useMemo<ScribeRecorderApi>(
    () => ({
      state,
      saved: savedMs(state),
      pendingUploads: nextUpload(state) != null,
      start,
      pause,
      resume,
      stop,
      cancel,
    }),
    [state, start, pause, resume, stop, cancel],
  );

  const clock = React.useMemo<ScribeClock>(
    () => ({ level, elapsed: elapsedMs(state, now) }),
    [level, now, state],
  );

  return (
    <ScribeRecorderContext.Provider value={value}>
      <ScribeClockContext.Provider value={clock}>{children}</ScribeClockContext.Provider>
    </ScribeRecorderContext.Provider>
  );
};

export function useScribeRecorder(): ScribeRecorderApi | null {
  return React.useContext(ScribeRecorderContext);
}

export function useScribeClock(): ScribeClock {
  return React.useContext(ScribeClockContext);
}
