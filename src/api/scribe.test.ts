import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiRequest: vi.fn(),
}));

import { apiRequest } from "./client";
import {
  getScribeLine,
  setPatientRecordingConsent,
  startScribeRecording,
  stopScribeRecording,
  uploadScribeChunk,
} from "./scribe";

const mocked = vi.mocked(apiRequest);

describe("api/scribe", () => {
  beforeEach(() => mocked.mockReset());

  it("контекст строки", async () => {
    mocked.mockResolvedValue({ serviceLineId: 5, patientId: 1, consent: "unknown", recordings: [] });
    await getScribeLine(5);
    expect(mocked).toHaveBeenCalledWith("/scribe/lines/5/", { signal: undefined });
  });

  it("старт без согласия не шлёт consent", async () => {
    mocked.mockResolvedValue({ id: 9 });
    await startScribeRecording({ serviceLineId: 5, mode: "dictation", mimeType: "audio/webm" });
    expect(mocked).toHaveBeenCalledWith("/scribe/recordings/", {
      method: "POST",
      body: { serviceLineId: 5, mode: "dictation", mimeType: "audio/webm" },
    });
  });

  it("кусок уходит multipart-полем chunk", async () => {
    mocked.mockResolvedValue({ seq: 3, chunkCount: 4, bytesTotal: 10 });
    await uploadScribeChunk(9, 3, new Blob(["x"], { type: "audio/webm" }));
    const [path, options] = mocked.mock.calls[0];
    expect(path).toBe("/scribe/recordings/9/chunks/3/");
    expect(options?.method).toBe("POST");
    expect((options?.formData as FormData).get("chunk")).toBeInstanceOf(Blob);
  });

  it("у куска свой таймаут — сигнал уходит в запрос", async () => {
    mocked.mockResolvedValue({ seq: 0, chunkCount: 1, bytesTotal: 1 });
    const signal = new AbortController().signal;
    await uploadScribeChunk(9, 0, new Blob(["x"]), signal);
    expect(mocked.mock.calls[0][1]?.signal).toBe(signal);
  });

  it("стоп с длительностью", async () => {
    mocked.mockResolvedValue({ id: 9, status: "queued" });
    await stopScribeRecording(9, 4200.7);
    expect(mocked).toHaveBeenCalledWith("/scribe/recordings/9/stop/", {
      method: "POST",
      body: { durationMs: 4201 },
    });
  });

  it("согласие из карточки", async () => {
    mocked.mockResolvedValue({ patientId: 1, status: "yes", setAt: "x", setByName: null });
    await setPatientRecordingConsent(1, "yes");
    expect(mocked).toHaveBeenCalledWith("/scribe/patients/1/consent/", {
      method: "PUT",
      body: { status: "yes" },
    });
  });
});
