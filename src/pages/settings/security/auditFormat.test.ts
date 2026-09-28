import { describe, expect, it } from "vitest";

import type { AuditCatalog, AuditEvent } from "../../../api/audit";
import { auditQuery } from "../../../api/audit";
import {
  actionText,
  actorText,
  changeLines,
  formatValue,
  maskPhone,
  outcomeTone,
  resourceText,
} from "./auditFormat";

function makeEvent(patch: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 1,
    occurredAt: "2026-09-27T14:32:00+06:00",
    organizationId: 42,
    branchId: null,
    branchName: null,
    actor: { type: "user", name: "Айбек Т.", userId: 7 },
    action: "staff.employee.updated",
    actionLabel: null,
    category: "staff",
    outcome: "success",
    source: "web",
    resource: { type: "staff.employee", id: "17", label: "Иванов Иван" },
    changes: {},
    metadata: {},
    requestId: "abc123",
    traceId: "abc123",
    ipAddress: "192.168.*.*",
    userAgent: null,
    device: "Chrome · Windows",
    httpMethod: "PATCH",
    path: "",
    statusCode: null,
    authMethod: "session",
    ...patch,
  };
}

const catalog: AuditCatalog = {
  categories: [{ code: "staff", label: "Сотрудники" }],
  actions: [
    { code: "staff.employee.updated", label: "Изменена карточка сотрудника", category: "staff" },
  ],
  canViewSecurity: false,
  canExport: false,
};

describe("actionText", () => {
  it("prefers the label the backend sent", () => {
    expect(actionText(makeEvent({ actionLabel: "Своя подпись" }), catalog)).toBe("Своя подпись");
  });

  it("falls back to the catalog, then to the raw code", () => {
    expect(actionText(makeEvent(), catalog)).toBe("Изменена карточка сотрудника");
    expect(actionText(makeEvent({ action: "legacy.odd.thing" }), catalog)).toBe("legacy.odd.thing");
  });
});

describe("changeLines", () => {
  it("renders old → new with masked phones and field labels", () => {
    const lines = changeLines({
      phone: { old: "+996700000123", new: "+996555000321" },
      status: { old: "active", new: "inactive" },
    });
    expect(lines).toEqual([
      { field: "phone", label: "Телефон", from: "+996700***123", to: "+996555***321" },
      { field: "status", label: "Статус", from: "active", to: "inactive" },
    ]);
  });

  it("never shows a value for redacted fields", () => {
    const [line] = changeLines({ inn: { changed: true } });
    expect(line).toEqual({ field: "inn", label: "ИНН", from: null, to: null });
  });
});

describe("formatValue", () => {
  it("handles empties, booleans and lists", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue(true)).toBe("да");
    expect(formatValue([3, 5])).toBe("3, 5");
    expect(formatValue([])).toBe("—");
  });

  it("leaves non-phone strings alone", () => {
    expect(maskPhone("Менеджер")).toBe("Менеджер");
    expect(maskPhone("12")).toBe("12");
  });
});

describe("actor and resource", () => {
  it("names the system instead of an empty actor", () => {
    expect(actorText(makeEvent({ actor: { type: "system", name: "", userId: null } }))).toBe("Система");
  });

  it("falls back to type #id for an unlabeled object", () => {
    expect(resourceText(makeEvent({ resource: { type: "billing.payment", id: "9", label: "" } }))).toBe(
      "billing.payment #9",
    );
  });

  it("maps outcomes to tones", () => {
    expect(outcomeTone("success")).toBe("success");
    expect(outcomeTone("denied")).toBe("warning");
    expect(outcomeTone("failure")).toBe("error");
  });
});

describe("auditQuery", () => {
  it("drops empty filters", () => {
    expect(auditQuery({ category: "staff", action: "", cursor: null, pageSize: 50 })).toBe(
      "?category=staff&pageSize=50",
    );
  });
});
