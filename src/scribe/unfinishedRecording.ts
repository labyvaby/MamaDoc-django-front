import type { ScribeRecording } from "../api/scribe";

/** Длина куска звука, который шлёт браузер. */
export const SCRIBE_SLICE_MS = 15_000;
/** Запас на сеть и паузу, после которого молчащая запись считается брошенной. */
const SILENCE_GRACE_MS = 60_000;

export interface UnfinishedOptions {
  /** Запись, только что остановленная в этой вкладке, и момент «Стопа». */
  justStopped?: { id: number; at: number } | null;
  /** Когда контекст строки пришёл с сервера (dataUpdatedAt запроса). */
  fetchedAt?: number;
}

/**
 * Незавершённая запись строки: вкладку закрыли без «Стоп», и звук так и
 * лежит на сервере. Сервер помечает такие `abandoned` раз в 10 минут, но
 * ждать его не нужно: если кусков пришло заметно меньше, чем прошло времени,
 * запись «молчит». Запись, которая пишется в этой вкладке, не предлагаем;
 * только что остановленную — тоже, пока строку не перечитали после «Стопа»
 * (в старых данных она ещё «recording»). Ищем по всем записям строки —
 * более новая запись старую не прячет.
 */
export function findUnfinishedRecording(
  recordings: readonly ScribeRecording[],
  ownRecordingId: number | null,
  now: number,
  options: UnfinishedOptions = {},
): ScribeRecording | null {
  const { justStopped, fetchedAt = 0 } = options;
  for (const item of recordings) {
    if (item.status !== "recording" || !item.audioAvailable || item.id === ownRecordingId) continue;
    if (justStopped && item.id === justStopped.id && fetchedAt <= justStopped.at) continue;
    if (item.abandoned) return item;
    const started = Date.parse(item.startedAt);
    if (Number.isFinite(started) && now - started > item.chunkCount * SCRIBE_SLICE_MS + SILENCE_GRACE_MS) {
      return item;
    }
  }
  return null;
}

/** Сколько минут звука уже на сервере — для подписи «Есть незавершённая запись (N мин)». */
export function unfinishedMinutes(recording: ScribeRecording): number {
  return Math.max(1, Math.round((recording.chunkCount * SCRIBE_SLICE_MS) / 60_000));
}
