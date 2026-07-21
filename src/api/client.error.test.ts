import { describe, expect, it } from "vitest";

import { extractErrorMessage } from "./client";

describe("extractErrorMessage", () => {
  it("returns the human message for an appointment_overlap 409 (no [object Object])", () => {
    const payload = {
      code: "appointment_overlap",
      message: "Время приёма пересекается с другим приёмом.",
      requestedSlot: {
        startsAt: "2026-07-20T14:30:00+06:00",
        endsAt: "2026-07-20T16:30:00+06:00",
      },
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
    const msg = extractErrorMessage(payload, 409);
    expect(msg).toBe("Время приёма пересекается с другим приёмом.");
    expect(msg).not.toContain("[object Object]");
  });

  it("never emits [object Object] for a field dict holding an array of objects", () => {
    const payload = { overlaps: [{ appointmentId: 1 }, { appointmentId: 2 }] };
    const msg = extractErrorMessage(payload, 409);
    expect(msg).not.toContain("[object Object]");
    expect(msg).toBe("Ошибка сервера (409)");
  });

  it("still formats a plain Django field dict with string arrays", () => {
    const payload = { startsAt: ["Обязательное поле."] };
    expect(extractErrorMessage(payload, 400)).toBe("startsAt: Обязательное поле.");
  });

  it("prefers { error } over { message }", () => {
    const payload = { error: "Явная ошибка", message: "запасной текст" };
    expect(extractErrorMessage(payload, 400)).toBe("Явная ошибка");
  });
});
