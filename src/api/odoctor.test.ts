import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./client";
import {
  applyClearPasswordToggle,
  buildOdoctorSettingsPatch,
  findOdoctorSettingsProblem,
  odoctorSettingsErrorMessage,
  odoctorSettingsToForm,
  parseHorizonDays,
  passwordFieldState,
  saveOdoctorSettingsForm,
  updateOdoctorSettings,
  ODOCTOR_HORIZON_MAX_DAYS,
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

/**
 * Ответ, в котором значение пароля всё-таки оказалось. Контракт такого не
 * допускает, но заполнять поле «чем найдётся» нельзя ни при каких
 * обстоятельствах: то, что попало в поле, уйдёт в newPassword следующим
 * сохранением.
 */
function leakySettings(over: Partial<OdoctorSettings> = {}): OdoctorSettings {
  return {
    ...settings(over),
    password: "s3cret",
    newPassword: "s3cret",
    odoctorPassword: "s3cret",
  } as unknown as OdoctorSettings;
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
    // Плейсхолдер из звёздочек — та же ошибка, что и настоящее значение.
    expect(odoctorSettingsToForm(leakySettings()).newPassword).toBe("");
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

describe("parseHorizonDays", () => {
  it("обычное число", () => {
    expect(parseHorizonDays("7")).toBe(7);
    expect(parseHorizonDays(" 7 ")).toBe(7);
  });

  it("пустое поле — ноль, а не NaN", () => {
    // Ноль осмыслен: бэк отвергает его только при включённой интеграции, и об
    // этом есть что сказать словами (horizonRequired).
    expect(parseHorizonDays("")).toBe(0);
  });

  it("ноль и отрицательное — ноль", () => {
    expect(parseHorizonDays("0")).toBe(0);
    expect(parseHorizonDays("-5")).toBe(0);
  });

  it("дробь округляет вниз: msgspec ждёт int и на 7.9 ответил бы 400", () => {
    expect(parseHorizonDays("7.9")).toBe(7);
  });

  it("экспоненциальную запись читает как число, а не как первую цифру", () => {
    // type=number такой ввод пропускает, а parseInt("1e3") вернул бы 1 —
    // оператор набрал тысячу, а сохранился бы один день.
    expect(parseHorizonDays("1e1")).toBe(10);
    expect(parseHorizonDays("1e3")).toBe(ODOCTOR_HORIZON_MAX_DAYS);
  });

  it("клампит сверху: атрибут max при наборе не действует", () => {
    // Без клампа набранные 3650 уехали бы на бэк молча — там 32767.
    expect(parseHorizonDays("3650")).toBe(ODOCTOR_HORIZON_MAX_DAYS);
    expect(parseHorizonDays(String(ODOCTOR_HORIZON_MAX_DAYS))).toBe(ODOCTOR_HORIZON_MAX_DAYS);
  });

  it("мусор и бесконечность — ноль", () => {
    expect(parseHorizonDays("12abc")).toBe(0);
    expect(parseHorizonDays("abc")).toBe(0);
    expect(parseHorizonDays("Infinity")).toBe(0);
  });

  it("шестнадцатеричную запись читает как число (зафиксировано, не задумано)", () => {
    // Поле type=number такого не отдаёт; тест держит поведение известным.
    expect(parseHorizonDays("0x10")).toBe(16);
  });
});

describe("applyClearPasswordToggle", () => {
  it("взведённая галочка всегда чистит поле пароля", () => {
    // Это единственное, что делает истинным «противоречие отправить нельзя
    // вовсе»: без очистки состояние «новый пароль плюс стирание» собиралось бы
    // одним щелчком, а бэк отвечает на него 400.
    const next = applyClearPasswordToggle(form({ newPassword: "набранный" }), true);

    expect(next.clearPassword).toBe(true);
    expect(next.newPassword).toBe("");
  });

  it("взведение при пустом поле ничего не ломает", () => {
    const next = applyClearPasswordToggle(form(), true);

    expect(next.clearPassword).toBe(true);
    expect(next.newPassword).toBe("");
  });

  it("снятие галочки поле не восстанавливает", () => {
    // Восстанавливать нечего: значение стёрто, а не спрятано.
    const cleared = applyClearPasswordToggle(form({ newPassword: "набранный" }), true);
    const back = applyClearPasswordToggle(cleared, false);

    expect(back.clearPassword).toBe(false);
    expect(back.newPassword).toBe("");
  });

  it("остальные поля не трогает и исходную форму не мутирует", () => {
    const before = form({ horizonDays: 21, odoctorLogin: "svc", newPassword: "набранный" });
    const next = applyClearPasswordToggle(before, true);

    expect(next.horizonDays).toBe(21);
    expect(next.odoctorLogin).toBe("svc");
    expect(before.newPassword).toBe("набранный");
  });
});

describe("passwordFieldState", () => {
  it("введённый пароль — «будет заменён»", () => {
    expect(passwordFieldState(form({ newPassword: "новый" }), true)).toBe("changing");
  });

  it("пустое поле у заданного пароля — «оставить прежний»", () => {
    expect(passwordFieldState(form(), true)).toBe("set");
  });

  it("пустое поле у незаданного — «пароля нет»", () => {
    // По одному виду поля это состояние от предыдущего неотличимо, поэтому
    // подпись и нужна.
    expect(passwordFieldState(form(), false)).toBe("unset");
  });

  it("взведённая галочка перебивает всё: подпись обязана говорить про отзыв", () => {
    expect(passwordFieldState(form({ clearPassword: true }), true)).toBe("clearing");
    // Тот же выбор последней надежды, что и в buildOdoctorSettingsPatch.
    expect(passwordFieldState(form({ clearPassword: true, newPassword: "новый" }), true)).toBe(
      "clearing",
    );
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

  it("при обоих ключах разом выбирает отзыв, а не установку пароля", () => {
    // Состояние недостижимо (галочка чистит поле) и предзаблокировано, так что
    // это выбор последней надежды. Он в пользу отзыва: не поставить новый
    // пароль — потеря удобства, не стереть утёкший — потеря контроля над
    // доступом к чужой системе.
    const payload = buildOdoctorSettingsPatch(
      form({ newPassword: "новый", clearPassword: true }),
    );

    expect(payload.clearPassword).toBe(true);
    expect(payload).not.toHaveProperty("newPassword");
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

    // Разделитель бэка ('; ') сохраняем: без него две причины склеиваются в
    // одну фразу — сейчас это незаметно только потому, что все три сообщения
    // кончаются точкой.
    expect(odoctorSettingsErrorMessage(err)).toBe(
      "Нужны логин и пароль.; Укажите хотя бы один день.",
    );
  });

  it("от сообщения из одних префиксов остаётся сырой текст, а не пустота", () => {
    // Иначе на месте причины отказа была бы пустая красная плашка.
    const err = new ApiError("__all__: ", 400, envelope("__all__: "));

    expect(odoctorSettingsErrorMessage(err)).toBe("__all__: ");
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

  it("значение пароля из ответа в форму не попадает и через fetch-слой", async () => {
    // Фикстура с паролем — иначе тест проверял бы сам себя: у ответа без
    // пароля поле формы пусто и без всякой защиты.
    fetchMock.mockResolvedValue(jsonResponse(leakySettings({ hasPassword: true })));

    const saved = await updateOdoctorSettings(
      buildOdoctorSettingsPatch(form({ newPassword: "новый" })),
    );

    expect((saved as unknown as { password?: string }).password).toBe("s3cret");
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

// ── Важно 1: сброс формы на ротации пароля ───────────────────────────────────

describe("saveOdoctorSettingsForm", () => {
  it("react-query на равном ответе оставляет прежнюю ссылку — сбросу нельзя быть эффектом", () => {
    // Механизм находки: replaceEqualDeep при полном совпадении возвращает
    // прежний объект (structuralSharing включён по умолчанию, Refine его не
    // выключает). Пока это так, useEffect([settings]) на ротации пароля не
    // срабатывает, и сброс обязан жить в самом пути сохранения.
    const client = new QueryClient();
    const key = ["django", "odoctor", "settings", null];
    client.setQueryData(key, settings({ hasPassword: true }));
    const seeded = client.getQueryData(key);

    // Ответ бэка на смену ОДНОГО пароля: значения пароля в payload нет, а
    // hasPassword был true и остался — новый объект, равный прежнему.
    const afterRotation = settings({ hasPassword: true });
    expect(afterRotation).not.toBe(seeded);

    client.setQueryData(key, afterRotation);

    expect(client.getQueryData(key)).toBe(seeded);
  });

  it("после смены одного пароля поле очищается, хотя ответ равен прежнему", async () => {
    // Тот самый путь. Иначе снекбар говорит «сохранено» при заполненном поле,
    // а набранный пароль уезжает в newPassword при каждом следующем
    // сохранении — включая правку одного горизонта.
    fetchMock.mockResolvedValue(jsonResponse(settings({ hasPassword: true })));

    const result = await saveOdoctorSettingsForm(form({ newPassword: "новый" }));

    expect(sentBody().newPassword).toBe("новый");
    expect(result.form.newPassword).toBe("");
    expect(result.form.clearPassword).toBe(false);
  });

  it("следующее сохранение после ротации уже не несёт пароль", async () => {
    // Инвариант, который рушился: правка одного горизонта не должна трогать
    // учётку. Проверяем на форме, вернувшейся из предыдущего сохранения.
    fetchMock.mockResolvedValue(jsonResponse(settings({ hasPassword: true })));
    const afterRotation = await saveOdoctorSettingsForm(form({ newPassword: "новый" }));

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(settings({ horizonDays: 21, hasPassword: true })));
    await saveOdoctorSettingsForm({ ...afterRotation.form, horizonDays: 21 });

    const body = sentBody();
    expect(body).not.toHaveProperty("newPassword");
    expect(body.horizonDays).toBe(21);
  });

  it("отзыв учётки тоже снимает галочку в вернувшейся форме", async () => {
    fetchMock.mockResolvedValue(jsonResponse(settings({ isEnabled: false, hasPassword: false })));

    const result = await saveOdoctorSettingsForm(form({ isEnabled: false, clearPassword: true }));

    expect(sentBody().clearPassword).toBe(true);
    expect(result.form.clearPassword).toBe(false);
    expect(result.settings.hasPassword).toBe(false);
  });

  it("отказ пробрасывает наружу — сообщение собирает страница", async () => {
    const text = "__all__: Выберите одно: либо новый пароль, либо стирание.";
    fetchMock.mockResolvedValue(jsonResponse(envelope(text), 400));

    const err = await saveOdoctorSettingsForm(form({ newPassword: "x" })).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(ApiError);
    expect(odoctorSettingsErrorMessage(err)).toBe(
      "Выберите одно: либо новый пароль, либо стирание.",
    );
  });
});
