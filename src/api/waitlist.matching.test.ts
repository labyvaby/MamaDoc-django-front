import { describe, it, expect } from "vitest";

import {
  compareCandidates,
  matchesSlot,
  type WaitlistEntry,
  type WaitlistSlot,
} from "./waitlist";

/**
 * Правила «запись подходит под освободившееся окно» продублированы в тикете
 * бэку (§3) дословно: если сервер и фронт разойдутся, счётчик «N ждут» и
 * список кандидатов будут показывать разное. Тест фиксирует инварианты.
 */

function entry(over: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 1,
    patientId: null,
    patientName: null,
    contactName: "Айгерим",
    phone: "+996700123456",
    employeeId: null,
    employeeName: null,
    specializationId: null,
    specializationName: null,
    services: [],
    branchId: null,
    branchName: null,
    desiredDateFrom: null,
    desiredDateTo: null,
    desiredTimeFrom: null,
    desiredTimeTo: null,
    desiredWeekdays: [],
    priority: "normal",
    comment: "",
    status: "waiting",
    source: "staff",
    appointmentId: null,
    activeUntil: null,
    lastContactAt: null,
    lastContactResult: null,
    contactsCount: 0,
    createdById: 1,
    createdByName: "Регистратор",
    createdAt: "2026-09-01T09:00:00+06:00",
    updatedAt: "2026-09-01T09:00:00+06:00",
    closedAt: null,
    closeReason: "",
    ...over,
  };
}

// 2026-09-03 — четверг (ISO 4).
const slot: WaitlistSlot = {
  employeeId: 55,
  date: "2026-09-03",
  time: "15:30",
  branchId: 1,
  employeeSpecializationIds: [7],
};

describe("matchesSlot", () => {
  it("берёт запись без ограничений — ждут кого угодно и когда угодно", () => {
    expect(matchesSlot(entry({ employeeId: 55 }), slot)).toBe(true);
  });

  it("не берёт запись, которая ждёт другого специалиста", () => {
    expect(matchesSlot(entry({ employeeId: 56 }), slot)).toBe(false);
  });

  it("берёт «жду любого педиатра», если специальность есть у специалиста слота", () => {
    expect(matchesSlot(entry({ specializationId: 7 }), slot)).toBe(true);
    expect(matchesSlot(entry({ specializationId: 8 }), slot)).toBe(false);
  });

  it("конкретный специалист важнее специальности", () => {
    // Ждут именно врача 55 — чужая специальность в записи роли не играет.
    expect(matchesSlot(entry({ employeeId: 55, specializationId: 8 }), slot)).toBe(true);
  });

  it("уважает желаемый период; пустая граница не ограничивает", () => {
    expect(
      matchesSlot(
        entry({ employeeId: 55, desiredDateFrom: "2026-09-04", desiredDateTo: "2026-09-10" }),
        slot,
      ),
    ).toBe(false);
    expect(matchesSlot(entry({ employeeId: 55, desiredDateFrom: "2026-09-01" }), slot)).toBe(true);
    expect(matchesSlot(entry({ employeeId: 55, desiredDateTo: "2026-09-02" }), slot)).toBe(false);
  });

  it("уважает дни недели (ISO 1–7); пустой список = любые дни", () => {
    expect(matchesSlot(entry({ employeeId: 55, desiredWeekdays: [4] }), slot)).toBe(true);
    expect(matchesSlot(entry({ employeeId: 55, desiredWeekdays: [6, 7] }), slot)).toBe(false);
    expect(matchesSlot(entry({ employeeId: 55, desiredWeekdays: [] }), slot)).toBe(true);
  });

  it("уважает окно внутри дня", () => {
    expect(matchesSlot(entry({ employeeId: 55, desiredTimeFrom: "16:00" }), slot)).toBe(false);
    expect(matchesSlot(entry({ employeeId: 55, desiredTimeFrom: "15:00" }), slot)).toBe(true);
    expect(matchesSlot(entry({ employeeId: 55, desiredTimeTo: "15:00" }), slot)).toBe(false);
  });

  it("без времени слота время записи не проверяется — это счётчик по дню", () => {
    const dayOnly: WaitlistSlot = { ...slot, time: undefined };
    expect(matchesSlot(entry({ employeeId: 55, desiredTimeFrom: "18:00" }), dayOnly)).toBe(true);
  });

  it("запись без филиала подходит любому, с филиалом — только своему", () => {
    expect(matchesSlot(entry({ employeeId: 55, branchId: null }), slot)).toBe(true);
    expect(matchesSlot(entry({ employeeId: 55, branchId: 2 }), slot)).toBe(false);
  });

  it("не берёт закрытые записи и протухшие по activeUntil", () => {
    expect(matchesSlot(entry({ employeeId: 55, status: "scheduled" }), slot)).toBe(false);
    expect(matchesSlot(entry({ employeeId: 55, status: "cancelled" }), slot)).toBe(false);
    expect(matchesSlot(entry({ employeeId: 55, status: "offered" }), slot)).toBe(true);
    expect(matchesSlot(entry({ employeeId: 55, activeUntil: "2026-09-02" }), slot)).toBe(false);
  });
});

describe("compareCandidates", () => {
  it("срочные впереди, дальше — кто дольше ждёт", () => {
    const urgentNew = entry({ id: 1, priority: "urgent", createdAt: "2026-09-01T10:00:00+06:00" });
    const normalOld = entry({ id: 2, createdAt: "2026-08-20T10:00:00+06:00" });
    const normalNew = entry({ id: 3, createdAt: "2026-08-30T10:00:00+06:00" });

    const sorted = [normalNew, normalOld, urgentNew].sort(compareCandidates).map((e) => e.id);
    expect(sorted).toEqual([1, 2, 3]);
  });
});
