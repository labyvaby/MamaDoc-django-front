import { describe, expect, it } from "vitest";

import type { RegistryRow } from "../../api/registry";
import { actionsForRow } from "./registryActions";

function row(overrides: Partial<RegistryRow> = {}): RegistryRow {
  return {
    enrollmentId: 1,
    patient: { id: 2, fullName: "Али", birthDate: "2026-05-10", cardNumber: "МД-1", phone: "+996700000011" },
    primaryContact: null,
    program: { id: 3, code: "newborn", name: "До года", grantsVip: false },
    branch: { id: 4, name: "Центр" },
    responsibleEmployee: null,
    status: "active",
    startsAt: null,
    expiresAt: null,
    onboardingCompletedAt: null,
    cancelReason: "",
    currentTerm: null,
    paymentState: "unpaid",
    lastInteraction: null,
    lastVisitAt: null,
    ...overrides,
  };
}

describe("registry row actions", () => {
  it("offers payment until the term is paid and toggles the exam mark", () => {
    expect(actionsForRow(row(), true)).toEqual([
      "pay",
      "renew",
      "markExamined",
      "book",
      "call",
      "changeDoctor",
      "cancel",
      "openBook",
    ]);
    const paid = actionsForRow(row({ paymentState: "paid", onboardingCompletedAt: "2026-09-24T10:00:00Z" }), true);
    expect(paid).not.toContain("pay");
    expect(paid).toContain("unmarkExamined");
  });

  it("leaves only the book for cancelled rows and for viewers", () => {
    expect(actionsForRow(row({ status: "cancelled", cancelReason: "moved" }), true)).toEqual(["openBook"]);
    expect(actionsForRow(row(), false)).toEqual(["openBook"]);
  });
});
