import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, apiStream } from "./client";
import {
  AI_ASSIST_BATCH_MAX,
  AI_ASSIST_FORM_ROWS_MAX,
  fitAiFormRows,
  isAiUnavailableError,
  normalizeAiBatchSuggestions,
  normalizeAiText,
  AiAssistStreamError,
  createSseParser,
  requestAiAssistBatch,
  requestAiAssistStream,
  streamAiAssistBatch,
  type AiAssistStreamSuggestion,
  type SseEvent,
} from "./medical";

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiRequest: vi.fn(),
  apiStream: vi.fn(),
}));

/**
 * Ответ AI-помощника — предложение рядом с полем, и показывать его есть
 * смысл только когда там есть текст. Гайд (13.09.2026) прямо просит не
 * полагаться на точное `""`: модель может вернуть пробелы или заглушку вроде
 * «данных не предоставлено», когда ей не на что опереться.
 */
describe("normalizeAiText", () => {
  it("обрезает пробелы по краям", () => {
    expect(normalizeAiText("  Жалуется на боль в горле.\n")).toBe("Жалуется на боль в горле.");
  });

  it("возвращает null для пустого ответа и одних пробелов", () => {
    expect(normalizeAiText("")).toBeNull();
    expect(normalizeAiText(" \n\t ")).toBeNull();
    expect(normalizeAiText(null)).toBeNull();
    expect(normalizeAiText(undefined)).toBeNull();
  });

  it("считает пустым ответ из одних невидимых символов (живой ответ test, 15.09.2026)", () => {
    expect(normalizeAiText("\u200E")).toBeNull();
    expect(normalizeAiText(" \uFEFF\u200B ")).toBeNull();
  });

  it("не показывает реплику модели в скобках про отсутствие данных (живые ответы test)", () => {
    for (const text of [
      "(Текст врача не предоставлен — данных для раздела «жалобы пациента» нет.)",
      "(пусто — текст врача не содержит данных для раздела)",
    ]) {
      expect(normalizeAiText(text), text).toBeNull();
    }
  });

  it("оставляет обычный текст про отсутствие жалоб и текст в скобках по делу", () => {
    for (const text of [
      "Жалоб на момент осмотра не предъявляет. Приём по поводу вакцинации.",
      "Жалоб нет, данных о травмах нет.",
      "(со слов матери) кашель третий день",
    ]) {
      expect(normalizeAiText(text)).toBe(text);
    }
  });

  it("не показывает заглушку модели как предложение", () => {
    for (const text of [
      "Данных не предоставлено.",
      "данные не предоставлены",
      "Нет данных",
      "Недостаточно данных.",
      "«Информация отсутствует»",
      "N/A",
      "—",
    ]) {
      expect(normalizeAiText(text), text).toBeNull();
    }
  });

  it("не режет нормальный текст, в котором заглушка — часть фразы", () => {
    const text = "Анамнез: данных о хронических заболеваниях не предоставлено, аллергии отрицает.";
    expect(normalizeAiText(text)).toBe(text);
  });
});

