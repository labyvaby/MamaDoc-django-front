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
import { addContextSwitchGuard, usePermissions } from "../hooks/usePermissions";
import { useT } from "../i18n/VerticalProvider";
import {
  MIC_ERROR_CODES,
  micErrorCode,
  openMicrophone,
  pickMimeType,
  watchLevel,
  type MicErrorCode,
} from "./microphone";
import {
  INITIAL_RECORDER,
  elapsedMs,
  isScribeBusy,
  nextUpload,
  recorderReducer,
  savedMs,
  type RecorderAction,
  type RecorderState,
} from "./recorderMachine";
import { staleGuard } from "./staleGuard";
import { waitFor, type WaitResult } from "./waitFor";

const SLICE_MS = 15_000;
const LIMIT_MS = 60 * 60_000;
const WARN_MS = 55 * 60_000;
const RETRY_MAX_MS = 30_000;
/** Кусок дольше минуты не грузится — обрываем и повторяем (сеть «висит»). */
const CHUNK_TIMEOUT_MS = 60_000;
/** Сколько выход из системы ждёт досылку, прежде чем предложить выйти без неё. */
const FLUSH_TIMEOUT_MS = 20_000;
const MIC_ERRORS: readonly string[] = MIC_ERROR_CODES;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Таймаут загрузки куска; таймаут становится сетевой ошибкой — значит, повтор. */
const chunkTimeout = (): AbortSignal | undefined =>
  typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(CHUNK_TIMEOUT_MS)
    : undefined;

