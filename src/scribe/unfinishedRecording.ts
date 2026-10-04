import type { ScribeRecording } from "../api/scribe";

/** Длина куска звука, который шлёт браузер. */
export const SCRIBE_SLICE_MS = 15_000;
/** Запас на сеть и паузу, после которого молчащая запись считается брошенной. */
const SILENCE_GRACE_MS = 60_000;

/**
 * Незавершённая запись строки: вкладку закрыли без «Стоп», и звук так и
 * лежит на сервере. Сервер помечает такие `abandoned` раз в 10 минут, но
 * ждать его не нужно: если кусков пришло заметно меньше, чем прошло времени,
 * запись «молчит». Запись, которая пишется в этой вкладке, не предлагаем.
 * Ищем по всем записям строки — более новая запись старую не прячет.
 */
export function findUnfinishedRecording(
  recordings: readonly ScribeRecording[],
  ownRecordingId: number | null,
  now: number,
): ScribeRecording | null {
  for (const item of recordings) {
    if (item.status !== "recording" || !item.audioAvailable || item.id === ownRecordingId) continue;
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
