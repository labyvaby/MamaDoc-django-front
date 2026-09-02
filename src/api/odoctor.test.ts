import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ApiError } from "./client";
import {
  buildOdoctorSettingsPatch,
  findOdoctorSettingsProblem,
  odoctorSettingsErrorMessage,
  odoctorSettingsToForm,
  updateOdoctorSettings,
  type OdoctorSettings,
  type OdoctorSettingsForm,
} from "./odoctor";

/** Ответ GET по контракту payloads.py: значения пароля в нём нет. */
function settings(over: Partial<OdoctorSettings> = {}): OdoctorSettings {
  return {
    organizationId: 1,
    isEnabled: true,
    horizonDays: 7,
    odoctorLogin: "mamadoc-service",
    hasPassword: true,
    ...over,
  };
}

function form(over: Partial<OdoctorSettingsForm> = {}): OdoctorSettingsForm {
  return {
    isEnabled: true,
    horizonDays: 7,
    odoctorLogin: "mamadoc-service",
    newPassword: "",
    clearPassword: false,
    ...over,
  };
}

/** Конверт ошибок бэкенда — в него завёрнут и текст ValidationError. */
function envelope(message: string) {
  return { error: { code: "VALIDATION_ERROR", message, details: null, trace_id: "t-1" } };
}

describe("odoctorSettingsToForm", () => {
  it("не заполняет поле пароля из ответа сервера", () => {
    expect(odoctorSettingsToForm(settings()).newPassword).toBe("");
  });

  it("оставляет поле пароля пустым, даже если в ответе оказалось значение", () => {
    // Значения пароля в контракте нет, но заполнять поле «чем найдётся» нельзя
    // ни при каких обстоятельствах: то, что попало в поле, уйдёт в newPassword
    // следующим сохранением. Плейсхолдер из звёздочек — та же ошибка.
    const leaky = {
      ...settings(),
      password: "s3cret",
      newPassword: "s3cret",
      odoctorPassword: "s3cret",
    } as unknown as OdoctorSettings;

    expect(odoctorSettingsToForm(leaky).newPassword).toBe("");
  });

  it("сбрасывает галочку отзыва: стирание — разовое действие", () => {
    expect(odoctorSettingsToForm(settings()).clearPassword).toBe(false);
  });

  it("переносит остальные поля как есть", () => {
    expect(odoctorSettingsToForm(settings({ isEnabled: false, horizonDays: 14 }))).toEqual({
      isEnabled: false,
      horizonDays: 14,
      odoctorLogin: "mamadoc-service",
      newPassword: "",
      clearPassword: false,
    });
  });
});

describe("buildOdoctorSettingsPatch", () => {
  it("пустое поле пароля не отправляет newPassword вовсе", () => {
    // Пустая строка на бэке стирает пароль (set_password('')), поэтому «не
    // менять» — это отсутствие ключа, а не ключ с пустым значением: иначе
    // правка горизонта выключала бы интеграцию.
    const payload = buildOdoctorSettingsPatch(form({ horizonDays: 21 }));

    expect(payload).not.toHaveProperty("newPassword");
    expect(payload).not.toHaveProperty("clearPassword");
    expect(payload.horizonDays).toBe(21);
  });

  it("введённый пароль отправляет без изменений", () => {
    // Пробелы внутри секрета — часть секрета, подрезать значение нельзя.
    const payload = buildOdoctorSettingsPatch(form({ newPassword: " па роль " }));

    expect(payload.newPassword).toBe(" па роль ");
  });

  it("галочка отзыва отправляет clearPassword и только его", () => {
    const payload = buildOdoctorSettingsPatch(form({ isEnabled: false, clearPassword: true }));

    expect(payload.clearPassword).toBe(true);
    expect(payload).not.toHaveProperty("newPassword");
  });

  it("не отправляет новый пароль вместе со стиранием", () => {
    // Сочетание бэк отвергает (400 на NON_FIELD_ERRORS), форма до него не
    // доводит — но состояние, собранное в обход формы, не должно превращаться
    // в отказ: набранный руками пароль важнее галочки.
    const payload = buildOdoctorSettingsPatch(
      form({ newPassword: "новый", clearPassword: true }),
    );

    expect(payload.newPassword).toBe("новый");
    expect(payload).not.toHaveProperty("clearPassword");
  });

  it("подрезает логин: бэк сравнивает его через strip()", () => {
    expect(buildOdoctorSettingsPatch(form({ odoctorLogin: "  service  " })).odoctorLogin).toBe(
      "service",
    );
  });

  it("organizationId добавляет только когда он задан", () => {
    expect(buildOdoctorSettingsPatch(form(), 42).organizationId).toBe(42);
    expect(buildOdoctorSettingsPatch(form())).not.toHaveProperty("organizationId");
    expect(buildOdoctorSettingsPatch(form(), null)).not.toHaveProperty("organizationId");
  });
});

