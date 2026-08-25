import { describe, expect, it } from "vitest";

import {
  ApiError,
  extractErrorMessage,
  getDisabledModule,
  getErrorCode,
  getErrorFields,
  getErrorTraceId,
  parseErrorEnvelope,
} from "./client";

/** Конверт бэка: {"error": {code, message, details, trace_id}} (test, 25.08.2026). */
const envelope = (
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
) => ({ error: { code, message, details, trace_id: "c290b776-71f0" } });

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

  it("показывает message, когда в error лежит машинный код (публичный API витрины)", () => {
    const payload = {
      error: "validation_error",
      message: "Онлайн-предоплата не настроена для этой организации.",
      details: {},
    };
    expect(extractErrorMessage(payload, 400)).toBe(
      "Онлайн-предоплата не настроена для этой организации.",
    );
  });

  it("оставляет код, если человеческого текста рядом нет", () => {
    expect(extractErrorMessage({ error: "invalid_api_key" }, 401)).toBe("invalid_api_key");
  });

  it("gives a friendly text for a network failure (status 0)", () => {
    expect(extractErrorMessage(null, 0)).toBe(
      "Нет связи с сервером. Проверьте подключение к интернету и попробуйте снова.",
    );
  });

  it("replaces a technical 429 with an apology and reload instruction", () => {
    const message = extractErrorMessage({ detail: "Too Many Requests" }, 429);
    expect(message).toContain("Приносим извинения");
    expect(message).toContain("Обновите страницу");
    expect(message).not.toContain("429");
  });

  it("gives friendly fallbacks by status code when the body has no message", () => {
    expect(extractErrorMessage(null, 403)).toBe("Недостаточно прав для этого действия.");
    expect(extractErrorMessage(null, 404)).toBe("Запрашиваемые данные не найдены.");
    expect(extractErrorMessage({}, 500)).toBe("Ошибка на сервере. Попробуйте позже.");
  });

  // ── Новый конверт бэка (18.08.2026, на проде появится после выката) ──────
  describe("конверт {error: {code, message, details, trace_id}}", () => {
    it("собирает подписи полей из details.fields", () => {
      const payload = envelope("VALIDATION_ERROR", "Обязательное поле.", {
        fields: { fullName: "Обязательное поле." },
      });
      expect(extractErrorMessage(payload, 400)).toBe("ФИО: Обязательное поле.");
    });

    it("показывает номер строки для пути с индексом (lines[0].productId)", () => {
      const payload = envelope("VALIDATION_ERROR", "Обязательное поле.", {
        fields: { "lines[0].productId": "Обязательное поле." },
      });
      expect(extractErrorMessage(payload, 400)).toBe("Строка 1, Товар: Обязательное поле.");
    });

    it("берёт message, когда details пуст — в том числе для незнакомого кода", () => {
      expect(extractErrorMessage(envelope("VALIDATION_ERROR", "JSON is malformed"), 400)).toBe(
        "JSON is malformed",
      );
      expect(extractErrorMessage(envelope("SOME_NEW_CODE", "Так нельзя."), 409)).toBe("Так нельзя.");
    });

    it("не путает конверт со строковой формой auth-ручек", () => {
      expect(parseErrorEnvelope({ error: "Неверный логин или пароль" })).toBeNull();
      expect(extractErrorMessage({ error: "Неверный логин или пароль" }, 401)).toBe(
        "Неверный логин или пароль",
      );
    });

    it("оставляет плоский appointment_overlap прежнему разбору", () => {
      const flat = { code: "appointment_overlap", message: "Пересечение." };
      expect(parseErrorEnvelope(flat)).toBeNull();
      expect(extractErrorMessage(flat, 409)).toBe("Пересечение.");
    });

    it("кладёт code/details/traceId в ApiError и достаёт хелперами", () => {
      const payload = envelope("MODULE_DISABLED", "Модуль «patients» не подключён.", {
        module: "patients",
      });
      const err = new ApiError(extractErrorMessage(payload, 403), 403, payload);
      expect(getErrorCode(err)).toBe("MODULE_DISABLED");
      expect(getDisabledModule(err)).toBe("patients");
      expect(getErrorTraceId(err)).toBe("c290b776-71f0");
      expect(err.message).toBe("Модуль «patients» не подключён.");
    });

    it("не считает выключенным модулем обычный FORBIDDEN", () => {
      const err = new ApiError("нет", 403, envelope("FORBIDDEN", "Permission denied"));
      expect(getDisabledModule(err)).toBeNull();
      expect(getErrorFields(err)).toBeNull();
    });

    it("отдаёт ошибки по полям для подсветки формы", () => {
      const err = new ApiError("x", 400, envelope("VALIDATION_ERROR", "…", {
        fields: { phone: "Длина должна быть не меньше 1 символов." },
      }));
      expect(getErrorFields(err)).toEqual({
        phone: "Длина должна быть не меньше 1 символов.",
      });
    });

    it("приписывает trace_id к 500 — по нему бэк ищет запрос в Sentry", () => {
      const message = extractErrorMessage(
        envelope("INTERNAL_ERROR", "Ошибка сервера. Попробуйте позже."),
        500,
      );
      expect(message).toContain("Ошибка сервера");
      expect(message).toContain("c290b776-71f0");
    });

    it("не приписывает trace_id к обычной ошибке формы", () => {
      const message = extractErrorMessage(envelope("VALIDATION_ERROR", "Проверьте поля."), 400);
      expect(message).toBe("Проверьте поля.");
    });

    it("для старой формы ответа код и trace_id пустые", () => {
      const err = new ApiError("x", 400, { detail: [{ msg: "Ошибка" }] });
      expect(getErrorCode(err)).toBeNull();
      expect(getErrorTraceId(err)).toBeNull();
    });
  });
});
