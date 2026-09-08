import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ApiError } from "./client";
import {
  DEAL_MOVED,
  STAGE_NOT_EMPTY,
  getMovedDeal,
  getStageDealsCount,
  moveDealTo,
  type Deal,
} from "./deals";

/** Карточка из живого ответа теста (01.09.2026) — минимум полей для проверок. */
function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: 2,
    pipelineId: 1,
    stageId: 1,
    stageName: "Новое обращение",
    stageKind: "open",
    contactName: "Тест",
    phone: "+996700000001",
    comment: "",
    patientId: null,
    patientName: null,
    assigneeId: null,
    assigneeName: null,
    amount: "0.00",
    currency: "KGS",
    sourceId: null,
    sourceName: null,
    nextActionAt: null,
    isActionOverdue: false,
    lostReasonId: null,
    lostReasonName: null,
    position: 0,
    branchId: 1,
    branchName: "Мама Доктор",
    bookingId: null,
    createdById: 1,
    createdByName: "Нурсултан",
    itemsCount: 0,
    activitiesCount: 0,
    wonAt: null,
    closedAt: null,
    createdAt: "2026-09-01T10:43:02.859103+00:00",
    updatedAt: "2026-09-01T10:43:02.859115+00:00",
    isSlaBreached: false,
    daysInStage: 0,
    ...over,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("getMovedDeal", () => {
  it("достаёт свежую сделку из 409, чтобы доска перерисовалась без второго запроса", () => {
    const fresh = deal({ stageId: 2, stageName: "Дозвонились" });
    const error = new ApiError("Карточку уже переместили", 409, {
      error: { code: DEAL_MOVED, message: "Карточку уже переместили", details: { deal: fresh } },
    });
    expect(getMovedDeal(error)?.stageId).toBe(2);
  });

  it("молчит на любой другой ошибке: ветвимся только по коду, не по статусу", () => {
    const other = new ApiError("Нельзя", 409, {
      error: { code: "SOMETHING_ELSE", message: "Нельзя", details: { deal: deal() } },
    });
    expect(getMovedDeal(other)).toBeNull();
    expect(getMovedDeal(new Error("сеть"))).toBeNull();
  });
});

describe("getStageDealsCount", () => {
  it("возвращает число сделок, мешающих удалить этап — для диалога «куда перенести»", () => {
    const error = new ApiError("В этапе 12 сделок", 400, {
      error: { code: STAGE_NOT_EMPTY, message: "В этапе 12 сделок", details: { dealsCount: 12 } },
    });
    expect(getStageDealsCount(error)).toBe(12);
  });
});

/**
 * ⚠ Тест держит костыль под расхождение с контрактом (см. moveDealTo): когда
 * бэк начнёт сам чистить причину при возврате в работу, тест «дошлёт
 * clearLostReason» упадёт — это сигнал убрать костыль, а не чинить тест.
 */
describe("moveDealTo", () => {
  it("дочищает причину потери при возврате закрытой сделки в работу", async () => {
    const movedWithReason = deal({
      stageId: 1,
      stageKind: "open",
      lostReasonId: 1,
      lostReasonName: "Дорого",
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ deal: movedWithReason, columns: [{ stageId: 6, count: 0, amountTotal: "0.00" }] }, 201),
      )
      .mockResolvedValueOnce(jsonResponse({ ...movedWithReason, lostReasonId: null, lostReasonName: null }));

    const res = await moveDealTo(2, { stageId: 1, position: 0 }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, patchInit] = fetchMock.mock.calls[1];
    expect(patchInit.method).toBe("PATCH");
    expect(JSON.parse(patchInit.body as string)).toEqual({ clearLostReason: true });
    expect(res.deal.lostReasonId).toBeNull();
    // Итоги колонок берём из ответа move/, PATCH их не отдаёт.
    expect(res.columns).toHaveLength(1);
  });

  it("не шлёт лишний запрос, когда причины нет", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deal: deal({ stageId: 2 }), columns: [] }, 201));

    await moveDealTo(2, { stageId: 2, position: 0 }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("не трогает причину у сделки, которая осталась закрытой", async () => {
    const lost = deal({ stageId: 6, stageKind: "lost", lostReasonId: 1, lostReasonName: "Дорого" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ deal: lost, columns: [] }, 201));

    const res = await moveDealTo(2, { stageId: 6, position: 0, lostReasonId: 1 }, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.deal.lostReasonName).toBe("Дорого");
  });
});