/**
 * Отказ сервера, который повтором не лечится: запись уже остановлена или
 * отменена в другом месте, нет доступа, кусок не принят. Сеть, таймаут, 5xx,
 * 401 и 429 — повторяем.
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
  /**
   * Остановить запись (если идёт) и дождаться конца досылки — перед выходом
   * из системы, но не дольше `timeoutMs` (по умолчанию 20 с). Отказ сервера
   * (фаза error) — тоже конец. `isCancelled` — выход отменили, ждать незачем.
   */
  flush: (timeoutMs?: number, isCancelled?: () => boolean) => Promise<WaitResult>;
  /**
   * Бросить запись без сетевых вызовов: погасить микрофон и очередь. Что
   * уже на сервере, станет «незавершённой записью» (Отправить / Удалить).
   */
  abandon: () => void;
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
 * Запись приёма живёт над рабочими макетами (только для вошедших): окно
 * заключения можно закрыть и уйти на другую страницу — звук пишется и
 * досылается кусками по 15 с.
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
  /** Закрыть текущую запись ровно один раз: дослать и «Стоп» на сервере. */
  const finalizeRef = React.useRef<(() => void) | null>(null);
  /**
   * Поколение записи: меняется, когда запись гасят без досылки (отмена,
   * отказ сервера, «выйти без досылки», размонтирование). Циклы досылки и
   * «Стопа» сверяют его после каждого ожидания и молча выходят.
   */
  const epoch = React.useRef(0);
  /** Провайдер смонтирован; после размонтирования — ни запросов, ни тостов. */
  const alive = React.useRef(true);
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
    epoch.current += 1;
    const rec = recorder.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      if (rec.state !== "inactive") rec.stop();
    }
    stream.current?.getTracks().forEach((track) => {
      track.onended = null;
    });
    finalizeRef.current = null;
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
    if (uploading.current || !alive.current) return;
    uploading.current = true;
    const myEpoch = epoch.current;
    // Запись погасили без досылки или провайдер размонтирован — молча выходим.
    const gone = () => !alive.current || epoch.current !== myEpoch;
    let delay = 1000;
    let restart = false;
    try {
      for (;;) {
        if (gone()) {
          restart = alive.current;
          break;
        }
        const current = stateRef.current;
        const seq = nextUpload(current);
        if (seq == null || current.recordingId == null || rejected.current) break;
        const blob = blobs.current.get(seq);
        if (!blob) break;
        try {
          await uploadScribeChunk(current.recordingId, seq, blob, chunkTimeout());
          // Пока кусок летел, запись отменили и начали новую — её очередь
          // разберёт следующий проход.
          if (gone() || stateRef.current.recordingId !== current.recordingId) {
            restart = alive.current;
            break;
          }
          blobs.current.delete(seq);
          send({ type: "uploaded", seq });
          delay = 1000;
        } catch (err) {
          if (gone()) {
            restart = alive.current;
            break;
          }
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
    const myEpoch = epoch.current;
    const gone = () => !alive.current || epoch.current !== myEpoch;
    while (!rejected.current && !gone() && nextUpload(stateRef.current) != null) {
      await pump();
      if (!rejected.current && !gone() && nextUpload(stateRef.current) != null) await sleep(1000);
    }
    if (rejected.current || gone()) return;
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
          if (gone()) return;
          if (isPermanentError(err)) break;
          await sleep(delay);
          if (gone()) return;
          delay = Math.min(delay * 2, RETRY_MAX_MS);
        }
      }
      if (gone()) return;
      refreshLine(current.lineId);
    }
    send({ type: "stopped", now: Date.now() });
  }, [pump, refreshLine, send]);

  const start = React.useCallback(
    async ({ lineId, mode, consent }: StartOptions) => {
      const phase = stateRef.current.phase;
      if (phase !== "idle" && phase !== "error") return;
      send({ type: "start" });
      // Между ожиданиями (микрофон, сервер) запись могли сбросить — «выйти без
      // досылки», отмена — или провайдер размонтировали: тогда старт бросаем.
      const stale = staleGuard(epoch, alive);
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
        if (stale()) return;
        return fail((err as { scribeCode?: MicErrorCode }).scribeCode ?? micErrorCode(err));
      }
      if (stale()) {
        media.getTracks().forEach((track) => track.stop());
        return;
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
        if (stale()) return;
        return fail(getErrorCode(err) ?? "start_failed", getErrorMessage(err, tRef.current("errors.start_failed")));
      }
      if (stale()) {
        // Пока ждали сервер, запись сбросили или провайдер размонтировали:
        // микрофон не держим, а созданную на сервере запись отменяем, не
        // дожидаясь ответа, — иначе она повисла бы «незавершённой».
        media.getTracks().forEach((track) => track.stop());
        void cancelScribeRecording(recording.id).catch(() => undefined);
        return;
      }
      stream.current = media;
      recorder.current = rec;
      rejected.current = false;
      warned.current = false;
      blobs.current.clear();
      mine.current.add(recording.id);

      let finalized = false;
      const finalize = () => {
        if (finalized) return;
        finalized = true;
        finalizeRef.current = null;
        releaseMic();
        void finish();
      };
      // Рекордер остановился сам (микрофон выдернули, доступ отозвали, сбой
      // кодека): фиксируем «Стоп» с длительностью и досылаем, что успели.
      const endedByItself = () => {
        const current = stateRef.current.phase;
        if (current !== "recording" && current !== "paused") return;
        send({ type: "stop", now: Date.now() });
        notifyRef.current?.({ type: "error", message: tRef.current("errors.mic_lost") });
      };
      try {
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
          endedByItself();
          finalize();
        };
        rec.onerror = () => {
          endedByItself();
          if (rec.state !== "inactive") {
            try {
              rec.stop(); // дальше — onstop
              return;
            } catch {
              /* уже остановлен — закрываем сами */
            }
          }
          finalize();
        };
        media.getAudioTracks().forEach((track) => {
          track.onended = () => {
            if (rec.state === "inactive") return;
            endedByItself();
            rec.stop();
          };
        });
        finalizeRef.current = finalize;
        stopLevel.current = watchLevel(media, setLevel);
        lastSliceAt.current = Date.now();
        rec.start(SLICE_MS);
      } catch {
        // Сервер запись уже завёл, а браузер писать не смог: гасим микрофон и
        // отменяем запись на сервере — пустой «брошенной» она не останется.
        dropRecorder();
        mine.current.delete(recording.id);
        void cancelScribeRecording(recording.id).catch(() => undefined);
        refreshLine(lineId);
        return fail("start_failed");
      }
      send({ type: "started", recordingId: recording.id, lineId, mode, now: Date.now() });
      refreshLine(lineId);
    },
    [dropRecorder, finish, pump, refreshLine, releaseMic, send],
  );

  const stop = React.useCallback(() => {
    const phase = stateRef.current.phase;
    if (phase !== "recording" && phase !== "paused") return;
    send({ type: "stop", now: Date.now() });
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // дальше — onstop → finalize
    } else if (finalizeRef.current) {
      finalizeRef.current();
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

  const flush = React.useCallback(
    (timeoutMs: number = FLUSH_TIMEOUT_MS, isCancelled?: () => boolean) =>
      waitFor(
        () => {
          const phase = stateRef.current.phase;
          if (phase === "recording" || phase === "paused") {
            stop();
            return false;
          }
          return phase !== "starting" && phase !== "stopping";
        },
        { timeoutMs, cancelled: () => !alive.current || Boolean(isCancelled?.()) },
      ),
    [stop],
  );

  const abandon = React.useCallback(() => {
    const current = stateRef.current;
    // Без единого запроса: сеть, видимо, лежит — потому и бросаем.
    dropRecorder();
    if (current.recordingId != null) mine.current.delete(current.recordingId);
    send({ type: "reset" });
  }, [dropRecorder, send]);

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
      // Состояние — синхронное: досылка могла закончиться за миг до ухода
      // (выход после flush), а слушатель ещё не снят рендером.
      const phase = stateRef.current.phase;
      if (phase !== "recording" && phase !== "paused" && phase !== "stopping") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  // Пока запись занята, организацию и филиал не переключить: событие о смене
  // приходит уже после неё, и хвост со «Стопом» ушли бы в чужом контексте
  // (403/404). Экраны переключения показывают причину из ошибки.
  React.useEffect(
    () =>
      addContextSwitchGuard(() =>
        isScribeBusy(stateRef.current.phase) ? tRef.current("busy.switch") : null,
      ),
    [],
  );

  // Запасной путь: контекст всё же сменился в обход охранника — остановить
  // и дослать, что получится.
  React.useEffect(() => {
    const handler = () => stop();
    window.addEventListener("mamadoc:django-context-switched", handler);
    return () => window.removeEventListener("mamadoc:django-context-switched", handler);
  }, [stop]);

  // Размонтирование (сессия истекла — RequireAuth увёл на вход): гасим
  // рекордер без тоста «микрофон отключился» и останавливаем очередь — после
  // размонтирования запросов нет. Что успело уйти, на сервере станет
  // «незавершённой записью».
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      dropRecorder();
    };
  }, [dropRecorder]);

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
      flush,
      abandon,
    }),
    [state, start, pause, resume, stop, cancel, flush, abandon],
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

/** Идёт запись или досылка. Вне провайдера (публичные страницы) — false. */
export function useScribeBusy(): boolean {
  return isScribeBusy(React.useContext(ScribeRecorderContext)?.state.phase);
}
