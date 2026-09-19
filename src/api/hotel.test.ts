import { afterEach, describe, expect, it, vi } from "vitest";

import { API_RATE_LIMIT_EVENT, ApiError } from "./client";
import { getReservationConflicts, isOverbookingConfirmable, scanGuestDocument } from "./hotel";

/** Конверт ошибок бэка: {"error": {code, message, details, trace_id}}. */
const errorBody = (code: string, message: string, details: Record<string, unknown> | null = null) => ({
  error: { code, message, details, trace_id: "9fe6f1d5" },
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const conflict = {
  reservationId: 4,
  reservationNumber: 4,
  itemId: 9,
  roomTypeId: 2,
  roomId: 6,
  roomNumber: "203",
  checkIn: "2026-09-19",
  checkOut: "2026-09-21",
  guestName: "Тест Конфликт",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("409 NO_AVAILABILITY", () => {
  it("занятый номер (overbookable + conflicts) можно подтвердить повтором с allowOverbooking", () => {
    const err = new ApiError(
      "Номер занят",
      409,
      errorBody("NO_AVAILABILITY", "Номер занят", { overbookable: true, conflicts: [conflict] }),
    );
    expect(isOverbookingConfirmable(err)).toBe(true);
    expect(getReservationConflicts(err)).toEqual([conflict]);
  });

  it("номер в ремонте (details.reason, без overbookable) повтором не подтверждается — только сообщение", () => {
    const err = new ApiError(
      "Номер 203 выведен из продажи (ремонт).",
      409,
      errorBody("NO_AVAILABILITY", "Номер 203 выведен из продажи (ремонт).", { reason: "out_of_service", roomId: 6 }),
    );
    expect(isOverbookingConfirmable(err)).toBe(false);
    expect(getReservationConflicts(err)).toBeNull();
  });

  it("блокировка на даты (reason: blocked) — тоже не подтверждается", () => {
    const err = new ApiError(
      "Номер 203 заблокирован с 2026-10-17 по 2026-10-19.",
      409,
      errorBody("NO_AVAILABILITY", "Номер 203 заблокирован с 2026-10-17 по 2026-10-19.", {
        reason: "blocked",
        roomId: 6,
        blockId: 4,
        dateFrom: "2026-10-17",
        dateTo: "2026-10-19",
      }),
    );
    expect(isOverbookingConfirmable(err)).toBe(false);
  });

  it("другой код 409 не считается конфликтом занятости", () => {
    const err = new ApiError("Версия устарела", 409, errorBody("VERSION_CONFLICT", "Версия устарела"));
    expect(isOverbookingConfirmable(err)).toBe(false);
    expect(getReservationConflicts(err)).toBeNull();
  });
});

describe("scanGuestDocument", () => {
  const scan = {
    guestType: "resident",
    documentType: "id_card",
    fullName: "АСАНОВ АСАН АСАНОВИЧ",
    documentNumber: "ID2201345",
    documentExpiry: "2027-03-01",
    confidence: 0.93,
    warnings: [],
  };

  it("шлёт multipart-запрос с полем file на scan-document/ и отдаёт разобранный ответ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, scan));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["photo"], "id.jpg", { type: "image/jpeg" });

    const result = await scanGuestDocument(file);

    expect(result.documentNumber).toBe("ID2201345");
    expect(result.confidence).toBe(0.93);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v2\/hotel\/guests\/scan-document\/$/);
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    // Content-Type не задаём руками — браузер сам ставит boundary у multipart.
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("503 — ApiError с кодом RECOGNITION_UNAVAILABLE (провайдер не настроен)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(503, errorBody("RECOGNITION_UNAVAILABLE", "Распознавание документов сейчас недоступно.")),
      ),
    );

    const err = await scanGuestDocument(new File(["x"], "id.jpg")).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as ApiError).code).toBe("RECOGNITION_UNAVAILABLE");
  });

  it("422 — ApiError с кодом DOCUMENT_NOT_RECOGNIZED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, errorBody("DOCUMENT_NOT_RECOGNIZED", "Не удалось распознать."))),
    );

    const err = await scanGuestDocument(new File(["x"], "id.jpg")).catch((e: unknown) => e);

    expect((err as ApiError).code).toBe("DOCUMENT_NOT_RECOGNIZED");
  });

  it("429 RECOGNITION_RATE_LIMITED не открывает общий диалог «обновите страницу», обычный 429 — открывает", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(429, errorBody("RECOGNITION_RATE_LIMITED", "Подождите минуту."))),
    );
    const limited = await scanGuestDocument(new File(["x"], "id.jpg")).catch((e: unknown) => e);
    expect((limited as ApiError).code).toBe("RECOGNITION_RATE_LIMITED");
    expect(dispatchEvent).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, { detail: "Too Many Requests" })));
    await scanGuestDocument(new File(["x"], "id.jpg")).catch(() => undefined);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(API_RATE_LIMIT_EVENT);
  });
});
