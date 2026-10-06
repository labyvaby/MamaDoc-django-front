import { describe, expect, it } from "vitest";

import { checklistRooms, fromRawHandover, fromRawHandoverSummary, fromRawNotice, fromRawRequest, fromRawRequestsSummary, opsQuery, requestActions, weekRange } from "./estateOps";
import { fromRawInstallment, fromRawUser, paymentState } from "./residentApp";

describe("приёмка", () => {
  it("сводка и спарклайны", () => {
    const s = fromRawHandoverSummary({ weekAhead: 6, keysIssuedPct: 1.5, avgDays: 9.0, perWeek: [0, 1, 4] });
    expect(s).toMatchObject({ weekAhead: 6, keysIssuedPct: 1.5, avgDays: 9, perWeek: [0, 1, 4], keysCumulative: [] });
    expect(fromRawHandoverSummary({ avgDays: null }).avgDays).toBeNull();
  });

  it("приёмка: время без секунд, счётчики, замечания", () => {
    const h = fromRawHandover({
      id: 2,
      number: "ПР-002",
      time: "10:00:00",
      meters: [["Электроэнергия", "000000,0 кВт·ч"], "мусор"],
      checklist: [{ id: 24, index: 1, room: "Кухня", ok: null }, { id: 23, index: 0, room: "Прихожая", ok: false }],
      defects: [{ id: 1, title: "УЗО", room: "Прихожая", defectId: 15 }],
    });
    expect(h.time).toBe("10:00");
    expect(h.meters).toEqual([["Электроэнергия", "000000,0 кВт·ч"]]);
    expect(h.defects[0]).toMatchObject({ defectId: 15, done: false, contractorName: "" });
    expect(checklistRooms(h.checklist)).toEqual(["Прихожая", "Кухня"]);
  });

  it("неделя с понедельника", () => {
    const w = weekRange("2026-10-08"); // четверг
    expect(w.from).toBe("2026-10-05");
    expect(w.to).toBe("2026-10-11");
    expect(w.days).toHaveLength(7);
  });
});

describe("сервис жильцов", () => {
  it("сводка: среднее время null", () => {
    const s = fromRawRequestsSummary({ open: 5, avgResolutionHours: null, rating: 5.0, slaNorms: [{ label: "Лифт", hours: 4 }] });
    expect(s).toMatchObject({ open: 5, avgResolutionHours: null, rating: 5, slaNorms: [{ label: "Лифт", hours: 4 }] });
  });

  it("обращение: переписка и SLA", () => {
    const r = fromRawRequest({ id: 1, slaLeftHours: 24, messages: [{ id: 1, fromResident: true, text: "x" }], rating: null });
    expect(r.messages[0].fromResident).toBe(true);
    expect(r).toMatchObject({ slaLeftHours: 24, rating: null, similar: [] });
  });

  it("уведомление: доставка только когда есть", () => {
    expect(fromRawNotice({ id: 5, deliveredPct: null, channels: ["push"] })).toMatchObject({ deliveredPct: null, channels: ["push"] });
  });

  it("кнопки обращения по статусу", () => {
    expect(requestActions("new")).toEqual(["take", "assign", "toQuality"]);
    expect(requestActions("done")).toEqual(["close"]);
    expect(requestActions("closed")).toEqual([]);
    expect(requestActions("in_progress", true)).toEqual(["done", "assign"]);
  });

  it("query без пустых", () => {
    expect(opsQuery({ status: "open", projectId: null, search: "" })).toBe("?status=open");
  });
});

describe("мобильное приложение", () => {
  it("пользователь и оплата", () => {
    const buyer = fromRawUser({ id: 8, role: "buyer", installmentState: "overdue" });
    expect(paymentState(buyer)).toMatchObject({ key: "buyer_overdue", tone: "error" });
    const resident = fromRawUser({ id: 15, role: "resident", lastBill: { id: 17, total: "6270.00", status: "due" } });
    expect(resident.lastBill?.total).toBe(6270);
    expect(paymentState(resident)).toMatchObject({ key: "resident_due", tone: "warning", amount: 6270 });
  });

  it("рассрочка", () => {
    const i = fromRawInstallment({ total: "11560000.00", overdue: "337100.00", paidCount: 3, term: 24, next: { number: 4, amount: "337100.00" } });
    expect(i).toMatchObject({ total: 11_560_000, overdue: 337_100, paidCount: 3, term: 24 });
    expect(i.next?.amount).toBe(337_100);
  });
});