describe("findOdoctorSettingsProblem", () => {
  it("новый пароль вместе со стиранием — противоречие, а не выбор", () => {
    expect(
      findOdoctorSettingsProblem(form({ newPassword: "новый", clearPassword: true }), true),
    ).toBe("passwordConflict");
  });

  it("стирание при включённой интеграции: сначала выключить, потом стирать", () => {
    expect(findOdoctorSettingsProblem(form({ clearPassword: true }), true)).toBe(
      "clearWhileEnabled",
    );
  });

  it("выключенную интеграцию стирание не блокирует", () => {
    expect(
      findOdoctorSettingsProblem(form({ isEnabled: false, clearPassword: true }), true),
    ).toBeNull();
  });

  it("включение без логина", () => {
    expect(findOdoctorSettingsProblem(form({ odoctorLogin: "   " }), true)).toBe("loginRequired");
  });

  it("включение без пароля", () => {
    expect(findOdoctorSettingsProblem(form(), false)).toBe("passwordRequired");
  });

  it("заданный пароль плюс пустое поле — включать можно: пустое значит «не менять»", () => {
    expect(findOdoctorSettingsProblem(form(), true)).toBeNull();
  });

  it("пароль, введённый в том же сохранении, что и включение, считается заданным", () => {
    // Бэк применяет пароль до full_clean именно для этого случая: включить
    // интеграцию и задать ей пароль одним запросом должно быть можно.
    expect(findOdoctorSettingsProblem(form({ newPassword: "новый" }), false)).toBeNull();
  });

  it("горизонт ноль дней при включённой интеграции", () => {
    expect(findOdoctorSettingsProblem(form({ horizonDays: 0 }), true)).toBe("horizonRequired");
  });

  it("выключенной интеграции пустая учётка и нулевой горизонт не мешают", () => {
    expect(
      findOdoctorSettingsProblem(
        form({ isEnabled: false, odoctorLogin: "", horizonDays: 0 }),
        false,
      ),
    ).toBeNull();
  });
});

