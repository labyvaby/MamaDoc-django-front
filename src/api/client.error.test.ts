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
    expect(msg).toBe("Конфликт данных. Обновите страницу и попробуйте снова.");
  });

  it("translates a known technical field name to a Russian label", () => {
    const payload = { startsAt: ["Обязательное поле."] };
    expect(extractErrorMessage(payload, 400)).toBe("Дата и время начала: Обязательное поле.");
  });

  it("maps snake_case + Id-suffixed keys through the same label", () => {
    const payload = { patient_id: ["Не найден."] };
    expect(extractErrorMessage(payload, 400)).toBe("Пациент: Не найден.");
  });

  it("drops the technical prefix for unknown fields", () => {
    const payload = { someInternalFlag: ["Недопустимое значение."] };
    expect(extractErrorMessage(payload, 400)).toBe("Недопустимое значение.");
  });

  it("drops the non_field_errors / __all__ wrapper prefix", () => {
    expect(extractErrorMessage({ non_field_errors: ["Общая ошибка."] }, 400)).toBe("Общая ошибка.");
    expect(extractErrorMessage({ errors: { __all__: ["Нельзя."] } }, 400)).toBe("Нельзя.");
  });

  it("prefers { error } over { message }", () => {
    const payload = { error: "Явная ошибка", message: "запасной текст" };
    expect(extractErrorMessage(payload, 400)).toBe("Явная ошибка");
  });

  it("gives a friendly text for a network failure (status 0)", () => {
    expect(extractErrorMessage(null, 0)).toBe(
      "Нет связи с сервером. Проверьте подключение к интернету и попробуйте снова.",
    );
  });

  it("gives friendly fallbacks by status code when the body has no message", () => {
    expect(extractErrorMessage(null, 403)).toBe("Недостаточно прав для этого действия.");
    expect(extractErrorMessage(null, 404)).toBe("Запрашиваемые данные не найдены.");
    expect(extractErrorMessage({}, 500)).toBe("Ошибка на сервере. Попробуйте позже.");
  });
});