describe("isAiUnavailableError", () => {
  it("502–504 и 429 — «AI временно недоступен», остальное — обычная ошибка", () => {
    expect(isAiUnavailableError(new ApiError("rate limit", 429, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("bad gateway", 502, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("unavailable", 503, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("timeout", 504, null))).toBe(true);
    expect(isAiUnavailableError(new ApiError("forbidden", 403, null))).toBe(false);
    expect(isAiUnavailableError(new ApiError("server", 500, null))).toBe(false);
    expect(isAiUnavailableError(new Error("network"))).toBe(false);
  });
});

/**
 * Пакетный эндпоинт (ответы бэка 16.09 и 27.09.2026): ключи `suggestions` —
 * ровно запрошенные колонки, `formSuggestions` — ровно id отправленных строк
 * бланка; пустой `text` — «добавить нечего», не ошибка.
 */
describe("normalizeAiBatchSuggestions", () => {
  it("раскладывает ответ по запрошенным полям, пустой text → null", () => {
    expect(
      normalizeAiBatchSuggestions(
        {
          suggestions: {
            complaints: { text: "Жалуется на боль в горле.", confidence: 0.75 },
            anamnesis: { text: "", confidence: 0.75 },
            conclusion: { text: " Рекомендовано...\n", confidence: 0.75 },
          },
        },
        ["complaints", "anamnesis", "conclusion"],
      ).fields,
    ).toEqual({
      complaints: "Жалуется на боль в горле.",
      anamnesis: null,
      conclusion: "Рекомендовано...",
    });
  });

  it("отсутствующий ключ и заглушка модели — тоже «нечего показать»", () => {
    expect(
      normalizeAiBatchSuggestions(
        { suggestions: { diagnosis: { text: "Нет данных" } } },
        ["complaints", "diagnosis"],
      ).fields,
    ).toEqual({ complaints: null, diagnosis: null });
    expect(normalizeAiBatchSuggestions({}, ["objective"]).fields).toEqual({ objective: null });
    expect(normalizeAiBatchSuggestions(null, ["objective"]).fields).toEqual({ objective: null });
  });

  it("лишние ключи ответа не попадают в результат", () => {
    const result = normalizeAiBatchSuggestions(
      {
        suggestions: { complaints: { text: "a" }, anamnesis: { text: "b" } },
        formSuggestions: { f_liver: { text: "c" }, f_extra: { text: "d" } },
      },
      ["complaints"],
      ["f_liver"],
    );
    expect(Object.keys(result.fields)).toEqual(["complaints"]);
    expect(result.rows).toEqual({ f_liver: "c" });
  });

  it("строки бланка — из formSuggestions, id строки не путается с колонкой", () => {
    expect(
      normalizeAiBatchSuggestions(
        {
          suggestions: { conclusion: { text: "колонка" } },
          formSuggestions: {
            conclusion: { text: "строка с id conclusion" },
            f_gb: { text: "", confidence: 0.75 },
          },
        },
        [],
        ["conclusion", "f_gb", "f_missing"],
      ).rows,
    ).toEqual({ conclusion: "строка с id conclusion", f_gb: null, f_missing: null });
  });
});

describe("fitAiFormRows", () => {
  it("режет до 40 строк, выкидывает дубли и id длиннее 64 символов", () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: `r${i}`, label: `Строка ${i}`, text: "" }));
    rows.splice(1, 0, { id: "r0", label: "дубль", text: "" }, { id: "x".repeat(65), label: "длинный", text: "" });
    const fitted = fitAiFormRows(rows);
    expect(fitted).toHaveLength(AI_ASSIST_FORM_ROWS_MAX);
    expect(fitted.map((r) => r.id)).toEqual(Array.from({ length: 40 }, (_, i) => `r${i}`));
  });

  it("multiline шлём только когда он есть", () => {
    expect(
      fitAiFormRows([
        { id: "a", label: "A", text: "1", multiline: false },
        { id: "b", label: "B", text: "", multiline: true },
      ]),
    ).toEqual([
      { id: "a", label: "A", text: "1" },
      { id: "b", label: "B", text: "", multiline: true },
    ]);
  });
});

