import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import {
  parseOverlapConflict,
  type AppointmentOverlapConflict,
} from "./appointments";

const conflictBody: AppointmentOverlapConflict = {
  code: "appointment_overlap",
  message: "Время приёма пересекается с другим приёмом.",
  requestedSlot: { startsAt: "2026-07-20T14:30:00+06:00", endsAt: "2026-07-20T16:30:00+06:00" },
  overlaps: [
    {
      appointmentId: 123,
      startsAt: "2026-07-20T16:00:00+06:00",
      endsAt: "2026-07-20T16:30:00+06:00",
      employeeId: 45,
      employeeName: "Иванов Иван",
      patientName: "Талант Дениз",
    },
  ],
};

describe("parseOverlapConflict", () => {
  it("returns the parsed body for a 409 with code appointment_overlap", () => {
    const err = new ApiError("Conflict", 409, conflictBody);
    const parsed = parseOverlapConflict(err);
    expect(parsed).not.toBeNull();
    expect(parsed?.overlaps[0].employeeName).toBe("Иванов Иван");
    expect(parsed?.requestedSlot.startsAt).toBe("2026-07-20T14:30:00+06:00");
  });

  it("returns null for a 409 without the overlap code (some other conflict)", () => {
    const err = new ApiError("Conflict", 409, { detail: [{ msg: "busy" }] });
    expect(parseOverlapConflict(err)).toBeNull();
  });

  it("returns null for a non-409 ApiError (e.g. a 400 forbid-mode rejection)", () => {
    const err = new ApiError("Bad", 400, conflictBody);
    expect(parseOverlapConflict(err)).toBeNull();
  });

  it("returns null for a plain error and for non-object payloads", () => {
    expect(parseOverlapConflict(new Error("network"))).toBeNull();
    expect(parseOverlapConflict(new ApiError("x", 409, null))).toBeNull();
    expect(parseOverlapConflict("boom")).toBeNull();
  });
});
