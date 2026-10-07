import { describe, expect, it } from "vitest";

import { acsTone, fromRawDevice, fromRawLog, fromRawShift, shiftDuration } from "./acs";

describe("СКУД", () => {
  it("моя смена: сеть и статус", () => {
    const s = fromRawShift({ employeeId: 22, status: "active", minutes: 102, canEnd: true, network: { isOffice: false, configured: false, label: "Офисная сеть не настроена" } });
    expect(s).toMatchObject({ employeeId: 22, status: "active", minutes: 102, canStart: false, canEnd: true });
    expect(s.network).toMatchObject({ isOffice: false, configured: false, hint: null });
    expect(fromRawShift({}).status).toBe("none");
  });

  it("журнал: строки, правила из rules.items, null-уход", () => {
    const l = fromRawLog({ onSiteCount: 28, staffCount: 30, avgHoursMonth: 8.61, rows: [{ employeeId: 13, checkIn: "07:31", checkOut: null, hours: null, isOnSite: true, statusTone: "green" }], rules: { items: [{ label: "Начало дня", value: "09:00" }] } });
    expect(l.rows[0]).toMatchObject({ checkIn: "07:31", checkOut: null, hours: null, isOnSite: true });
    expect(l.rules).toEqual([{ label: "Начало дня", value: "09:00" }]);
    expect(l.prevDate).toBeNull();
  });

  it("устройство: lastSync из lastSyncAt", () => {
    expect(fromRawDevice({ id: 3, kind: "Турникет", lastSyncAt: "2026-10-05T10:12:00+06:00" })).toMatchObject({ type: "Турникет", lastSync: "2026-10-05T10:12:00+06:00" });
  });

  it("тон и длительность", () => {
    expect(acsTone("amber")).toBe("warning");
    expect(acsTone("gray")).toBeNull();
    expect(shiftDuration(125)).toEqual({ h: 2, m: 5 });
  });
});