describe("requestAiAssistBatch", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("не шлёт пакет, который бэк отверг бы 422: пусто, дубль поля, больше пяти", async () => {
    await expect(requestAiAssistBatch([])).rejects.toThrow(/уникальных полей/);
    await expect(
      requestAiAssistBatch([
        { field: "complaints", text: "" },
        { field: "complaints", text: "x" },
      ]),
    ).rejects.toThrow(/уникальных полей/);
    expect(AI_ASSIST_BATCH_MAX).toBe(5);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("без бланка тело прежнее: только fields и serviceLineId", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ suggestions: { complaints: { text: "Ок." } } });
    const result = await requestAiAssistBatch([{ field: "complaints", text: "ок" }], {
      serviceLineId: 42,
    });
    expect(vi.mocked(apiRequest).mock.calls[0][1]?.body).toEqual({
      fields: [{ field: "complaints", text: "ок" }],
      serviceLineId: 42,
    });
    expect(result).toEqual({ fields: { complaints: "Ок." }, rows: {}, fieldReasons: {}, rowReasons: {} });
  });

  it("с бланком: target убран из fields, строки ушли в form.rows, ответ по id строк", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      suggestions: { complaints: { text: "Жалобы." } },
      formSuggestions: {
        f_liver: { text: "Не увеличена.", reason: " исправлен регистр " },
        // Причина у пустой подсказки ничего не значит — плашки нет.
        f_gb: { text: "", reason: "нечего добавить" },
      },
    });
    const result = await requestAiAssistBatch(
      [
        { field: "complaints", text: "боль" },
        { field: "conclusion", text: "проекция бланка" },
      ],
      {
        form: {
          title: " УЗИ ОБП ",
          target: "conclusion",
          rows: [
            { id: "f_liver", label: "Печень", text: "не увеличена" },
            { id: "f_gb", label: "Желчный пузырь", text: "", multiline: true },
          ],
        },
      },
    );
    expect(vi.mocked(apiRequest).mock.calls[0][1]?.body).toEqual({
      fields: [{ field: "complaints", text: "боль" }],
      form: {
        title: "УЗИ ОБП",
        target: "conclusion",
        rows: [
          { id: "f_liver", label: "Печень", text: "не увеличена" },
          { id: "f_gb", label: "Желчный пузырь", text: "", multiline: true },
        ],
      },
    });
    expect(result).toEqual({
      fields: { complaints: "Жалобы." },
      rows: { f_liver: "Не увеличена.", f_gb: null },
      fieldReasons: {},
      rowReasons: { f_liver: "исправлен регистр" },
    });
  });

  it("бланк без свободных строк не шлётся, target остаётся колонкой", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ suggestions: {} });
    await requestAiAssistBatch([{ field: "conclusion", text: "" }], {
      form: { target: "conclusion", rows: [] },
    });
    expect(vi.mocked(apiRequest).mock.calls[0][1]?.body).toEqual({
      fields: [{ field: "conclusion", text: "" }],
    });
  });

  it("только строки бланка, без колонок — допустимый запрос", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ suggestions: {}, formSuggestions: { a: { text: "x" } } });
    const result = await requestAiAssistBatch([], {
      form: { target: "conclusion", rows: [{ id: "a", label: "A", text: "" }] },
    });
    expect(vi.mocked(apiRequest).mock.calls[0][1]?.body).toEqual({
      fields: [],
      form: { target: "conclusion", rows: [{ id: "a", label: "A", text: "" }] },
    });
    expect(result.rows).toEqual({ a: "x" });
  });
});

describe("createSseParser", () => {
  const parse = (chunks: string[]) => {
    const events: SseEvent[] = [];
    const parser = createSseParser((e) => events.push(e));
    for (const chunk of chunks) parser.push(chunk);
    return events;
  };

  it("событие, разорванное посередине строки и между \\r и \\n", () => {
    expect(
      parse(["event: sugg", "estion\r", "\ndata: {\"a\":", "1}\r\n\r", "\n"]),
    ).toEqual([{ event: "suggestion", data: '{"a":1}' }]);
  });

  it("heartbeat «: ping» пропускается, data из нескольких строк склеивается", () => {
    expect(parse([": ping\n\n", "data: a\ndata: b\n\n", "event: done\ndata: {}\n\n"])).toEqual([
      { event: "message", data: "a\nb" },
      { event: "done", data: "{}" },
    ]);
  });

  it("событие без пустой строки в конце потока не отдаётся", () => {
    expect(parse(["event: done\ndata: {}\n"])).toEqual([]);
  });
});

/** Ответ-поток из готовых кусков текста. */
function sseResponse(chunks: string[], contentType = "text/event-stream; charset=utf-8"): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": contentType } });
}

