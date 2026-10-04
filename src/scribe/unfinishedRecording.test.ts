import { describe, expect, it } from "vitest";
import type { ScribeRecording } from "../api/scribe";
import { findUnfinishedRecording, unfinishedMinutes } from "./unfinishedRecording";

const T0 = Date.parse("2026-10-04T10:00:00Z");

const rec = (patch: Partial<ScribeRecording>): ScribeRecording => ({
  id: 1,
  serviceLineId: 5,
  mode: "visit",
  status: "recording",
  abandoned: false,
  durationMs: 0,
  chunkCount: 4,
  startedAt: new Date(T0).toISOString(),
  stoppedAt: null,
  errorCode: "",
  audioAvailable: true,
  transcript: "",
  result: null,
  appliedAt: null,
  ...patch,
});

describe("findUnfinishedRecording", () => {
  it("брошенная сервером — сразу", () => {
    const item = rec({ abandoned: true });
    expect(findUnfinishedRecording([item], null, T0 + 1000)).toBe(item);
  });

  it("молчит дольше куски×15 с + минута — незавершённая", () => {
    const item = rec({ chunkCount: 4 });
    // 4 куска = 60 с звука, + 60 с запаса → 120 с.
    expect(findUnfinishedRecording([item], null, T0 + 120_000)).toBeNull();
    expect(findUnfinishedRecording([item], null, T0 + 120_001)).toBe(item);
  });

  it("пишется в этой вкладке — не предлагаем", () => {
    const item = rec({ id: 7, abandoned: true });
    expect(findUnfinishedRecording([item], 7, T0 + 600_000)).toBeNull();
  });

  it("без звука и не в статусе записи — пропуск", () => {
    const items = [
      rec({ id: 1, abandoned: true, audioAvailable: false }),
      rec({ id: 2, abandoned: true, status: "queued" }),
      rec({ id: 3, abandoned: true, status: "cancelled" }),
    ];
    expect(findUnfinishedRecording(items, null, T0 + 600_000)).toBeNull();
  });

  it("находится и под более новой записью", () => {
    const newer = rec({ id: 9, status: "ready", startedAt: new Date(T0 + 900_000).toISOString() });
    const older = rec({ id: 4, abandoned: true });
    expect(findUnfinishedRecording([newer, older], null, T0 + 1_000_000)).toBe(older);
  });

  it("только что остановленную в этой вкладке не показываем, пока строку не перечитали", () => {
    const item = rec({ id: 7, chunkCount: 1 });
    const now = T0 + 600_000;
    const justStopped = { id: 7, at: T0 + 500_000 };
    // Данные строки — до «Стопа»: статус ещё «recording», это не брошенная.
    expect(findUnfinishedRecording([item], null, now, { justStopped, fetchedAt: T0 + 400_000 })).toBeNull();
    // Строку перечитали после «Стопа», а запись всё ещё «recording» (стоп не дошёл) — показываем.
    expect(findUnfinishedRecording([item], null, now, { justStopped, fetchedAt: T0 + 550_000 })).toBe(item);
    // Другая запись под правило не попадает.
    const other = rec({ id: 8, chunkCount: 1 });
    expect(findUnfinishedRecording([other], null, now, { justStopped, fetchedAt: T0 + 400_000 })).toBe(other);
  });

  it("битая дата старта — только по флагу abandoned", () => {
    const item = rec({ startedAt: "not-a-date" });
    expect(findUnfinishedRecording([item], null, T0 + 10_000_000)).toBeNull();
  });
});

describe("unfinishedMinutes", () => {
  it("по числу кусков, не меньше минуты", () => {
    expect(unfinishedMinutes(rec({ chunkCount: 0 }))).toBe(1);
    expect(unfinishedMinutes(rec({ chunkCount: 2 }))).toBe(1);
    expect(unfinishedMinutes(rec({ chunkCount: 28 }))).toBe(7);
  });
});
