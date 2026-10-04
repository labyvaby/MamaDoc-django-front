import { describe, expect, it } from "vitest";
import {
  INITIAL_RECORDER,
  elapsedMs,
  isScribeBusy,
  nextUpload,
  recorderReducer,
  savedMs,
  type RecorderState,
} from "./recorderMachine";

const started = (): RecorderState =>
  recorderReducer(recorderReducer(INITIAL_RECORDER, { type: "start" }), {
    type: "started",
    recordingId: 7,
    lineId: 5,
    mode: "visit",
    now: 1000,
  });

describe("recorderMachine", () => {
  it("старт → запись", () => {
    const s = started();
    expect(s.phase).toBe("recording");
    expect(s.recordingId).toBe(7);
    expect(elapsedMs(s, 6000)).toBe(5000);
  });

  it("пауза не считается во времени", () => {
    let s = started();
    s = recorderReducer(s, { type: "pause", now: 3000 });
    expect(elapsedMs(s, 10_000)).toBe(2000);
    s = recorderReducer(s, { type: "resume", now: 10_000 });
    expect(elapsedMs(s, 11_000)).toBe(3000);
  });

  it("куски уходят по порядку, повтор — тот же номер", () => {
    let s = started();
    s = recorderReducer(s, { type: "chunk", sliceMs: 15_000 });
    s = recorderReducer(s, { type: "chunk", sliceMs: 15_000 });
    expect(nextUpload(s)).toBe(0);
    s = recorderReducer(s, { type: "uploaded", seq: 0 });
    expect(nextUpload(s)).toBe(1);
    expect(savedMs(s)).toBe(15_000);
    s = recorderReducer(s, { type: "uploaded", seq: 1 });
    expect(nextUpload(s)).toBeNull();
    expect(savedMs(s)).toBe(30_000);
  });

  it("стоп ждёт досылки", () => {
    let s = started();
    s = recorderReducer(s, { type: "chunk", sliceMs: 15_000 });
    s = recorderReducer(s, { type: "stop", now: 20_000 });
    expect(s.phase).toBe("stopping");
    expect(s.durationMs).toBe(19_000);
    s = recorderReducer(s, { type: "uploaded", seq: 0 });
    s = recorderReducer(s, { type: "stopped" });
    expect(s.phase).toBe("idle");
    expect(s.lastRecordingId).toBe(7);
  });

  it("занята — от старта до конца досылки", () => {
    expect(isScribeBusy("idle")).toBe(false);
    expect(isScribeBusy("error")).toBe(false);
    expect(isScribeBusy(null)).toBe(false);
    expect(isScribeBusy(undefined)).toBe(false);
    for (const phase of ["starting", "recording", "paused", "stopping"] as const) {
      expect(isScribeBusy(phase)).toBe(true);
    }
  });

  it("ошибка и сброс", () => {
    let s = recorderReducer(INITIAL_RECORDER, { type: "start" });
    s = recorderReducer(s, { type: "failed", error: "mic_denied" });
    expect(s.phase).toBe("error");
    expect(s.error).toBe("mic_denied");
    expect(recorderReducer(s, { type: "reset" })).toEqual(INITIAL_RECORDER);
  });
});