const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("streamAiAssistBatch", () => {
  beforeEach(() => {
    vi.mocked(apiStream).mockReset();
  });

  const run = (chunks: string[]) => {
    vi.mocked(apiStream).mockResolvedValue(sseResponse(chunks));
    const got: AiAssistStreamSuggestion[] = [];
    const promise = streamAiAssistBatch(
      [
        { field: "complaints", text: "боль" },
        { field: "anamnesis", text: "" },
      ],
      {
        serviceLineId: 7,
        form: { target: "conclusion", rows: [{ id: "f_liver", label: "Печень", text: "" }] },
        onSuggestion: (s) => got.push(s),
      },
    );
    return { promise, got };
  };

  it("тело то же, что у batch/; подсказки по мере прихода, чужие и повторные ключи отбрасываются", async () => {
    const { promise, got } = run([
      ev("suggestion", { kind: "field", key: "complaints", text: "Боль.", confidence: 0.75, reason: "заглавная буква" }),
      ": ping\n\n",
      ev("suggestion", { kind: "field", key: "complaints", text: "дубль" }),
      ev("suggestion", { kind: "field", key: "diagnosis", text: "не просили" }),
      ev("suggestion", { kind: "row", key: "f_liver", text: "Не увеличена." }),
      ev("suggestion", { kind: "field", key: "anamnesis", text: "" }),
      ev("done", { total: 3, suggested: 2 }),
    ]);
    await expect(promise).resolves.toEqual({ total: 3, suggested: 2 });
    expect(vi.mocked(apiStream).mock.calls[0][0]).toBe("/medical/ai/assist/batch/stream/");
    expect(vi.mocked(apiStream).mock.calls[0][1]?.body).toEqual({
      fields: [
        { field: "complaints", text: "боль" },
        { field: "anamnesis", text: "" },
      ],
      serviceLineId: 7,
      form: { target: "conclusion", rows: [{ id: "f_liver", label: "Печень", text: "" }] },
    });
    expect(got).toEqual([
      { kind: "field", key: "complaints", text: "Боль.", reason: "заглавная буква" },
      { kind: "row", key: "f_liver", text: "Не увеличена.", reason: null },
      { kind: "field", key: "anamnesis", text: null, reason: null },
    ]);
  });

  it("event: error после части подсказок — ошибка с числом пришедших, пришедшее остаётся", async () => {
    const { promise, got } = run([
      ev("suggestion", { kind: "field", key: "complaints", text: "Боль." }),
      ev("error", { code: "AI_UNAVAILABLE" }),
    ]);
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiAssistStreamError);
    expect(err).toMatchObject({ code: "AI_UNAVAILABLE", received: 1 });
    expect(got).toHaveLength(1);
  });

  it("поток кончился без done (gunicorn убил воркер) — это обрыв, а не успех", async () => {
    const { promise } = run([ev("suggestion", { kind: "field", key: "complaints", text: "Боль." })]);
    await expect(promise).rejects.toMatchObject({ code: "STREAM_TRUNCATED", received: 1 });
  });
});

describe("requestAiAssistStream", () => {
  beforeEach(() => {
    vi.mocked(apiStream).mockReset();
    vi.mocked(apiRequest).mockReset();
  });

  const request = () => {
    const got: AiAssistStreamSuggestion[] = [];
    const promise = requestAiAssistStream([{ field: "complaints", text: "боль" }], {
      onSuggestion: (s) => got.push(s),
    });
    return { promise, got };
  };

  it("404 (бэк без стрима) — те же подсказки через batch/", async () => {
    vi.mocked(apiStream).mockRejectedValue(new ApiError("Not found", 404, null));
    vi.mocked(apiRequest).mockResolvedValue({
      suggestions: { complaints: { text: "Боль.", reason: "орфография" } },
    });
    const { promise, got } = request();
    await expect(promise).resolves.toEqual({ total: 1, suggested: 1 });
    expect(vi.mocked(apiRequest).mock.calls[0][0]).toBe("/medical/ai/assist/batch/");
    expect(got).toEqual([{ kind: "field", key: "complaints", text: "Боль.", reason: "орфография" }]);
  });

  it("ответ не text/event-stream — тоже batch/", async () => {
    vi.mocked(apiStream).mockResolvedValue(sseResponse(["{}"], "application/json"));
    vi.mocked(apiRequest).mockResolvedValue({ suggestions: {} });
    await request().promise;
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("event: error до первой подсказки batch/ не зовёт: тот же AI-сервис, квота общая", async () => {
    vi.mocked(apiStream).mockResolvedValue(sseResponse([ev("error", { code: "AI_UNAVAILABLE" })]));
    await expect(request().promise).rejects.toBeInstanceOf(AiAssistStreamError);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("400/403 до старта потока пробрасываются как есть", async () => {
    vi.mocked(apiStream).mockRejectedValue(new ApiError("Нет прав", 403, null));
    await expect(request().promise).rejects.toMatchObject({ status: 403 });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