describe("odoctorSettingsErrorMessage", () => {
  it("снимает префикс __all__ — техническое имя ключа человеку показывать нельзя", () => {
    const err = new ApiError(
      "__all__: Выберите одно: либо новый пароль (newPassword), либо стирание пароля (clearPassword). Две инструкции про пароль сразу исполнить нельзя.",
      400,
      envelope(
        "__all__: Выберите одно: либо новый пароль (newPassword), либо стирание пароля (clearPassword). Две инструкции про пароль сразу исполнить нельзя.",
      ),
    );

    const message = odoctorSettingsErrorMessage(err);

    expect(message).not.toContain("__all__");
    expect(message).toBe(
      "Выберите одно: либо новый пароль (newPassword), либо стирание пароля (clearPassword). Две инструкции про пароль сразу исполнить нельзя.",
    );
  });

  it("двоеточие внутри самого текста не трогает", () => {
    // Настоящий отказ этого же эндпоинта (ODOCTOR_CRED_KEY не настроен —
    // handle_error отдаёт его тем же 400). Срезать «всё до первого двоеточия»
    // значило бы выбросить единственное, что тут можно починить: имя
    // переменной окружения.
    const text =
      "ODOCTOR_CRED_KEY не задан: пароль сервисной учётки odoctor нельзя ни сохранить, ни прочитать.";
    const err = new ApiError(text, 400, envelope(text));

    expect(odoctorSettingsErrorMessage(err)).toBe(text);
  });

  it("не снимает префикс, которого нет в списке ключей", () => {
    // Список ключей закрытый намеренно: `organizationId` бэк тоже отдаёт
    // префиксом (views._parse_int), но это ошибка вызывающего кода, а не
    // оператора, и по ней надо видеть, какой параметр не понравился. Срезать
    // «любое слово до двоеточия» значило бы потерять и это.
    const text = "organizationId: Ожидается число: 'abc'.";
    const err = new ApiError(text, 400, envelope(text));

    expect(odoctorSettingsErrorMessage(err)).toBe(text);
  });

  it("снимает и префиксы полей строки настроек", () => {
    const text =
      "is_enabled: Включённой интеграции нужны логин и пароль сервисной учётной записи.";
    const err = new ApiError(text, 400, envelope(text));

    expect(odoctorSettingsErrorMessage(err)).toBe(
      "Включённой интеграции нужны логин и пароль сервисной учётной записи.",
    );
  });

  it("собирает две причины отказа в один текст", () => {
    const text =
      "is_enabled: Нужны логин и пароль.; horizon_days: Укажите хотя бы один день.";
    const err = new ApiError(text, 400, envelope(text));

    expect(odoctorSettingsErrorMessage(err)).toBe(
      "Нужны логин и пароль. Укажите хотя бы один день.",
    );
  });

  it("обычную ошибку отдаёт как есть", () => {
    expect(odoctorSettingsErrorMessage(new Error("offline"))).toBe("offline");
  });
});

// ── Запрос целиком: что реально уходит на бэк ────────────────────────────────

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Тело последнего запроса — то, что бэк действительно получит. */
function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("updateOdoctorSettings", () => {
  it("правка горизонта уходит без ключей про пароль", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings({ horizonDays: 21 })));

    await updateOdoctorSettings(buildOdoctorSettingsPatch(form({ horizonDays: 21 })));

    const body = sentBody();
    expect(body).not.toHaveProperty("newPassword");
    expect(body).not.toHaveProperty("clearPassword");
    expect(body.horizonDays).toBe(21);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PATCH" });
  });

  it("отзыв учётки уходит отдельным ключом", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings({ isEnabled: false, hasPassword: false })));

    await updateOdoctorSettings(
      buildOdoctorSettingsPatch(form({ isEnabled: false, clearPassword: true })),
    );

    const body = sentBody();
    expect(body.clearPassword).toBe(true);
    expect(body).not.toHaveProperty("newPassword");
  });

  it("ответ на сохранение значения пароля не содержит — только признак", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings({ hasPassword: true })));

    const saved = await updateOdoctorSettings(
      buildOdoctorSettingsPatch(form({ newPassword: "новый" })),
    );

    expect(saved.hasPassword).toBe(true);
    expect(odoctorSettingsToForm(saved).newPassword).toBe("");
  });

  it("отказ 400 доходит до формы уже без префикса __all__", async () => {
    const text =
      "__all__: Выберите одно: либо новый пароль (newPassword), либо стирание пароля (clearPassword).";
    fetchMock.mockResolvedValue(jsonResponse(envelope(text), 400));

    await expect(
      updateOdoctorSettings({ newPassword: "новый", clearPassword: true }),
    ).rejects.toBeInstanceOf(ApiError);

    fetchMock.mockResolvedValue(jsonResponse(envelope(text), 400));
    const err = await updateOdoctorSettings({ newPassword: "x", clearPassword: true }).catch(
      (e: unknown) => e,
    );

    expect(odoctorSettingsErrorMessage(err)).toBe(
      "Выберите одно: либо новый пароль (newPassword), либо стирание пароля (clearPassword).",
    );
  });
});
