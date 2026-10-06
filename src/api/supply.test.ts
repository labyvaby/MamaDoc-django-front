import { describe, expect, it } from "vitest";

import {
  filterPositions,
  fromRawEstimate,
  fromRawRequest,
  fromRawStockByNom,
  fromRawSupplier,
  fromRawSupplySummary,
  fromRawTender,
  inventoryDiff,
  movementBody,
  orderStep,
  requestActions,
  requestBody,
} from "./supply";

describe("разбор ответов снабжения", () => {
  it("смета: позиции, разделы, версии — деньги числами", () => {
    const e = fromRawEstimate({
      id: 1,
      total: "888928000.00",
      donePct: 53.3,
      positions: [{ id: 7, code: "P07", section: "Монолитный каркас", qty: 3200.0, price: "21400.00", amount: "68480000.00", stageId: null }],
      sections: [{ name: "Монолитный каркас", total: "278684000.00", positions: 4 }],
      versions: [{ version: 2, kind: "import", total: "888928000.00", current: true }],
    });
    expect(e.total).toBe(888_928_000);
    expect(e.positionsCount).toBe(1);
    expect(e.positions[0]).toMatchObject({ code: "P07", qty: 3200, price: 21_400, stageId: null, stageName: "" });
    expect(e.sections[0].total).toBe(278_684_000);
    expect(e.versions[0]).toMatchObject({ version: 2, current: true });
  });

  it("сводка снабжения", () => {
    const s = fromRawSupplySummary({ newRequests: 2, ordersInTransitAmount: "2107200.00", lowStock: [{ nomId: 14, nomName: "Керамогранит", total: 120.0, min: 150.0, suggestedQty: 300.0 }] });
    expect(s.ordersInTransitAmount).toBe(2_107_200);
    expect(s.lowStock[0]).toMatchObject({ nomId: 14, total: 120, suggestedQty: 300 });
    expect(s.funnel).toEqual([]);
  });

  it("заявка: покрытие null у несогласованной", () => {
    const r = fromRawRequest({ id: 3, number: "ЗС-43", items: [{ id: 4, nomId: 6, qty: 320.0, localAvailable: null, centralQty: null, coverage: null }], total: "1744000.00", canIssueFromStock: false });
    expect(r.items[0]).toMatchObject({ localAvailable: null, centralQty: null, coverage: null });
    expect(r.total).toBe(1_744_000);
  });

  it("тендер: предложения и «не ответили» строками", () => {
    const t = fromRawTender({ id: 1, offers: [{ id: 2, supplierId: 1, price: "8460000.00", isBest: false, aboveBestPct: 6.0, recommended: true }], notResponded: ["ОсОО «X»", { supplierName: "Y" }] });
    expect(t.offers[0]).toMatchObject({ price: 8_460_000, aboveBestPct: 6, recommended: true });
    expect(t.offersCount).toBe(1);
    expect(t.notResponded).toEqual(["ОсОО «X»", "Y"]);
  });

  it("поставщик: своевременность null без доставок", () => {
    expect(fromRawSupplier({ id: 1, onTimePct: null, ordersTotal: "100.00" })).toMatchObject({ onTimePct: null, ordersTotal: 100, orders: [] });
  });

  it("остатки по складам", () => {
    const row = fromRawStockByNom({ nomId: 1, total: 65.0, status: "ok", byWarehouse: [{ warehouseId: 1, qty: 22.0, reserved: 0.0 }] });
    expect(row.byWarehouse[0]).toEqual({ warehouseId: 1, qty: 22, reserved: 0 });
  });
});

describe("тела и кнопки", () => {
  it("заявка без пустых позиций и необязательных полей", () => {
    expect(requestBody({ title: " Газоблок ", projectId: 1, needBy: null, items: [{ nomId: 6, qty: 320 }, { nomId: 4, qty: 0 }], note: "" })).toEqual({
      title: "Газоблок",
      projectId: 1,
      items: [{ nomId: 6, qty: 320 }],
    });
  });

  it("движение: получатель только у перемещения, объект только у списания", () => {
    const base = { warehouseId: 2, toWarehouseId: 3, nomId: 1, qty: 5, projectId: 1, floor: "7", ref: "" };
    expect(movementBody({ ...base, type: "in" })).toEqual({ type: "in", warehouseId: 2, nomId: 1, qty: 5 });
    expect(movementBody({ ...base, type: "move" })).toEqual({ type: "move", warehouseId: 2, nomId: 1, qty: 5, toWarehouseId: 3 });
    expect(movementBody({ ...base, type: "out", ref: " на объект " })).toEqual({ type: "out", warehouseId: 2, nomId: 1, qty: 5, projectId: 1, floor: "7", ref: "на объект" });
  });

  it("кнопки заявки по статусу и правам", () => {
    expect(requestActions({ status: "new", canIssueFromStock: false }, { manage: true, approve: false })).toEqual([]);
    expect(requestActions({ status: "new", canIssueFromStock: false }, { manage: false, approve: true })).toEqual(["approve", "reject"]);
    expect(requestActions({ status: "approved", canIssueFromStock: true }, { manage: true, approve: true })).toEqual(["issue", "tender", "order", "reject"]);
    expect(requestActions({ status: "ordered", canIssueFromStock: false }, { manage: true, approve: true })).toEqual([]);
  });

  it("шаг заказа и расхождение инвентаризации", () => {
    expect(orderStep("in_transit")).toBe(1);
    expect(orderStep("unknown")).toBe(0);
    expect(inventoryDiff(10, 9)).toEqual({ diff: -1, result: "shortage" });
    expect(inventoryDiff(10, 10)).toEqual({ diff: 0, result: "ok" });
    expect(inventoryDiff(10, null)).toEqual({ diff: null, result: null });
  });

  it("фильтр позиций сметы по разделу и поиску", () => {
    const p = (code: string, name: string, section: string) => ({ id: 1, code, name, section, unit: "", qty: 0, price: 0, amount: 0, doneQty: 0, donePct: 0, remaining: 0, lastAct: "", stageId: null, stageName: "" });
    const list = [p("P07", "Колонны В25", "Каркас"), p("P12", "Кладка газоблока", "Стены")];
    expect(filterPositions(list, "колонн", "").map((x) => x.code)).toEqual(["P07"]);
    expect(filterPositions(list, "p12", "Стены").map((x) => x.code)).toEqual(["P12"]);
    expect(filterPositions(list, "", "Каркас")).toHaveLength(1);
  });
});
